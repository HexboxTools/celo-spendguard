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
const topups = ledger.filter((e) => e.kind === "topup" && e.rail === "altana-session");
const firstTopup = topups[0]?.at || "9999";
const altanaFunded = paid.filter((e) => e.at > firstTopup);
const topupTotal = topups.reduce((s, e) => s + BigInt(e.amount), 0n);
const topupFees = topups.reduce((s, e) => s + BigInt(e.fee || 0), 0n);
const usd = (a) => (Number(a) / 1e6).toFixed(3);
const total = paid.reduce((s, e) => s + BigInt(e.amount), 0n);
const short = (h) => `${h.slice(0, 10)}…${h.slice(-6)}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const tok = { "0xceba9300f2b948710d2653dd7b07f33a8b32118c": "USDC", "0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e": "USD₮" };
const et = (iso) => new Date(iso).toLocaleString("en-US", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET";
const briefSlug = (e) => `${e.day}-${briefOf(e.query)}`;
const briefOf = (q) => ({ "x402 payments": "x402", "Mento stablecoin": "mento", "Self protocol zk passport": "self", "ERC-8004 trustless agents": "erc-8004", Celo: "celo", "Celo Composer": "celo-composer", Altana: "altana", MiniPay: "minipay" }[q]);
const expiry = new Date(session.expiry * 1000);

const TAGGED = new Set(["0x6c25718b7aa8288be290f87a13fb62328e28030143a8608c4dab57c847aaadc4", ...topups.map((t) => t.tx), "0xe47d71bb03cc18e736e43b0a3a5d9a31b750db81ec299da6c9205f631feb36e4", "0x9ecaf8e783f903f45f52de08491b8ed9ffd6a257e20fbb0b8a4ec282c9e9957d", "0x9e456abd1e14a8ca76f695cdf5ba4f07beb817a2c715445f9bbff94037b38d8f", "0xa6828f284c18c6f8a679e0396e8f915b3cbaaf469d2e7c3b222c09d16e240824"]);
const setup = [
  ["ERC-8004 identity: agentId " + reg.agentId + " in Celo's Identity Registry", reg.tx],
  ["EIP-7702 delegation of the agent wallet to the Altana smart account", "0x6eb06f8cac72baf41947c3a483f9b77c2f638bc1856f21bf5c117b01f01fea6f"],
  ["Altana KeyStore registration + session grant (USD₮ cap, token-only allowlist, expiry)", "0xaf680c1b453efad02812cd9ed8abdc143b7879ba68813bbf46d80217b43593cd"],
  ["Same daily cap added for USDC on the session key", "0x9ecaf8e783f903f45f52de08491b8ed9ffd6a257e20fbb0b8a4ec282c9e9957d"],
  ["USDC approved as the session's ERC-1271 spend checker", "0x9e456abd1e14a8ca76f695cdf5ba4f07beb817a2c715445f9bbff94037b38d8f"],
  ["Owner tops up the spending key with one day's cap (0.05 USDC). Funded the first 10 payments, before the session key took over funding", "0xa6828f284c18c6f8a679e0396e8f915b3cbaaf469d2e7c3b222c09d16e240824"],
  ["Session key allowed to call <code>USDC.transfer</code> (and nothing else on USDC): <code>setCanExecute</code>, one admin self-call", "0x6c25718b7aa8288be290f87a13fb62328e28030143a8608c4dab57c847aaadc4"],
  ...topups.map((t) => [`<b>Altana session key tops up the spending key</b>: ${usd(t.amount)} USDC from the smart wallet, signed by the session key, sent via Altana's relay (relay fee ${usd(t.fee)} USDC), counted against the onchain $0.05/day USDC cap`, t.tx]),
];

const briefs = [
  ["2026-11-26-altana", "Altana", "paid from the Altana session key's top-up"],
  ["2026-11-26-minipay", "MiniPay", "paid from the Altana session key's top-up"],
  ["2026-11-25-celo", "Celo", "first demo run, relevance filter on"],
  ["2026-11-25-celo-composer", "Celo Composer", "hit the daily cap: Reddit refused"],
  ["2026-11-25-x402", "x402", ""], ["2026-11-25-mento", "Mento", ""], ["2026-11-25-self", "Self", ""], ["2026-11-25-erc-8004", "ERC-8004", ""],
].filter(([s]) => fs.existsSync(`reports/${s}.md`));

const payRows = paid.map((e) => `<tr><td>${et(e.at)}</td><td><code>${esc(e.source)}</code></td><td>${esc(e.query)}</td><td>${usd(e.amount)} ${tok[e.asset.toLowerCase()] || ""}</td><td><a href="${SCAN}/tx/${e.tx}">${short(e.tx)}</a></td><td><a href="briefs/${briefSlug(e)}.html">brief</a>${e.at > firstTopup ? ' <span class="pill">Altana-funded</span>' : ""}</td></tr>`).join("\n");
const refRows = refused.map((e) => `<tr class="refused"><td>${et(e.at)}</td><td colspan="3"><b>Refused before signing:</b> ${esc(e.reason)}</td><td>nothing sent</td><td><a href="briefs/${e.day}-celo-composer.html">brief</a></td></tr>`).join("\n");

// Minimal Markdown for the briefs: headings, bullets, tables, quotes, links, bold, italics, code.
const inline = (t) => esc(t).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/_([^_]+)_$/g, "<i>$1</i>").replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, a, h) => `<a href="${h.replace(/^(2026-[\w-]+)\.md$/, "$1.html")}">${a}</a>`);
function md(src) {
  const out = []; let list = false, table = false;
  for (const line of src.split("\n")) {
    if (!line.startsWith("- ") && list) { out.push("</ul>"); list = false; }
    if (!line.startsWith("|") && table) { out.push("</table>"); table = false; }
    if (line.startsWith("# ")) out.push(`<h1>${inline(line.slice(2))}</h1>`);
    else if (line.startsWith("## ")) out.push(`<h2>${inline(line.slice(3))}</h2>`);
    else if (line.startsWith("- ")) { if (!list) { out.push("<ul>"); list = true; } out.push(`<li>${inline(line.slice(2))}</li>`); }
    else if (line.startsWith("> ")) out.push(`<p class="note">${inline(line.slice(2))}</p>`);
    else if (line.startsWith("|")) { if (/^\|[-| ]+\|$/.test(line)) continue; const cells = line.slice(1, -1).split("|").map((c) => c.trim()); if (!table) { out.push("<table>"); table = true; out.push(`<tr>${cells.map((c) => `<th>${inline(c)}</th>`).join("")}</tr>`); } else out.push(`<tr>${cells.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`); }
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push("</ul>"); if (table) out.push("</table>");
  return out.join("\n");
}
fs.mkdirSync("docs/briefs", { recursive: true });
for (const [slug, name] of briefs) {
  const src = fs.readFileSync(`reports/${slug}.md`, "utf8");
  fs.writeFileSync(`docs/briefs/${slug}.html`, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Traction brief: ${esc(name)} · Spendguard Scout</title><link rel="icon" href="../logo.png"><style>body{margin:0;font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#16161a;background:#fcfbf6}.bar{background:#0f3d2e;color:#fff;padding:14px 0}.bar a{color:#fcff52;text-decoration:none;font-weight:600}.w{max-width:860px;margin:0 auto;padding:0 22px}h1{margin:28px 0 10px}a{color:#0b6b48}code{font:13px ui-monospace,Menlo,monospace;background:#f1efe6;padding:1px 5px;border-radius:4px}table{border-collapse:collapse;width:100%;background:#fff;border:1px solid #e6e3d8}th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #e6e3d8}th{background:#f4f2ea}.note{border-left:4px solid #fcff52;background:#fffde3;padding:10px 14px}footer{color:#5b5b66;font-size:14px;margin:30px 0}</style></head><body><div class="bar"><div class="w"><a href="../">← Spendguard Scout</a></div></div><div class="w">${md(src)}<footer>Source: <a href="${REPO}/blob/main/reports/${slug}.md">reports/${slug}.md</a> · data: <a href="${REPO}/blob/main/reports/${slug}.json">JSON</a></footer></div></body></html>\n`);
}

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
.stats{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin:-26px auto 0;position:relative}
.stat{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px;box-shadow:0 2px 10px rgba(0,0,0,.04)}.stat b{display:block;font-size:28px}.stat span{color:var(--mut);font-size:13px}
section{padding:34px 0 6px}h2{font-size:26px;margin:0 0 12px}h3{margin:18px 0 8px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:18px}.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px 20px}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;font-size:14px}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}th{background:#f4f2ea;font-size:13px;color:var(--mut)}
tr.refused td{background:#fff3f1;color:#7a1f14}.pill{background:#fcff52;color:#111;border-radius:999px;padding:1px 8px;font-size:12px;font-weight:600;white-space:nowrap}
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
 <p class="lead">An agent that pays for its own data on Celo, inside a spend cap its owner sets. It writes traction briefs, buys each paid search over <b>x402</b>, and shows the bill with onchain receipts. An <b>Altana session key</b> funds its spending key under an onchain daily cap.</p>
 <div class="badges">
  <a class="badge y" href="${SCAN}/tx/${reg.tx}">ERC-8004 agent #${reg.agentId}</a>
  <a class="badge" href="${SCAN}/address/${reg.owner}">Celo mainnet · ${reg.owner.slice(0, 8)}…${reg.owner.slice(-4)}</a>
  <span class="badge">Altana smart agentic wallet</span><span class="badge">x402 · USDC / USD₮</span><span class="badge">ERC-8021 tag celo_73a54a0daad9</span>
 </div>
 <div class="cta"><a class="btn" href="#proof">See the onchain proof</a><a class="btn o" href="#demo">Watch the demo</a><a class="btn o" href="${REPO}">Source on GitHub</a></div>
</div></header>

<div class="wrap"><div class="stats">
 <div class="stat"><b>${paid.length}</b><span>settled x402 payments on Celo mainnet</span></div>
 <div class="stat"><b>$${usd(total)}</b><span>total spent, never more than $0.010 a call</span></div>
 <div class="stat"><b>${altanaFunded.length}</b><span>payments funded by the Altana session key's top-up (${usd(topupTotal)} USDC)</span></div>
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
<div class="flow"><span class="k">owner</span>  grants an Altana session key: USDC.transfer only, $0.05/day cap, 14-day expiry (onchain)
<span class="k">session key</span>  smart wallet ──USDC.transfer (≤ cap, incl. relay fee)──▶ x402 spending key        <span class="g"># scripts/altana-topup.mjs</span>
<span class="k">agent</span>  scout --project NAME --repo owner/name
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
  <li>May call: <b><code>USDC.transfer</code></b> (to top up the spending key) and the USD₮ contract; nothing else</li>
  <li>Every top-up and its relay fee count against today's onchain USDC cap (<code>node scripts/session-status.mjs</code> reads it live)</li>
  <li>Expires <b>${expiry.toUTCString().slice(5, 16)}</b> (14 days); revocable in one tx (<code>scripts/altana-revoke.mjs</code>)</li>
  <li>Session record: <a href="${REPO}/blob/main/session.celo.json">session.celo.json</a></li>
 </ul></div>
 <div class="card"><h3>In the agent: SpendPolicy</h3>
 <ul>
  <li>Per-call cap <b>$0.010</b>; daily cap <b>$0.050</b> per UTC day</li>
  <li>Payee allowlist: buy's <code>payTo</code> only; host allowlist: <code>gateway.usebuy.ai</code></li>
  <li>Tokens: USDC, USD₮, USAT on Celo; network <code>eip155:42220</code> only</li>
  <li>Runs inside the x402 client's <code>onBeforePaymentCreation</code> hook, so a refused payment is never signed</li>
  <li>The spending key only holds what the session key sent it, so the onchain cap bounds what the agent can spend each day</li>
 </ul></div>
</div></section>

<section id="proof"><h2>Onchain proof</h2>
<h3>Identity and wallet setup</h3>
<table><tr><th>Step</th><th>Transaction</th><th>ERC-8021 tag</th></tr>
${setup.map(([a, h]) => `<tr><td>${a}</td><td><a href="${SCAN}/tx/${h}">${short(h)}</a></td><td>${TAGGED.has(h) ? "✓" : "–"}</td></tr>`).join("\n")}
</table>
<p style="font-size:14px;color:var(--mut)">✓ = calldata ends with the Loops House ERC-8021 tag <code>celo_73a54a0daad9</code> (checked onchain). The 7702 delegation has empty calldata, and the Altana grant went through Altana's relay without a suffix on the outer call. x402 payments can't carry tags; they are matched by payer address and the ledger. Registration file: <a href="${REPO}/blob/main/agent.json">agent.json</a>.</p>
<h3>Every paid call (from <a href="${REPO}/blob/main/ledger/celo.jsonl">ledger/celo.jsonl</a>)</h3>
<table><tr><th>When</th><th>Source</th><th>Query</th><th>Paid</th><th>Settlement</th><th></th></tr>
${payRows}
${refRows}
</table>
<p style="font-size:14px;color:var(--mut)"><span class="pill">Altana-funded</span> = paid from the float the Altana session key sent (top-up tx above). Payer for these calls: <a href="${SCAN}/address/0xB18095490A9f775d22Ffd7ce7b833AaC510A95ad#tokentxns"><code>0xB1809549…95ad</code></a>, the capped spending key (see below). Payee: buy's facilitator <code>0x20faAca5…333B</code>.</p>
</section>

<section id="finding"><h2>What we found about x402 from a smart account</h2>
<div class="note">
<p><b>1. Header mismatch, now fixed.</b> buy's gateway reads <code>X-PAYMENT</code> (v1) before <code>PAYMENT-SIGNATURE</code> (v2). Altana's SDK sends both, so the v1 header was matched against v1 offers (<code>celo</code>, not <code>eip155:42220</code>) and failed with <code>no_matching_requirements</code>. Our Altana payer now sends v2 only.</p>
<p><b>2. ERC-1271 signatures rejected.</b> buy's facilitator then answers <code>malformed_payload</code> for the Altana session signature (98 bytes, ERC-1271). As of Nov 25, 2026 it only accepts 65-byte EOA signatures. The ${altanaRejected.length} rejected session payments are in the ledger (rail <code>altana-session-erc1271</code>, ${et(altanaRejected[0]?.at || new Date().toISOString())} to ${et(altanaRejected.at(-1)?.at || new Date().toISOString())}); none settled.</p>
<p style="margin-bottom:0"><b>How the session key still funds and caps the payments:</b> the session key may call <code>USDC.transfer</code> under its onchain $0.05/day cap. Once a day it moves the day's float from the smart wallet to a plain x402 spending key, whose 65-byte EIP-3009 signatures buy accepts. The spending key holds only what the session key sent it, so the Altana cap bounds the agent's spending. The SpendPolicy and ledger check every call before it is signed. From ${et(firstTopup)} on, every payment is funded this way. When the facilitator accepts ERC-1271, <code>SPENDGUARD_PAYER=altana</code> pays straight from the session key (<a href="${REPO}/blob/main/src/payers/altana.mjs">src/payers/altana.mjs</a>).</p>
</div></section>

<section id="demo"><h2>Demo</h2>
<video controls preload="metadata" poster="shots/poster.png" src="demo.mp4"></video>
<p style="font-size:14px;color:var(--mut)">Real mainnet runs: paid calls settle and the daily cap refuses the next one, then the Altana session key funds the spending key and the agent pays from that float. <a href="demo.mp4">Direct MP4 link</a>.</p>
</section>

<section id="briefs"><h2>Briefs</h2>
<table><tr><th>Brief</th><th>Notes</th></tr>
${briefs.map(([s, n, d]) => `<tr><td><a href="briefs/${s}.html">${n}</a> · <a href="${REPO}/blob/main/reports/${s}.md">md</a></td><td>${d || "first mainnet batch (before the relevance filter)"}</td></tr>`).join("\n")}
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
