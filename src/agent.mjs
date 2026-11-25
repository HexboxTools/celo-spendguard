// Wires the payer (EOA or Altana session) to the owner's spend policy.
import fs from "node:fs";
import { SpendPolicy } from "./policy.mjs";
import { createEoaPayer } from "./payers/eoa.mjs";
import { createAltanaPayer, loadSession } from "./payers/altana.mjs";
import { attributionCode } from "./config.mjs";

export const readKey = (file) => {
  const t = fs.readFileSync(file, "utf8");
  const m = t.match(/(0x[0-9a-fA-F]{64})/);
  if (!m) throw new Error(`no private key in ${file}`);
  return m[1];
};

export function defaultPolicy(net, overrides = {}) {
  const assets = Object.values(net.tokens).map((t) => t.address);
  return new SpendPolicy({
    network: net.caip2,
    maxPerCall: process.env.SPENDGUARD_MAX_PER_CALL || "10000", // 0.01 USD
    dailyCap: process.env.SPENDGUARD_DAILY_CAP || "50000",      // 0.05 USD a day
    allowedHosts: (process.env.SPENDGUARD_HOSTS || "gateway.usebuy.ai").split(","),
    allowedPayTo: (process.env.SPENDGUARD_PAYTO || "0x20faAca5F980E29639A0FCC6dcA6988E18ed333B").split(",").filter(Boolean),
    allowedAssets: assets,
    ledgerFile: process.env.SPENDGUARD_LEDGER || `ledger/${net.name}.jsonl`,
    ...overrides,
  });
}

export async function buildAgent(net, overrides = {}, { log } = {}) {
  const policy = defaultPolicy(net, overrides);
  const kind = process.env.SPENDGUARD_PAYER || "eoa";
  if (kind === "altana") {
    const session = loadSession({ sessionFile: process.env.ALTANA_SESSION_FILE, sessionKey: readKey(process.env.ALTANA_SESSION_KEY_FILE) });
    return { policy, payer: createAltanaPayer({ session, policy, networkName: net.name, appCode: attributionCode() || undefined }) };
  }
  return { policy, payer: createEoaPayer({ privateKey: readKey(process.env.SPENDGUARD_KEY_FILE), policy, rpcUrl: net.rpc, log }) };
}
