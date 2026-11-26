# Spendguard Scout

**An agent that pays for its own data on Celo, inside a spend cap its owner sets.**

Built by [Hexbox Tools](https://github.com/HexboxTools) for Celo's *Agents Open for Business* hackathon (Nov–Dec 2026). All code written from 20 Nov 2026.

**Live page:** https://hexboxtools.github.io/celo-spendguard/ · **Demo video (MP4):** https://hexboxtools.github.io/celo-spendguard/demo.mp4 · ERC-8004 agent **#10134** on Celo mainnet · 14 settled x402 payments, 1 refused at the cap · **the Altana session key funds and caps the agent's spending key** (since Nov 25, 6:20 PM ET).

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
| **Altana session key** | the smart account onchain (EIP-7702, same address) | $0.05/day spend caps on USDC and USD₮; may call `USDC.transfer` (and the USD₮ contract), nothing else; 14-day expiry; revocable in one tx (`scripts/altana-revoke.mjs`). The session key funds the x402 spending key (`scripts/altana-topup.mjs`), so every dollar the agent spends passed through this cap. `node scripts/session-status.mjs` reads it live. |
| **SpendPolicy** (`src/policy.mjs`) | the agent process, before any signature | per-call cap, daily cap per UTC day, allowlisted payees (`payTo`), hosts, assets and network. Refusals are logged too. |
| **Working balance** | the chain | the spending key only holds what the session key sent it (one day's float at most). |

Every payment, failure and refusal goes to an append-only ledger (`ledger/<network>.jsonl`) that is committed to this repo.

## How it works

```
owner        grants an Altana session key (USDC.transfer only, $0.05/day cap, expiry)   ← onchain
session key  smart wallet ──USDC.transfer──▶ x402 spending key   (scripts/altana-topup.mjs, ≤ cap incl. relay fee)
agent        scout --project NAME --repo owner/name
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
- **ERC-8021:** the agent's and owner's transactions carry the hackathon attribution tag, via `@celo/attribution-tags` (EOA) or Altana's `appCode` (smart wallet); exceptions are listed under *Mainnet run* below.
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
node scripts/session-status.mjs             # the session key's onchain allowlist, caps and today's usage

# daily float: the session key tops up the spending key under its onchain cap
ALTANA_SESSION_KEY_FILE=./session.key SPENDGUARD_ATTRIBUTION_CODE=celo_xxx node scripts/altana-topup.mjs --amount 25000
```

Key files contain a line with the 0x-prefixed private key. Defaults: `SPENDGUARD_MAX_PER_CALL=10000` ($0.01) and `SPENDGUARD_DAILY_CAP=50000` ($0.05 a day). Paid hosts are limited to `gateway.usebuy.ai` and its `payTo` address.

## Want a brief?

Open an issue with your project name and repo. Scout runs it and commits the brief and its data bill to `reports/`.

## Status

See [`STATUS.md`](STATUS.md) for what's live on mainnet: agent address, ERC-8004 agent ID and tagged transactions.

## License

MIT


## Mainnet run (Nov 25, 2026)

Everything below is on Celo mainnet. The ERC-8004 registration, both USDC session-key calls, the owner top-up, the `USDC.transfer` permission and the relayed session-key top-up carry the Loops House attribution tag `celo_73a54a0daad9` as an ERC-8021 calldata suffix (checked onchain). Not tagged: the EIP-7702 delegation (empty calldata), the Altana grant sent through Altana's relay (no suffix found in the outer calldata), and the two Uniswap swaps that bought the stablecoin float.

| Step | Tx |
|---|---|
| ERC-8004 identity, **agentId 10134** | [0xe47d71bb…](https://celoscan.io/tx/0xe47d71bb03cc18e736e43b0a3a5d9a31b750db81ec299da6c9205f631feb36e4) |
| EIP-7702 delegation to the Altana account (self-sponsored; works around a stale relay authorization nonce) | [0x6eb06f8c…](https://celoscan.io/tx/0x6eb06f8cac72baf41947c3a483f9b77c2f638bc1856f21bf5c117b01f01fea6f) |
| Altana KeyStore registration and session grant (daily cap 0.05 USD₮, token-only allowlist, 14-day expiry) | [0xaf680c1b…](https://celoscan.io/tx/0xaf680c1b453efad02812cd9ed8abdc143b7879ba68813bbf46d80217b43593cd) |
| Same cap added for USDC on the session key, and USDC approved as its ERC-1271 checker (`scripts/altana-add-usdc.mjs`) | [0x9ecaf8e7…](https://celoscan.io/tx/0x9ecaf8e783f903f45f52de08491b8ed9ffd6a257e20fbb0b8a4ec282c9e9957d), [0x9e456abd…](https://celoscan.io/tx/0x9e456abd1e14a8ca76f695cdf5ba4f07beb817a2c715445f9bbff94037b38d8f) |
| Owner top-up of the agent's spending float: 0.05 USDC, one day's cap (funded payments 1–10) | [0xa6828f28…](https://celoscan.io/tx/0xa6828f284c18c6f8a679e0396e8f915b3cbaaf469d2e7c3b222c09d16e240824) |
| Session key allowed to call `USDC.transfer` (nothing else on USDC), one admin self-call (`scripts/altana-allow-usdc-transfer.mjs`) | [0x6c25718b…](https://celoscan.io/tx/0x6c25718b7aa8288be290f87a13fb62328e28030143a8608c4dab57c847aaadc4) |
| **Altana session key tops up the spending key**: 0.025 USDC from the smart wallet, signed by the session key, sent via Altana's relay (fee 0.005006 USDC), 0.030006 of the $0.05 onchain USDC cap used (`scripts/altana-topup.mjs`) | [0xb460d2bd…](https://celoscan.io/tx/0xb460d2bd872edc4d19c1f85e63adc174564439cabe66ac01141b0b8d3f1c0227) |
| 14 paid x402 calls to buy (Reddit and YouTube, $0.005 each), across 8 briefs; 1 refused at the daily cap. Payments 11–14 (Altana and MiniPay briefs) were paid from the session key's top-up | see `reports/` and `ledger/celo.jsonl` |

Briefs: [Altana](reports/2026-11-26-altana.md) and [MiniPay](reports/2026-11-26-minipay.md) (paid from the session key's top-up), [Celo](reports/2026-11-25-celo.md), [Celo Composer](reports/2026-11-25-celo-composer.md) (hit the daily cap), [x402](reports/2026-11-25-x402.md), [Mento](reports/2026-11-25-mento.md), [Self](reports/2026-11-25-self.md), [ERC-8004](reports/2026-11-25-erc-8004.md).

### What we learned about paying x402 from a smart account
- buy's gateway reads `X-PAYMENT` (v1) before `PAYMENT-SIGNATURE` (v2). Altana's SDK sends both, so the v1 header is matched against v1 offers (`celo`, not `eip155:42220`) and fails with `no_matching_requirements`. `src/payers/altana.mjs` now sends v2 only, and it pays on the token the session's onchain cap covers.
- With that fixed, the facilitator still answers `malformed_payload` for an ERC-1271 session signature (98 bytes). As of today it only takes 65-byte EOA signatures.
- **So the session key funds the payer instead of signing each payment:** it may call `USDC.transfer` under its onchain $0.05/day cap and moves the day's float to a plain spending key, whose EIP-3009 signatures buy accepts. The spending key holds only what the session key sent, so the Altana cap still bounds daily spending, and the SpendPolicy and ledger check every call before signing. Once the facilitator accepts ERC-1271, `SPENDGUARD_PAYER=altana` pays straight from the session key.
