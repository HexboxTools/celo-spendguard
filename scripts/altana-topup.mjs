#!/usr/bin/env node
// Agent step: the Altana session key tops up the x402 spending key from the smart wallet.
// The account enforces the session's onchain limits on this transfer: USDC.transfer is the only
// USDC call it may make, and the daily USDC spend cap ($0.05) bounds the amount.
//   ALTANA_SESSION_FILE=session.celo.json ALTANA_SESSION_KEY_FILE=... SPENDGUARD_ATTRIBUTION_CODE=celo_xxx \
//     node scripts/altana-topup.mjs --amount 30000 [--quote] [--fee-token 0x...]
import fs from "node:fs";
import { parseArgs } from "node:util";
import * as v from "viem";
import { createClient } from "@altananetwork/sdk";
import { loadSession, altanaNetwork } from "../src/payers/altana.mjs";
import { readKey } from "../src/agent.mjs";
import { network, attributionCode } from "../src/config.mjs";

const { values } = parseArgs({ options: { amount: { type: "string", default: "30000" }, to: { type: "string", default: "0xB18095490A9f775d22Ffd7ce7b833AaC510A95ad" }, quote: { type: "boolean" }, "fee-token": { type: "string" } } });
const net = network();
const USDC = net.tokens.USDC.address;
const session = loadSession({ sessionFile: process.env.ALTANA_SESSION_FILE || `session.${net.name}.json`, sessionKey: readKey(process.env.ALTANA_SESSION_KEY_FILE) });
const code = attributionCode();
const client = createClient({ chains: [altanaNetwork(net.name)], ...(code ? { appCode: code } : {}) });
const calls = [{ to: USDC, data: v.encodeFunctionData({ abi: v.erc20Abi, functionName: "transfer", args: [v.getAddress(values.to), BigInt(values.amount)] }) }];
const opts = { session, calls, chainId: net.chainId, ...(values["fee-token"] ? { feeToken: values["fee-token"] } : {}) };
const j = (o) => JSON.stringify(o, (_k, x) => (typeof x === "bigint" ? x.toString() : x), 2);
const q = await client.quoteExecute(opts);
console.log(j({ topUp: values.amount, to: values.to, fee: q.fee, feeToken: q.feeToken, feeTokenDeficit: q.feeTokenDeficit, value: q.value }));
if (values.quote) process.exit(0);
const r = await client.execute(opts);
console.log(j(r));
// The relay fee actually charged: USDC that left the wallet in the same tx to anyone but the recipient.
let fee = null;
if (r.transactionHash) {
  const pub = v.createPublicClient({ transport: v.http(net.rpc) });
  const rc = await pub.waitForTransactionReceipt({ hash: r.transactionHash });
  const T = v.parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
  fee = 0n;
  for (const l of rc.logs) { if (l.address.toLowerCase() !== USDC.toLowerCase()) continue; try { const d = v.decodeEventLog({ abi: [T], data: l.data, topics: l.topics }); if (d.args.from.toLowerCase() === session.walletAddress?.toLowerCase() && d.args.to.toLowerCase() !== values.to.toLowerCase()) fee += d.args.value; } catch {} }
  console.log(`relay fee charged: ${fee} (quoted max ${q.fee})`);
}
fs.appendFileSync("ledger/celo.jsonl", JSON.stringify({ at: new Date().toISOString(), day: new Date().toISOString().slice(0, 10), network: net.caip2, kind: "topup", rail: "altana-session", from: session.walletAddress || "0xC17733165C47f80E56b1c6eD61E8988296CA8f82", to: values.to, asset: USDC, amount: values.amount, tx: r.transactionHash || r.txHash || null, fee: String(fee ?? q.fee), relayQuoteMaxFee: String(q.fee), feeToken: r.feeToken || q.feeToken }) + "\n");
