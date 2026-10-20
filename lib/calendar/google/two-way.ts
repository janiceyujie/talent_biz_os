// Two-way Google Calendar (docs/design/calendar-two-way.md, decision 0017):
// the fields an event shares with Google, read back from a Google event,
// merged with ours field by field, and the description's notes line. Pure
// functions, no server-only imports; sync.ts does the calls.
import type { IcsEvent } from "@/lib/calendar/ics";
import { DEFAULT_DURATION_MINUTES } from "@/lib/calendar/ics";
import { fromGoogleEvent, type GoogleEvent } from "./import-plan";

/** What an event shares with Google, both ways. An ordinary event's end is in its start zone. */
export type SyncFields = {
  title: string;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:mm; null = all day
  timeZone: string;
  end: { date: string; time: string } | null; // null = none recorded (an hour long in Google)
  location: string | null;
  notes: string | null;
};
export type SyncKey = keyof SyncFields;

const ALL_KEYS: SyncKey[] = ["title", "date", "time", "timeZone", "end", "location", "notes"];
// Travel and stays: the route, the hotel, and the arrival in its own zone are composed into one
// location and line in Google, so they stay ours (decision 3).
const COMPOSED_KEYS: SyncKey[] = ["title", "date", "time", "timeZone", "notes"];

/** The fields that come back from Google for this kind of event. */
export const keysFor = (kind: string): SyncKey[] => (kind === "travel" || kind === "accommodation" ? COMPOSED_KEYS : ALL_KEYS);

/** Our event's shared fields, as we push them. */
export function fieldsOfOurs(e: IcsEvent): SyncFields {
  const ordinary = keysFor(e.kind ?? "").includes("end");
  return {
    title: e.title,
    date: e.date,
    time: e.time,
    timeZone: e.timeZone,
    end: ordinary && e.end && e.time ? { date: e.end.date, time: e.end.time } : null,
    location: ordinary ? (e.location ?? null) : null,
    notes: e.notes ?? null,
  };
}

/** Wall time plus minutes, staying wall time. */
function plusMinutes(date: string, time: string, minutes: number) {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), h, m + minutes));
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
}

/**
 * The text a person typed under the notes line, or undefined when the line isn't there (it was
 * deleted in Google): then the notes are left as they were. `markers` is the line in every language.
 */
export function notesFrom(description: string | undefined, markers: string[]): string | null | undefined {
  const lines = (description ?? "").replace(/\r\n/g, "\n").split("\n");
  const at = lines.findIndex((l) => markers.includes(l.trim()));
  if (at < 0) return undefined;
  return lines.slice(at + 1).join("\n").trim() || null;
}

/** The lines above the notes line: ours, never read back. */
export const infoFrom = (description: string | undefined, markers: string[]) => {
  const lines = (description ?? "").replace(/\r\n/g, "\n").split("\n");
  const at = lines.findIndex((l) => markers.includes(l.trim()));
  return (at < 0 ? lines : lines.slice(0, at)).join("\n").trim();
};

/**
 * A Google event read back into our shared fields, or null without a usable start. `zone` is the
 * fallback for a time Google gives with only an offset: the event's own zone. An hour-long event
 * is "no end recorded", as we push one. A field left undefined is unknown: it isn't merged.
 */
export function fieldsOfTheirs(g: GoogleEvent, zone: string, markers: string[]): Partial<SyncFields> | null {
  const read = fromGoogleEvent({ ...g, status: undefined }, zone);
  if (!read) return null;
  const time = read.startTime;
  let end: SyncFields["end"] = null;
  if (time && read.endDate && read.endTime) {
    const hour = plusMinutes(read.startDate, time, DEFAULT_DURATION_MINUTES);
    end = hour.date === read.endDate && hour.time === read.endTime ? null : { date: read.endDate, time: read.endTime };
  }
  const notes = notesFrom(g.description, markers);
  return {
    ...(read.title ? { title: read.title } : {}), // an emptied title isn't taken
    date: read.startDate,
    time,
    timeZone: read.timeZone,
    end,
    location: read.location,
    ...(notes === undefined ? {} : { notes }),
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Merge field by field against what we last pushed (`base`). A field changed only in Google is
 * applied here; changed only here, it's pushed; changed on both sides, the newer wins. Returns the
 * fields to set here.
 */
export function mergeFields(keys: SyncKey[], base: SyncFields, ours: SyncFields, theirs: Partial<SyncFields>, theirsNewer: boolean): Partial<SyncFields> {
  const apply: Partial<SyncFields> = {};
  for (const k of keys) {
    if (!(k in theirs)) continue;
    const t = theirs[k];
    if (same(t, base[k]) || same(t, ours[k])) continue;
    if (same(ours[k], base[k]) || theirsNewer) (apply as Record<SyncKey, unknown>)[k] = t;
  }
  return apply;
}

/** Whether ours has changes of its own since the last push, on top of what's applied from Google. */
export const changedHere = (keys: SyncKey[], base: SyncFields, ours: SyncFields, applied: Partial<SyncFields>) =>
  keys.some((k) => !(k in applied) && !same(ours[k], base[k]));

/** The description we write in Google: our lines, the notes line, then the notes. */
export const googleDescription = (info: string[], notes: string | null | undefined, marker: string) =>
  [...info.filter(Boolean), marker, notes ?? ""].join("\n").trimEnd();

/**
 * The project an event added in Google most likely belongs to, or null when it isn't clear: an
 * invited address that's a contact on exactly one project first, then exactly one project named
 * in the title. `projects` are the ones it may be added to (signed, not archived).
 */
export function suggestProject(
  event: { title: string; attendees?: string[] },
  projects: { id: string; names: string[]; emails?: string[] }[],
): string | null {
  const invited = new Set((event.attendees ?? []).map((a) => a.trim().toLowerCase()).filter(Boolean));
  if (invited.size) {
    const byPerson = projects.filter((p) => (p.emails ?? []).some((e) => invited.has(e.toLowerCase())));
    if (byPerson.length === 1) return byPerson[0].id;
  }
  const title = event.title.toLowerCase();
  const byName = projects.filter((p) => p.names.some((n) => n.trim().length >= 2 && title.includes(n.trim().toLowerCase())));
  return byName.length === 1 ? byName[0].id : null;
}
