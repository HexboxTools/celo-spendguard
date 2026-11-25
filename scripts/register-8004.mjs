#!/usr/bin/env node
// Register the agent in Celo's ERC-8004 Identity Registry from the agent wallet, with the
// ERC-8021 attribution tag on the transaction. Then write the minted agentId back into
// agent.json (registrations[]) and, with --set-uri, point the token at the final record.
//   SPENDGUARD_KEY_FILE=... SPENDGUARD_ATTRIBUTION_CODE=celo_xxx node scripts/register-8004.mjs [--dry-run] [--set-uri]
import fs from "node:fs";
import { createPublicClient, createWalletClient, http, parseAbi, parseEventLogs, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo, celoSepolia } from "viem/chains";
import { withAttribution } from "@celo/attribution-tags";
import { network, attributionCode } from "../src/config.mjs";
import { readKey } from "../src/agent.mjs";

const ABI = parseAbi([
  "function register(string agentURI) returns (uint256)",
  "function setAgentURI(uint256 agentId, string newURI)",
  "function balanceOf(address) view returns (uint256)",
  "function tokenURI(uint256) view returns (string)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);
const net = network();
const chain = net.name === "celo" ? celo : celoSepolia;
const args = new Set(process.argv.slice(2));
const code = attributionCode();
if (!code && !args.has("--dry-run") && net.name === "celo") { console.error("Set SPENDGUARD_ATTRIBUTION_CODE (from Loops House enrollment) first: an untagged tx can never be credited."); process.exit(2); }
const account = privateKeyToAccount(readKey(process.env.SPENDGUARD_KEY_FILE));
const pub = createPublicClient({ chain, transport: http(net.rpc) });
let wallet = createWalletClient({ account, chain, transport: http(net.rpc) });
if (code) wallet = wallet.extend(withAttribution(code));
const uri = process.env.AGENT_URI || "https://raw.githubusercontent.com/HexboxTools/celo-spendguard/main/agent.json";
const owned = await pub.readContract({ address: net.identityRegistry, abi: ABI, functionName: "balanceOf", args: [account.address] });
const bal = await pub.getBalance({ address: account.address });
console.log(JSON.stringify({ network: net.name, agent: account.address, celo: formatEther(bal), alreadyOwns: owned.toString(), uri, attribution: code || null }));
if (args.has("--dry-run")) {
  const gas = await pub.estimateGas({ account: account.address, to: net.identityRegistry, data: (await import("viem")).encodeFunctionData({ abi: ABI, functionName: "register", args: [uri] }) });
  const gp = await pub.getGasPrice();
  console.log(`dry run: register needs ~${gas} gas, ~${formatEther(gas * gp)} CELO at the current price`);
  process.exit(0);
}
let agentId;
const recPath = `registration.${net.name}.json`;
if (owned > 0n && fs.existsSync(recPath)) {
  agentId = BigInt(JSON.parse(fs.readFileSync(recPath, "utf8")).agentId);
  console.log("already registered, agentId", agentId.toString());
} else {
  const hash = await wallet.writeContract({ address: net.identityRegistry, abi: ABI, functionName: "register", args: [uri] });
  const rc = await pub.waitForTransactionReceipt({ hash });
  const ev = parseEventLogs({ abi: ABI, logs: rc.logs }).find((l) => l.eventName === "Registered" || (l.eventName === "Transfer" && l.args.to?.toLowerCase() === account.address.toLowerCase()));
  agentId = ev.args.agentId ?? ev.args.tokenId;
  fs.writeFileSync(recPath, JSON.stringify({ network: net.name, chainId: net.chainId, registry: net.identityRegistry, agentId: agentId.toString(), owner: account.address, tx: hash, uri, at: new Date().toISOString() }, null, 2) + "\n");
  console.log("registered agentId", agentId.toString(), `${net.explorer}/tx/${hash}`);
}
const card = JSON.parse(fs.readFileSync("agent.json", "utf8"));
const reg = `eip155:${net.chainId}:${net.identityRegistry}`;
card.registrations = [...card.registrations.filter((r) => r.agentRegistry !== reg), { agentId: Number(agentId), agentRegistry: reg }];
fs.writeFileSync("agent.json", JSON.stringify(card, null, 2) + "\n");
console.log("agent.json registrations updated; commit and push it so the URI resolves to the completed record.");
if (args.has("--set-uri")) {
  const hash = await wallet.writeContract({ address: net.identityRegistry, abi: ABI, functionName: "setAgentURI", args: [agentId, uri] });
  await pub.waitForTransactionReceipt({ hash });
  console.log("setAgentURI", `${net.explorer}/tx/${hash}`);
}
