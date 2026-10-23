// The Opportunities list: each call's state today, the filters, the tabs, and
// the order, a program's calls together. Pure; the endpoint
// (app/api/opportunities) and the screen both use it.
import { z } from "zod";
import { dateInZone } from "@/lib/domain/dates";
import { PAGE_MAX, PAGE_SIZE } from "@/lib/domain/list-page";
import { screen, type Fit } from "./screening";
import { opportunityKinds, opportunityRegions, type Opportunity, type ScreeningProfile } from "./types";

export const availabilities = ["open", "upcoming", "unknown", "closed"] as const;
export type Availability = (typeof availabilities)[number];

export function availability(o: Pick<Opportunity, "opensOn" | "closesOn" | "sourceStatus">, today: string): Availability {
  if (o.closesOn && o.closesOn < today) return "closed";
  if (o.sourceStatus === "forecasted" || (o.opensOn && o.opensOn > today)) return "upcoming";
  if (o.sourceStatus === "posted" || (o.opensOn && o.opensOn <= today)) return "open";
  return "unknown";
}

export const WITHIN_DAYS = [7, 30, 90] as const;

/**
 * The list's tabs: the calls no stated rule leaves you out of (Fits and Check
 * together: few sources state every rule, so Fits alone is nearly empty), the
 * ones one does, and the ones you follow, closed ones too.
 */
export const listTabs = ["canApply", "doesNotFit", "following"] as const;
export type ListTab = (typeof listTabs)[number];

/** Where a call sits in the list: by how soon it closes, a standing program apart. */
export const SOON_DAYS = 14;
export const listSections = ["soon", "later", "standing", "closed"] as const;
export type ListSection = (typeof listSections)[number];

export function sectionOf(o: Pick<Opportunity, "closesOn" | "timeZone">, state: Availability, now = new Date()): ListSection {
  if (state === "closed") return "closed";
  if (!o.closesOn) return "standing";
  return o.closesOn <= dateInZone(o.timeZone, SOON_DAYS, now) ? "soon" : "later";
}

/** Days from `today` to a date, both YYYY-MM-DD. */
export const daysUntil = (date: string, today: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);

// A program's name without the wording its source files it under. The
// Ministry of Culture names a form "Program — Form" or "Program_individual";
// a tracked page's tracks are "Program（Track）" (lib/opportunities/sources/pages.ts).
const formMarkers = [/^(個人|團體)件-/, /^此為(.{1,20})申請之表單$/, /[_（(]\s*(個人|團體|公司|自然人|縣市政府)組?[)）]?$/];
/** Who a form is for, and the name around the marker that says so. */
function formOf(name: string): { rest: string; who: string } | null {
  for (const marker of formMarkers) {
    const m = marker.exec(name);
    if (m) return { rest: name.slice(0, m.index) + name.slice(m.index + m[0].length), who: m[1] };
  }
  return null;
}
const rulesWording = /(?:作業|實施|執行|處理)?要點|申請須知|徵件須知/g;
const tidy = (s: string) => s.replace(rulesWording, "").replace(/^[\s\-_·—]+|[\s\-_·—]+$/g, "").replace(/\s+/g, " ");

/** A call's program and, when the program has several, which round or form it is. */
export function programOf(o: Pick<Opportunity, "source" | "title">): { program: string; track: string | null } {
  if (o.source === "pages") {
    // The first bracket whose match closes the title: "Program（Track（detail））".
    if (/[）)]$/.test(o.title)) {
      let depth = 0;
      for (let i = o.title.length - 1; i >= 0; i--) {
        const c = o.title[i];
        if (c === "）" || c === ")") depth++;
        else if ((c === "（" || c === "(") && --depth === 0) {
          if (i > 1) return { program: o.title.slice(0, i).trim(), track: o.title.slice(i + 1, -1).trim() };
          break;
        }
      }
    }
    return { program: o.title, track: null };
  }
  if (o.source !== "moc") return { program: o.title, track: null };
  const [point, form = ""] = o.title.split(" — ");
  // "Program_individual": the form is the program, for one kind of applicant.
  const named = formOf(point);
  if (named) return { program: tidy(named.rest), track: named.who };
  if (form) return { program: tidy(point), track: formOf(form)?.who ?? (tidy(form.replace(point, "")) || null) };
  // "Program_track": a named track of the program.
  const at = point.lastIndexOf("_");
  return at > 0 ? { program: tidy(point.slice(0, at)), track: tidy(point.slice(at + 1)) || null } : { program: tidy(point), track: null };
}

/** A program's calls in the list: the soonest first, which the card shows. */
export type OpportunityCall = Opportunity & { track: string | null };
export type OpportunityGroup = { id: string; program: string; section: ListSection; fit: Fit; calls: OpportunityCall[] };

export const listParams = z.object({
  region: z.enum(["all", ...opportunityRegions]).catch("all"),
  kind: z.enum(["all", ...opportunityKinds]).catch("all"),
  within: z.enum(["", ...WITHIN_DAYS.map(String)] as ["", ...string[]]).catch(""), // closing within this many days
  tab: z.enum(listTabs).catch("canApply"),
  q: z.string().max(200).catch(""),
  cursor: z.string().max(500).catch(""),
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).catch(PAGE_SIZE),
});
export type ListParams = z.infer<typeof listParams>;

type Key = [number, string, string]; // section, closing date (undated last), id
const keyOf = (o: Opportunity, section: ListSection): Key => [listSections.indexOf(section), o.closesOn ?? "9999-12-31", o.id];
const after = (a: Key, b: Key) => a[0] - b[0] || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]);

export const encodeCursor = (k: Key) => Buffer.from(JSON.stringify(k)).toString("base64url");
function decodeCursor(cursor: string): Key | null {
  try {
    return z.tuple([z.number(), z.string(), z.string()]).parse(JSON.parse(Buffer.from(cursor, "base64url").toString()));
  } catch {
    return null;
  }
}

/**
 * One page of the list: a program's calls together, soonest to close first,
 * in sections by how soon. A tab holds the calls you can apply for or the
 * ones you can't, closed ones left out, or the ones you follow, closed ones too.
 * `counts` is each tab's programs under the other filters.
 */
export function pageOf(
  rows: Opportunity[],
  params: ListParams,
  { profile, followed, now = new Date() }: { profile: ScreeningProfile | null; followed: Set<string>; now?: Date },
) {
  const q = params.q.normalize("NFKC").trim().toLocaleLowerCase();
  const filtered = rows
    .map((o) => {
      // Each call's "today" is its funding body's.
      const state = availability(o, dateInZone(o.timeZone, 0, now));
      return { o, section: sectionOf(o, state, now), fit: screen(o.rules, profile, o.checkedAt, now).fit, ...programOf(o) };
    })
    .filter(({ o }) => {
      if (params.region !== "all" && o.region !== params.region) return false;
      if (params.kind !== "all" && o.kind !== params.kind) return false;
      if (params.within && (!o.closesOn || o.closesOn > dateInZone(o.timeZone, Number(params.within), now))) return false;
      return !q || `${o.title} ${o.agency}`.normalize("NFKC").toLocaleLowerCase().includes(q);
    });
  const inTab = (tab: ListTab) =>
    filtered.filter((c) =>
      tab === "following" ? followed.has(c.o.id) : c.section !== "closed" && (tab === "doesNotFit") === (c.fit === "doesNotFit"),
    );
  const groups = (calls: typeof filtered) => {
    const byProgram = new Map<string, typeof filtered>();
    for (const c of calls) {
      const key = `${c.o.source}|${c.o.agency}|${c.program}`;
      byProgram.set(key, [...(byProgram.get(key) ?? []), c]);
    }
    return [...byProgram.values()].map((members) => {
      const sorted = members.map((m) => ({ ...m, key: keyOf(m.o, m.section) })).sort((a, b) => after(a.key, b.key));
      const first = sorted[0];
      const group: OpportunityGroup = { id: first.o.id, program: first.program, section: first.section, fit: first.fit, calls: sorted.map((m) => ({ ...m.o, track: m.track })) };
      return { group, key: first.key };
    });
  };
  const counts = Object.fromEntries(listTabs.map((tab) => [tab, groups(inTab(tab)).length])) as Record<ListTab, number>;
  const matching = groups(inTab(params.tab)).sort((a, b) => after(a.key, b.key));
  const from = params.cursor ? decodeCursor(params.cursor) : null;
  const rest = from ? matching.filter((m) => after(m.key, from) > 0) : matching;
  const size = params.limit;
  const page = rest.slice(0, size);
  return {
    items: page.map((m) => m.group),
    total: matching.length,
    counts,
    nextCursor: rest.length > size ? encodeCursor(page[page.length - 1].key) : null,
  };
}
