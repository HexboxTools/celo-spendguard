// Re-set the ERC-8004 agent URI (same raw GitHub URL) so indexers like 8004scan re-read agent.json
// after its services change. One tx from the agent wallet, with the ERC-8021 attribution tag.
import fs from "node:fs";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { withAttribution } from "@celo/attribution-tags";
import { network, attributionCode } from "../src/config.mjs";
import { readKey } from "../src/agent.mjs";
const net = network("celo");
const reg = JSON.parse(fs.readFileSync("registration.celo.json", "utf8"));
const ABI = parseAbi(["function setAgentURI(uint256 agentId, string newURI)", "function tokenURI(uint256) view returns (string)"]);
const account = privateKeyToAccount(readKey(process.env.SPENDGUARD_KEY_FILE));
const pub = createPublicClient({ chain: celo, transport: http(net.rpc) });
let wallet = createWalletClient({ account, chain: celo, transport: http(net.rpc) });
if (attributionCode()) wallet = wallet.extend(withAttribution(attributionCode()));
const uri = process.env.AGENT_URI || await pub.readContract({ address: net.identityRegistry, abi: ABI, functionName: "tokenURI", args: [BigInt(reg.agentId)] });
await pub.simulateContract({ account, address: net.identityRegistry, abi: ABI, functionName: "setAgentURI", args: [BigInt(reg.agentId), uri] });
const hash = await wallet.writeContract({ address: net.identityRegistry, abi: ABI, functionName: "setAgentURI", args: [BigInt(reg.agentId), uri] });
const rc = await pub.waitForTransactionReceipt({ hash });
console.log(JSON.stringify({ agentId: reg.agentId, uri, tx: hash, status: rc.status, gasUsed: String(rc.gasUsed) }));
