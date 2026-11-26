#!/usr/bin/env node
// spendguard scout --project "Name" [--repo owner/name] [--query "search terms"] [--free]
// Env: SPENDGUARD_NETWORK=celo|celo-sepolia, SPENDGUARD_PAYER=eoa|altana,
//      SPENDGUARD_KEY_FILE (eoa key file: a line private_key=0x...), or ALTANA_SESSION_FILE + ALTANA_SESSION_KEY_FILE,
//      SPENDGUARD_MAX_PER_CALL / SPENDGUARD_DAILY_CAP (atomic, 6 decimals), SPENDGUARD_LEDGER.
import fs from "node:fs";
import { parseArgs } from "node:util";
import { network } from "../src/config.mjs";
import { buildAgent } from "../src/agent.mjs";
import { runScout } from "../src/scout.mjs";

const { values } = parseArgs({ options: { project: { type: "string" }, repo: { type: "string" }, query: { type: "string" }, free: { type: "boolean" }, out: { type: "string" } } });
if (!values.project) { console.error("usage: scout --project NAME [--repo owner/name] [--query TERMS] [--free]"); process.exit(2); }
const net = network();
const log = (m) => console.error(`[scout] ${m}`);
const { payer, policy } = values.free ? { payer: null, policy: null } : await buildAgent(net, {}, { log });
if (payer) log(`payer ${payer.kind} ${payer.address} on ${net.name}`);
if (payer && policy) {
  // Show where the float came from: the latest Altana session top-up into this payer, if any.
  const t = policy.entries().filter((e) => e.kind === "topup" && String(e.to).toLowerCase() === payer.address.toLowerCase()).at(-1);
  if (t) log(`float funded by the Altana session key: ${(Number(t.amount) / 1e6).toFixed(3)} USDC from smart wallet ${t.from.slice(0, 10)}…, tx ${net.explorer}/tx/${t.tx}`);
}
const r = await runScout({ project: values.project, repo: values.repo, query: values.query, payer, policy, network: net, outDir: values.out || "reports", paid: !values.free, log });
console.log(JSON.stringify({ score: r.score, receipts: r.receipts, files: r.files, errors: r.errors }, null, 2));
