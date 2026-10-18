/** Read-only acceptance checks against the local reference import. No email or customer writes. */
import env from "@next/env";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { referenceManifestInput, referenceStates } from "../lib/tax/reference-input";
env.loadEnvConfig(process.cwd());
const url = new URL(process.env.DATABASE_URL!);
assert.equal(process.env.APP_ENV, "development");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
const { default: postgres } = await import("postgres"), q = postgres(process.env.DATABASE_URL!);
const { findTaxReferences, resolveCatalogueTax } = await import("../lib/tax/service");
const input = referenceManifestInput.parse(JSON.parse(await readFile(process.argv[2], "utf8")));
let checks = 0;
const ok = (condition: unknown, label: string) => { assert.ok(condition, label); checks++; };
try {
  const [{ count }] = await q`select count(*)::int as count from tax_reference r join tax_reference_release b on b.id=r.release_id where b.active`;
  ok(count === input.rows.length, "All parsed rows persisted");
  for (const state of referenceStates) {
    const result = await findTaxReferences(state, "", "2026-10-17");
    ok(result.summary.length === 2, `${state} has state and local coverage evidence`);
    ok(result.items.length <= 20, `${state} is bounded`);
  }
  const first = await findTaxReferences("TX", "", "2026-10-17"), second = await findTaxReferences("TX", "", "2026-10-17", first.nextOffset!);
  ok(first.items.length === 20 && first.nextOffset === 20, "First reference page has 20 records");
  ok(!second.items.some(r => first.items.some(f => f.id === r.id)), "No overlapping pages");
  ok((await findTaxReferences("TX", "%_", "2026-10-17")).items.length === 0, "Search wildcards are literal");
  ok((await findTaxReferences("MO", "", "2027-01-01")).items.length === 0, "Expired quarter excluded");
  const ny = await findTaxReferences("NY", "New York City", "2026-10-17");
  ok(ny.items.some(r => r.rate === 8.875), "New York fractional combined rate is 8.875%");
  const fl = await findTaxReferences("FL", "Palm Beach", "2026-10-17");
  ok(fl.items[0]?.rate === .5, "Palm Beach 2026 local surtax is 0.5%");
  const co = await findTaxReferences("CO", "DENVER", "2026-10-17");
  ok(co.items.some(r => r.rate === 9.15 && r.level === "combined"), "Colorado percent units are not multiplied by 100");
  const mo = await findTaxReferences("MO", "ADAIR", "2026-10-17");
  ok(mo.items.some(r => r.rate === 5.975), "Missouri fraction cells convert correctly");
  const az = await findTaxReferences("AZ", "MARICOPA · MAR", "2026-10-17");
  const retail = input.rows.find(r => r.state === "AZ" && r.name === "MARICOPA · MAR" && r.scope === "TPT 017 · RETAIL");
  ok(az.items.every(r => r.level === "combined") && retail?.rate === 6.3, "Arizona county table includes state component");
  const [{ unknowns }] = await q`select count(*)::int as unknowns from tax_reference where state='IL' and reasons ? 'addressOverride' and rate is null`;
  ok(unknowns > 0, "Illinois address overrides are unknown, not zero");
  const dc = await findTaxReferences("DC", "", "2026-10-17");
  ok(dc.summary.find(r => r.level === "state")?.rate === 6, "DC postponed increase is not applied early");
  const verdict = await resolveCatalogueTax({ state: "TX", sellerState: "TX", location: "Synthetic test address", saleOn: "2026-10-17", category: "photography", delivery: "physical", collection: "registered", exemption: "none", jurisdictionConfirmed: true, standardSaleConfirmed: true, jurisdictionId: first.items[0].id });
  ok(verdict.status === "review", "Reference IDs cannot authorize calculated tax");
  const [{ rates, batches, rules }] = await q`select (select count(*)::int from tax_rate) rates, (select count(*)::int from tax_rate_batch) batches, (select count(*)::int from tax_service_rule) rules`;
  ok(rates === 34177 && batches === 25 && rules === 614, "Original rate/rule catalogue untouched");
  const [{ active, revisions }] = await q`select count(*) filter(where active)::int active, count(*)::int revisions from tax_reference_release`;
  ok(active === 1, "Exactly one active reference release");
  console.log(JSON.stringify({ checks, rows: count, active, revisions, originalRates: rates, originalRules: rules }));
} finally { await q.end(); await (globalThis as unknown as { pgClient?: { end(): Promise<void> } }).pgClient?.end(); }
