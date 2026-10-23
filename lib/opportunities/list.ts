// The Opportunities list: each call's state today, the filters, and the order.
// Pure; the endpoint (app/api/opportunities) and the screen both use it.
import { z } from "zod";
import { dateInZone } from "@/lib/domain/dates";
import { PAGE_MAX, PAGE_SIZE } from "@/lib/domain/list-page";
import { screen } from "./screening";
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

export const listParams = z.object({
  region: z.enum(["all", ...opportunityRegions]).catch("all"),
  kind: z.enum(["all", ...opportunityKinds]).catch("all"),
  within: z.enum(["", ...WITHIN_DAYS.map(String)] as ["", ...string[]]).catch(""), // closing within this many days
  following: z.enum(["", "1"]).catch(""),
  show: z.enum(["fitting", "all"]).catch("fitting"), // fitting hides Doesn't fit
  q: z.string().max(200).catch(""),
  cursor: z.string().max(500).catch(""),
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).catch(PAGE_SIZE),
});
export type ListParams = z.infer<typeof listParams>;

const order: Record<Availability, number> = { open: 0, upcoming: 1, unknown: 2, closed: 3 };
type Key = [number, string, string]; // state, closing date (undated last), id
const keyOf = (o: Opportunity, state: Availability): Key => [order[state], o.closesOn ?? "9999-12-31", o.id];
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
 * One page of calls, open ones first and the soonest to close first.
 * Closed calls show only among the ones you follow. Doesn't fit is left out
 * unless asked for; Check never is.
 */
export function pageOf(
  rows: Opportunity[],
  params: ListParams,
  { profile, followed, now = new Date() }: { profile: ScreeningProfile | null; followed: Set<string>; now?: Date },
) {
  const q = params.q.normalize("NFKC").trim().toLocaleLowerCase();
  const matching = rows
    // Each call's "today" is its funding body's.
    .map((o) => ({ o, state: availability(o, dateInZone(o.timeZone, 0, now)) }))
    .filter(({ o, state }) => {
      if (params.following ? !followed.has(o.id) : state === "closed") return false;
      if (params.region !== "all" && o.region !== params.region) return false;
      if (params.kind !== "all" && o.kind !== params.kind) return false;
      if (params.within && (!o.closesOn || o.closesOn > dateInZone(o.timeZone, Number(params.within), now))) return false;
      if (q && !`${o.title} ${o.agency}`.normalize("NFKC").toLocaleLowerCase().includes(q)) return false;
      return params.show === "all" || screen(o.rules, profile, o.checkedAt, now).fit !== "doesNotFit";
    })
    .map(({ o, state }) => ({ o, key: keyOf(o, state) }))
    .sort((a, b) => after(a.key, b.key));
  const from = params.cursor ? decodeCursor(params.cursor) : null;
  const rest = from ? matching.filter((m) => after(m.key, from) > 0) : matching;
  const size = params.limit;
  const page = rest.slice(0, size);
  return {
    items: page.map((m) => m.o),
    total: matching.length,
    nextCursor: rest.length > size ? encodeCursor(page[page.length - 1].key) : null,
  };
}
