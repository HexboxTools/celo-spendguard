import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { extractList, redditMentions, youtubeMentions } from "../src/sources/buy.mjs";
import { parseRepo } from "../src/sources/free.mjs";
import { score } from "../src/scout.mjs";

const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url)));
const fakePayer = (data) => ({ address: "0xabc", kind: "fake", pay: async () => ({ paid: true, res: new Response(JSON.stringify(data)), entry: { amount: "5000", tx: "0x1" } }) });

test("extractList finds reddit posts under output.children[].post", () => {
  const l = extractList(fx("reddit"));
  assert.equal(l.length, 2);
  assert.ok("postTitle" in l[0]);
});
test("reddit and youtube parsers read real gateway payloads", async () => {
  const r = await redditMentions(fakePayer(fx("reddit")), "celo");
  // The real sandbox payload for "celo" returned two unrelated posts; neither counts.
  assert.equal(r.ok, true); assert.equal(r.returned, 2); assert.equal(r.count, 0); assert.equal(r.sample.length, 0);
  const y = await youtubeMentions(fakePayer(fx("youtube")), "celo");
  assert.equal(y.ok, true); assert.equal(y.count, 3); assert.ok(y.sample[0].url.includes("youtube.com/watch"));
});
test("parseRepo", () => {
  assert.deepEqual(parseRepo("https://github.com/celo-org/celo-monorepo"), { owner: "celo-org", repo: "celo-monorepo" });
  assert.deepEqual(parseRepo("a/b"), { owner: "a", repo: "b" });
  assert.equal(parseRepo("not a repo"), null);
});
test("score stays within 0..100", () => {
  assert.equal(score({}).total, 0);
  const s = score({ gh: { stars: 1e6, commits30d: 1e4 }, hn: { points: 1e6 }, x: { ok: true, count: 1e4, engagement: 1e7 }, reddit: { ok: true, count: 1e4, score: 1e7 } });
  assert.equal(s.total, 100);
});
test("relevance filter drops loose matches that never mention the project keyword", async () => {
  const { keyTerm, mentions } = await import("../src/sources/buy.mjs");
  assert.equal(keyTerm('"ERC-8004" trustless agents'), "erc-8004");
  assert.equal(keyTerm("x402 payments"), "x402");
  assert.equal(mentions("2023 Topps Shohei Ohtani All-Star Relic", "ERC-8004 trustless agents"), false);
  assert.equal(mentions("Registering an ERC-8004 agent on Celo", "ERC-8004 trustless agents"), true);
  const data = { output: { children: [{ post: { postTitle: "Celo MiniPay hits 10M wallets", score: 5 } }, { post: { postTitle: "Baseball card for sale", score: 50 } }] } };
  const r = await redditMentions(fakePayer(data), "celo");
  assert.equal(r.returned, 2); assert.equal(r.count, 1); assert.equal(r.score, 5);
});
