// Payer A: a plain key that signs EIP-3009 x402 authorizations. The SpendPolicy is applied in
// the x402 client's onBeforePaymentCreation hook, so nothing is signed that the policy refuses.
// The buyer pays no gas: the seller's facilitator settles the authorization onchain.
import { x402Client, wrapFetchWithPayment, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

export function createEoaPayer({ privateKey, policy, rpcUrl, fetchImpl = globalThis.fetch, log = () => {} }) {
  const account = privateKeyToAccount(privateKey);
  const client = new x402Client();
  // Only the policy's network, and only allowlisted assets.
  client.registerPolicy((_v, reqs) => reqs.filter((r) => r.network === policy.network && (!policy.allowedAssets.size || policy.allowedAssets.has(String(r.asset).toLowerCase()))));
  client.setSpendControls({ maxAmountPerPayment: "$1" });
  client.register("eip155:*", new ExactEvmScheme(account, rpcUrl ? { rpcUrl } : undefined));

  let current = null; // { url, req }
  client.onBeforePaymentCreation(async ({ selectedRequirements: req }) => {
    const reason = policy.check(req, current?.url);
    const usd = (a) => (Number(a) / 1e6).toFixed(3);
    log(`402   ${new URL(current?.url).pathname} asks ${usd(req.amount)} ${req.extra?.name || "token"} -> ${req.payTo.slice(0, 10)}…`);
    if (reason) {
      log(`REFUSED by SpendPolicy: ${reason}. Nothing signed.`);
      policy.record({ kind: "refused", url: current?.url, payTo: req.payTo, asset: req.asset, amount: req.amount, reason, payer: account.address });
      return { abort: true, reason };
    }
    log(`ok    policy check passed (spent today ${usd(policy.spentToday() + policy.pending)} + ${usd(req.amount)} <= cap ${usd(policy.dailyCap)}); signing EIP-3009 authorization`);
    policy.reserve(req.amount);
    current.req = req;
  });

  const paidFetch = wrapFetchWithPayment(fetchImpl, client);

  async function pay(url, init = {}, meta = {}) {
    current = { url, req: null };
    let res;
    try {
      res = await paidFetch(url, init);
    } finally {
      if (current.req) policy.release(current.req.amount);
    }
    const req = current.req;
    current = null;
    if (!req) { if (res.status !== 200) log(`skip  ${new URL(url).pathname}: HTTP ${res.status}, not paid`); return { res, paid: false }; }
    const hdr = res.headers.get("payment-response") || res.headers.get("x-payment-response");
    let settle = null;
    try { settle = hdr ? decodePaymentResponseHeader(hdr) : null; } catch {}
    const ok = res.ok && (!settle || settle.success !== false);
    const entry = policy.record({
      kind: ok ? "paid" : "failed",
      url, status: res.status, payTo: req.payTo, asset: req.asset, amount: req.amount,
      tx: settle?.transaction || null, payer: account.address, rail: "eoa-eip3009", ...meta,
    });
    log(ok ? `PAID  settled onchain: https://celoscan.io/tx/${entry.tx}` : `fail  HTTP ${res.status}, seller did not settle (no charge)`);
    return { res, paid: ok, entry };
  }

  return { address: account.address, kind: "eoa", pay };
}
