import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SpendPolicy } from "../src/policy.mjs";

const NET = "eip155:42220";
const USDT = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e";
const PAYTO = "0x20faAca5F980E29639A0FCC6dcA6988E18ed333B";
const req = (amount, o = {}) => ({ scheme: "exact", network: NET, asset: USDT, payTo: PAYTO, amount: String(amount), ...o });
const mk = (o = {}) => new SpendPolicy({ network: NET, maxPerCall: 10000, dailyCap: 20000, allowedPayTo: [PAYTO], allowedHosts: ["gateway.usebuy.ai"], allowedAssets: [USDT], ledgerFile: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sg-")), "l.jsonl"), ...o });

test("allows an in-policy payment", () => assert.equal(mk().check(req(5000), "https://gateway.usebuy.ai/v1/x"), null));
test("refuses over the per-call cap", () => assert.match(mk().check(req(10001)), /per-call cap/));
test("refuses other networks, assets, payees and hosts", () => {
  const p = mk();
  assert.match(p.check(req(1, { network: "eip155:8453" })), /network/);
  assert.match(p.check(req(1, { asset: "0x0000000000000000000000000000000000000001" })), /asset/);
  assert.match(p.check(req(1, { payTo: "0x0000000000000000000000000000000000000002" })), /payTo/);
  assert.match(p.check(req(1), "https://evil.example/pay"), /host/);
});
test("daily cap counts ledger entries and in-flight reservations", () => {
  const p = mk();
  p.record({ kind: "paid", amount: 10000 });
  assert.equal(p.check(req(10000)), null);
  p.reserve(5000);
  assert.match(p.check(req(10000)), /daily cap/);
  p.release(5000);
  p.record({ kind: "paid", amount: 10000 });
  assert.match(p.check(req(1)), /daily cap/);
});
test("a new UTC day resets the cap", () => {
  let now = new Date("2026-11-25T23:59:00Z");
  const p = mk({ now: () => now });
  p.record({ kind: "paid", amount: 20000 });
  assert.match(p.check(req(1)), /daily cap/);
  now = new Date("2026-11-26T00:00:01Z");
  assert.equal(p.check(req(1)), null);
});
test("failed and refused entries do not count as spend", () => {
  const p = mk();
  p.record({ kind: "failed", amount: 10000 });
  p.record({ kind: "refused", amount: 10000 });
  assert.equal(p.spentToday(), 0n);
  assert.equal(p.summary().refusals, 1);
});
