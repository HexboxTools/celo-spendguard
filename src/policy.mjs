// The spend policy: the owner's rules the agent cannot change.
//  - maxPerCall: the most one request may cost (atomic token units)
//  - dailyCap:   the most all requests may cost per UTC day (atomic units)
//  - allowedPayTo / allowedHosts: who may be paid, and for which hosts
//  - allowedAssets: which tokens may be spent (by address, per network)
// Every payment (and every refusal) is written to an append-only JSONL ledger that the
// public report links to, so anyone can match it against the chain.
import fs from "node:fs";
import path from "node:path";

const lower = (a) => String(a).toLowerCase();

export class SpendPolicy {
  constructor({ maxPerCall, dailyCap, allowedPayTo = [], allowedHosts = [], allowedAssets = [], network, ledgerFile, now = () => new Date() }) {
    if (maxPerCall == null || dailyCap == null) throw new Error("maxPerCall and dailyCap are required");
    this.maxPerCall = BigInt(maxPerCall);
    this.dailyCap = BigInt(dailyCap);
    this.allowedPayTo = new Set(allowedPayTo.map(lower));
    this.allowedHosts = new Set(allowedHosts.map(lower));
    this.allowedAssets = new Set(allowedAssets.map(lower));
    this.network = network; // CAIP-2, e.g. eip155:42220
    this.ledgerFile = ledgerFile;
    this.now = now;
    this.pending = 0n; // signed but not yet recorded in this process
  }

  day(d = this.now()) { return d.toISOString().slice(0, 10); }

  entries() {
    if (!this.ledgerFile || !fs.existsSync(this.ledgerFile)) return [];
    return fs.readFileSync(this.ledgerFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  }

  spentToday() {
    const today = this.day();
    let sum = 0n;
    for (const e of this.entries()) if (e.kind === "paid" && e.day === today && e.network === this.network) sum += BigInt(e.amount);
    return sum;
  }

  /** Returns null when allowed, or a reason string when refused. Never throws. */
  check(req, url) {
    try {
      if (req.network !== this.network) return `network ${req.network} is not ${this.network}`;
      if (this.allowedAssets.size && !this.allowedAssets.has(lower(req.asset))) return `asset ${req.asset} is not allowlisted`;
      if (this.allowedPayTo.size && !this.allowedPayTo.has(lower(req.payTo))) return `payTo ${req.payTo} is not allowlisted`;
      if (url && this.allowedHosts.size && !this.allowedHosts.has(lower(new URL(url).host))) return `host ${new URL(url).host} is not allowlisted`;
      const amount = BigInt(req.amount ?? req.maxAmountRequired);
      if (amount <= 0n) return "amount must be positive";
      if (amount > this.maxPerCall) return `amount ${amount} is over the per-call cap ${this.maxPerCall}`;
      const spent = this.spentToday() + this.pending;
      if (spent + amount > this.dailyCap) return `daily cap ${this.dailyCap} would be passed (spent ${spent}, asks ${amount})`;
      return null;
    } catch (e) {
      return `policy error: ${e.message}`;
    }
  }

  reserve(amount) { this.pending += BigInt(amount); }
  release(amount) { this.pending -= BigInt(amount); if (this.pending < 0n) this.pending = 0n; }

  record(entry) {
    const e = { at: this.now().toISOString(), day: this.day(), network: this.network, ...entry };
    if (e.amount != null) e.amount = String(e.amount);
    if (this.ledgerFile) {
      fs.mkdirSync(path.dirname(this.ledgerFile), { recursive: true });
      fs.appendFileSync(this.ledgerFile, JSON.stringify(e) + "\n");
    }
    return e;
  }

  summary() {
    const paid = this.entries().filter((e) => e.kind === "paid" && e.network === this.network);
    const refused = this.entries().filter((e) => e.kind === "refused" && e.network === this.network);
    return {
      network: this.network,
      payments: paid.length,
      refusals: refused.length,
      totalAtomic: paid.reduce((s, e) => s + BigInt(e.amount), 0n).toString(),
      spentTodayAtomic: this.spentToday().toString(),
      dailyCapAtomic: this.dailyCap.toString(),
      maxPerCallAtomic: this.maxPerCall.toString(),
    };
  }
}
