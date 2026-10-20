import { z } from "zod";

export const applicantTypes = ["individual", "business", "nonprofit", "government", "tribal", "other"] as const;
export const applicantCountries = ["TW", "US", "other"] as const;
export const eligibilityProfileSchema = z.object({
  version: z.literal(1),
  applicantType: z.enum(applicantTypes).nullable(),
  country: z.enum(applicantCountries).nullable(),
});
export type EligibilityProfile = z.infer<typeof eligibilityProfileSchema>;
export const emptyEligibilityProfile: EligibilityProfile = {version:1, applicantType:null, country:null};
export const eligibilityRuleSchema = z.object({
  version:z.literal(1),
  applicantTypes:z.array(z.enum(applicantTypes)).min(1).nullable(),
  countries:z.array(z.enum(applicantCountries)).min(1).nullable(),
  evidenceUrl:z.url().refine(url=>new URL(url).protocol === "https:"),
  verifiedOn:z.iso.date(), validThrough:z.iso.date(),
  notes:z.object({en:z.string().min(1).max(2000), "zh-TW":z.string().min(1).max(2000)}),
});
export type EligibilityRule = z.infer<typeof eligibilityRuleSchema>;
export type EligibilityStatus = "match" | "check" | "mismatch";
export type EligibilityReason = "noRules" | "stale" | "applicantType" | "country" | "missingProfile" | "knownMatch";
/** A preliminary comparison of explicitly reviewed rules, never an award or full eligibility decision. */
export function assessEligibility(rule: unknown, profile: EligibilityProfile | null, today: string): {status:EligibilityStatus; reasons:EligibilityReason[]} {
  const parsed=eligibilityRuleSchema.safeParse(rule);
  if(!parsed.success) return {status:"check",reasons:["noRules"]};
  const r=parsed.data;
  if(r.verifiedOn>today || r.validThrough<today) return {status:"check",reasons:["stale"]};
  const reasons:EligibilityReason[]=[];
  if(r.applicantTypes && profile?.applicantType && !r.applicantTypes.includes(profile.applicantType)) reasons.push("applicantType");
  if(r.countries && profile?.country && !r.countries.includes(profile.country)) reasons.push("country");
  if(reasons.length) return {status:"mismatch",reasons};
  if((r.applicantTypes && !profile?.applicantType)||(r.countries && !profile?.country)) return {status:"check",reasons:["missingProfile"]};
  if(!r.applicantTypes && !r.countries) return {status:"check",reasons:["noRules"]};
  return {status:"match",reasons:["knownMatch"]};
}
