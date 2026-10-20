import { z } from "zod";

export const serviceCategories = ["livePerformance", "ticketAdmissions", "influencerSponsorship", "videoProduction", "photography", "modeling", "podcastSponsorship", "musicLicensing", "digitalDownloads", "merchandise", "consulting", "management", "mixed"] as const;
export const taxContextInput = z.object({
  state: z.string().regex(/^[A-Z]{2}$/),
  sellerState: z.string().regex(/^[A-Z]{2}$/),
  saleOn: z.iso.date(),
  category: z.enum(serviceCategories),
  delivery: z.enum(["electronic", "physical", "inPerson", "mixed"]),
  collection: z.enum(["registered", "notRequired", "unknown"]),
  exemption: z.enum(["none", "claimed", "unknown"]),
  location: z.string().trim().min(1).max(600),
  jurisdictionId: z.uuid().optional(),
  jurisdictionConfirmed: z.boolean(),
  standardSaleConfirmed: z.boolean(),
  merchandiseScope: z.enum(["ordinaryInPerson", "other"]).optional(),
}).strict();
export type TaxContext = z.infer<typeof taxContextInput>;
export type RateEvidence = {
  id: string; state: string; kind: string; rate: number; validFrom: string; validThrough: string | null;
  sourceUrl: string; batchHash: string; checkedAt: string; name: string;
};
export type RuleEvidence = {
  id: string; state: string; category: string; delivery: string; treatment: string;
  status: string; validFrom: string; validThrough: string; sourceUrl: string; contentHash: string;
};
export type TaxReason = "crossState" | "jurisdiction" | "collection" | "exemption" | "scope" | "admissions" | "rule" | "rate" | "date" | "stale";
export type TaxResolution = { status: "review"; reason: TaxReason } | {
  status: "ready"; treatment: "taxable" | "nonTaxable"; rate: number; source: string;
  ruleId: string; ruleHash: string; rateId?: string; rateName?: string; batchHash?: string;
};
/** A rate table is not a taxability rule or an address resolver. Missing evidence never means zero tax. */
export function resolveTax(context: TaxContext, rules: RuleEvidence[], rate: RateEvidence | undefined, now: string): TaxResolution {
  const review = (reason: TaxReason): TaxResolution => ({ status: "review", reason });
  if (context.sellerState !== context.state) return review("crossState");
  if (!context.jurisdictionConfirmed) return review("jurisdiction");
  if (context.collection !== "registered") return review("collection");
  if (context.exemption !== "none") return review("exemption");
  // Ticket admission and amusement taxes are separate from a performer's service fee.
  if (context.category === "ticketAdmissions") return review("admissions");
  if (context.category === "merchandise" && (context.merchandiseScope !== "ordinaryInPerson" || context.delivery !== "physical")) return review("scope");
  if (!context.standardSaleConfirmed || context.category === "mixed" || context.delivery === "mixed") return review("scope");
  const matches = rules.filter(r => r.status === "reviewed" && r.state === context.state && r.category === context.category && r.delivery === context.delivery
    && r.validFrom <= context.saleOn && r.validThrough >= context.saleOn && r.validThrough >= now);
  if (matches.length !== 1) return review("rule");
  const rule = matches[0];
  if (rule.treatment === "nonTaxable") return { status: "ready", treatment: "nonTaxable", rate: 0, source: rule.sourceUrl, ruleId: rule.id, ruleHash: rule.contentHash };
  if (rule.treatment !== "taxable") return review("rule");
  if (!rate || rate.id !== context.jurisdictionId || rate.state !== context.state || rate.kind !== "combined") return review("rate");
  if (rate.validFrom > context.saleOn || (rate.validThrough && rate.validThrough < context.saleOn)) return review("date");
  const age = (Date.parse(now) - Date.parse(rate.checkedAt)) / 86400000;
  if (!Number.isFinite(age) || age < -1 || age > 30) return review("stale");
  if (!Number.isFinite(rate.rate) || rate.rate < 0 || rate.rate > 100) return review("rate");
  return { status: "ready", treatment: "taxable", rate: rate.rate, source: rate.sourceUrl,
    ruleId: rule.id, ruleHash: rule.contentHash, rateId: rate.id, rateName: rate.name, batchHash: rate.batchHash };
}
