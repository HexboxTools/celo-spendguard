// Payer A: a plain key that signs EIP-3009 x402 authorizations. The SpendPolicy is applied in
// the x402 client's onBeforePaymentCreation hook, so nothing is signed that the policy refuses.
// The buyer pays no gas: the seller's facilitator settles the authorization onchain.
import { x402Client, wrapFetchWithPayment, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

export function createEoaPayer({ privateKey, policy, rpcUrl, fetchImpl = globalThis.fetch }) {
  const account = privateKeyToAccount(privateKey);
  const client = new x402Client();
  // Only the policy's network, and only allowlisted assets.
  client.registerPolicy((_v, reqs) => reqs.filter((r) => r.network === policy.network && (!policy.allowedAssets.size || policy.allowedAssets.has(String(r.asset).toLowerCase()))));
  client.setSpendControls({ maxAmountPerPayment: "$1" });
  client.register("eip155:*", new ExactEvmScheme(account, rpcUrl ? { rpcUrl } : undefined));

  let current = null; // { url, req }
  client.onBeforePaymentCreation(async ({ selectedRequirements: req }) => {
    const reason = policy.check(req, current?.url);
    if (reason) {
      policy.record({ kind: "refused", url: current?.url, payTo: req.payTo, asset: req.asset, amount: req.amount, reason, payer: account.address });
      return { abort: true, reason };
    }
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
    if (!req) return { res, paid: false };
    const hdr = res.headers.get("payment-response") || res.headers.get("x-payment-response");
    let settle = null;
    try { settle = hdr ? decodePaymentResponseHeader(hdr) : null; } catch {}
    const ok = res.ok && (!settle || settle.success !== false);
    const entry = policy.record({
      kind: ok ? "paid" : "failed",
      url, status: res.status, payTo: req.payTo, asset: req.asset, amount: req.amount,
      tx: settle?.transaction || null, payer: account.address, rail: "eoa-eip3009", ...meta,
    });
    return { res, paid: ok, entry };
  }

  return { address: account.address, kind: "eoa", pay };
}
