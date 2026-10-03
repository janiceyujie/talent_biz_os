// iCalendar (RFC 5545) output for calendar events. Timed events are written
// in UTC, converted from their stored wall time and IANA zone; calendar apps
// then show them in each viewer's own zone. Events without a time are all-day.

export type IcsEvent = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD, local to timeZone
  time: string | null; // HH:mm, null = all day
  timeZone: string;
  /** The real end (arrival, check-out) in its own zone; without one a timed event lasts an hour. */
  end?: { date: string; time: string; timeZone: string } | null;
  location?: string | null;
  description?: string | null;
  updatedAt: Date;
};

import { wallTimeToUtc } from "@/lib/domain/dates";

const DEFAULT_DURATION_MINUTES = 60; // for timed events without an end

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
    const end = e.end
      ? wallTimeToUtc(e.end.date, e.end.time, e.end.timeZone)
      : new Date(start.getTime() + DEFAULT_DURATION_MINUTES * 60_000);
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
