// Paid sources on buy (usebuy.ai), Celo Core Co.'s agent service marketplace. Each call is
// one x402 payment from the agent's capped wallet; the 402 for the exact request sets the price.
import { BUY_GATEWAY } from "../config.mjs";

async function post(payer, path, body, meta) {
  const url = `${BUY_GATEWAY}${path}`;
  const { res, paid, entry, refused } = await payer.pay(url, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }, meta);
  if (!paid) return { ok: false, status: res.status, refused: refused || null, error: (await res.text().catch(() => "")).slice(0, 300) };
  return { ok: true, data: await res.json(), receipt: entry };
}

const n = (v) => (typeof v === "number" ? v : Number(v) || 0);

// Search providers return loose matches (a query for "ERC-8004 agents" can return a trading-card post).
// A post counts only if its title or text mentions the query's first term, the project keyword.
const STOP = new Set(["the", "and", "for", "with", "protocol", "payments", "agents", "agent", "network", "app"]);
export function keyTerm(query) {
  const w = String(query).replace(/["'()]/g, " ").toLowerCase().split(/\s+/).filter((x) => x.length >= 3 && !STOP.has(x));
  return w[0] || null;
}
export function mentions(text, query) {
  const k = keyTerm(query);
  if (!k) return true;
  const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, "i").test(String(text));
}

export async function xMentions(payer, query) {
  const r = await post(payer, "/v1/social/x/posts/search", { query: `${query} within_time:30d`, type: "latest" }, { source: "x.posts.search", query });
  if (!r.ok) return r;
  const posts = extractList(r.data).map((p) => ({
    text: String(p.text || p.full_text || p.content || "").slice(0, 200),
    likes: n(p.favorite_count ?? p.likes ?? p.like_count),
    reposts: n(p.retweet_count ?? p.retweets ?? p.repost_count),
    author: p.screen_name || p.author?.screen_name || p.user?.screen_name || p.author || null,
    id: p.tweet_id || p.id_str || p.id || null,
  }));
  return { ok: true, receipt: r.receipt, count: posts.length, engagement: posts.reduce((s, p) => s + p.likes + p.reposts, 0), authors: new Set(posts.map((p) => p.author).filter(Boolean)).size, sample: posts.slice(0, 3) };
}

export async function redditMentions(payer, query) {
  const r = await post(payer, "/v1/social/reddit/posts/search", { query, sort: "new", timeRange: "month" }, { source: "reddit.posts.search", query });
  if (!r.ok) return r;
  const posts = extractList(r.data).map((p) => ({
    title: String(p.postTitle || p.title || p.text || "").slice(0, 160),
    score: n(p.score ?? p.ups ?? p.upvotes), comments: n(p.commentCount ?? p.num_comments ?? p.comments),
    sub: p.subreddit?.name || p.subreddit?.prefixedName || (typeof p.subreddit === "string" ? p.subreddit : null),
    url: p.url || (p.permalink ? `https://www.reddit.com${p.permalink}` : null),
    text: String(p.body || p.selftext || p.postBody || p.content || "").slice(0, 2000),
  }));
  const rel = posts.filter((p) => mentions(`${p.title} ${p.text}`, query)).map(({ text, ...p }) => p);
  return { ok: true, receipt: r.receipt, returned: posts.length, keyTerm: keyTerm(query), count: rel.length, score: rel.reduce((s, p) => s + p.score, 0), comments: rel.reduce((s, p) => s + p.comments, 0), sample: rel.slice(0, 3) };
}

export async function youtubeMentions(payer, query) {
  const r = await post(payer, "/v1/social/youtube/videos/search", { query }, { source: "youtube.videos.search", query });
  if (!r.ok) return r;
  const vids = extractList(r.data).map((v) => ({ title: String(v.title || "").slice(0, 160), views: n(v.number_of_views ?? v.views), author: v.author || null, published: v.published_time || null, url: v.video_id ? `https://www.youtube.com/watch?v=${v.video_id}` : null }));
  const all = vids.length;
  const relv = vids.filter((v) => mentions(v.title, query));
  const recent = relv.filter((v) => /(hour|day|week)s? ago/.test(String(v.published || "")));
  return { ok: true, receipt: r.receipt, returned: all, keyTerm: keyTerm(query), count: relv.length, recent: recent.length, views: recent.reduce((s, v) => s + v.views, 0), sample: (recent.length ? recent : relv).slice(0, 3) };
}

// The upstream payloads differ by provider; find the first array of objects that looks like posts.
export function extractList(d, depth = 0) {
  if (!d || depth > 6) return [];
  if (Array.isArray(d)) return d.length && typeof d[0] === "object" && !Array.isArray(d[0]) ? d : [];
  if (typeof d === "object") {
    for (const k of ["output", "timeline", "posts", "videos", "results", "items", "tweets", "data", "children", "entries"]) {
      if (k in d) { const l = extractList(d[k], depth + 1); if (l.length) return l.map(unwrap); }
    }
    for (const v of Object.values(d)) { const l = extractList(v, depth + 1); if (l.length) return l; }
  }
  return [];
}

const unwrap = (x) => {
  for (const k of ["post", "data", "tweet"]) if (x && x[k] && typeof x[k] === "object" && !Array.isArray(x[k])) return x[k];
  return x;
};
