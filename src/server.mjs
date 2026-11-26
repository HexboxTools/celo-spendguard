// Spendguard Scout as a public service: anyone (a person or an agent) can ask for a traction brief.
//   GET  /v1/brief?repo=owner/name[&project=Name][&by=@you]   free: GitHub + Hacker News, rate-limited, no wallet
//   GET  /v1/brief/full?repo=...                               x402 on Celo ($0.02 in USDC, USDT or USA₮):
//        adds X/YouTube + Reddit, which the agent buys on buy (usebuy.ai) inside its SpendPolicy cap
//   POST /mcp                                                  MCP (streamable HTTP, JSON responses): tool traction_brief
//   GET  /requests                                             public log of outside requests (who asked, when, what, tx)
// Every request is appended to ledger/requests.jsonl, so "who used it" can be checked line by line.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { runScout, toMarkdown } from "./scout.mjs";
import { parseRepo } from "./sources/free.mjs";

export const VERSION = "0.2.0";
const lower = (s) => String(s || "").toLowerCase();

export const OFFER_TOKENS = [
  { symbol: "USDC", asset: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C", name: "USDC", version: "2" },
  { symbol: "USDT", asset: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e", name: "Tether USD", version: "1" },
  { symbol: "USAT", asset: "0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771", name: "Tether America USD", version: "1" },
];

const EXAMPLE_OUT = { project: "Celo Composer", repo: "https://github.com/celo-org/celo-composer", score: { total: 41, parts: { github: 27, hackerNews: 0, x: 8, reddit: 6 } }, github: { stars: 700, forks: 350, commits30d: 4 }, receipts: [{ source: "reddit.posts.search", amount: "5000", tx: "0x…" }], markdown: "# Traction brief: Celo Composer …" };
export const BAZAAR = declareDiscoveryExtension({
  input: { repo: "celo-org/celo-composer", project: "Celo Composer", by: "@yourhandle" },
  inputSchema: { properties: { repo: { type: "string", description: "GitHub repo, owner/name or URL" }, project: { type: "string", description: "Name to search for (default: repo name)" }, by: { type: "string", description: "Optional: your handle, shown in the public request log" }, address: { type: "string", description: "Optional Celo address: txs sent, ERC-8004 identities owned" } }, required: ["repo"] },
  output: { example: EXAMPLE_OUT },
});
BAZAAR.bazaar.info.input.method = "GET";

export function cleanHandle(s) {
  const h = String(s || "").trim().slice(0, 48).replace(/[^\w@.:\-/]/g, "");
  return h || null;
}

export function parseInput(q) {
  const r = parseRepo(q.repo || q.url || "");
  const project = String(q.project || q.name || (r ? r.repo : "")).trim().slice(0, 60);
  if (!r && !project) return { error: "give repo=owner/name (or a GitHub URL), and optionally project=Name" };
  if (project && !/^[\p{L}\p{N} .,'&+_#@-]{1,60}$/u.test(project)) return { error: "project: letters, digits, spaces and . , ' & + _ # @ - only (max 60)" };
  return { repo: r ? `${r.owner}/${r.repo}` : null, project, defaultName: !q.project && !q.name && !q.query, by: cleanHandle(q.by || q.handle), query: q.query ? String(q.query).slice(0, 80) : undefined, address: /^0x[0-9a-fA-F]{40}$/.test(String(q.address || "")) ? q.address : undefined };
}

class Limiter {
  constructor(max, windowMs) { this.max = max; this.windowMs = windowMs; this.hits = new Map(); }
  take(key, now = Date.now()) {
    const a = (this.hits.get(key) || []).filter((t) => now - t < this.windowMs);
    if (a.length >= this.max) { this.hits.set(key, a); return false; }
    a.push(now); this.hits.set(key, a); return true;
  }
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64");
const unb64 = (s) => JSON.parse(Buffer.from(String(s), "base64").toString("utf8"));

export function createScoutService({
  network, // config network object (celo)
  payTo,   // where full-brief payments go (the agent's spending key, so callers fund their own data)
  price = "20000", // $0.02, 6-decimal stablecoins
  facilitator = null, // { verify(payload, req), settle(payload, req) } (ExactEvmScheme facilitator, settles from the agent wallet)
  buildPaid = null,   // async () => { payer, policy }  for the full brief
  scout = runScout,
  fetchImpl = globalThis.fetch,
  requestLog = "ledger/requests.jsonl",
  outDir = "reports/requests",
  publicBase = () => "https://spendguard-scout.liveapps.dev",
  freePerIpPerHour = 6, freePerDay = 200, salt = crypto.randomBytes(8).toString("hex"),
  verifyHashFile = null, cacheMs = 60 * 60e3, log = () => {}, now = () => new Date(),
} = {}) {
  const ipLimit = new Limiter(freePerIpPerHour, 3600e3);
  const dayLimit = new Limiter(freePerDay, 86400e3);
  const cache = new Map();
  let paidBusy = Promise.resolve();

  const record = (e) => {
    const entry = { at: now().toISOString(), ...e };
    if (requestLog) { fs.mkdirSync(path.dirname(requestLog), { recursive: true }); fs.appendFileSync(requestLog, JSON.stringify(entry) + "\n"); }
    log(`request ${entry.tier} ${entry.project} ${entry.repo || ""} by=${entry.by || "-"} via=${entry.via}${entry.self ? " (self)" : ""}`);
    return entry;
  };
  const entries = () => (requestLog && fs.existsSync(requestLog) ? fs.readFileSync(requestLog, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);

  const who = (req) => {
    const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "?";
    const self = !req.headers["x-forwarded-for"] || req.headers["x-hexbox-self"] === "1";
    return { ip, self, ipHash: crypto.createHash("sha256").update(salt + ip).digest("hex").slice(0, 10), ua: String(req.headers["user-agent"] || "").slice(0, 60) };
  };

  function requirements(resourceUrl) {
    return {
      x402Version: 2,
      error: "Payment required",
      resource: { url: resourceUrl, description: "Traction brief for a GitHub project: GitHub + Hacker News, plus X/YouTube and Reddit searches the agent buys over x402 on Celo inside its spend cap. Returns score 0-100, sources and a data bill with settlement txs.", mimeType: "application/json" },
      accepts: OFFER_TOKENS.map((t) => ({ scheme: "exact", network: network.caip2, amount: String(price), asset: t.asset, payTo, maxTimeoutSeconds: 300, description: "Spendguard Scout full traction brief (GitHub, Hacker News, X/YouTube, Reddit) with a data bill", mimeType: "application/json", extra: { name: t.name, version: t.version } })),
      extensions: BAZAAR,
    };
  }

  async function freeBrief(inp, ctx) {
    const key = `${lower(inp.repo)}|${lower(inp.project)}|${lower(inp.query)}|${lower(inp.address)}`;
    const hit = cache.get(key);
    let report;
    if (hit && now() - hit.at < cacheMs) report = hit.report;
    else {
      report = await scout({ project: inp.project, repo: inp.repo, query: inp.query, address: inp.address, payer: null, policy: null, network, outDir, fetchImpl, paid: false });
      cache.set(key, { at: now(), report });
    }
    const entry = record({ id: crypto.randomUUID().slice(0, 8), tier: "free", via: ctx.via, project: inp.project, repo: inp.repo, by: inp.by, score: report.score.total, self: ctx.self || undefined, ipHash: ctx.ipHash, ua: ctx.ua, cached: !!(hit && report === hit.report) || undefined, report: report.files ? `${outDir}/${report.files[1]}` : null });
    return { report, entry };
  }

  const markdownOf = (report, entry, inp = {}) => toMarkdown(report, network) + (inp.defaultName ? `\n> Searched Hacker News for the repo name "${report.project}". If that is a common word, matches may be about something else: add &project=<distinct name> or &query=<terms>.\n` : "") + `\nRequest \`${entry.id}\` logged at ${publicBase()}/requests${entry.tier === "free" ? `\n\nFree brief = GitHub + Hacker News. The full brief (${(Number(price) / 1e6).toFixed(2)} USD over x402 on Celo) adds X/YouTube and Reddit: \`npx @celo/buy curl "${publicBase()}/v1/brief/full?repo=${report.repo ? encodeURIComponent(String(report.repo).replace("https://github.com/", "")) : ""}"\`` : ""}\n`;

  function send(res, status, body, headers = {}) {
    const isStr = typeof body === "string";
    res.writeHead(status, { "content-type": isStr ? "text/markdown; charset=utf-8" : "application/json", "access-control-allow-origin": "*", "access-control-expose-headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE", ...headers });
    res.end(isStr ? body : JSON.stringify(body, null, 2) + "\n");
  }
  const wantsJson = (req, q) => q.format === "json" || (q.format !== "md" && /application\/json/.test(String(req.headers.accept || "")));

  async function handleFree(req, res, q, via = "http") {
    const inp = parseInput(q);
    if (inp.error) return send(res, 400, { error: inp.error, example: `${publicBase()}/v1/brief?repo=celo-org/celo-composer&by=@you` });
    const ctx = { ...who(req), via };
    if (!ctx.self && (!ipLimit.take(ctx.ipHash) || !dayLimit.take("all"))) return send(res, 429, { error: "free tier limit: 6 briefs an hour per caller, 200 a day overall. Try later, or use the paid full brief." });
    try {
      const { report, entry } = await freeBrief(inp, ctx);
      return wantsJson(req, q) ? send(res, 200, { request: entry.id, tier: "free", report, markdown: markdownOf(report, entry, inp) }) : send(res, 200, markdownOf(report, entry, inp));
    } catch (e) { return send(res, 502, { error: `brief failed: ${String(e.message).slice(0, 200)}` }); }
  }

  async function handleFull(req, res, q) {
    const inp = parseInput(q);
    const resourceUrl = `${publicBase()}${req.url}`;
    const sig = req.headers["payment-signature"] || req.headers["x-payment"];
    if (!facilitator || !buildPaid) return send(res, 503, { error: "paid tier not configured on this instance" });
    // Probes with no input still get the 402, so indexes and buy quote can read the offer.
    if (!sig) {
      const { policy } = await buildPaid();
      const left = policy.dailyCap - policy.spentToday();
      if (!inp.error && left < 10000n) return send(res, 503, { error: "today's data budget (the agent's SpendPolicy daily cap) is used up; nothing charged. Try after 00:00 UTC, or use the free brief.", free: `${publicBase()}/v1/brief?repo=${inp.repo || ""}` });
      const pr = requirements(resourceUrl);
      return send(res, 402, pr, { "PAYMENT-REQUIRED": b64(pr) });
    }
    if (inp.error) return send(res, 400, { error: inp.error });
    let payload;
    try { payload = unb64(sig); } catch { return send(res, 400, { error: "PAYMENT-SIGNATURE is not base64 JSON" }); }
    const acc = payload.accepted || {};
    const pr = requirements(resourceUrl);
    const match = pr.accepts.find((a) => lower(a.asset) === lower(acc.asset) && a.network === acc.network && lower(a.payTo) === lower(acc.payTo) && String(a.amount) === String(acc.amount) && a.scheme === acc.scheme);
    if (!match) return send(res, 402, { ...pr, error: "payment does not match any offer" }, { "PAYMENT-REQUIRED": b64({ ...pr, error: "no_matching_requirements" }) });
    // One paid brief at a time, so the daily cap check and the spend can't race.
    const run = paidBusy.then(async () => {
      const v = await facilitator.verify(payload, match);
      if (!v?.isValid) return { status: 402, body: { ...pr, error: `payment invalid: ${v?.invalidReason || "unknown"}` } };
      const { payer, policy } = await buildPaid();
      if (policy.dailyCap - policy.spentToday() < 10000n) return { status: 503, body: { error: "today's data budget is used up; payment not settled, nothing charged" } };
      // Settle first: the caller's payment is what funds the agent's data purchases for this brief.
      const s = await facilitator.settle(payload, match);
      if (!s?.success) return { status: 402, body: { ...pr, error: `settlement failed: ${s?.errorReason || "unknown"}` } };
      const ctx = { ...who(req), via: "http" };
      let report = null, err = null;
      try { report = await scout({ project: inp.project, repo: inp.repo, query: inp.query, address: inp.address, payer, policy, network, outDir, fetchImpl, paid: true }); } catch (e) { err = String(e.message).slice(0, 200); }
      const entry = record({ id: crypto.randomUUID().slice(0, 8), tier: "full", via: "x402", project: inp.project, repo: inp.repo, by: inp.by, score: report?.score.total ?? null, payer: s.payer || v.payer || acc.payer || null, asset: match.asset, amount: match.amount, tx: s.transaction, dataBill: report?.receipts?.map((r) => ({ source: r.source, amount: r.amount, tx: r.tx })) || [], self: ctx.self || undefined, ipHash: ctx.ipHash, ua: ctx.ua, error: err || undefined, report: report?.files ? `${outDir}/${report.files[1]}` : null });
      const settleHdr = b64({ success: true, transaction: s.transaction, network: network.caip2, payer: entry.payer });
      if (!report) return { status: 200, headers: { "PAYMENT-RESPONSE": settleHdr }, body: { request: entry.id, tier: "full", error: `paid ${s.transaction} but the brief failed: ${err}. Open an issue and we refund.` } };
      return { status: 200, headers: { "PAYMENT-RESPONSE": settleHdr }, body: { request: entry.id, tier: "full", payment: { tx: s.transaction, explorer: `${network.explorer}/tx/${s.transaction}` }, report, markdown: markdownOf(report, entry, inp) } };
    });
    paidBusy = run.catch(() => {});
    try { const r = await run; return send(res, r.status, r.body, r.headers || (r.status === 402 ? { "PAYMENT-REQUIRED": b64(r.body) } : {})); }
    catch (e) { return send(res, 502, { error: `paid brief failed: ${String(e.message).slice(0, 200)}` }); }
  }

  // MCP over streamable HTTP, JSON responses only (no SSE). One tool: traction_brief (the free tier).
  const TOOL = { name: "traction_brief", description: "Traction brief for a GitHub project from Spendguard Scout (an agent on Celo): stars, forks, commits in 30 days, Hacker News stories and points, and a 0-50 score for the free tier. Use when asked whether anyone is using a project.", inputSchema: { type: "object", properties: { repo: { type: "string", description: "owner/name or GitHub URL" }, project: { type: "string" }, by: { type: "string", description: "your handle for the public request log (optional)" }, address: { type: "string", description: "optional Celo address of the agent or contract" } }, required: ["repo"] } };
  async function handleMcp(req, res, body) {
    let msg; try { msg = JSON.parse(body || "{}"); } catch { return send(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }); }
    const reply = (id, result) => send(res, 200, { jsonrpc: "2.0", id, result });
    const fail = (id, code, message) => send(res, 200, { jsonrpc: "2.0", id, error: { code, message } });
    if (Array.isArray(msg)) return fail(null, -32600, "batch not supported");
    if (msg.id === undefined) { res.writeHead(202, { "access-control-allow-origin": "*" }); return res.end(); }
    if (msg.method === "initialize") return reply(msg.id, { protocolVersion: msg.params?.protocolVersion || "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "spendguard-scout", version: VERSION }, instructions: "Call traction_brief with a GitHub repo to get a traction brief. Free; rate-limited. Requests are logged publicly at /requests." });
    if (msg.method === "ping") return reply(msg.id, {});
    if (msg.method === "tools/list") return reply(msg.id, { tools: [TOOL] });
    if (msg.method === "tools/call") {
      if (msg.params?.name !== "traction_brief") return fail(msg.id, -32602, "unknown tool");
      const inp = parseInput(msg.params.arguments || {});
      if (inp.error) return reply(msg.id, { content: [{ type: "text", text: inp.error }], isError: true });
      const ctx = { ...who(req), via: "mcp" };
      if (!ctx.self && (!ipLimit.take(ctx.ipHash) || !dayLimit.take("all"))) return reply(msg.id, { content: [{ type: "text", text: "rate limited: 6 briefs an hour per caller" }], isError: true });
      try { const { report, entry } = await freeBrief(inp, ctx); return reply(msg.id, { content: [{ type: "text", text: markdownOf(report, entry, inp) }], structuredContent: { request: entry.id, score: report.score, github: report.github, hackerNews: report.hackerNews } }); }
      catch (e) { return reply(msg.id, { content: [{ type: "text", text: `brief failed: ${e.message}` }], isError: true }); }
    }
    return fail(msg.id, -32601, "method not found");
  }

  function publicRequests() {
    return entries().filter((e) => !e.self).map(({ ipHash, ua, ...e }) => e);
  }

  function info() {
    const b = publicBase();
    return {
      name: "Spendguard Scout", version: VERSION, by: "Hexbox Tools (an AI agent; not a person)",
      what: "Traction briefs: is anyone actually using this project? Built for Celo's Agents Open for Business hackathon. ERC-8004 agent #10134 on Celo.",
      try: { free: `curl "${b}/v1/brief?repo=celo-org/celo-composer&by=@yourhandle"`, full_x402: `npx @celo/buy curl "${b}/v1/brief/full?repo=celo-org/celo-composer&by=@yourhandle"`, mcp: `${b}/mcp` },
      endpoints: { free: `${b}/v1/brief?repo=owner/name[&project=Name][&address=0x…][&by=@handle][&format=json]`, full: `${b}/v1/brief/full?repo=owner/name (x402, ${(Number(price) / 1e6).toFixed(2)} USD in USDC/USDT/USA₮ on Celo)`, mcp: `${b}/mcp`, requests: `${b}/requests`, openapi: `${b}/openapi.json`, llms: `${b}/llms.txt` },
      limits: "free: 6 an hour per caller, 200 a day; full: one at a time, inside the agent's $0.05/day SpendPolicy cap",
      repo: "https://github.com/HexboxTools/celo-spendguard", site: "https://hexboxtools.github.io/celo-spendguard/", erc8004: { chain: "celo", agentId: 10134 },
    };
  }

  function openapi() {
    const b = publicBase();
    const params = [{ name: "repo", in: "query", required: true, schema: { type: "string" }, description: "GitHub repo, owner/name or URL" }, { name: "project", in: "query", schema: { type: "string" } }, { name: "by", in: "query", schema: { type: "string" }, description: "your handle, for the public request log" }, { name: "address", in: "query", schema: { type: "string" }, description: "optional Celo address (agent or contract): txs sent and ERC-8004 identities owned" }];
    return {
      openapi: "3.1.0", info: { title: "Spendguard Scout", version: VERSION, description: "Traction briefs for GitHub projects from an agent that pays for its own data on Celo inside a spend cap." }, servers: [{ url: b }],
      paths: {
        "/v1/brief": { get: { operationId: "freeBrief", summary: "Free traction brief (GitHub + Hacker News). Rate-limited.", parameters: [...params, { name: "format", in: "query", schema: { type: "string", enum: ["md", "json"] } }], responses: { 200: { description: "Markdown brief, or JSON with format=json" }, 429: { description: "rate limited" } }, security: [] } },
        "/v1/brief/full": { get: { operationId: "fullBrief", summary: "Full traction brief: adds X/YouTube and Reddit searches the agent buys over x402. Paid over x402 on Celo.", parameters: params, "x-payment-info": { protocols: ["x402"], price: { mode: "fixed", currency: "USD", amount: (Number(price) / 1e6).toFixed(2) }, network: network.caip2, assets: OFFER_TOKENS.map((t) => t.symbol) }, responses: { 200: { description: "JSON brief with data bill and settlement tx" }, 402: { description: "Payment required (x402 v2, PAYMENT-REQUIRED header)" }, 503: { description: "daily data budget used; nothing charged" } } } },
        "/mcp": { post: { operationId: "mcp", summary: "MCP server (streamable HTTP, JSON). Tool: traction_brief.", responses: { 200: { description: "JSON-RPC" } }, security: [] } },
        "/requests": { get: { operationId: "requests", summary: "Public log of outside requests", responses: { 200: { description: "JSON list" } }, security: [] } },
      },
      "x-discovery": { ownershipProofs: [] },
    };
  }

  function llms() {
    const i = info();
    return `# Spendguard Scout\n\n${i.what}\nRun by ${i.by}.\n\n## Free brief (no wallet)\n${i.try.free}\nReturns Markdown (add &format=json for JSON). GitHub stars, forks, commits in 30 days, Hacker News stories and points, score.\n\n## Full brief (x402 on Celo, ${(Number(price) / 1e6).toFixed(2)} USD in USDC, USDT or USA₮)\n${i.try.full_x402}\nAdds X (or YouTube) and Reddit searches that the agent buys on buy (usebuy.ai) inside its own spend cap; the brief ends with a data bill of settlement txs on Celoscan.\n\n## MCP\nStreamable HTTP endpoint: ${i.try.mcp} (tool: traction_brief)\nClaude Code: claude mcp add --transport http spendguard-scout ${i.try.mcp}\n\n## Public request log\n${i.endpoints.requests}\n\nLimits: ${i.limits}\nCode: ${i.repo}\n`;
  }

  return async function handler(req, res) {
    const u = new URL(req.url, "http://x");
    const q = Object.fromEntries(u.searchParams);
    if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, payment-signature, x-payment, mcp-session-id, mcp-protocol-version, accept", "access-control-allow-methods": "GET, POST, OPTIONS" }); return res.end(); }
    try {
      if (u.pathname === "/health") return send(res, 200, { ok: true, version: VERSION });
      if (u.pathname === "/" || u.pathname === "/v1") return send(res, 200, info());
      if (u.pathname === "/llms.txt") { res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "access-control-allow-origin": "*" }); return res.end(llms()); }
      if (u.pathname === "/openapi.json") return send(res, 200, openapi());
      if (u.pathname === "/.well-known/402index-verify.txt" && verifyHashFile && fs.existsSync(verifyHashFile)) { res.writeHead(200, { "content-type": "text/plain" }); return res.end(fs.readFileSync(verifyHashFile, "utf8").trim()); }
      if (u.pathname === "/.well-known/x402") return send(res, 200, { version: 1, resources: [`${publicBase()}/v1/brief/full`], instructions: "Traction brief for a GitHub repo; pass ?repo=owner/name" });
      if (u.pathname === "/requests") return send(res, 200, { count: publicRequests().length, note: "Outside requests only (the agent's own test calls are excluded). Handles are as given by the caller.", requests: publicRequests() });
      if (u.pathname === "/v1/brief" && req.method === "GET") return await handleFree(req, res, q);
      if (u.pathname === "/v1/brief/full" && req.method === "GET") return await handleFull(req, res, q);
      if (u.pathname === "/mcp") {
        if (req.method !== "POST") { res.writeHead(405, { allow: "POST", "access-control-allow-origin": "*" }); return res.end(); }
        let body = ""; for await (const c of req) { body += c; if (body.length > 20000) return send(res, 413, { error: "too large" }); }
        return await handleMcp(req, res, body);
      }
      return send(res, 404, { error: "not found", see: `${publicBase()}/` });
    } catch (e) { return send(res, 500, { error: String(e.message).slice(0, 200) }); }
  };
}

export function listen(handler, port = 8797, host = "127.0.0.1") {
  const srv = http.createServer(handler);
  return new Promise((r) => srv.listen(port, host, () => r(srv)));
}
