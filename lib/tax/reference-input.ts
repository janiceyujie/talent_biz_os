import { z } from "zod";

export const referenceStates = ["AL", "AK", "AZ", "CO", "CT", "DE", "DC", "FL", "HI", "ID", "IL", "LA", "ME", "MD", "MA", "MS", "MO", "MT", "NH", "NM", "NY", "OR", "PA", "SC", "TX", "VA"] as const;
export const referenceReasons = ["applicability", "effectiveDate", "sourceUnavailable", "snapshotPeriod", "specialTaxes", "localCoverage", "jurisdiction", "administrativeDate", "addressOverride"] as const;
const officialHosts = new Set(["azdor.gov", "business.idaho.gov", "comptroller.texas.gov", "dor.mo.gov", "dor.sc.gov", "floridarevenue.com", "otr.cfo.dc.gov", "portal.ct.gov", "revenue.delaware.gov", "revenue.louisiana.gov", "revenue.mt.gov", "tax.hawaii.gov", "tax.idaho.gov", "tax.illinois.gov", "www.dor.ms.gov", "dor.ms.gov", "www.marylandtaxes.gov", "www.marylandcomptroller.gov", "www.oregon.gov", "www.pa.gov", "www.revenue.alabama.gov", "www.tax.newmexico.gov", "rgis.unm.edu", "gstore.unm.edu", "www.tax.ny.gov", "www.tax.virginia.gov", "www1.maine.gov", "tax.colorado.gov", "www.commerce.alaska.gov", "www.mass.gov", "www.revenue.nh.gov"]);
const officialUrl = z.url().refine(v => { const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password && !u.port && officialHosts.has(u.hostname); }, "Unrecognized official source");
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const referenceRowInput = z.object({
  state: z.enum(referenceStates), code: z.string().min(1).max(200), name: z.string().min(1).max(1000),
  level: z.enum(["state", "local", "combined", "localSummary"]), scope: z.string().max(500),
  rate: z.number().finite().min(0).max(100).nullable(), sourceUrl: officialUrl,
  validFrom: z.iso.date().nullable(), validThrough: z.iso.date().nullable(),
  dateBasis: z.enum(["effective", "snapshot", "administrative", "unknown"]),
  status: z.literal("pending"), reasons: z.array(z.enum(referenceReasons)).min(1), notes: z.string().max(4000),
}).refine(r => !r.validFrom || !r.validThrough || r.validThrough >= r.validFrom, "Invalid date range")
  .refine(r => !!r.validFrom || r.reasons.includes("effectiveDate"), "Missing dates must be pending")
  .refine(r => r.rate !== null || r.reasons.some(v => ["localCoverage", "addressOverride", "sourceUnavailable"].includes(v)), "Missing rates need an explicit reason");
const documentInput = z.discriminatedUnion("status", [
  z.object({ status: z.literal("retained"), url: officialUrl, resolvedUrl: officialUrl, retrievedAt: z.iso.datetime({ offset: true }), sha256: hash, size: z.number().int().positive(), contentType: z.string() }),
  z.object({ status: z.literal("pending"), url: officialUrl, retrievedAt: z.iso.datetime({ offset: true }), error: z.string() }),
]);
export const referenceManifestInput = z.object({
  version: z.literal(1), parserVersion: z.literal("official-reference-2026-10-v1"),
  states: z.array(z.object({ state: z.enum(referenceStates), url: officialUrl, localUrl: officialUrl })).length(26),
  documents: z.array(documentInput).max(200), rows: z.array(referenceRowInput).min(52).max(100000),
}).superRefine((m, ctx) => {
  const states = new Set(m.states.map(s => s.state));
  if (states.size !== 26) ctx.addIssue({ code: "custom", message: "All 25 remaining states and DC are required" });
  const docs = new Map(m.documents.map(d => [d.url, d]));
  if (docs.size !== m.documents.length) ctx.addIssue({ code: "custom", message: "Duplicate source URL" });
  for (const s of m.states) if (!docs.has(s.url) || !docs.has(s.localUrl)) ctx.addIssue({ code: "custom", message: `Missing state source ${s.state}` });
  const keys = new Set<string>();
  for (const r of m.rows) {
    const key = `${r.state}:${r.code}`;
    if (keys.has(key)) ctx.addIssue({ code: "custom", message: `Duplicate reference ${key}` });
    keys.add(key);
    const d = docs.get(r.sourceUrl);
    if (!d || (d.status === "pending" && !r.reasons.includes("sourceUnavailable"))) ctx.addIssue({ code: "custom", message: `Missing evidence for ${key}` });
  }
  for (const state of states) for (const level of ["state", "localSummary"]) {
    if (m.rows.filter(r => r.state === state && r.level === level).length !== 1) ctx.addIssue({ code: "custom", message: `Missing or duplicate ${state} ${level}` });
  }
});
