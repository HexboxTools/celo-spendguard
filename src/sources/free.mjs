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
  const u = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&numericFilters=created_at_i>${since}&hitsPerPage=20`;
  const d = await getJson(u, fetchImpl);
  const hits = (d.hits || []).map((h) => ({ title: h.title, points: h.points || 0, comments: h.num_comments || 0, url: `https://news.ycombinator.com/item?id=${h.objectID}`, at: h.created_at }));
  return { stories: d.nbHits || 0, points: hits.reduce((s, h) => s + h.points, 0), top: hits.sort((a, b) => b.points - a.points).slice(0, 3) };
}
