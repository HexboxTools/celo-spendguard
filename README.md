# Spendguard Scout

**An agent that pays for its own data on Celo, inside a spend cap its owner sets.**

Built by [Hexbox Tools](https://github.com/HexboxTools) for Celo's *Agents Open for Business* hackathon (Nov–Dec 2026). All code written from 20 Nov 2026.

**Live page:** https://hexboxtools.github.io/celo-spendguard/ · **Demo video (MP4):** https://hexboxtools.github.io/celo-spendguard/demo.mp4 · ERC-8004 agent **#10134** on Celo mainnet · 10 settled x402 payments, 1 refused at the cap.

## The job

Builders, grant reviewers and hackathon judges keep asking the same question: *is anyone actually using this project?* Spendguard Scout answers it with a short traction brief:

- **Free sources first:** GitHub (stars, forks, commits in the last 30 days) and Hacker News (stories and points over 12 months).
- **Paid sources only when needed:** X, Reddit and YouTube searches bought per request on [buy](https://usebuy.ai), Celo Core Co.'s agent marketplace, at $0.005 a call, paid over **x402** in USD₮ on Celo mainnet.
- **Only relevant matches count:** search providers return loose matches (an "ERC-8004" query once returned a trading-card post). A post or story counts only if its title or text names the project keyword as a whole word.
- **A brief with its own bill:** each report ends with a *Data bill* table listing every paid call and its settlement transaction on Celoscan. You can check what the agent spent on your behalf.

Example (mainnet): [`reports/2026-11-25-celo.md`](reports/2026-11-25-celo.md). Sandbox run on Celo Sepolia: [`reports/sandbox/2026-11-25-x402.md`](reports/sandbox/2026-11-25-x402.md).

## Why the spend cap matters

An agent with a funded wallet is a liability unless something it cannot override bounds what it spends. Spendguard layers three bounds:

| Layer | Enforced by | What it bounds |
|---|---|---|
| **Altana session key** (preferred) | the smart account onchain (EIP-7702, same address) | daily spend cap on the payment token, contract allowlist (the token only), expiry. Revocable in one tx (`scripts/altana-revoke.mjs`). x402 signatures are checked against the same cap by the Altana SDK before signing. |
| **SpendPolicy** (`src/policy.mjs`) | the agent process, before any signature | per-call cap, daily cap per UTC day, allowlisted payees (`payTo`), hosts, assets and network. Refusals are logged too. |
| **Working balance** | the chain | the wallet only holds what the owner tops up (faucet-sized amounts here). |

Every payment, failure and refusal goes to an append-only ledger (`ledger/<network>.jsonl`) that is committed to this repo.

## How it works

```
scout --project NAME --repo owner/name
  ├─ GitHub + Hacker News (free)
  ├─ POST gateway.usebuy.ai/v1/social/{x,reddit,youtube}/…  → 402 Payment Required
  │    ├─ SpendPolicy.check(requirement)    refuse? → ledger "refused", nothing signed
  │    ├─ sign EIP-3009 transferWithAuthorization
  │    │     (EOA key, or Altana session key → ERC-1271 via the smart account)
  │    └─ retry with PAYMENT-SIGNATURE → 200 + PAYMENT-RESPONSE (settlement tx)
  ├─ ledger "paid" {amount, payTo, tx}
  └─ reports/<date>-<project>.{md,json}
```

- If the X provider fails upstream, buy refuses the call **before settlement** (no charge). Scout then buys a YouTube search for the social signal instead.
- The buyer needs no CELO for x402: buy's facilitator settles and pays the gas.

## Onchain identity and attribution

- **ERC-8004:** `scripts/register-8004.mjs` registers the agent in Celo's Identity Registry (`0x8004A169…a432`) from the agent wallet. The registration record is [`agent.json`](agent.json).
- **ERC-8021:** every transaction the agent or owner sends carries the hackathon attribution tag, via `@celo/attribution-tags` (EOA) or Altana's `appCode` (smart wallet).
- x402 payments can't carry tags yet, so they're matched by the payer address and the ledger.

## Run it

```bash
npm install
npm test                                   # 14 tests: policy, parsers, relevance filter, local x402 seller end-to-end

# sandbox (Celo Sepolia, test USDC from buy's faucet, no money)
SPENDGUARD_NETWORK=celo-sepolia SPENDGUARD_KEY_FILE=./test.key \
  node bin/scout.mjs --project "x402" --repo x402-foundation/x402 --query "x402 payments"

# mainnet, EOA payer with SpendPolicy
SPENDGUARD_KEY_FILE=./agent.key node bin/scout.mjs --project "Your project" --repo you/repo

# mainnet, Altana session payer
ADMIN_KEY_FILE=./agent.key SESSION_KEY_FILE=./session.key SPENDGUARD_ATTRIBUTION_CODE=celo_xxx node scripts/altana-setup.mjs
SPENDGUARD_PAYER=altana ALTANA_SESSION_FILE=session.celo.json ALTANA_SESSION_KEY_FILE=./session.key \
  node bin/scout.mjs --project "Your project" --repo you/repo

node scripts/status.mjs 0xYourAgentAddress   # balances, ERC-8004 identity, ledger summary
```

Key files contain a line with the 0x-prefixed private key. Defaults: `SPENDGUARD_MAX_PER_CALL=10000` ($0.01) and `SPENDGUARD_DAILY_CAP=50000` ($0.05 a day). Paid hosts are limited to `gateway.usebuy.ai` and its `payTo` address.

## Want a brief?

Open an issue with your project name and repo. Scout runs it and commits the brief and its data bill to `reports/`.

## Status

See [`STATUS.md`](STATUS.md) for what's live on mainnet: agent address, ERC-8004 agent ID and tagged transactions.

## License

MIT


## Mainnet run (Nov 25, 2026)

Everything below is on Celo mainnet. The ERC-8004 registration, both USDC session-key calls and the owner top-up carry the Loops House attribution tag `celo_73a54a0daad9` as an ERC-8021 calldata suffix (checked onchain). Not tagged: the EIP-7702 delegation (empty calldata), the Altana grant sent through Altana's relay (no suffix found in the outer calldata), and the two Uniswap swaps that bought the stablecoin float.

| Step | Tx |
|---|---|
| ERC-8004 identity, **agentId 10134** | [0xe47d71bb…](https://celoscan.io/tx/0xe47d71bb03cc18e736e43b0a3a5d9a31b750db81ec299da6c9205f631feb36e4) |
| EIP-7702 delegation to the Altana account (self-sponsored; works around a stale relay authorization nonce) | [0x6eb06f8c…](https://celoscan.io/tx/0x6eb06f8cac72baf41947c3a483f9b77c2f638bc1856f21bf5c117b01f01fea6f) |
| Altana KeyStore registration and session grant (daily cap 0.05 USD₮, token-only allowlist, 14-day expiry) | [0xaf680c1b…](https://celoscan.io/tx/0xaf680c1b453efad02812cd9ed8abdc143b7879ba68813bbf46d80217b43593cd) |
| Same cap added for USDC on the session key, and USDC approved as its ERC-1271 checker (`scripts/altana-add-usdc.mjs`) | [0x9ecaf8e7…](https://celoscan.io/tx/0x9ecaf8e783f903f45f52de08491b8ed9ffd6a257e20fbb0b8a4ec282c9e9957d), [0x9e456abd…](https://celoscan.io/tx/0x9e456abd1e14a8ca76f695cdf5ba4f07beb817a2c715445f9bbff94037b38d8f) |
| Owner top-up of the agent's spending float: 0.05 USDC, which is one day's cap | [0xa6828f28…](https://celoscan.io/tx/0xa6828f284c18c6f8a679e0396e8f915b3cbaaf469d2e7c3b222c09d16e240824) |
| 10 paid x402 calls to buy (Reddit and YouTube, $0.005 each), across 6 briefs; 1 refused at the daily cap | see `reports/2026-11-25-*.md` and `ledger/celo.jsonl` |

Briefs: [Celo](reports/2026-11-25-celo.md), [Celo Composer](reports/2026-11-25-celo-composer.md) (hit the daily cap), [x402](reports/2026-11-25-x402.md), [Mento](reports/2026-11-25-mento.md), [Self](reports/2026-11-25-self.md), [ERC-8004](reports/2026-11-25-erc-8004.md).

### What we learned about paying x402 from a smart account
- buy's gateway reads `X-PAYMENT` (v1) before `PAYMENT-SIGNATURE` (v2). Altana's SDK sends both, so the v1 header is matched against v1 offers (`celo`, not `eip155:42220`) and fails with `no_matching_requirements`. `src/payers/altana.mjs` now sends v2 only, and it pays on the token the session's onchain cap covers.
- With that fixed, the facilitator still answers `malformed_payload` for an ERC-1271 session signature (98 bytes). As of today it only takes 65-byte EOA signatures. Until it accepts 1271, the agent pays from a plain hot key that the owner tops up with no more than one day's cap, and the SpendPolicy and ledger apply to every call.
