/** Today (plus `offset` days) as YYYY-MM-DD in the given IANA time zone. */
export function dateInZone(timeZone: string, offset = 0, now = new Date()) {
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const d = new Date(`${local}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

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
  const { valid, fallback } = wallTimeInstants(date, time, timeZone);
  return new Date(valid.length ? Math.min(...valid) : fallback);
}

/**
 * The one instant at which it's `date time` in `timeZone`, or null when there
 * isn't exactly one — an invalid input, or a wall time repeated or skipped by
 * daylight saving. Used where guessing would be wrong (travel times).
 */
export function exactInstant(date: string, time: string, timeZone: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  try {
    const { valid } = wallTimeInstants(date, time, timeZone);
    return new Set(valid).size === 1 ? valid[0] : null;
  } catch {
    return null; // unknown time zone
  }
}

function wallTimeInstants(date: string, time: string, timeZone: string) {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const day = 86_400_000;
  // Offsets a day either side are outside any transition on this date.
  const before = offsetAt(timeZone, wall - day);
  const after = offsetAt(timeZone, wall + day);
  const valid = [...new Set([wall - before, wall - after])].filter((t) => offsetAt(timeZone, t) === wall - t);
  return { valid, fallback: wall - before };
}
