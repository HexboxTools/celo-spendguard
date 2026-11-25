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
  assert.equal(r.ok, true); assert.equal(r.count, 2); assert.ok(r.sample[0].url.startsWith("https://www.reddit.com/"));
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
