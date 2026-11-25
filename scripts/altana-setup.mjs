#!/usr/bin/env node
// Owner step: make the agent wallet an Altana smart agentic wallet (EIP-7702, same address)
// and grant the agent a session key with an onchain spend cap, a contract allowlist and an
// expiry. Revoke at any time with scripts/altana-revoke.mjs (one transaction).
//   ADMIN_KEY_FILE=... SESSION_KEY_FILE=... SPENDGUARD_ATTRIBUTION_CODE=celo_xxx node scripts/altana-setup.mjs [--quote]
// Cost: Altana's KeyStore charges a one-time registration fee in CELO for the wallet's admin
// key (about 10.3 CELO on Celo mainnet in Nov 2026), plus a small relay fee in CELO or USDT.
import fs from "node:fs";
import { createClient, signerFromPrivateKey, serializeSession } from "@altananetwork/sdk";
import { generatePrivateKey } from "viem/accounts";
import { network, attributionCode } from "../src/config.mjs";
import { altanaNetwork } from "../src/payers/altana.mjs";
import { readKey } from "../src/agent.mjs";

const j = (o) => JSON.stringify(o, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);
const net = network();
const anet = altanaNetwork(net.name);
const token = (net.tokens.USDT || net.tokens.USDC).address;
const cap = BigInt(process.env.SPENDGUARD_DAILY_CAP || "50000");
const days = Number(process.env.SESSION_DAYS || 14);
const code = attributionCode();
const client = createClient({ chains: [anet], ...(code ? { appCode: code } : {}) });
const admin = signerFromPrivateKey(readKey(process.env.ADMIN_KEY_FILE));
const wallet = await client.createWallet({ signer: admin });
const skFile = process.env.SESSION_KEY_FILE;
if (!fs.existsSync(skFile)) fs.writeFileSync(skFile, `session_key=${generatePrivateKey()}\n`, { mode: 0o600 });
const sessionSigner = signerFromPrivateKey(readKey(skFile));
const opts = {
  wallet, signer: admin, sessionSigner,
  permissions: { calls: [{ to: token }], spend: [{ token, limit: cap, period: "day" }] },
  expiry: Math.floor(Date.now() / 1000) + days * 86400,
  x402Tokens: [token],
  register: process.env.REGISTER_SESSION === "1",
  feeToken: process.env.FEE_TOKEN === "native" ? undefined : [token], // FEE_TOKEN=native pays the relay in CELO
  agentIdentity: false, // registered separately with our own record (scripts/register-8004.mjs)
};
const q = await client.quoteGrantSession(opts);
console.log(j({ wallet: wallet.address, token, dailyCap: cap, expiryDays: days, quote: q.lines, balances: q.balances }));
if (process.argv.includes("--quote")) process.exit(0);
const s = await client.grantSession(opts);
console.log(j({ status: s.status, tx: s.transactionHash, legs: s.legs }));
if (s.status !== "granted") process.exit(1);
fs.writeFileSync(`session.${net.name}.json`, JSON.stringify(serializeSession(s), null, 2) + "\n");
console.log(`session written to session.${net.name}.json (public: no secret inside)`);
