# Spendguard Scout

**An agent that pays for its own data on Celo, inside a spend cap its owner sets.**

Built by [Hexbox Tools](https://github.com/HexboxTools) for Celo's *Agents Open for Business* hackathon (Nov–Dec 2026). All code written from 20 Nov 2026.

## The job

Builders, grant reviewers and hackathon judges keep asking the same question: *is anyone actually using this project?* Spendguard Scout answers it with a short traction brief:

- **Free sources first:** GitHub (stars, forks, commits in the last 30 days) and Hacker News (stories and points over 12 months).
- **Paid sources only when needed:** X, Reddit and YouTube searches bought per request on [buy](https://usebuy.ai), Celo Core Co.'s agent marketplace, at $0.005 a call, paid over **x402** in USD₮ on Celo mainnet.
- **A brief with its own bill:** each report ends with a *Data bill* table listing every paid call and its settlement transaction on Celoscan. You can check what the agent spent on your behalf.

Example (sandbox run on Celo Sepolia): [`reports/sandbox/2026-11-25-x402.md`](reports/sandbox/2026-11-25-x402.md).

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
npm test                                   # 13 tests: policy, parsers, local x402 seller end-to-end

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
