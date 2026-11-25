// Owner step (direct self-calls from the admin EOA, which IthacaAccount treats as the account itself):
// let the session key pay x402 in USDC as well as USDT, under the same onchain daily cap.
//   ADMIN_KEY_FILE=... SPENDGUARD_ATTRIBUTION_CODE=celo_xxx node scripts/altana-add-usdc.mjs
import fs from "node:fs";
import * as v from "viem"; import { privateKeyToAccount } from "viem/accounts"; import { celo } from "viem/chains";
import { withAttribution } from "@celo/attribution-tags";
import { readKey } from "../src/agent.mjs"; import { attributionCode } from "../src/config.mjs";
const acct = privateKeyToAccount(readKey(process.env.ADMIN_KEY_FILE));
const pub = v.createPublicClient({ chain: celo, transport: v.http("https://forno.celo.org") });
let w = v.createWalletClient({ account: acct, chain: celo, transport: v.http("https://forno.celo.org") });
const code = attributionCode(); if (code) w = w.extend(withAttribution(code));
const USDC = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C", USDT = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e";
const KEYHASH = process.env.SESSION_KEY_HASH || "0x58ce539738140da860c82e2fc6ec2de0d9b02598d2ad3820193152453c7e565c";
const cap = BigInt(process.env.SPENDGUARD_DAILY_CAP || "50000");
const R = "0x5615CDAb10dc425a742d643d949a7F474C01abc4";
const abi = v.parseAbi([
  "function setSignatureCheckerApproval(bytes32 keyHash, address checker, bool isApproved)",
  "function setSpendLimit(bytes32 keyHash, address token, uint8 period, uint256 limit)",
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)",
]);
const send = async (label, req) => { const h = await w.writeContract(req); const r = await pub.waitForTransactionReceipt({ hash: h }); console.log(label, h, r.status); if (r.status !== "success") process.exit(1); return h; };
const out = {};
out.checker = await send("checker", { address: acct.address, abi, functionName: "setSignatureCheckerApproval", args: [KEYHASH, USDC, true] });
out.cap = await send("cap", { address: acct.address, abi, functionName: "setSpendLimit", args: [KEYHASH, USDC, 2, cap] });
if (process.argv.includes("--swap")) {
  const bal = await pub.readContract({ address: USDT, abi: v.erc20Abi, functionName: "balanceOf", args: [acct.address] });
  if (bal > 0n) {
    out.approve = await send("approve", { address: USDT, abi: v.erc20Abi, functionName: "approve", args: [R, bal] });
    out.swap = await send("swap USDT->USDC", { address: R, abi, functionName: "exactInputSingle", args: [{ tokenIn: USDT, tokenOut: USDC, fee: 100, recipient: acct.address, amountIn: bal, amountOutMinimum: bal * 97n / 100n, sqrtPriceLimitX96: 0n }] });
  }
}
// Mirror the new cap in the public session record so the SDK measures USDC payments against it too.
const f = process.env.ALTANA_SESSION_FILE || "session.celo.json";
const s = JSON.parse(fs.readFileSync(f, "utf8"));
if (!s.permissions.spend.some((c) => c.token.toLowerCase() === USDC.toLowerCase())) s.permissions.spend.push({ limit: cap.toString(), period: "day", token: USDC });
fs.writeFileSync(f, JSON.stringify(s, null, 2) + "\n");
console.log(JSON.stringify(out));