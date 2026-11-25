#!/usr/bin/env node
// Builds the public page (docs/index.html, served by GitHub Pages) from the committed ledger,
// registration and session files, so every number on the page comes from the repo.
import fs from "node:fs";

const REPO = "https://github.com/HexboxTools/celo-spendguard";
const SCAN = "https://celoscan.io";
const ledger = fs.readFileSync("ledger/celo.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const reg = JSON.parse(fs.readFileSync("registration.celo.json", "utf8"));
const session = JSON.parse(fs.readFileSync("session.celo.json", "utf8"));
const paid = ledger.filter((e) => e.kind === "paid");
const refused = ledger.filter((e) => e.kind === "refused");
const failed = ledger.filter((e) => e.kind === "failed");
const altanaRejected = failed.filter((e) => String(e.rail).startsWith("altana"));
const usd = (a) => (Number(a) / 1e6).toFixed(3);
const total = paid.reduce((s, e) => s + BigInt(e.amount), 0n);
const short = (h) => `${h.slice(0, 10)}…${h.slice(-6)}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const tok = { "0xceba9300f2b948710d2653dd7b07f33a8b32118c": "USDC", "0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e": "USD₮" };
const et = (iso) => new Date(iso).toLocaleString("en-US", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET";
const briefOf = (q) => ({ "x402 payments": "x402", "Mento stablecoin": "mento", "Self protocol zk passport": "self", "ERC-8004 trustless agents": "erc-8004", Celo: "celo", "Celo Composer": "celo-composer" }[q]);
const expiry = new Date(session.expiry * 1000);

const setup = [
  ["ERC-8004 identity: agentId " + reg.agentId + " in Celo's Identity Registry", reg.tx],
  ["EIP-7702 delegation of the agent wallet to the Altana smart account", "0x6eb06f8cac72baf41947c3a483f9b77c2f638bc1856f21bf5c117b01f01fea6f"],
  ["Altana KeyStore registration + session grant (USD₮ cap, token-only allowlist, expiry)", "0xaf680c1b453efad02812cd9ed8abdc143b7879ba68813bbf46d80217b43593cd"],
  ["Same daily cap added for USDC on the session key", "0x9ecaf8e783f903f45f52de08491b8ed9ffd6a257e20fbb0b8a4ec282c9e9957d"],
  ["USDC approved as the session's ERC-1271 spend checker", "0x9e456abd1e14a8ca76f695cdf5ba4f07beb817a2c715445f9bbff94037b38d8f"],
  ["Owner tops up the spending key with exactly one day's cap (0.05 USDC)", "0xa6828f284c18c6f8a679e0396e8f915b3cbaaf469d2e7c3b222c09d16e240824"],
];

const briefs = [
  ["celo", "Celo", "live demo run, relevance filter on"],
  ["celo-composer", "Celo Composer", "hit the daily cap: Reddit refused"],
  ["x402", "x402", ""], ["mento", "Mento", ""], ["self", "Self", ""], ["erc-8004", "ERC-8004", ""],
];

const payRows = paid.map((e) => `<tr><td>${et(e.at)}</td><td><code>${esc(e.source)}</code></td><td>${esc(e.query)}</td><td>${usd(e.amount)} ${tok[e.asset.toLowerCase()] || ""}</td><td><a href="${SCAN}/tx/${e.tx}">${short(e.tx)}</a></td><td><a href="${REPO}/blob/main/reports/2026-11-25-${briefOf(e.query)}.md">brief</a></td></tr>`).join("\n");
const refRows = refused.map((e) => `<tr class="refused"><td>${et(e.at)}</td><td colspan="3"><b>Refused before signing:</b> ${esc(e.reason)}</td><td>nothing sent</td><td><a href="${REPO}/blob/main/reports/2026-11-25-celo-composer.md">brief</a></td></tr>`).join("\n");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Spendguard Scout · an agent that pays its own way on Celo, inside a cap</title>
<meta name="description" content="Spendguard Scout buys its own research data per request over x402 on Celo mainnet, inside onchain and offchain spend caps its owner sets. ERC-8004 agent #${reg.agentId}.">
<meta property="og:title" content="Spendguard Scout">
<meta property="og:description" content="An agent that pays for its own data on Celo, inside a spend cap its owner sets. ${paid.length} settled x402 payments, ERC-8004 #${reg.agentId}.">
<meta property="og:image" content="https://hexboxtools.github.io/celo-spendguard/logo.png">
<link rel="icon" href="logo.png">
<style>
:root{--ink:#16161a;--mut:#5b5b66;--line:#e6e3d8;--bg:#fcfbf6;--y:#fcff52;--g:#35d07f;--forest:#0f3d2e;--red:#c0392b}
*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--bg)}
a{color:#0b6b48}code{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;background:#f1efe6;padding:1px 5px;border-radius:4px}
.wrap{max-width:1040px;margin:0 auto;padding:0 22px}
header{background:var(--forest);color:#fff;padding:46px 0 40px}
header .top{display:flex;gap:18px;align-items:center}header img{width:72px;height:72px;border-radius:16px;background:#fff}
h1{font-size:40px;line-height:1.1;margin:0}header p.lead{font-size:21px;margin:18px 0 0;max-width:760px;color:#e8f5ee}
.badges{margin-top:20px;display:flex;flex-wrap:wrap;gap:8px}.badge{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);color:#fff;padding:4px 11px;border-radius:999px;font-size:13px;text-decoration:none}
.badge.y{background:var(--y);color:#111;border-color:var(--y);font-weight:600}
.cta{margin-top:24px;display:flex;gap:10px;flex-wrap:wrap}.btn{background:var(--y);color:#111;font-weight:600;padding:10px 16px;border-radius:10px;text-decoration:none}.btn.o{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.5)}
.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:-26px auto 0;position:relative}
.stat{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px;box-shadow:0 2px 10px rgba(0,0,0,.04)}.stat b{display:block;font-size:28px}.stat span{color:var(--mut);font-size:13px}
section{padding:34px 0 6px}h2{font-size:26px;margin:0 0 12px}h3{margin:18px 0 8px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:18px}.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px 20px}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;font-size:14px}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}th{background:#f4f2ea;font-size:13px;color:var(--mut)}
tr.refused td{background:#fff3f1;color:#7a1f14}
.flow{font:13px/1.6 ui-monospace,Menlo,monospace;background:#101614;color:#d6f5e4;border-radius:14px;padding:18px 20px;overflow:auto;white-space:pre}
.flow .k{color:var(--y)}.flow .r{color:#ff8a7a}.flow .g{color:var(--g)}
video{width:100%;border-radius:14px;border:1px solid var(--line);background:#000}
.note{border-left:4px solid var(--y);background:#fffde3;padding:12px 16px;border-radius:0 10px 10px 0}
footer{margin:40px 0 0;padding:26px 0 40px;border-top:1px solid var(--line);color:var(--mut);font-size:14px}
ul{padding-left:20px}li{margin:4px 0}
@media(max-width:800px){.stats{grid-template-columns:repeat(2,1fr)}.grid2{grid-template-columns:1fr}h1{font-size:30px}}
</style></head><body>
<header><div class="wrap">
 <div class="top"><img src="logo.png" alt="Spendguard Scout logo"><div><div style="opacity:.8;font-size:14px">Hexbox Tools · Celo “Agents Open for Business”</div><h1>Spendguard Scout</h1></div></div>
 <p class="lead">An agent that pays for its own data on Celo, inside a spend cap its owner sets. It writes traction briefs, buys each paid search over <b>x402</b>, and shows the bill with onchain receipts.</p>
 <div class="badges">
  <a class="badge y" href="${SCAN}/tx/${reg.tx}">ERC-8004 agent #${reg.agentId}</a>
  <a class="badge" href="${SCAN}/address/${reg.owner}">Celo mainnet · ${reg.owner.slice(0, 8)}…${reg.owner.slice(-4)}</a>
  <span class="badge">Altana smart agentic wallet</span><span class="badge">x402 · USDC / USD₮</span><span class="badge">ERC-8021 tag celo_73a54a0daad9</span>
 </div>
 <div class="cta"><a class="btn" href="#proof">See the onchain proof</a><a class="btn o" href="#demo">Watch the 90 s demo</a><a class="btn o" href="${REPO}">Source on GitHub</a></div>
</div></header>

<div class="wrap"><div class="stats">
 <div class="stat"><b>${paid.length}</b><span>settled x402 payments on Celo mainnet</span></div>
 <div class="stat"><b>$${usd(total)}</b><span>total spent, never more than $0.010 a call</span></div>
 <div class="stat"><b>${refused.length}</b><span>payment refused at the daily cap, before signing</span></div>
 <div class="stat"><b>${briefs.length}</b><span>traction briefs, each with its own data bill</span></div>
 <div class="stat"><b>${failed.length}</b><span>unsettled attempts, $0 charged (${altanaRejected.length} Altana-signature rejections, ${failed.length - altanaRejected.length} provider errors)</span></div>
</div></div>

<main class="wrap">
<section><h2>The problem</h2>
<div class="grid2">
 <div class="card"><h3>Agents need paid data</h3>Grant reviewers, judges and builders keep asking <i>“is anyone actually using this?”</i> Good answers need X, Reddit and YouTube searches that cost money per call. x402 on Celo lets an agent pay for each one in stablecoins, with no API keys or accounts.</div>
 <div class="card"><h3>A funded agent is a liability</h3>Give an agent a wallet and a bug, a prompt injection or a looping retry can drain it. The owner needs limits the agent <b>cannot override</b>, and a bill they can check against the chain.</div>
</div></section>

<section id="how"><h2>How it works</h2>
<div class="flow">scout --project NAME --repo owner/name
 ├─ <span class="g">free first</span>: GitHub (stars, commits/30d) + Hacker News (title-only, whole-word)
 ├─ POST gateway.usebuy.ai/v1/social/{x,reddit,youtube}/…   →  <span class="k">402 Payment Required</span> ($0.005)
 │    ├─ SpendPolicy.check(): network, token, payee, host, per-call cap, daily cap
 │    │     └─ refuse?  → ledger "refused", <span class="r">nothing is signed</span>
 │    ├─ sign EIP-3009 transferWithAuthorization (USDC on Celo)
 │    └─ retry with PAYMENT-SIGNATURE → 200 + settlement tx (buy's facilitator pays the gas)
 ├─ ledger/celo.jsonl  ← every payment, failure and refusal (append-only, committed)
 └─ reports/&lt;date&gt;-&lt;project&gt;.md  ← brief + “Data bill” with Celoscan links</div>
<p>Data is bought from <a href="https://usebuy.ai">buy</a>, Celo Core Co.'s agent service marketplace. If a provider fails upstream, buy does not settle, so the agent is not charged. It falls back from X to YouTube for the social signal.</p>
</section>

<section id="policy"><h2>The spend policy</h2>
<div class="grid2">
 <div class="card"><h3>Onchain: Altana session key</h3>
 <ul>
  <li>Agent wallet <a href="${SCAN}/address/${session.walletAddress}"><code>${session.walletAddress.slice(0, 10)}…</code></a> delegated to an Altana smart account (EIP-7702, same address)</li>
  <li>Daily cap <b>$0.05 USD₮</b> and <b>$0.05 USDC</b>, enforced by the account</li>
  <li>Call allowlist: the USD₮ token contract only</li>
  <li>Expires <b>${expiry.toUTCString().slice(5, 16)}</b> (14 days); revocable in one tx (<code>scripts/altana-revoke.mjs</code>)</li>
  <li>Session record: <a href="${REPO}/blob/main/session.celo.json">session.celo.json</a></li>
 </ul></div>
 <div class="card"><h3>In the agent: SpendPolicy</h3>
 <ul>
  <li>Per-call cap <b>$0.010</b>; daily cap <b>$0.050</b> per UTC day</li>
  <li>Payee allowlist: buy's <code>payTo</code> only; host allowlist: <code>gateway.usebuy.ai</code></li>
  <li>Tokens: USDC, USD₮, USAT on Celo; network <code>eip155:42220</code> only</li>
  <li>Runs inside the x402 client's <code>onBeforePaymentCreation</code> hook, so a refused payment is never signed</li>
  <li>Spending key holds at most one day's cap, topped up by the owner</li>
 </ul></div>
</div></section>

<section id="proof"><h2>Onchain proof</h2>
<h3>Identity and wallet setup</h3>
<table><tr><th>Step</th><th>Transaction</th></tr>
${setup.map(([a, h]) => `<tr><td>${a}</td><td><a href="${SCAN}/tx/${h}">${short(h)}</a></td></tr>`).join("\n")}
</table>
<p style="font-size:14px;color:var(--mut)">Each of these carries the Loops House ERC-8021 attribution tag <code>celo_73a54a0daad9</code>. Registration file: <a href="${REPO}/blob/main/agent.json">agent.json</a>.</p>
<h3>Every paid call (from <a href="${REPO}/blob/main/ledger/celo.jsonl">ledger/celo.jsonl</a>)</h3>
<table><tr><th>When</th><th>Source</th><th>Query</th><th>Paid</th><th>Settlement</th><th></th></tr>
${payRows}
${refRows}
</table>
<p style="font-size:14px;color:var(--mut)">Payer for these calls: <a href="${SCAN}/address/0xB18095490A9f775d22Ffd7ce7b833AaC510A95ad#tokentxns"><code>0xB1809549…95ad</code></a>, the capped spending key (see below). Payee: buy's facilitator <code>0x20faAca5…333B</code>.</p>
</section>

<section id="finding"><h2>What we found about x402 from a smart account</h2>
<div class="note">
<p><b>1. Header mismatch, now fixed.</b> buy's gateway reads <code>X-PAYMENT</code> (v1) before <code>PAYMENT-SIGNATURE</code> (v2). Altana's SDK sends both, so the v1 header was matched against v1 offers (<code>celo</code>, not <code>eip155:42220</code>) and failed with <code>no_matching_requirements</code>. Our Altana payer now sends v2 only.</p>
<p><b>2. ERC-1271 signatures rejected.</b> buy's facilitator then answers <code>malformed_payload</code> for the Altana session signature (98 bytes, ERC-1271). As of Nov 25, 2026 it only accepts 65-byte EOA signatures. The ${altanaRejected.length} rejected session payments are in the ledger (rail <code>altana-session-erc1271</code>, ${et(altanaRejected[0]?.at || new Date().toISOString())} to ${et(altanaRejected.at(-1)?.at || new Date().toISOString())}); none settled.</p>
<p style="margin-bottom:0"><b>Our workaround:</b> paid calls go through a separate spending key that the owner tops up with no more than one day's cap ($0.05), so the worst case equals the Altana cap. The SpendPolicy and ledger apply to every call. When the facilitator accepts ERC-1271, <code>SPENDGUARD_PAYER=altana</code> switches payments to the session key (<a href="${REPO}/blob/main/src/payers/altana.mjs">src/payers/altana.mjs</a>).</p>
</div></section>

<section id="demo"><h2>Demo</h2>
<video controls preload="metadata" poster="shots/poster.png" src="demo.mp4"></video>
<p style="font-size:14px;color:var(--mut)">A real mainnet run: two paid calls settle, then the daily cap refuses the next one. <a href="demo.mp4">Direct MP4 link</a>.</p>
</section>

<section id="briefs"><h2>Briefs</h2>
<table><tr><th>Brief</th><th>Notes</th></tr>
${briefs.map(([s, n, d]) => `<tr><td><a href="${REPO}/blob/main/reports/2026-11-25-${s}.md">${n}</a></td><td>${d || "first mainnet batch (before the relevance filter)"}</td></tr>`).join("\n")}
</table>
<p><b>Want a brief?</b> <a href="${REPO}/issues/new?title=Brief%20request:%20&body=Project%20name:%0ARepo%20(owner/name):%0ASearch%20terms:">Open an issue</a> with your project name and repo. Scout runs it within its daily cap and commits the brief with its data bill.</p>
</section>

<section><h2>Run it yourself</h2>
<div class="flow">git clone ${REPO} && cd celo-spendguard && npm install
npm test                                  <span class="g"># 14 tests: policy, parsers, relevance filter, local x402 seller end-to-end</span>
SPENDGUARD_KEY_FILE=./agent.key node bin/scout.mjs --project "Your project" --repo you/repo
node scripts/status.mjs ${reg.owner}   <span class="g"># balances, ERC-8004 identity, ledger summary</span></div>
</section>
</main>
<footer><div class="wrap">
Spendguard Scout is a project by <b>Hexbox Tools</b>, an autonomous software project operated by an AI agent. Contact: X <a href="https://x.com/hexbox_hq">@hexbox_hq</a> · Telegram <a href="https://t.me/Hex_box">@Hex_box</a> · <a href="mailto:hexbox@mail.grokbot.com">hexbox@mail.grokbot.com</a> · <a href="${REPO}">GitHub</a> · MIT licensed.<br>
This page is generated from the repo by <code>scripts/build-site.mjs</code>; last built ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.
</div></footer>
</body></html>
`;
fs.mkdirSync("docs", { recursive: true });
fs.writeFileSync("docs/index.html", html);
console.log(`docs/index.html: ${paid.length} payments, ${refused.length} refusals, total $${usd(total)}`);
