#!/usr/bin/env node
// Owner step (one admin self-call from the agent EOA, which the 7702 account treats as itself):
// let the session key call USDC.transfer, so it can top up the x402 spending key. The account's
// onchain daily spend cap on USDC (setSpendLimit, already in place) bounds every transfer.
//   ADMIN_KEY_FILE=... SPENDGUARD_ATTRIBUTION_CODE=celo_xxx node scripts/altana-allow-usdc-transfer.mjs [--dry]
import * as v from "viem"; import { privateKeyToAccount } from "viem/accounts"; import { celo } from "viem/chains";
import { withAttribution } from "@celo/attribution-tags";
import { readKey } from "../src/agent.mjs"; import { attributionCode } from "../src/config.mjs";
const acct = privateKeyToAccount(readKey(process.env.ADMIN_KEY_FILE));
const pub = v.createPublicClient({ chain: celo, transport: v.http("https://forno.celo.org") });
let w = v.createWalletClient({ account: acct, chain: celo, transport: v.http("https://forno.celo.org") });
const code = attributionCode(); if (code) w = w.extend(withAttribution(code));
const USDC = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";
const KEYHASH = process.env.SESSION_KEY_HASH || "0x58ce539738140da860c82e2fc6ec2de0d9b02598d2ad3820193152453c7e565c";
const abi = v.parseAbi(["function setCanExecute(bytes32 keyHash, address target, bytes4 fnSel, bool can)", "function canExecute(bytes32 keyHash, address target, bytes calldata data) view returns (bool)"]);
const req = { address: acct.address, abi, functionName: "setCanExecute", args: [KEYHASH, USDC, "0xa9059cbb", true] };
const gas = await pub.estimateContractGas({ ...req, account: acct }); const gp = await pub.getGasPrice();
console.log(`gas ${gas} at ${v.formatGwei(gp)} gwei ≈ ${v.formatEther(gas * gp)} CELO`);
if (process.argv.includes("--dry")) process.exit(0);
const h = await w.writeContract(req); const r = await pub.waitForTransactionReceipt({ hash: h });
console.log("setCanExecute", h, r.status, `fee ${v.formatEther(r.gasUsed * r.effectiveGasPrice)} CELO`);
const data = v.encodeFunctionData({ abi: v.erc20Abi, functionName: "transfer", args: ["0xB18095490A9f775d22Ffd7ce7b833AaC510A95ad", 1n] });
console.log("canExecute(session, USDC.transfer):", await pub.readContract({ address: acct.address, abi, functionName: "canExecute", args: [KEYHASH, USDC, data] }));
