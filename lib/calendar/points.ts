// A travel or stay event shows on the calendar twice — departure and arrival,
// or check-in and check-out — as two markers of one stored event. Editing,
// completing, or archiving a marker acts on the event.
import type { CalendarItem } from "@/lib/types";

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
