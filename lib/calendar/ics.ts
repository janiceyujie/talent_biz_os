// iCalendar (RFC 5545) output for calendar events. Timed events are written
// in UTC, converted from their stored wall time and IANA zone; calendar apps
// then show them in each viewer's own zone. Events without a time are all-day.

export type IcsEvent = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD, local to timeZone
  time: string | null; // HH:mm, null = all day
  timeZone: string;
  location?: string | null;
  description?: string | null;
  updatedAt: Date;
};

const DEFAULT_DURATION_MINUTES = 60; // end times aren't tracked yet

/** The zone's offset from UTC, in ms, at a given instant. */
function offsetAt(timeZone: string, instant: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * The instant at which it's `date time` on the wall clock in `timeZone`,
 * disambiguated like Temporal's "compatible": a time repeated by a DST
 * fall-back takes its first occurrence; a time skipped by a spring-forward
 * moves forward past the gap (02:30 → 03:30).
 */
export function wallTimeToUtc(date: string, time: string, timeZone: string) {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const day = 86_400_000;
  // Offsets a day either side are outside any transition on this date.
  const before = offsetAt(timeZone, wall - day);
  const after = offsetAt(timeZone, wall + day);
  const valid = [wall - before, wall - after].filter((t) => offsetAt(timeZone, t) === wall - t);
  return new Date(valid.length ? Math.min(...valid) : wall - before);
}

const utcStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const dateValue = (date: string) => date.replaceAll("-", "");
function nextDay(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** TEXT escaping per RFC 5545 §3.3.11. */
const escapeText = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Fold to 75-octet lines (§3.1), never splitting a UTF-8 character. */
function fold(line: string) {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch);
    if (bytes + size > (out.length ? 74 : 75)) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

function eventLines(e: IcsEvent, host: string) {
  const lines = ["BEGIN:VEVENT", `UID:${e.id}@${host}`, `DTSTAMP:${utcStamp(e.updatedAt)}`];
  if (e.time) {
    const start = wallTimeToUtc(e.date, e.time, e.timeZone);
    const end = new Date(start.getTime() + DEFAULT_DURATION_MINUTES * 60_000);
    lines.push(`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${dateValue(e.date)}`, `DTEND;VALUE=DATE:${dateValue(nextDay(e.date))}`);
  }
  lines.push(`SUMMARY:${escapeText(e.title)}`);
  if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
  if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
  lines.push("END:VEVENT");
  return lines;
}

export function buildCalendar(events: IcsEvent[], { name, host }: { name: string; host: string }) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Talent Biz OS//Calendar//ZH-TW",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...events.flatMap((e) => eventLines(e, host)),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
