#!/usr/bin/env node
// Public status: balances, ERC-8004 identity and the spend ledger summary.
import fs from "node:fs";
import { createPublicClient, http, parseAbi, formatEther, formatUnits } from "viem";
import { network } from "../src/config.mjs";
import { defaultPolicy } from "../src/agent.mjs";
const net = network();
const addr = process.argv[2] || process.env.SPENDGUARD_ADDRESS;
const pub = createPublicClient({ transport: http(net.rpc) });
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const out = { network: net.name, address: addr };
if (addr) {
  out.native = formatEther(await pub.getBalance({ address: addr }));
  for (const [sym, t] of Object.entries(net.tokens)) out[sym] = formatUnits(await pub.readContract({ address: t.address, abi: erc20, functionName: "balanceOf", args: [addr] }), t.decimals);
  out.erc8004Owned = (await pub.readContract({ address: net.identityRegistry, abi: erc20, functionName: "balanceOf", args: [addr] })).toString();
}
const rec = `registration.${net.name}.json`;
if (fs.existsSync(rec)) out.registration = JSON.parse(fs.readFileSync(rec, "utf8"));
out.ledger = defaultPolicy(net).summary();
console.log(JSON.stringify(out, null, 2));
