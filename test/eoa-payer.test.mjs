// End-to-end against a local x402 seller: 402 -> policy -> sign EIP-3009 -> retry -> 200 + receipt.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generatePrivateKey } from "viem/accounts";
import { SpendPolicy } from "../src/policy.mjs";
import { createEoaPayer } from "../src/payers/eoa.mjs";

const NET = "eip155:42220";
const USDT = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e";
const PAYTO = "0x20faAca5F980E29639A0FCC6dcA6988E18ed333B";

function seller(amount) {
  const seen = [];
  const srv = http.createServer((req, res) => {
    const pay = req.headers["payment-signature"] || req.headers["x-payment"];
    if (!pay) {
      const pr = { x402Version: 2, resource: { url: `http://${req.headers.host}${req.url}`, description: "t", mimeType: "application/json" },
        accepts: [{ scheme: "exact", network: NET, amount: String(amount), asset: USDT, payTo: PAYTO, maxTimeoutSeconds: 300, extra: { name: "Tether USD", version: "1" } }] };
      res.writeHead(402, { "content-type": "application/json", "payment-required": Buffer.from(JSON.stringify(pr)).toString("base64") });
      return res.end("{}");
    }
    seen.push(JSON.parse(Buffer.from(pay, "base64").toString()));
    const settle = { success: true, transaction: "0x" + "ab".repeat(32), network: NET };
    res.writeHead(200, { "content-type": "application/json", "payment-response": Buffer.from(JSON.stringify(settle)).toString("base64") });
    res.end(JSON.stringify({ ok: true }));
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r({ srv, seen, url: `http://127.0.0.1:${srv.address().port}/data` })));
}
const policy = (o = {}) => new SpendPolicy({ network: NET, maxPerCall: 10000, dailyCap: 12000, allowedPayTo: [PAYTO], allowedHosts: [], allowedAssets: [USDT], ledgerFile: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sg-")), "l.jsonl"), ...o });

test("pays an in-policy 402 and records the settlement tx", async () => {
  const s = await seller(5000);
  const p = policy();
  const payer = createEoaPayer({ privateKey: generatePrivateKey(), policy: p });
  const r = await payer.pay(s.url);
  s.srv.close();
  assert.equal(r.paid, true);
  assert.equal(r.entry.tx, "0x" + "ab".repeat(32));
  assert.equal(s.seen.length, 1);
  const auth = s.seen[0].payload.authorization;
  assert.equal(auth.to.toLowerCase(), PAYTO.toLowerCase());
  assert.equal(auth.value, "5000");
  assert.equal(p.spentToday(), 5000n);
});

test("refuses to sign over the per-call cap", async () => {
  const s = await seller(20000);
  const p = policy();
  const payer = createEoaPayer({ privateKey: generatePrivateKey(), policy: p });
  await assert.rejects(payer.pay(s.url));
  s.srv.close();
  assert.equal(s.seen.length, 0);
  assert.equal(p.summary().refusals, 1);
});

test("refuses the payment that would pass the daily cap", async () => {
  const s = await seller(5000);
  const p = policy();
  const payer = createEoaPayer({ privateKey: generatePrivateKey(), policy: p });
  assert.equal((await payer.pay(s.url)).paid, true);
  assert.equal((await payer.pay(s.url)).paid, true);
  await assert.rejects(payer.pay(s.url));
  s.srv.close();
  assert.equal(s.seen.length, 2);
});
