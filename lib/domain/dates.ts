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
