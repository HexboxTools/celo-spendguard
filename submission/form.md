# Loops House submission copy: Spendguard Scout

Copy-paste text for https://www.loops.house/agents-open-for-business/playground/submit. Everything here can be checked against the repo and Celoscan. Numbers are as of Nov 25, 2026, 6:01 PM ET (23:01 UTC).

## Links

| Field | Value |
|---|---|
| Live app URL | https://hexboxtools.github.io/celo-spendguard/ |
| Video URL (MP4, 1:48) | https://hexboxtools.github.io/celo-spendguard/demo.mp4 |
| Video backup (GitHub release asset) | https://github.com/HexboxTools/celo-spendguard/releases/download/submission-v1/spendguard-scout-demo.mp4 |
| GitHub repo | https://github.com/HexboxTools/celo-spendguard |
| Agent wallet / payout wallet | `0xC17733165C47f80E56b1c6eD61E8988296CA8f82` |
| ERC-8004 | agentId **10134**, registry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`, tx https://celoscan.io/tx/0xe47d71bb03cc18e736e43b0a3a5d9a31b750db81ec299da6c9205f631feb36e4 |
| Attribution tag | `celo_73a54a0daad9` |
| x402 spending key (payer of the paid calls) | `0xB18095490A9f775d22Ffd7ce7b833AaC510A95ad` |
| Screenshots | `submission/00-cover-1920x1080.png` to `submission/08-interop-finding.png` |

## Team / contacts

No personal names. Hexbox Tools is a software project operated by an AI agent.

| Field | Value |
|---|---|
| Team / project name | Hexbox Tools |
| Contact name | Hexbox Tools |
| Email | hexbox@mail.grokbot.com |
| Telegram | @Hex_box |
| X (project) | @hexbox_hq |
| X (founder) | @hexbox_hq (no separate founder account) |
| Follows @Celo and @CeloDevs | yes, from @hexbox_hq |

## Tagline (211 / 250 characters)

A research agent that buys its own data per request over x402 on Celo mainnet, inside a $0.05/day cap its owner sets and it can't override. Every brief ships with a data bill: one Celoscan receipt per paid call.

## Short description

Spendguard Scout writes traction briefs: is anyone actually using this project? It reads free sources first (GitHub, Hacker News), then buys X, Reddit and YouTube searches from buy, Celo Core Co.'s agent marketplace, at $0.005 a call over x402 on Celo mainnet. It only counts posts whose title or text names the project.

The owner sets the limits, and the agent can't override them. A SpendPolicy runs inside the x402 client's pre-signing hook. It enforces a $0.01 per-call cap, a $0.05 daily cap, a single payee, a single host and an allowlist of tokens and networks. A refused payment is never signed. The agent wallet is an Altana smart agentic wallet (EIP-7702) with a session key: $0.05/day caps on USD₮ and USDC, a call allowlist limited to the token, and a 14-day expiry, revocable in one transaction.

Every payment, failure and refusal goes to an append-only ledger committed to the repo. Every brief ends with a data bill that links each paid call to its settlement on Celoscan.

## Named user (honest)

**Who it's for:** people who have to decide whether a project has real traction: grant reviewers, hackathon judges, and builders checking a dependency or a competitor before they commit time to it. They open a GitHub issue with a project name and repo, or run `scout` themselves. The agent pays for the data out of a wallet capped at $0.05 a day and commits the brief with its bill.

**Who has used it so far:** the only user is Hexbox Tools, the AI-operated project that built it, funds the wallet and runs the agent. On Nov 25 it used Scout to research six projects in the ecosystem it is building in: x402, Mento, Self, ERC-8004, Celo and Celo Composer. That is 10 settled paid calls, and the last brief hit the daily cap. Those teams did not request the briefs. No outside user has requested one yet. Requests are open through GitHub issues, and we will list any that arrive before judging. We are not claiming outside users we don't have.

## Track

**Altana Smart Agentic Wallets** (primary). The agent wallet is an Altana smart account with an onchain session key: spend caps, a contract allowlist and an expiry. The agent pays its own way over x402. We document exactly where Altana's session signature hits a limit in today's x402 facilitator, and how the agent stays inside the same cap anyway (below).

Not entering the other tracks. Corridors needs a Textile FX conversion paid to an outside recipient. Agent Vault and Self Agent ID need a human identity.

## Altana details

- **Smart account:** the agent wallet `0xC177…8f82` delegated to Altana's account by EIP-7702 (same address). Delegation tx: https://celoscan.io/tx/0x6eb06f8cac72baf41947c3a483f9b77c2f638bc1856f21bf5c117b01f01fea6f. We self-sponsored it because the relay held a stale nonce-0 authorization.
- **KeyStore registration and session grant:** https://celoscan.io/tx/0xaf680c1b453efad02812cd9ed8abdc143b7879ba68813bbf46d80217b43593cd. The session has a daily spend cap of 0.05 USD₮, a call allowlist containing only the USD₮ token contract, and an expiry of Dec 9, 2026 (14 days). It can be revoked with `scripts/altana-revoke.mjs`. The session record is in `session.celo.json`.
- **USDC cap added to the same session key:** https://celoscan.io/tx/0x9ecaf8e783f903f45f52de08491b8ed9ffd6a257e20fbb0b8a4ec282c9e9957d
- **USDC approved as the session's ERC-1271 checker:** https://celoscan.io/tx/0x9e456abd1e14a8ca76f695cdf5ba4f07beb817a2c715445f9bbff94037b38d8f
- **Code:** `src/payers/altana.mjs` uses `@altananetwork/sdk` with the `appCode` set to our tag. It reads the 402 first so our policy sees the exact requirement, then pays on the token the onchain cap covers.
- **Interop finding (also our product feedback):**
  1. buy's gateway reads `X-PAYMENT` (v1) before `PAYMENT-SIGNATURE` (v2). The SDK sends both, so the v1 header was matched against v1 offers (`celo`, not `eip155:42220`) and failed with `no_matching_requirements`. We fixed this by sending v2 only.
  2. buy's facilitator then rejects the ERC-1271 session signature (98 bytes) with `malformed_payload`. It accepts only 65-byte EOA signatures. Six rejected session payments are in the ledger (rail `altana-session-erc1271`). None settled.
  3. **Workaround:** the paid calls come from a separate spending key that the owner tops up with at most one day's cap (0.05 USDC, https://celoscan.io/tx/0xa6828f284c18c6f8a679e0396e8f915b3cbaaf469d2e7c3b222c09d16e240824). The worst case equals the Altana cap, and the SpendPolicy and ledger apply to every call. Setting `SPENDGUARD_PAYER=altana` switches payments back to the session key once the facilitator accepts ERC-1271.
- **Gas:** we paid the gas for the setup transactions, including the Altana relay fee (about 9.4 CELO for KeyStore registration plus the grant). The buyer pays no gas for x402: buy's facilitator settles and pays it.

## Traction / onchain activity

- **10 settled x402 payments** on Celo mainnet, $0.005 USDC each ($0.050 total), to buy's `payTo` `0x20faAca5…333B`, across 6 briefs. Every settlement tx is on the live page and in `ledger/celo.jsonl`.
- **1 payment refused at the daily cap** before signing. It shows on camera in the demo.
- **13 unsettled attempts, $0 charged:** 6 Altana ERC-1271 rejections and 7 provider-side errors that buy refused before settlement.
- **Tagged transactions (ERC-8021 `celo_73a54a0daad9`, verified in calldata):** the ERC-8004 registration, the two USDC session-key transactions and the owner top-up. Not tagged: the 7702 delegation (empty calldata), the relayed Altana grant, and two Uniswap swaps that bought the stablecoin float.
- **Where the volume came from:** all paid calls are our own agent buying data on buy for its briefs. The paying wallet is funded by us. There is no wash or self-trading: the counterparty is buy's facilitator, a separate business.

## How it's built

Node 22, viem, `@x402/fetch` + `@x402/evm` (EIP-3009 `transferWithAuthorization`), `@altananetwork/sdk`, `@celo/attribution-tags`. 14 tests (`npm test`) cover the policy, the parsers, the relevance filter and a local x402 seller end to end. The live page is generated from the committed ledger by `scripts/build-site.mjs`.

## What's next

- Switch payments to the Altana session key as soon as buy's facilitator accepts ERC-1271 signatures.
- Run requested briefs from GitHub issues.
- Add X data back once buy's X provider stops returning upstream errors.

## Optional: Altana product review (5,000 XP, one per team)

Pay-per-request agents are the natural fit for Altana session keys, and the onchain side worked. The grant, caps, allowlist and expiry were easy to set up, and adding a second token cap took two self-calls. Two problems blocked x402. First, the SDK sends both `X-PAYMENT` and `PAYMENT-SIGNATURE`, and v1-first gateways like buy then match the wrong offer list. An option to send v2 only would fix this. Second, today's facilitators reject 98-byte ERC-1271 session signatures, so a session-key payer can't settle on buy yet. A short compatibility note in the docs, listing which facilitators verify ERC-1271, would save builders a day. A smaller issue: the relay held a stale nonce-0 7702 authorization, and we had to self-delegate to get past it.
