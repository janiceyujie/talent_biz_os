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
  ref: { source: "event" | "todo"; id: string } | { source: "payment"; id: string };
  title: string;
  kind: CalendarKind;
  date: string; // YYYY-MM-DD in the talent's zone
  start: string; // HH:mm or "" (untimed: a due date, an all-day item)
  end: string; // HH:mm or "" (no recorded end: never invented)
  /**
   * Fixed: a commitment someone else depends on (events, payment dates) — moving it asks first.
   * Flexible: the person's own work (to-dos) — moves directly unless it clashes.
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

/** A real date; a start without an end, or an end after the start on the same day. */
export function validItem(item: Pick<PlanItem, "date" | "start" | "end">) {
  if (!isDate(item.date)) return false;
  if (!item.start) return !item.end;
  if (!isTime(item.start)) return false;
  return !item.end || (isTime(item.end) && minutes(item.end) > minutes(item.start));
}

/** Timed items on the same day whose spans overlap. Items without both a start and an end never clash. */
export function conflicts(item: PlanItem, items: PlanItem[]) {
  if (!item.start || !item.end) return [];
  return items.filter(
    (o) =>
      o.id !== item.id &&
      !o.done &&
      o.date === item.date &&
      o.start &&
      o.end &&
      minutes(item.start) < minutes(o.end) &&
      minutes(item.end) > minutes(o.start),
  );
}

/** Move to a new day and start, keeping the length; or with `resize`, set a new end on the same day. */
export function moveItem(item: PlanItem, date: string, start: string, resize = false): PlanItem {
  if (resize) return { ...item, end: date === item.date ? start : item.start };
  if (!item.end) return { ...item, date, start };
  const end = minutes(start) + minutes(item.end) - minutes(item.start);
  return { ...item, date, start, end: end <= 1439 ? clock(end) : "" };
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
export function planItems(data: Pick<AppData, "calendar" | "payments" | "projects" | "talent">): PlanItem[] {
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
    };
    const multiDay = !!c.travel;
    const local = c.time && c.timeZone !== zone ? wallTime(wallTimeToUtc(c.date, c.time, c.timeZone), zone) : { date: c.date, time: c.time };
    const localEnd =
      c.endTime && c.timeZone !== zone ? wallTime(wallTimeToUtc(c.date, c.endTime, c.timeZone), zone) : { date: c.date, time: c.endTime };
    const sameDay = !multiDay && localEnd.date === local.date;
    items.push({
      ...base,
      id: `${c.source}:${c.id}`,
      date: local.date,
      start: multiDay ? "" : local.time,
      end: sameDay ? localEnd.time : "",
      fixed: c.source === "event",
      movable: !multiDay && !!c.time && c.timeZone === zone,
      note: multiDay || c.timeZone !== zone ? [c.date, c.time, c.timeZone].filter(Boolean).join(" ") : "",
    });
    // A trip's arrival or a stay's check-out on another day gets its own marker.
    if (c.travel?.endDate && c.travel.endDate !== c.date)
      items.push({
        ...base,
        id: `${c.source}:${c.id}:end`,
        date: c.travel.endDate,
        start: "",
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
      end: "",
      fixed: true,
      movable: false,
      projectId: pay.projectId,
      project: p?.title ?? "",
      client: p?.counterparty ?? "",
      done: false,
      note: "",
      amount: paymentTotal(pay) * (pay.direction === "out" ? -1 : 1),
    });
  }
  return items.sort((a, b) => `${a.date}${a.start || "99"}`.localeCompare(`${b.date}${b.start || "99"}`));
}
