// A travel or stay event shows on the calendar twice — departure and arrival,
// or check-in and check-out — as two markers of one stored event. Editing,
// completing, or archiving a marker acts on the event.
import type { CalendarItem, ExternalEvent } from "@/lib/types";

export type CalendarPoint = {
  key: string; // stable per marker: `${id}:start` / `${id}:end`
  item: CalendarItem;
  end: boolean;
  date: string;
  time: string;
  timeZone: string;
};

export function calendarPoints(items: CalendarItem[]): CalendarPoint[] {
  return items.flatMap((item) => {
    const start = { key: `${item.id}:start`, item, end: false, date: item.date, time: item.time, timeZone: item.timeZone };
    const t = item.travel;
    return t?.endDate
      ? [start, { key: `${item.id}:end`, item, end: true, date: t.endDate, time: t.endTime, timeZone: t.endTimeZone }]
      : [start];
  });
}

/** Which marker this is, for its label: departure/arrival, check-in/check-out, or none. */
export function pointKind(p: CalendarPoint) {
  if (p.item.kind === "travel") return p.end ? "arrive" : "depart";
  if (p.item.kind === "accommodation") return p.end ? "checkOut" : "checkIn";
  return null;
}

// A Google event (decision 0009, phase 2) on the month view: a timed one on its
// start date, an all-day one on each day it covers, in the event's own zone
// like everything else here.
export type ExternalPoint = { key: string; event: ExternalEvent; date: string; time: string; timeZone: string };

const LONGEST_ALL_DAY = 31; // days; a longer one is shown for its first month

export function externalPoints(events: ExternalEvent[]): ExternalPoint[] {
  return events.flatMap((event) => {
    const at = (date: string) => ({ key: `${event.id}:${date}`, event, date, time: event.time, timeZone: event.timeZone });
    if (event.time) return [at(event.date)];
    const days = [];
    for (let d = event.date, n = 0; d <= (event.endDate || event.date) && n < LONGEST_ALL_DAY; d = nextDay(d), n++) days.push(at(d));
    return days;
  });
}

const nextDay = (date: string) => new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
