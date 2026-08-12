#!/usr/bin/env node
// Recomputes the analysis from data/gc_metrics.csv: shrinkage, expected GP, tiers,
// and the shrinkage-weight sensitivity table. No dependencies; Node >= 18.
// Data dictionary: one row per GC (identities are random codes; dollars are uniformly
// rescaled; see README). n = lifetime opportunities, decided = resolved ones, wins =
// awarded ones; *_24mo = trailing-24-month figures (award side binned on award date);
// flow_yr = bid_24mo / 2; gp_pct = dollar-weighted GP percent on awarded work (rescaled);
// flow_trend_12v12 = last 12 months of bid dollars over the 12 before ("new" = no prior).
import { readFileSync } from "node:fs";
const K = Number(process.argv[2] ?? 6);
const rows = readFileSync(new URL("../data/gc_metrics.csv", import.meta.url), "utf8").trim().split(/\r?\n/);
const head = rows[0].split(",");
const gcs = rows.slice(1).map(line => {
  const c = line.split(","), o = {};
  head.forEach((h, i) => { o[h] = c[i]; });
  for (const k of ["n", "decided", "wins", "n_24mo", "wins_24mo", "bid_total", "award_total", "flow_yr", "bid_24mo", "award_24mo", "gp_pct", "avg_won", "avg_lost"]) o[k] = Number(o[k] || 0);
  return o;
});
const totBid = gcs.reduce((s, g) => s + g.bid_total, 0), totAward = gcs.reduce((s, g) => s + g.award_total, 0);
const p0 = totAward / totBid;
const active = gcs.filter(g => g.n_24mo >= 1);
const flows = active.map(g => g.flow_yr).sort((a, b) => a - b);
const medFlow = flows[Math.floor(flows.length / 2)];
for (const g of gcs) {
  g.raw = g.bid_total > 0 ? g.award_total / g.bid_total : 0;
  const w = g.n / (g.n + K);
  g.adj = w * g.raw + (1 - w) * p0;
  g.exp = g.flow_yr * g.adj * (g.gp_pct / 100);
  g.tier = g.n < 5 ? "E" : g.n_24mo === 0 ? "F" : (g.flow_yr >= 2 * medFlow ? (g.adj >= p0 ? "A" : "C") : (g.adj >= p0 ? "B" : "D"));
}
console.log(`company dollar award rate ${(p0 * 100).toFixed(1)}%  median active flow ${Math.round(medFlow / 1000)}K  K=${K}`);
for (const t of ["A", "B", "C", "D", "E", "F"]) {
  const list = gcs.filter(g => g.tier === t);
  const flow = list.reduce((s, g) => s + g.flow_yr, 0), exp = list.reduce((s, g) => s + g.exp, 0);
  const bidsYr = list.reduce((s, g) => s + g.n_24mo, 0) / 2;
  console.log(`tier ${t}: ${String(list.length).padStart(3)} GCs  flow/yr ${String(Math.round(flow / 1e6 * 10) / 10).padStart(6)}M  expGP/yr ${String(Math.round(exp / 1000)).padStart(5)}K  perBid ${bidsYr > 0 ? Math.round(exp / bidsYr / 100) * 100 : "n/a"}`);
}
console.log("\ntop 15 by expected GP per year:");
[...gcs].sort((a, b) => b.exp - a.exp).slice(0, 15).forEach((g, i) =>
  console.log(`  ${String(i + 1).padStart(2)}. ${g.code}  ${g.tier}  expGP ${String(Math.round(g.exp / 1000)).padStart(4)}K  flow ${String(Math.round(g.flow_yr / 1000)).padStart(6)}K  adj ${(g.adj * 100).toFixed(1)}%  record ${g.wins}/${g.n}`));
console.log("\nsensitivity: rerun with 'node src/tiers.mjs 3' and 'node src/tiers.mjs 10'.");
console.log("Tier letters cannot change with K: shrinking toward the company average never crosses it.");
