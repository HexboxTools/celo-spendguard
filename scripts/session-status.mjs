#!/usr/bin/env node
// Reads the Altana session key's onchain limits from the smart account: what it may call,
// its daily spend caps and how much of today's cap is used, its expiry. No keys needed.
//   node scripts/session-status.mjs [session.celo.json]
import fs from "node:fs";
import * as v from "viem";
import { network } from "../src/config.mjs";
const net = network();
const s = JSON.parse(fs.readFileSync(process.argv[2] || `session.${net.name}.json`, "utf8"));
const pub = v.createPublicClient({ transport: v.http(net.rpc) });
const abi = v.parseAbi([
  "function getKeys() view returns ((uint40 expiry,uint8 keyType,bool isSuperAdmin,bytes publicKey)[] keys, bytes32[] keyHashes)",
  "function canExecutePackedInfos(bytes32 keyHash) view returns (bytes32[])",
  "function spendInfos(bytes32 keyHash) view returns ((address token,uint8 period,uint256 limit,uint256 spent,uint256 lastUpdated,uint256 currentSpent,uint256 current)[])",
]);
const A = s.walletAddress;
const [keys, hashes] = await pub.readContract({ address: A, abi, functionName: "getKeys" });
const name = Object.fromEntries(Object.entries(net.tokens).map(([k, t]) => [t.address.toLowerCase(), k]));
const sel = { "0xa9059cbb": "transfer", "0x32323232": "any function" };
name["0xaf140d0416a994aebb3fa6212b16ce6700f09751"] = "AltanaRelayEntry(0xaf14…)";
for (let i = 0; i < keys.length; i++) {
  const k = keys[i]; if (k.isSuperAdmin) continue;
  const calls = (await pub.readContract({ address: A, abi, functionName: "canExecutePackedInfos", args: [hashes[i]] })).map((p) => { const t = "0x" + p.slice(2, 42), f = "0x" + p.slice(-8); return `${name[t] || t}.${sel[f] || f}`; });
  const spend = (await pub.readContract({ address: A, abi, functionName: "spendInfos", args: [hashes[i]] })).map((x) => `${name[x.token.toLowerCase()] || x.token}: ${(Number(x.currentSpent) / 1e6).toFixed(4)} of ${(Number(x.limit) / 1e6).toFixed(3)} used today`);
  console.log(JSON.stringify({ account: A, sessionKey: "0x" + k.publicKey.slice(-40), expiry: new Date(k.expiry * 1000).toISOString().slice(0, 10), mayCall: calls, dailyCaps: spend }, null, 2));
}
