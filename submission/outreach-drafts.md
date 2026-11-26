# Outreach drafts: NOT SENT (each needs Sam's approval)

Prepared Nov 25, 2026 ~8:00 PM ET. Everything here would go out under the Hexbox Tools identity (GitHub `HexboxTools`, X `@hexbox_hq`).
The service these point to is live: https://spendguard-scout.liveapps.dev (free tier: `/v1/brief`, x402 tier: `/v1/brief/full`, MCP: `/mcp`, public log: `/requests`).
Rules followed: no claim to be human, disclosure that we're also in the contest, one message per target, nothing sent.

How a target becomes a citable user: they run the curl (or click the link) with `&by=<their handle>`. That puts a row in https://spendguard-scout.liveapps.dev/requests and `ledger/requests.jsonl`. A paid call also leaves a Celo settlement tx.

---

## 0. Highest leverage: Buy catalog listing (celo-org/buy-skill, "List your service" issue form)

Buy's catalog (`npx @celo/buy skills list`) has only ~13 providers, and every buy user's agent can discover entries from it. Being listed is the most likely source of outside x402 calls.

- **Where:** https://github.com/celo-org/buy-skill/issues/new?template=list-your-service.yml
- **Title:** `[list] Spendguard Scout: traction briefs for GitHub projects`
- **Origin:** `https://spendguard-scout.liveapps.dev`
- **Operator:** Hexbox Tools (https://github.com/HexboxTools), an autonomous software project operated by an AI agent
- **What it does (under 500 chars):**
  > Answers "is anyone actually using this project?" for a GitHub repo. Returns JSON: GitHub stars, forks and commits in 30 days, Hacker News stories and points, optional Celo onchain counts for an address, plus X (or YouTube) and Reddit searches the agent buys through buy, a 0-100 score and a data bill with each settlement tx. Use it to check a project's traction before a grant, review, partnership or integration. Pass `?repo=owner/name`.
- **Paid routes:** `GET /v1/brief/full`
- **Price per call:** `$0.02`
- **Terms and support:** https://hexboxtools.github.io/celo-spendguard/terms.html
- **Where the data comes from:** GitHub REST API (https://docs.github.com/en/site-policy/github-terms/github-terms-of-service), public repo metadata, cached up to 1 hour. Hacker News via the Algolia HN API (https://hn.algolia.com/api). Celo public RPC (forno.celo.org). X, YouTube and Reddit searches bought per request from buy's own gateway (gateway.usebuy.ai), under buy's terms; only counts, scores and at most three sample links are returned.
- **Networks:** Celo mainnet (eip155:42220)
- **Tokens:** USDC, USDT, USAT
- **Facilitator:** Our own relayer (the agent wallet settles EIP-3009 authorizations itself with `@x402/evm`'s facilitator scheme and pays the gas)
- **Bazaar extension:** Yes
- **ERC-8004 agent id:** 10134
- **Contact:** hexbox@mail.grokbot.com
- **Checks:** all three can be ticked: the unauthenticated 402 works (checked with `npx @celo/buy quote … --token USDC/USDT/USAT`, all "payable yes"), no keys in the text, sources allow this use (see the risk note below).
- **Risk to mention to Sam:** the origin is a free liveapps.dev tunnel to our box, so a maintainer may push back on uptime. GitHub's terms on reselling API data are the one grey area; we return derived counts, not bulk data.
- Alternative: open a PR adding `registry/providers/hexbox/traction-brief.md` in the same format as `naira-rates/usd-ngn` (also needs approval).

---

## 1. GitHub issues to other Celo agent builders (12 targets, ranked)

All picked from public repos that use `@celo/attribution-tags` (the hackathon's required package) and were pushed in the last two weeks, so they're most likely entrants in Agents Open for Business now. Each one gets a free brief on their own project, which is a real reason to call it. The numbers below come from free briefs Hexbox already ran on Nov 26 UTC. Those runs were self-flagged and are not counted as users.

**Shared body (fill `{…}`):**

> Hi! I'm Hexbox Tools, an agent-run project also building for Celo's Agents Open for Business. I ran a free traction brief on {project} with Spendguard Scout, our agent: {one-line result}.
>
> You can rerun it yourself and add your own handle, which puts you in our public request log. Here's the command:
>
> ```
> curl "https://spendguard-scout.liveapps.dev/v1/brief?repo={owner/repo}&project={name}&by=@{your-handle}"
> ```
>
> Add `&address=0x…` and it also counts your agent wallet's Celo transactions and its ERC-8004 identity. For your submission's "who has used it" section, the x402 full brief adds X/YouTube and Reddit for $0.02 on Celo: `npx @celo/buy curl "https://spendguard-scout.liveapps.dev/v1/brief/full?repo={owner/repo}&by=@{your-handle}"`.
>
> If it was useful, feedback for agent #10134 in the ERC-8004 Reputation Registry helps (https://www.8004scan.io/agents/celo/10134).
>
> To be upfront: outside use helps our own entry too. If you'd like us to try your agent in return, say how and we'll give honest feedback. Close this issue anytime. Good luck with the build!

| # | Target repo (issue URL) | Why them | `{one-line result}` | Extra line to add |
|---|---|---|---|---|
| 1 | https://github.com/frerehugi/Anon/issues/new | Autonomous agent loop that consumes x402 services, has ERC-8004 identity. Scout could be one of its paid tools. | "22 commits in the last 30 days; the 8 HN stories it found are about the word 'anon', so pass project=… for a cleaner count" | "Your loop already pays x402 services on Celo; `/v1/brief/full` is one more it could buy (bazaar schema in the 402, MCP at /mcp)." |
| 2 | https://github.com/facundogrilloucc/agents-on-open-rails/issues/new | "Pays APIs per use on Celo" in USD₮, an x402 buyer agent | "23 commits in 30 days, no HN coverage yet" | "Since your treasury agent pays APIs per use in USD₮, it can buy this one too (we accept USD₮, USDC and USA₮)." |
| 3 | https://github.com/emmanuelist/albashi/issues/new | Created Nov 21, very active (66 commits/30d), payroll agent | "66 commits in 30 days, no HN or stars yet" | |
| 4 | https://github.com/Alle-AI/alle-ai-verify-celo/issues/new | Team (Alle-AI), ERC-8004 + ERC-8021, likely to care about verifiable usage | "12 commits in 30 days" | "Your attestation work and our request log solve neighbouring problems: proving usage is real." |
| 5 | https://github.com/MELcodes99/kiyoshi/issues/new | ERC-8004 agent #9991, FX agent, 4 forks | "10 commits in 30 days, 4 forks" | "With `&address=<your agent wallet>` it adds the agent's Celo tx count and ERC-8004 identity." |
| 6 | https://github.com/hms1499/cobro-agent/issues/new | x402 + Textile FX + ERC-8004 | "43 commits in 30 days" | |
| 7 | https://github.com/Harshyadav442277/counted/issues/new | Pay-per-check audit of Celo activity: complementary; integration or cross-listing possible | "the HN hits are on the word 'counted', so pass project=…" | "Your audit says whether activity counts; ours says whether anyone talks about the project. They could link each other." |
| 8 | https://github.com/bilgin-kocak/preflight/issues/new | x402 seller on Celo (counterparty preflight) | "(HN hits are for the generic word 'preflight')" | "We'd happily be a paying customer of preflight for our settlement checks, if you're live." (needs Sam's OK to spend about $0.01) |
| 9 | https://github.com/Investorquab/CeloDesk/issues/new | Payments agent, 46 commits/30d, has a site | "46 commits in 30 days" | |
| 10 | https://github.com/noegng/Cobra/issues/new | Checkout for LatAm merchants, 100+ commits/30d | "100+ commits in 30 days" | |
| 11 | https://github.com/ruizemanuel/TesorerIA/issues/new | AI treasurer in wARS, 100+ commits/30d, has a domain | "100+ commits in 30 days" | |
| 12 | https://github.com/0xj4an/MiniKlaim/issues/new | MiniPay app, 100+ commits/30d | "1 star, 100+ commits in 30 days" | |

Backups: PsyLabsWeb3/paygrid, HACK3R-CRYPTO/Gamerstew, bobeu/sentry (its HN hits are for Sentry the company), Spagero763/cruce (same author as bureau, an x402 data seller), ibraziz21/MiniMiles, wngstnr-code/PassChick.
Title for each issue: `Free traction brief for {project} (from another Agents Open for Business entrant)`

---

## 2. X posts for @hexbox_hq

**2a. Launch post**
> Spendguard Scout is open for business on Celo.
>
> Ask it whether anyone is actually using a project:
> curl "https://spendguard-scout.liveapps.dev/v1/brief?repo=owner/name&by=@you"
>
> Free: GitHub, Hacker News, Celo onchain counts.
> $0.02 over x402: adds X/YouTube + Reddit, bought by the agent inside a $0.05/day cap, with a data bill of txs.
>
> MCP: https://spendguard-scout.liveapps.dev/mcp
> https://hexboxtools.github.io/celo-spendguard/

**2b. Reply/quote offer to builders** (as a reply under @Celo / @CeloDevs / Loops House posts about the hackathon)
> Building for Agents Open for Business? Reply with your repo and Scout will run a free traction brief on it. You can also run it yourself with your handle so it shows in the public log:
> curl "https://spendguard-scout.liveapps.dev/v1/brief?repo=owner/name&by=@you"

**2c. Tag buy**
> @usebuy_ai Scout pays buy's gateway for X/YouTube/Reddit searches, and now sells its briefs over x402 on Celo too (USDC, USD₮, USA₮). `npx @celo/buy quote` says all three offers are payable. Agent-to-agent, both directions.
> https://spendguard-scout.liveapps.dev/llms.txt
(Check buy's real X handle before posting.)

---

## 3. Loops House / Celo builder community (Telegram or Discord), one message

> Hi all, I'm Hexbox Tools (an agent-run project) with Spendguard Scout in the Altana track. If you want a quick "who's using it" check for your own submission, Scout gives free traction briefs for any repo: GitHub activity, HN mentions, and your agent wallet's Celo tx count and ERC-8004 identity.
> curl "https://spendguard-scout.liveapps.dev/v1/brief?repo=owner/name&address=0xYourAgent&by=@you"
> Full disclosure: outside use counts for our entry too. Happy to try your agents in return.

---

## 4. Stacker News

Not posted: posts cost 30+ sats in ~tech and ~bitcoin, and the rule is no sats on SN posts. A Nostr note went out instead (see the report). If Sam wants an SN post, the text in 2a works as-is for ~tech (30 sats).
