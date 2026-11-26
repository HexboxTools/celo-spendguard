import { mentions } from "./buy.mjs";
// Free public sources: GitHub REST and the Hacker News Algolia API. No keys, no payment.
const UA = { "user-agent": "spendguard-scout (+https://github.com/HexboxTools/celo-spendguard)" };

async function getJson(url, fetchImpl, headers = {}) {
  const r = await fetchImpl(url, { headers: { ...UA, ...headers } });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

export function parseRepo(s) {
  if (!s) return null;
  const m = String(s).match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/i) || String(s).match(/^([\w.-]+)\/([\w.-]+)$/);
  return m ? { owner: m[1], repo: m[2].replace(/\.git$/, "") } : null;
}

export async function githubStats(repoRef, { fetchImpl = globalThis.fetch, token = process.env.GITHUB_TOKEN } = {}) {
  const r = parseRepo(repoRef);
  if (!r) return null;
  const h = token ? { authorization: `Bearer ${token}` } : {};
  const base = `https://api.github.com/repos/${r.owner}/${r.repo}`;
  const repo = await getJson(base, fetchImpl, h);
  const since = new Date(Date.now() - 30 * 86400e3).toISOString();
  let commits30d = null;
  try { commits30d = (await getJson(`${base}/commits?since=${since}&per_page=100`, fetchImpl, h)).length; } catch {}
  return {
    url: repo.html_url, stars: repo.stargazers_count, forks: repo.forks_count, openIssues: repo.open_issues_count,
    pushedAt: repo.pushed_at, createdAt: repo.created_at, commits30d, description: repo.description,
  };
}

export async function hnMentions(query, { fetchImpl = globalThis.fetch, days = 365 } = {}) {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  // Title-only, no typo tolerance, then a whole-word check: "Celo" must not match "Cello" or "Celorga".
  const u = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&restrictSearchableAttributes=title&typoTolerance=false&numericFilters=created_at_i>${since}&hitsPerPage=50`;
  const d = await getJson(u, fetchImpl);
  const hits = (d.hits || []).filter((h) => mentions(h.title || "", query)).map((h) => ({ title: h.title, points: h.points || 0, comments: h.num_comments || 0, url: `https://news.ycombinator.com/item?id=${h.objectID}`, at: h.created_at }));
  return { stories: hits.length, points: hits.reduce((s, h) => s + h.points, 0), top: hits.sort((a, b) => b.points - a.points).slice(0, 3) };
}

// Celo onchain, free over the public RPC: transactions the address has sent (its nonce) and
// how many ERC-8004 agent identities it owns. For agents, this is often the traction that counts.
export async function celoOnchain(address, { rpc = "https://forno.celo.org", registry = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432", fetchImpl = globalThis.fetch } = {}) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(address || ""))) return null;
  const call = async (method, params) => {
    const r = await fetchImpl(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    const j = await r.json();
    if (j.error) throw new Error(j.error.message);
    return j.result;
  };
  const a = address.toLowerCase();
  const [nonce, code, owned] = await Promise.all([
    call("eth_getTransactionCount", [a, "latest"]),
    call("eth_getCode", [a, "latest"]),
    call("eth_call", [{ to: registry, data: "0x70a08231" + a.slice(2).padStart(64, "0") }, "latest"]).catch(() => "0x0"),
  ]);
  return { address, txSent: Number(BigInt(nonce)), isContract: code !== "0x" && !String(code).toLowerCase().startsWith("0xef0100"), erc8004Owned: Number(BigInt(owned || "0x0")), explorer: `https://celoscan.io/address/${address}` };
}
