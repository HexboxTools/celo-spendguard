# Status

Live page: https://hexboxtools.github.io/celo-spendguard/ (generated from this repo by `scripts/build-site.mjs`).

| Item | State |
|---|---|
| Agent wallet (Celo mainnet) | `0xC17733165C47f80E56b1c6eD61E8988296CA8f82` |
| ERC-8004 identity | **agentId 10134**, [tx 0xe47d71bb…](https://celoscan.io/tx/0xe47d71bb03cc18e736e43b0a3a5d9a31b750db81ec299da6c9205f631feb36e4) |
| Attribution tag (ERC-8021) | `celo_73a54a0daad9` on every owner/agent tx except the two Uniswap float swaps |
| Altana session (mainnet) | live: $0.05/day caps on USD₮ and USDC, USD₮-only call allowlist, expires Dec 9, 2026 |
| Mainnet paid x402 calls | **10 settled ($0.050)** across 6 briefs, 1 refused at the daily cap, 13 unsettled attempts at $0 (6 Altana ERC-1271 rejections, 7 provider errors) |
| Payment rail | capped spending key `0xB1809549…95ad` (buy's facilitator rejects ERC-1271 signatures; see below) |
| Tests | 14 passing (`npm test`) |

## Mainnet run (Nov 25, 2026)

Everything below is on Celo mainnet. Each transaction the owner or agent sent carries the Loops House attribution tag `celo_73a54a0daad9` (ERC-8021), except the two Uniswap swaps that bought the stablecoin float.

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
