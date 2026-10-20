// Phase 2 of decision 0009: a Google event as we store it — wall time plus
// zone (decision 0003), all-day as dates. Pure; import.ts reads and writes.
import { wallTimeToUtc } from "@/lib/domain/dates";

/** The parts of a Google Calendar event we read (Events resource). */
export type GoogleEvent = {
  id: string;
  etag?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  updated?: string; // when it last changed in Google
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  recurrence?: string[]; // a repeating event's rules
  recurringEventId?: string; // an occurrence of a repeating event
  attendees?: { email?: string }[];
  extendedProperties?: { private?: Record<string, string> };
};

export type ImportedEvent = {
  externalEventId: string;
  title: string;
  startDate: string;
  startTime: string | null; // null = all day
  endDate: string | null;
  endTime: string | null;
  timeZone: string;
  location: string | null;
  htmlLink: string | null;
};

/** The wall date and time in `zone` at an instant. */
function wallTime(instant: Date, zone: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(instant)
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

const previousDay = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

const isZone = (zone: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

const hasOffset = (dateTime: string) => /(?:[zZ]|[+-]\d\d:?\d\d)$/.test(dateTime);

/**
 * A Google time as wall time in `zone`. Google normally gives an offset; one without is already
 * wall time in the zone named beside it (`written`), never in the zone of whatever machine reads it.
 */
function at(dateTime: string, written: string, zone = written) {
  if (hasOffset(dateTime)) return wallTime(new Date(dateTime), zone);
  const wall = { date: dateTime.slice(0, 10), time: dateTime.slice(11, 16) };
  return written === zone ? wall : wallTime(new Date(wallTimeToUtc(wall.date, wall.time, written)), zone);
}

/**
 * One Google event as we store it, or null for one we skip (cancelled, or
 * without a usable start). A timed event keeps the zone it was made in
 * (falling back to its calendar's); an all-day event's end is the last day
 * it covers (Google's end date is the day after).
 */
export function fromGoogleEvent(g: GoogleEvent, calendarZone: string, into?: string): ImportedEvent | null {
  if (g.status === "cancelled" || !g.start) return null;
  const base = { externalEventId: g.id, title: (g.summary ?? "").slice(0, 300), location: g.location?.slice(0, 500) || null, htmlLink: g.htmlLink ?? null };
  if (g.start.date) {
    const last = g.end?.date ? previousDay(g.end.date) : g.start.date;
    return { ...base, startDate: g.start.date, startTime: null, endDate: last > g.start.date ? last : null, endTime: null, timeZone: into ?? calendarZone };
  }
  if (!g.start.dateTime) return null;
  const zone = [g.start.timeZone, calendarZone, "UTC"].find((z) => z && isZone(z))!;
  // `into`: the same moment, as wall time in that zone (two-way sync keeps an event in its own zone).
  const out = into && isZone(into) ? into : zone;
  const start = at(g.start.dateTime, zone, out);
  const end = g.end?.dateTime ? at(g.end.dateTime, g.end.timeZone && isZone(g.end.timeZone) && !hasOffset(g.end.dateTime) ? g.end.timeZone : zone, out) : null;
  return { ...base, startDate: start.date, startTime: start.time, endDate: end?.date ?? null, endTime: end?.time ?? null, timeZone: out };
}
