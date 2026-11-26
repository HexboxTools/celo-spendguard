// The public service: free brief, rate limit, request log, x402 offer shape, paid flow with a fake facilitator, MCP.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createScoutService, listen } from "../src/server.mjs";
import { NETWORKS } from "../src/config.mjs";

const net = NETWORKS.celo;
const PAYTO = "0xB18095490A9f775d22Ffd7ce7b833AaC510A95ad";
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "sgs-"));
const fakeScout = async ({ project, repo, paid, payer }) => ({ project, repo: `https://github.com/${repo}`, query: `"${project}"`, started: "2026-11-26T00:00:00Z", finished: "2026-11-26T00:00:01Z", network: "celo", score: { total: paid ? 50 : 30, parts: { github: 30, hackerNews: 0, x: 0, reddit: 0 } }, github: { url: `https://github.com/${repo}`, stars: 10, forks: 1, commits30d: 3, pushedAt: "2026-11-20" }, hackerNews: { stories: 0, points: 0, top: [] }, x: null, reddit: null, receipts: paid ? [{ source: "reddit.posts.search", amount: "5000", tx: "0x" + "cd".repeat(32) }] : [], budget: null, funding: null, errors: [], payer: payer?.address || null });
const fakePaid = () => ({ payer: { address: PAYTO, kind: "eoa" }, policy: { dailyCap: 50000n, spentToday: () => 0n } });

async function svc(o = {}) {
  const dir = tmp();
  const h = createScoutService({ network: net, payTo: PAYTO, scout: fakeScout, requestLog: path.join(dir, "r.jsonl"), outDir: null, publicBase: () => "https://t.example", ...o });
  const srv = await listen(h, 0);
  return { srv, dir, url: `http://127.0.0.1:${srv.address().port}`, log: () => fs.readFileSync(path.join(dir, "r.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)) };
}
const ext = { "x-forwarded-for": "203.0.113.7" };

test("free brief returns markdown, logs the caller handle, and rate-limits outside callers", async () => {
  const s = await svc({ freePerIpPerHour: 2 });
  const r = await fetch(`${s.url}/v1/brief?repo=celo-org/celo-composer&by=@alice`, { headers: ext });
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Traction brief: celo-composer/);
  const j = await (await fetch(`${s.url}/v1/brief?repo=https://github.com/a/b&format=json`, { headers: ext })).json();
  assert.equal(j.tier, "free");
  assert.equal((await fetch(`${s.url}/v1/brief?repo=a/b`, { headers: ext })).status, 429);
  const l = s.log();
  assert.equal(l[0].by, "@alice");
  assert.equal(l[0].self, undefined);
  const pub = await (await fetch(`${s.url}/requests`)).json();
  assert.equal(pub.count, 2);
  assert.equal(pub.requests[0].ipHash, undefined);
  s.srv.close();
});

test("own calls (no forwarded-for) are flagged self and left out of /requests", async () => {
  const s = await svc();
  await fetch(`${s.url}/v1/brief?repo=a/b`);
  assert.equal(s.log()[0].self, true);
  assert.equal((await (await fetch(`${s.url}/requests`)).json()).count, 0);
  s.srv.close();
});

test("full brief answers 402 with Celo offers and a bazaar description", async () => {
  const s = await svc({ facilitator: {}, buildPaid: fakePaid });
  const r = await fetch(`${s.url}/v1/brief/full?repo=a/b`, { headers: ext });
  assert.equal(r.status, 402);
  const pr = JSON.parse(Buffer.from(r.headers.get("payment-required"), "base64").toString());
  assert.equal(pr.x402Version, 2);
  assert.equal(pr.accepts.length, 3);
  assert.equal(pr.accepts[0].network, "eip155:42220");
  assert.equal(pr.accepts[0].payTo, PAYTO);
  assert.deepEqual(pr.accepts[0].extra, { name: "USDC", version: "2" });
  assert.equal(pr.extensions.bazaar.info.input.method, "GET");
  s.srv.close();
});

test("paid full brief: verify, settle, run with the payer, log the tx", async () => {
  const calls = [];
  const facilitator = { verify: async () => (calls.push("verify"), { isValid: true, payer: "0xBuyer" }), settle: async () => (calls.push("settle"), { success: true, transaction: "0x" + "ef".repeat(32), payer: "0xBuyer" }) };
  const s = await svc({ facilitator, buildPaid: fakePaid });
  const pr = JSON.parse(Buffer.from((await fetch(`${s.url}/v1/brief/full?repo=a/b`)).headers.get("payment-required"), "base64").toString());
  const payload = { x402Version: 2, accepted: pr.accepts[0], payload: { signature: "0x", authorization: {} } };
  const r = await fetch(`${s.url}/v1/brief/full?repo=a/b&by=@bob`, { headers: { ...ext, "payment-signature": Buffer.from(JSON.stringify(payload)).toString("base64") } });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.payment.tx, "0x" + "ef".repeat(32));
  assert.ok(r.headers.get("payment-response"));
  assert.deepEqual(calls, ["verify", "settle"]);
  const e = s.log().at(-1);
  assert.equal(e.tier, "full"); assert.equal(e.by, "@bob"); assert.equal(e.dataBill.length, 1);
  s.srv.close();
});

test("a payment that doesn't match the offer is refused before verify", async () => {
  let verified = false;
  const s = await svc({ facilitator: { verify: async () => ((verified = true), { isValid: true }) }, buildPaid: fakePaid });
  const payload = { x402Version: 2, accepted: { scheme: "exact", network: "eip155:42220", amount: "1", asset: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C", payTo: PAYTO }, payload: {} };
  const r = await fetch(`${s.url}/v1/brief/full?repo=a/b`, { headers: { "payment-signature": Buffer.from(JSON.stringify(payload)).toString("base64") } });
  assert.equal(r.status, 402);
  assert.equal(verified, false);
  s.srv.close();
});

test("MCP: initialize, tools/list, tools/call", async () => {
  const s = await svc();
  const rpc = async (m) => (await fetch(`${s.url}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...ext }, body: JSON.stringify(m) })).json();
  assert.equal((await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })).result.serverInfo.name, "spendguard-scout");
  assert.equal((await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" })).result.tools[0].name, "traction_brief");
  const c = await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "traction_brief", arguments: { repo: "a/b", by: "@carol" } } });
  assert.match(c.result.content[0].text, /Traction brief/);
  assert.equal(s.log()[0].via, "mcp");
  s.srv.close();
});
