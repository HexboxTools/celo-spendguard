// Payer B: an Altana smart agentic wallet (EIP-7702) acting under a session key.
// The owner grants the session once (scripts/altana-setup.mjs) with:
//   - a spend cap on the payment token, per UTC day
//   - an allowlist of contracts the session may call (the token only)
//   - an expiry, after which the key is dead; revocable in one transaction
// The account enforces the cap and allowlist onchain for everything the session executes.
// x402 payments are ERC-1271 signatures the seller settles, so the SDK measures each one
// against the same onchain cap before it signs, and our SpendPolicy adds the per-call cap,
// the host and payTo allowlist and the public ledger on top.
import fs from "node:fs";
import { createClient, CELO, CELO_SEPOLIA, signerFromPrivateKey, deserializeSession } from "@altananetwork/sdk";

export function altanaNetwork(name) { return name === "celo-sepolia" ? CELO_SEPOLIA : CELO; }

export function loadSession({ sessionFile, sessionKey }) {
  const raw = JSON.parse(fs.readFileSync(sessionFile, "utf8"));
  return deserializeSession(raw, signerFromPrivateKey(sessionKey));
}

export function createAltanaPayer({ session, policy, networkName = "celo", appCode, fetchImpl = globalThis.fetch }) {
  const net = altanaNetwork(networkName);
  const client = createClient({ chains: [net], ...(appCode ? { appCode } : {}) });

  async function pay(url, init = {}, meta = {}) {
    // Read the 402 first so our own policy sees the exact requirement before anything is signed.
    const probe = await fetchImpl(url, init);
    if (probe.status !== 402) return { res: probe, paid: false };
    const required = await readRequirements(probe);
    const req = (required?.accepts || []).find((r) => r.network === policy.network && (!policy.allowedAssets.size || policy.allowedAssets.has(String(r.asset).toLowerCase())));
    if (!req) {
      policy.record({ kind: "refused", url, reason: "no offer on an allowlisted asset/network", payer: session.walletAddress });
      return { res: probe, paid: false };
    }
    const reason = policy.check(req, url);
    if (reason) {
      policy.record({ kind: "refused", url, payTo: req.payTo, asset: req.asset, amount: req.amount, reason, payer: session.walletAddress });
      return { res: probe, paid: false, refused: reason };
    }
    policy.reserve(req.amount);
    let res;
    try {
      res = await client.fetchWithX402({ session, url, init, chainId: net.chainId, preferRail: "eip3009" });
    } finally {
      policy.release(req.amount);
    }
    const hdr = res.headers.get("payment-response") || res.headers.get("x-payment-response");
    let settle = null;
    try { settle = hdr ? JSON.parse(Buffer.from(hdr, "base64").toString("utf8")) : null; } catch {}
    const ok = res.ok && (!settle || settle.success !== false);
    const entry = policy.record({
      kind: ok ? "paid" : "failed", url, status: res.status, payTo: req.payTo, asset: req.asset, amount: req.amount,
      tx: settle?.transaction || null, payer: session.walletAddress, rail: "altana-session-erc1271", ...meta,
    });
    return { res, paid: ok, entry };
  }

  return { address: session.walletAddress, kind: "altana", pay, client };
}

export async function readRequirements(res) {
  const h = res.headers.get("payment-required");
  if (h) {
    try { return JSON.parse(Buffer.from(h, "base64").toString("utf8")); } catch {}
  }
  try {
    const body = await res.clone().json();
    // v1 body: maxAmountRequired + network names; normalise to v2 shape
    if (body?.accepts) {
      const map = { celo: "eip155:42220", "celo-sepolia": "eip155:11142220" };
      return { ...body, accepts: body.accepts.map((a) => ({ ...a, network: map[a.network] || a.network, amount: a.amount ?? a.maxAmountRequired })) };
    }
  } catch {}
  return null;
}
