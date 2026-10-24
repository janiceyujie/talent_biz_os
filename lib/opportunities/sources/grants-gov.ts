// Grants.gov: the US federal listing's public search and detail APIs, no
// sign-in. Arts category only. Most of these are for organizations; the
// detail's official applicant codes are what screening uses.
import { z } from "zod";
import { htmlToText } from "@/lib/mail/clean";
import { ruleApplicantTypes, type OpportunityHighlights, type OpportunityRules } from "../types";
import { isoDate, plain, type Listing } from "./listing";

export const GRANTS_GOV_SEARCH = "https://api.grants.gov/v1/api/search2";
export const GRANTS_GOV_DETAIL = "https://api.grants.gov/v1/api/fetchOpportunity";
export const searchBody = (page: number) => ({ rows: 100, startRecordNum: page * 100, fundingCategories: "AR", oppStatuses: "forecasted|posted", keyword: "" });

function usDate(value: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  // A program that's always open carries a far-off placeholder date; it isn't a deadline.
  return m && Number(m[3]) < 2090 ? isoDate(Number(m[3]), Number(m[1]), Number(m[2])) : null;
}

const hit = z.object({
  id: z.union([z.string(), z.number()]),
  title: z.string().min(1).max(500),
  agency: z.string().optional(),
  agencyName: z.string().optional(),
  openDate: z.string().default(""),
  closeDate: z.string().default(""),
  oppStatus: z.string(),
});
const searchSchema = z.object({ errorcode: z.literal(0), data: z.object({ hitCount: z.number().int().nonnegative(), oppHits: z.array(hit).max(100) }) });

export function parseSearch(value: unknown): { rows: Listing[]; total: number } {
  const body = searchSchema.parse(value);
  return {
    total: body.data.hitCount,
    rows: body.data.oppHits.map((r) => ({
      source: "grants_gov",
      externalId: String(r.id),
      region: "US",
      kind: "grant",
      title: plain(r.title).slice(0, 300),
      agency: plain(r.agency || r.agencyName || "Grants.gov").slice(0, 200),
      url: `https://www.grants.gov/search-results-detail/${encodeURIComponent(r.id)}`,
      opensOn: usDate(r.openDate),
      closesOn: usDate(r.closeDate),
      sourceStatus: r.oppStatus === "forecasted" ? "forecasted" : r.oppStatus === "posted" ? "posted" : "unknown",
      timeZone: "America/New_York", // Grants.gov's closing times are Eastern
      summary: "",
      rules: null,
      highlights: null,
    })),
  };
}

// Grants.gov's applicant codes, grouped. "Others" (25) and any code not here
// leave the dimension unknown; "Unrestricted" (99) means anyone.
type Types = Exclude<NonNullable<OpportunityRules["applicantTypes"]>, "any">;
const codes: Record<string, Types> = {
  "00": ["government"], "01": ["government"], "02": ["government"], "04": ["government"], "05": ["government"],
  "06": ["government", "nonprofit"], "07": ["government"], "08": ["government"],
  "12": ["nonprofit"], "13": ["nonprofit"], "20": ["nonprofit"], "21": ["individual"], "22": ["business"], "23": ["business"],
};
const detailSchema = z.object({
  errorcode: z.literal(0),
  data: z.object({
    id: z.union([z.string(), z.number()]),
    synopsis: z
      .object({
        applicantTypes: z.array(z.object({ id: z.string(), description: z.string().max(1000) })).max(50),
        applicantEligibilityDesc: z.string().max(20000).nullish(),
        awardFloor: z.string().max(20).nullish(),
        awardCeiling: z.string().max(20).nullish(),
      })
      .nullish(),
  }),
});

const dollars = (value: string | null | undefined) => {
  const n = Number(value);
  return value && Number.isInteger(n) && n > 0 ? `$${n.toLocaleString("en-US")}` : null;
};

/** An award's size as the detail states it: one figure, or the floor to the ceiling ($0 when it has no floor). */
function amountOf(floor: string | null | undefined, ceiling: string | null | undefined): string | null {
  const top = dollars(ceiling);
  if (!top) return null;
  const bottom = dollars(floor) ?? "$0";
  return bottom === top ? top : `${bottom} – ${top}`;
}

/**
 * The rules and highlights in one call's detail; each null when it states none.
 * Throws when it isn't a detail of the call asked for: its format changed.
 */
export function parseDetail(value: unknown, externalId: string): { rules: OpportunityRules | null; highlights: OpportunityHighlights | null } {
  const { data } = detailSchema.parse(value);
  if (String(data.id) !== externalId) throw new Error("grants_gov_detail_mismatch");
  const synopsis = data.synopsis;
  const amount = amountOf(synopsis?.awardFloor, synopsis?.awardCeiling);
  return { rules: rulesOf(synopsis), highlights: amount ? { amount, covers: null, applicants: null } : null };
}

function rulesOf(synopsis: z.infer<typeof detailSchema>["data"]["synopsis"]): OpportunityRules | null {
  if (!synopsis?.applicantTypes.length) return null;
  // More eligibility in prose ("individuals may also apply") can widen or narrow the codes: unknown.
  const prose = plain(htmlToText(synopsis.applicantEligibilityDesc ?? ""));
  // In a fixed order, so the same call reads the same each day: the source's order varies.
  const listed = synopsis.applicantTypes.toSorted((a, b) => a.id.localeCompare(b.id));
  const ids = listed.map((t) => t.id);
  const applicantTypes: OpportunityRules["applicantTypes"] = prose || ids.some((id) => id !== "99" && !codes[id])
    ? null
    : ids.includes("99")
      ? "any"
      : ruleApplicantTypes.filter((type) => ids.some((id) => codes[id].includes(type)));
  const labels = listed.map((t) => plain(t.description)).join("; ");
  return { applicantTypes, countries: null, areas: null, disciplines: null, evidence: [labels, prose].filter(Boolean).join(" ").slice(0, 2000) };
}
