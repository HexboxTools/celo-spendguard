#!/usr/bin/env node
// Run Spendguard Scout as a public service (see src/server.mjs).
// Env: PORT (8797), PUBLIC_BASE (https://spendguard-scout.liveapps.dev) or PUBLIC_BASE_FILE,
//      SPENDGUARD_NETWORK (celo), SPENDGUARD_KEY_FILE (spending key: pays buy for full briefs, receives full-brief payments),
//      SETTLER_KEY_FILE (pays gas to settle callers' EIP-3009 authorizations; the agent wallet),
//      SPENDGUARD_ATTRIBUTION_CODE (ERC-8021 tag on settlement txs), FULL_PRICE (atomic, default 20000 = $0.02), GITHUB_TOKEN.
import fs from "node:fs";
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo, celoSepolia } from "viem/chains";
import { withAttribution } from "@celo/attribution-tags";
import { ExactEvmScheme } from "@x402/evm/exact/facilitator";
import { toFacilitatorEvmSigner } from "@x402/evm";
import { network, attributionCode } from "../src/config.mjs";
import { buildAgent, readKey } from "../src/agent.mjs";
import { createScoutService, listen } from "../src/server.mjs";

const net = network();
const log = (m) => console.error(`${new Date().toISOString()} ${m}`);
const publicBase = () => (process.env.PUBLIC_BASE_FILE && fs.existsSync(process.env.PUBLIC_BASE_FILE) ? fs.readFileSync(process.env.PUBLIC_BASE_FILE, "utf8").trim() : process.env.PUBLIC_BASE || "https://spendguard-scout.liveapps.dev");

let facilitator = null, buildPaid = null, payTo = null;
if (process.env.SPENDGUARD_KEY_FILE && process.env.SETTLER_KEY_FILE) {
  payTo = privateKeyToAccount(readKey(process.env.SPENDGUARD_KEY_FILE)).address;
  const account = privateKeyToAccount(readKey(process.env.SETTLER_KEY_FILE));
  let wallet = createWalletClient({ account, chain: net.name === "celo" ? celo : celoSepolia, transport: http(net.rpc) });
  const code = attributionCode();
  if (code) wallet = wallet.extend(withAttribution(code));
  const client = wallet.extend(publicActions);
  const signer = toFacilitatorEvmSigner({ ...client, address: account.address, readContract: client.readContract, verifyTypedData: client.verifyTypedData, writeContract: client.writeContract, sendTransaction: client.sendTransaction, waitForTransactionReceipt: client.waitForTransactionReceipt, getCode: client.getCode }, { confirmationTimeoutMs: 60000 });
  const scheme = new ExactEvmScheme(signer);
  facilitator = { verify: (p, r) => scheme.verify(p, r), settle: (p, r) => scheme.settle(p, r) };
  buildPaid = () => buildAgent(net, {}, { log });
  log(`paid tier on ${net.name}: payTo ${payTo}, settler ${account.address}${code ? `, tag ${code}` : ""}`);
}
const handler = createScoutService({ network: net, payTo, price: process.env.FULL_PRICE || "20000", facilitator, buildPaid, publicBase, log, verifyHashFile: process.env.VERIFY_HASH_FILE || null, requestLog: process.env.REQUEST_LOG || "ledger/requests.jsonl" });
const port = Number(process.env.PORT || 8797);
await listen(handler, port);
log(`spendguard scout service on 127.0.0.1:${port}, public ${publicBase()}`);
