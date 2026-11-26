// The job: a traction brief for one project. Free sources first; paid sources only within budget.
import fs from "node:fs";
import path from "node:path";
import { githubStats, hnMentions, celoOnchain } from "./sources/free.mjs";
import { xMentions, redditMentions, youtubeMentions } from "./sources/buy.mjs";

export function score({ gh, hn, x, reddit }) {
  const lg = (v, k) => Math.min(1, Math.log10(1 + (v || 0)) / k);
  const parts = {
    github: gh ? 30 * (0.6 * lg(gh.stars, 3.5) + 0.4 * lg(gh.commits30d, 2)) : 0,
    hackerNews: hn ? 20 * lg(hn.points, 3) : 0,
    x: x?.ok ? (x.source === "youtube" ? 30 * (0.5 * lg(x.recent, 1.3) + 0.5 * lg(x.views, 5)) : 30 * (0.5 * lg(x.count, 1.5) + 0.5 * lg(x.engagement, 3))) : 0,
    reddit: reddit?.ok ? 20 * (0.5 * lg(reddit.count, 1.5) + 0.5 * lg(reddit.score, 3)) : 0,
  };
  for (const k in parts) parts[k] = Math.round(parts[k]);
  return { total: Object.values(parts).reduce((a, b) => a + b, 0), parts };
}

export async function runScout({ project, repo, query, address, payer, policy, network, outDir = "reports", fetchImpl = globalThis.fetch, paid = true, log = () => {} }) {
  const q = query || `"${project}"`;
  log(`brief: ${project}  (query ${q}${repo ? `, repo ${repo}` : ""})`);
  if (policy) { const b = policy.summary(); log(`budget: spent today ${(Number(b.spentTodayAtomic) / 1e6).toFixed(3)} of ${(Number(b.dailyCapAtomic) / 1e6).toFixed(3)} USD cap, per-call cap ${(Number(b.maxPerCallAtomic) / 1e6).toFixed(3)}`); }
  const started = new Date().toISOString();
  const errors = [];
  const gh = repo ? await githubStats(repo, { fetchImpl }).catch((e) => (errors.push(`github: ${e.message}`), null)) : null;
  if (gh) log(`free  github: ${gh.stars} stars, ${gh.commits30d ?? "?"} commits in 30 days`);
  const hn = await hnMentions(q, { fetchImpl }).catch((e) => (errors.push(`hn: ${e.message}`), null));
  if (hn) log(`free  hacker news: ${hn.stories} stories, ${hn.points} points`);
  const onchain = address ? await celoOnchain(address, { fetchImpl, rpc: network?.rpc }).catch((e) => (errors.push(`onchain: ${e.message}`), null)) : null;
  if (onchain) log(`free  celo onchain: ${onchain.txSent} txs sent, ${onchain.erc8004Owned} ERC-8004 identities`);
  let x = null, reddit = null;
  if (paid && payer) {
    x = await xMentions(payer, q).catch((e) => ({ ok: false, error: e.message }));
    // X upstream errors are refused before settlement (no charge); fall back to YouTube for the social signal.
    if (!x.ok && !x.refused) { const yt = await youtubeMentions(payer, q).catch((e) => ({ ok: false, error: e.message })); if (yt.ok) x = { ...yt, source: "youtube", xError: x.error }; }
    reddit = await redditMentions(payer, q).catch((e) => ({ ok: false, error: e.message }));
  }
  const s = score({ gh, hn, x, reddit });
  log(`score ${s.total}/100`);
  const receipts = [x?.receipt, reddit?.receipt].filter(Boolean);
  const report = { project, query: q, repo: gh?.url || repo || null, started, finished: new Date().toISOString(), network: network.name, payer: payer?.address || null, payerKind: payer?.kind || null, score: s, github: gh, hackerNews: hn, onchain, x: strip(x), reddit: strip(reddit), receipts, budget: policy?.summary() || null, funding: fundingOf(policy, payer), errors };
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    const slug = `${started.slice(0, 10)}-${project.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}`;
    fs.writeFileSync(path.join(outDir, `${slug}.json`), JSON.stringify(report, null, 2) + "\n");
    fs.writeFileSync(path.join(outDir, `${slug}.md`), toMarkdown(report, network));
    report.files = [`${slug}.json`, `${slug}.md`];
  }
  return report;
}

// The latest Altana session-key top-up into this payer, so the brief says where its float came from.
function fundingOf(policy, payer) {
  if (!policy || !payer) return null;
  const t = policy.entries().filter((e) => e.kind === "topup" && String(e.to).toLowerCase() === String(payer.address).toLowerCase()).at(-1);
  return t ? { rail: t.rail, from: t.from, amount: t.amount, tx: t.tx } : null;
}

const strip = (r) => (r ? Object.fromEntries(Object.entries(r).filter(([k]) => k !== "receipt")) : null);

export function toMarkdown(r, network) {
  const fmt = (a) => (Number(a) / 1e6).toFixed(3);
  const L = [];
  const free = !r.x && !r.reddit;
  L.push(`# Traction brief: ${r.project}`, "", free ? `Checked ${r.finished.slice(0, 16).replace("T", " ")} UTC. Free tier score **${r.score.total}/50** (GitHub ${r.score.parts.github}/30, Hacker News ${r.score.parts.hackerNews}/20; social sources are in the full brief).` : `Checked ${r.finished.slice(0, 16).replace("T", " ")} UTC. Score **${r.score.total}/100** (GitHub ${r.score.parts.github}/30, Hacker News ${r.score.parts.hackerNews}/20, Social ${r.score.parts.x}/30, Reddit ${r.score.parts.reddit}/20).`, "");
  if (r.github) L.push(`- **GitHub** [${r.github.url}](${r.github.url}): ${r.github.stars} stars, ${r.github.forks} forks, ${r.github.commits30d ?? "?"} commits in 30 days, last push ${String(r.github.pushedAt).slice(0, 10)}.`);
  if (r.hackerNews) L.push(`- **Hacker News** (12 months): ${r.hackerNews.stories} stories, ${r.hackerNews.points} points.${r.hackerNews.top[0] ? ` Top: [${r.hackerNews.top[0].title}](${r.hackerNews.top[0].url}) (${r.hackerNews.top[0].points}).` : ""}`);
  if (r.onchain) L.push(`- **Celo onchain** [\`${r.onchain.address.slice(0, 10)}…\`](${r.onchain.explorer}): ${r.onchain.txSent} transactions sent, ${r.onchain.erc8004Owned} ERC-8004 agent identit${r.onchain.erc8004Owned === 1 ? "y" : "ies"} owned${r.onchain.isContract ? " (contract)" : ""}. Not scored.`);
  if (r.x) L.push(!r.x.ok ? `- **Social**: not bought (${r.x.refused ? `refused by the spend policy: ${r.x.refused}` : "X and YouTube providers failed upstream; buy did not settle, so no charge"}).` : r.x.source === "youtube" ? `- **YouTube** (X search failed upstream, unpaid): ${r.x.recent} of ${r.x.count} matching videos${r.x.returned != null ? ` (of ${r.x.returned} returned)` : ""} from the last few weeks, ${r.x.views} views on those.` : `- **X** (30 days, latest): ${r.x.count} posts from ${r.x.authors} accounts, ${r.x.engagement} likes and reposts.`);
  if (r.reddit) L.push(r.reddit.ok ? `- **Reddit** (month): ${r.reddit.count} posts${r.reddit.returned != null ? ` mentioning "${r.reddit.keyTerm}" (of ${r.reddit.returned} returned)` : ""}, ${r.reddit.score} total score, ${r.reddit.comments} comments.${r.reddit.sample[0] ? ` Newest: [${r.reddit.sample[0].title.replace(/[\[\]|]/g, "")}](${r.reddit.sample[0].url}).` : ""}` : `- **Reddit**: not bought (${r.reddit.refused || /cap|allowlist|not allowlisted/.test(String(r.reddit.error)) ? `refused by the spend policy: ${String(r.reddit.refused || r.reddit.error).replace(/^.*aborted: /, "")}` : "provider failed upstream; no charge"}).`);
  L.push("", "## Data bill", "", "| Source | Paid | Settlement |", "|---|---|---|");
  for (const e of r.receipts) L.push(`| ${e.source} | ${fmt(e.amount)} | ${e.tx ? `[${e.tx.slice(0, 10)}…](${network.explorer}/tx/${e.tx})` : "pending"} |`);
  if (!r.receipts.length) L.push(free ? "| (free tier: no paid calls) | 0 | |" : "| (no paid calls) | 0 | |");
  if (r.budget) L.push("", `Wallet \`${r.payer}\` (${r.payerKind}). Spent today ${fmt(r.budget.spentTodayAtomic)} of a ${fmt(r.budget.dailyCapAtomic)} daily cap; per-call cap ${fmt(r.budget.maxPerCallAtomic)}.`);
  if (r.funding) L.push("", `Float funded by the Altana session key: ${fmt(r.funding.amount)} USDC from smart wallet \`${r.funding.from}\` under its onchain daily cap ([${r.funding.tx.slice(0, 10)}…](${network.explorer}/tx/${r.funding.tx})).`);
  L.push("", "_Made by Spendguard Scout, an agent that pays for its own data on Celo inside a spend cap. https://github.com/HexboxTools/celo-spendguard_", "");
  return L.join("\n");
}
