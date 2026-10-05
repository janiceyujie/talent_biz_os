// The day and week calendar: the talent's events, to-dos, and payment due
// dates as items on one timeline, in the talent's time zone. Pure functions;
// the calendar view saves moves through the same actions as the forms.
// Adapted from the prototype's planner model (talent-business-os-prototype,
// src/components/planner/model.ts), on real data instead of a demo scenario.
import { wallTimeToUtc } from "@/lib/domain/dates";
import { isSigned } from "@/lib/domain/phases";
import { paymentTotal } from "@/lib/domain/workflow";
import type { AppData, CalendarKind } from "@/lib/types";

export type PlanItem = {
  /** Unique per item on the timeline; a stay's check-out marker gets its own. */
  id: string;
  /** What it was made from, for editing and saving. */
  ref: { source: "event" | "todo"; id: string } | { source: "payment"; id: string } | { source: "google"; id: string; link: string };
  title: string;
  kind: CalendarKind;
  date: string; // YYYY-MM-DD in the talent's zone
  start: string; // HH:mm or "" (untimed: a due date, an all-day item)
  endDate: string; // the end's day: the start day or later; "" with no recorded end
  end: string; // HH:mm or "" (no recorded end: never invented)
  /**
   * Fixed: a commitment someone else depends on — an event on a project, a payment date. Moving it asks first.
   * Flexible: the person's own events and to-dos — they move directly unless they clash.
   */
  fixed: boolean;
  /** Can be dragged: has a start, is in the talent's zone, and isn't a multi-day or derived item. */
  movable: boolean;
  projectId: string | null;
  project: string;
  client: string;
  done: boolean;
  /** Shown when the item can't sit on the timeline as stated (another zone, multi-day). */
  note: string;
  amount: number | null; // payment due dates
  /** From one of the person's own Google calendars (decision 0009, phase 2): read-only, never on a project. */
  external: { calendar: string; color: string | null } | null;
};

export const plusDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** The Monday of the week containing `date`. */
export const weekStart = (date: string) => plusDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));

export const minutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

export const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;
const isTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** Minutes since 1970-01-01 00:00 for a wall date and time: lets spans cross midnight. Zone-free on purpose. */
export const at = (date: string, time: string) => Date.parse(`${date}T00:00:00Z`) / 60000 + minutes(time);
const fromAt = (value: number) => {
  const d = new Date(Math.floor(value / 1440) * 86400000);
  return { date: d.toISOString().slice(0, 10), time: clock(((value % 1440) + 1440) % 1440) };
};

/** A real date; a start without an end, or an end after the start (possibly on a later day). */
export function validItem(item: Pick<PlanItem, "date" | "start" | "endDate" | "end">) {
  if (!isDate(item.date)) return false;
  if (!item.start) return !item.end;
  if (!isTime(item.start)) return false;
  if (!item.end) return true;
  return isDate(item.endDate) && isTime(item.end) && at(item.endDate, item.end) > at(item.date, item.start);
}

const span = (i: Pick<PlanItem, "date" | "start" | "endDate" | "end">) =>
  i.start && i.end && i.endDate ? [at(i.date, i.start), at(i.endDate, i.end)] : null;

/** Timed items whose spans overlap (across midnight too). Items without both a start and an end never clash. */
export function conflicts(item: PlanItem, items: PlanItem[]) {
  const a = span(item);
  if (!a) return [];
  return items.filter((o) => {
    const b = o.id !== item.id && !o.done ? span(o) : null;
    return !!b && a[0] < b[1] && a[1] > b[0];
  });
}

/**
 * Move to a new start, keeping the length; or set a new start or end edge
 * (`edge`), refusing an edge that would cross the other one.
 */
export function moveItem(item: PlanItem, date: string, time: string, edge: "move" | "start" | "end" = "move"): PlanItem {
  const target = at(date, time);
  if (edge === "end") {
    if (target <= at(item.date, item.start)) return item;
    return { ...item, endDate: date, end: time };
  }
  if (edge === "start") {
    if (item.end && target >= at(item.endDate, item.end)) return item;
    return { ...item, date, start: time };
  }
  if (!item.end) return { ...item, date, start: time };
  const end = fromAt(target + at(item.endDate, item.end) - at(item.date, item.start));
  return { ...item, date, start: time, endDate: end.date, end: end.time };
}

/** The part of an item on one day, in minutes from that day's midnight; null if it isn't on the day. */
export function segment(item: PlanItem, day: string) {
  if (!item.start) return null;
  const dayStart = at(day, "00:00");
  const from = at(item.date, item.start);
  const to = item.end ? at(item.endDate, item.end) : from; // no end: a point in time
  if (to < dayStart || from >= dayStart + 1440 || (to === dayStart && from < dayStart)) return null;
  return { from: Math.max(from, dayStart) - dayStart, to: Math.min(to, dayStart + 1440) - dayStart, open: !item.end };
}

/**
 * Side-by-side columns for overlapping blocks on one day, like a calendar app:
 * each block gets a lane, and every block in a cluster of overlaps shares the
 * cluster's lane count. Blocks without an end count as `minLength` long.
 */
export function layoutDay<T extends { id: string; from: number; to: number }>(blocks: T[], minLength = 30) {
  const sorted = [...blocks].sort((a, b) => a.from - b.from || b.to - a.to);
  const out = new Map<string, { lane: number; lanes: number }>();
  let cluster: { id: string; lane: number }[] = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];
  const close = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1));
    for (const c of cluster) out.set(c.id, { lane: c.lane, lanes });
    cluster = [];
    laneEnds = [];
  };
  for (const b of sorted) {
    const end = Math.max(b.to, b.from + minLength);
    if (b.from >= clusterEnd) close();
    let lane = laneEnds.findIndex((e) => e <= b.from);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = end;
    cluster.push({ id: b.id, lane });
    clusterEnd = Math.max(clusterEnd, end);
  }
  close();
  return out;
}

/** The wall date and time in `zone` at an instant. */
function wallTime(instant: Date, zone: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/**
 * Everything with a date, as timeline items in the talent's zone. Items in
 * another zone are shown at the talent's local time but not dragged (moving
 * them would mean rewriting a time someone gave in their own zone); travel
 * and stays span days and are edited in the full form.
 */
export function planItems(data: Pick<AppData, "calendar" | "payments" | "projects" | "talent"> & Partial<Pick<AppData, "externalEvents">>): PlanItem[] {
  const zone = data.talent.timeZone;
  const projectOf = (id: string | null) => data.projects.find((p) => p.id === id);
  const items: PlanItem[] = [];
  for (const c of data.calendar.filter((x) => !x.archived)) {
    const p = projectOf(c.projectId);
    const base = {
      ref: { source: c.source, id: c.id } as PlanItem["ref"],
      title: c.title,
      kind: c.kind,
      projectId: c.projectId,
      project: p?.title ?? "",
      client: p?.counterparty ?? "",
      done: c.done,
      amount: null,
      external: null,
    };
    const trip = !!c.travel;
    // Shown in the talent's zone; an item in another zone is converted, start and end.
    const local = c.time && c.timeZone !== zone ? wallTime(wallTimeToUtc(c.date, c.time, c.timeZone), zone) : { date: c.date, time: c.time };
    const endDay = c.endDate || c.date;
    const localEnd =
      c.endTime && c.timeZone !== zone ? wallTime(wallTimeToUtc(endDay, c.endTime, c.timeZone), zone) : { date: endDay, time: c.endTime };
    items.push({
      ...base,
      id: `${c.source}:${c.id}`,
      date: local.date,
      start: trip ? "" : local.time,
      endDate: !trip && c.time && c.endTime ? localEnd.date : "",
      end: !trip && c.time && c.endTime ? localEnd.time : "",
      fixed: c.source === "event" && !!c.projectId,
      movable: !trip && !!c.time && c.timeZone === zone,
      note: trip || c.timeZone !== zone ? [c.date, c.time, c.timeZone].filter(Boolean).join(" ") : "",
    });
    // A trip's arrival or a stay's check-out on another day gets its own marker.
    if (c.travel?.endDate && c.travel.endDate !== c.date)
      items.push({
        ...base,
        id: `${c.source}:${c.id}:end`,
        date: c.travel.endDate,
        start: "",
        endDate: "",
        end: "",
        fixed: true,
        movable: false,
        note: [c.travel.endDate, c.travel.endTime, c.travel.endTimeZone || c.timeZone].filter(Boolean).join(" "),
      });
  }
  // Money expected on a date, for signed work or no project: shown, edited in the ledger.
  for (const pay of data.payments) {
    if (pay.voided || pay.status !== "expected" || !pay.dueDate) continue;
    const p = projectOf(pay.projectId);
    if (p && (p.archived || !isSigned(p.stage))) continue;
    items.push({
      id: `payment:${pay.id}`,
      ref: { source: "payment", id: pay.id },
      title: pay.label,
      kind: "payment",
      date: pay.dueDate,
      start: "",
      endDate: "",
      end: "",
      fixed: true,
      movable: false,
      projectId: pay.projectId,
      project: p?.title ?? "",
      client: p?.counterparty ?? "",
      done: false,
      note: "",
      amount: paymentTotal(pay) * (pay.direction === "out" ? -1 : 1),
      external: null,
    });
  }
  // The person's own Google events: shown in the talent's zone, read-only, part of clash checks.
  for (const g of data.externalEvents ?? []) {
    const local = g.time && g.timeZone !== zone ? wallTime(wallTimeToUtc(g.date, g.time, g.timeZone), zone) : { date: g.date, time: g.time };
    const endDay = g.endDate || g.date;
    const localEnd = g.endTime && g.timeZone !== zone ? wallTime(wallTimeToUtc(endDay, g.endTime, g.timeZone), zone) : { date: endDay, time: g.endTime };
    const base = {
      ref: { source: "google" as const, id: g.id, link: g.link },
      title: g.title,
      kind: "meeting" as CalendarKind,
      fixed: true,
      movable: false,
      projectId: null,
      project: "",
      client: "",
      done: false,
      note: "",
      amount: null,
      external: { calendar: g.calendar, color: g.color },
    };
    if (g.time) {
      items.push({ ...base, id: `google:${g.id}`, date: local.date, start: local.time, endDate: localEnd.time ? localEnd.date : "", end: localEnd.time });
      continue;
    }
    // All day: on each day it covers (a long one is capped at a month).
    for (let d = g.date, n = 0; d <= endDay && n < 31; d = plusDays(d, 1), n++)
      items.push({ ...base, id: `google:${g.id}:${d}`, date: d, start: "", endDate: "", end: "" });
  }
  return items.sort((a, b) => `${a.date}${a.start || "99"}`.localeCompare(`${b.date}${b.start || "99"}`));
}
