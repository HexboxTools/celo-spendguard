// One real x402 payment through the service's own facilitator code on Celo mainnet, at a token price,
// between the agent's own wallets: spending key pays 0.001 USDC to the agent wallet, which settles (pays gas).
// Proves verify + settle work before outsiders pay. Writes to ledger/celo-selftest.jsonl (not the main ledger).
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { withAttribution } from "@celo/attribution-tags";
import { ExactEvmScheme } from "@x402/evm/exact/facilitator";
import { toFacilitatorEvmSigner } from "@x402/evm";
import { network, attributionCode } from "../src/config.mjs";
import { readKey, defaultPolicy } from "../src/agent.mjs";
import { createEoaPayer } from "../src/payers/eoa.mjs";
import { createScoutService, listen } from "../src/server.mjs";

const net = network("celo");
const settler = privateKeyToAccount(readKey(process.env.SETTLER_KEY_FILE));
let w = createWalletClient({ account: settler, chain: celo, transport: http(net.rpc) });
if (attributionCode()) w = w.extend(withAttribution(attributionCode()));
const c = w.extend(publicActions);
const scheme = new ExactEvmScheme(toFacilitatorEvmSigner({ ...c, address: settler.address }, { confirmationTimeoutMs: 60000 }));
const stub = async ({ project, repo }) => ({ project, repo, query: project, started: new Date().toISOString(), finished: new Date().toISOString(), network: "celo", score: { total: 0, parts: { github: 0, hackerNews: 0, x: 0, reddit: 0 } }, github: null, hackerNews: null, x: null, reddit: null, receipts: [], budget: null, funding: null, errors: [] });
const h = createScoutService({ network: net, payTo: settler.address, price: "1000", facilitator: { verify: (p, r) => scheme.verify(p, r), settle: (p, r) => scheme.settle(p, r) }, buildPaid: () => ({ payer: null, policy: { dailyCap: 50000n, spentToday: () => 0n } }), scout: stub, requestLog: "ledger/requests-selftest.jsonl", outDir: null, publicBase: () => base });
const srv = await listen(h, 0);
const base = `http://127.0.0.1:${srv.address().port}`;
const policy = defaultPolicy(net, { allowedHosts: [`127.0.0.1:${srv.address().port}`], allowedPayTo: [settler.address], ledgerFile: "ledger/celo-selftest.jsonl" });
const payer = createEoaPayer({ privateKey: readKey(process.env.SPENDGUARD_KEY_FILE), policy, rpcUrl: net.rpc, log: console.error });
const r = await payer.pay(`${base}/v1/brief/full?repo=HexboxTools/celo-spendguard&by=hexbox-selftest`);
console.log(r.res.status, JSON.stringify(r.entry), (await r.res.text()).slice(0, 300));
srv.close();
