// Screening a call against who you are (decision 0024). A preliminary
// comparison of the rules the source states, never a ruling on eligibility:
// whatever isn't known comes out as Check, so incomplete data never hides a call.
import type { OpportunityRules, ScreeningProfile } from "./types";

export type Fit = "fits" | "check" | "doesNotFit";
export const fits = ["fits", "check", "doesNotFit"] as const;

type Dimension = "applicantType" | "country" | "area" | "discipline";
export type FitReason =
  | { kind: "excludes"; dimension: Dimension } // a stated rule leaves you out
  | { kind: "unknown"; dimension: Dimension } // the source doesn't say
  | { kind: "missing"; dimension: Dimension } // your profile doesn't say
  | { kind: "stale" }; // the source hasn't been read lately

/** After this long without a successful read, what a call says may be out of date. */
export const STALE_AFTER_MS = 3 * 24 * 3600_000;

export function screen(rules: OpportunityRules | null, profile: ScreeningProfile | null, checkedAt: string, now = new Date()) {
  const reasons: FitReason[] = [];
  if (now.getTime() - Date.parse(checkedAt) > STALE_AFTER_MS) reasons.push({ kind: "stale" });
  const compare = (dimension: Dimension, rule: "any" | readonly string[] | null | undefined, mine: readonly string[]) => {
    if (rule === "any") return;
    if (!rule) reasons.push({ kind: "unknown", dimension });
    else if (!mine.length) reasons.push({ kind: "missing", dimension });
    else if (!mine.some((v) => rule.includes(v))) reasons.push({ kind: "excludes", dimension });
  };
  const one = (v: string | null | undefined) => (v ? [v] : []);
  compare("applicantType", rules?.applicantTypes, one(profile?.applicantType));
  compare("country", rules?.countries, one(profile?.country));
  compare("area", rules?.areas, one(profile?.area));
  compare("discipline", rules?.disciplines, profile?.disciplines ?? []);
  const fit: Fit = reasons.some((r) => r.kind === "excludes") ? "doesNotFit" : reasons.length ? "check" : "fits";
  return { fit, reasons };
}
