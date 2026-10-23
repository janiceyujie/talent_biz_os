// Taiwan's Ministry of Culture: its open-data list of calls taking
// applications (the government open-data licence). One row per application
// form; a program with a form for individuals and one for groups is two calls.
import { decodeEntities } from "@/lib/mail/clean";
import type { Discipline, OpportunityRules } from "../types";
import { isoDate, plain, stableId, type Listing } from "./listing";

export const MOC_URL = "https://grants.moc.gov.tw/OpenData/getOpenData_ApplyList.jsp";
// The list links to no call of its own; the grants site is where each one is.
const MOC_SITE = "https://grants.moc.gov.tw/Web/";

// The units that fund a single discipline. Every other unit's is left unknown.
const unitDisciplines: Record<string, Discipline[]> = {
  流行音樂產業組: ["music"],
  電影產業組: ["film"],
  廣播電視產業組: ["film"],
};

// Who a form is for, as its name says it: a suffix ("_individual", "(group)"),
// a prefix ("individual applications-"), or a sentence ("this is the form for
// groups / companies"). Matched on the form's own marker, not the program's
// name, which often says "for groups and individuals".
const marker = /(?:[_（(]|-)\s*(個人|團體|公司|自然人|縣市政府)組?[)）]?\s*$|^(個人|團體)件-|^此為(.{1,20})申請之表單$/;
type Types = Exclude<NonNullable<OpportunityRules["applicantTypes"]>, "any">;
const applicants: [RegExp, Types][] = [
  [/個人|自然人/, ["individual"]],
  [/團體/, ["business", "nonprofit"]],
  [/公司/, ["business"]],
  [/縣市政府/, ["government"]],
];
function applicantTypesOf(form: string): OpportunityRules["applicantTypes"] {
  const m = marker.exec(form);
  const said = m?.[1] ?? m?.[2] ?? m?.[3];
  if (!said) return null;
  const types = [...new Set(applicants.flatMap(([word, types]) => (word.test(said) ? types : [])))];
  return types.length ? types : null;
}

const field = (block: string, tag: string) => plain(decodeEntities(new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(block)?.[1] ?? ""));
const slashDate = (s: string) => {
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s);
  return m ? isoDate(Number(m[1]), Number(m[2]), Number(m[3])) : null;
};

/** The calls still open or closed since `since` (an ISO date); older rounds are history the list keeps. */
export function parseMoc(xml: string, since: string): Listing[] {
  if (!xml.includes("<database>")) throw new Error("moc_structure_changed");
  const seen = new Set<string>();
  const rows: Listing[] = [];
  let blocks = 0;
  let unreadable = 0;
  for (const [block] of xml.matchAll(/<Apply>[\s\S]*?<\/Apply>/g)) {
    blocks++;
    const [year, unit, point, form] = ["Year", "UnitName", "PointName", "FormName"].map((tag) => field(block, tag));
    const opensOn = slashDate(field(block, "StartDate"));
    const closesOn = slashDate(field(block, "EndDate"));
    if (!point || !closesOn) unreadable++;
    if (!point || !closesOn || closesOn < since) continue;
    // A program runs several rounds a year, each its own row: the round's opening tells them apart.
    const externalId = stableId(year, unit, point, form, opensOn ?? "");
    if (seen.has(externalId)) continue;
    seen.add(externalId);
    const disciplines = unitDisciplines[unit] ?? null;
    const applicantTypes = applicantTypesOf(form);
    rows.push({
      source: "moc",
      externalId,
      region: "TW",
      kind: "grant",
      // One name when one holds the other (the form is often the program's with its track added); otherwise both.
      title: (!form || point.includes(form) ? point : form.includes(point) ? form : `${point} — ${form}`).slice(0, 300),
      agency: unit.slice(0, 200),
      url: MOC_SITE,
      opensOn,
      closesOn,
      sourceStatus: "posted",
      summary: "",
      rules: applicantTypes || disciplines ? { applicantTypes, countries: null, areas: null, disciplines, evidence: [unit, form].join(" · ").slice(0, 2000) } : null,
    });
  }
  if (!blocks) throw new Error("moc_empty");
  // Every row without a program or a closing date: its fields were renamed, or its dates written another way.
  if (unreadable === blocks) throw new Error("moc_fields_changed");
  return rows;
}
