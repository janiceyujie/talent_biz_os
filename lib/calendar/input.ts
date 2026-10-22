// Dates and times as people type them, for the date and time fields (components/app/date-time-input.tsx).
// Pure: wall dates only, no time zones; arithmetic uses noon UTC so a day never shifts.

/** A typed date as YYYY-MM-DD: year first, in any of 20261012, 2026/10/12, 2026-10-12, 2026.10.12. "" when blank, null when it isn't a real date. */
export function parseDateInput(input: string): string | null {
  const text = input.normalize("NFKC").trim();
  if (!text) return "";
  // Year first only: 10/12/2026 could be October or December, so it's refused rather than guessed.
  const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text) ?? /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (year < 1000 || month < 1 || month > 12 || day < 1) return null;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= days ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null;
}

/** A typed time as HH:mm, in any of 9, 930, 1530, 9:30, 9:30pm, 12am. "" when blank, null when it isn't a time. */
export function parseTimeInput(input: string): string | null {
  const text = input.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, "");
  if (!text) return "";
  const m = /^(\d{1,4})(?::(\d{1,2}))?(am|pm)?$/.exec(text);
  if (!m) return null;
  let hour: number;
  let minute: number;
  if (m[2] !== undefined) {
    if (m[1].length > 2) return null;
    [hour, minute] = [Number(m[1]), Number(m[2])];
  } else if (m[1].length > 2) {
    [hour, minute] = [Number(m[1].slice(0, -2)), Number(m[1].slice(-2))]; // 930, 1530
  } else {
    [hour, minute] = [Number(m[1]), 0];
  }
  if (m[3]) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (m[3] === "pm" ? 12 : 0);
  }
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** A date some days later (or earlier). */
export function addDateDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The same day some months later (or earlier), or the month's last day when it's shorter: Jan 31 + 1 month is Feb 28. */
export function addDateMonths(date: string, months: number) {
  const d = new Date(`${date}T12:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
  return d.toISOString().slice(0, 10);
}

/** The time picker's choices: every half hour. Any other minute can be typed. */
export const halfHourTimes = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
