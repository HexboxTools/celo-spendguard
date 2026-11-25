import * as v from "viem"; import { privateKeyToAccount } from "viem/accounts"; import { celo } from "viem/chains";
import { readKey } from "../src/agent.mjs";
const acct = privateKeyToAccount(readKey("/home/box/secrets/celo-hexbox.txt"));
const pub = v.createPublicClient({ chain: celo, transport: v.http("https://forno.celo.org") });
const w = v.createWalletClient({ account: acct, chain: celo, transport: v.http("https://forno.celo.org") });
const code = await pub.getCode({ address: acct.address }); console.log("code before", code);
if (!code || code === "0x") {
  const auth = await w.signAuthorization({ contractAddress: "0xc0f16888f4198f53892c53af859f673e23f26fa3", executor: "self" });
  console.log("auth nonce", auth.nonce);
  const h = await w.sendTransaction({ to: acct.address, data: "0x", authorizationList: [auth] });
  console.log("tx", h); const r = await pub.waitForTransactionReceipt({ hash: h }); console.log("status", r.status, "gas", r.gasUsed);
  console.log("code after", await pub.getCode({ address: acct.address }));
}