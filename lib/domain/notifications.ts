// In-app notifications: computed on read from calendar items and payments,
// never stored. Ids are stable so per-person read/snooze state
// (notification_state) can refer to them. Pure functions; run anywhere.
import { calendarPoints, pointKind } from "@/lib/calendar/points";
import type { AppData, CalendarKind, NotificationState } from "@/lib/types";
import { dateInZone, exactInstant } from "./dates";
import { isSigned } from "./phases";
import { paymentTotal } from "./workflow";

/** Most urgent first: timed and within two hours, then overdue, then today, then the rest. */
export const urgencies = ["soon", "overdue", "today", "upcoming"] as const;
export type Urgency = (typeof urgencies)[number];

const SOON_MS = 2 * 3600_000;
const WINDOW_DAYS = 7;

type Base = {
  id: string;
  title: string;
  date: string;
  time: string;
  timeZone: string;
  urgency: Urgency;
  dueAt: number | null; // the instant it's due, when it has one
  href: string;
};
export type Notification = Base &
  (
    | { kind: "calendar"; source: "event" | "todo"; calendarKind: CalendarKind; marker: ReturnType<typeof pointKind>; location: string }
    | { kind: "receivable" | "payable"; amount: number }
  );

/**
 * Urgency from the item's own zone: a timed item compares real instants (so a
 * Tokyo 09:00 and a Taipei 09:00 aren't the same moment); a date-only item is
 * due all that local day, overdue only once the day is over.
 */
function timing(date: string, time: string, timeZone: string, now: Date) {
  const today = dateInZone(timeZone, 0, now);
  const dueAt = exactInstant(date, time || "23:59", timeZone);
  const delta = time && dueAt !== null ? dueAt - now.getTime() : null;
  const urgency: Urgency =
    delta !== null && delta >= 0 && delta <= SOON_MS
      ? "soon"
      : (delta !== null && delta < 0) || date < today
        ? "overdue"
        : date === today
          ? "today"
          : "upcoming";
  return { urgency, dueAt };
}

export function compareNotifications(a: Notification, b: Notification) {
  return (
    urgencies.indexOf(a.urgency) - urgencies.indexOf(b.urgency) ||
    (a.dueAt ?? Date.parse(a.date)) - (b.dueAt ?? Date.parse(b.date)) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Open to-dos due within a week (overdue ones stay), events and travel markers
 * still ahead in the coming week, and expected payments in or out due within a
 * week or overdue. Items linked to an archived or unsigned project are left
 * out: execution work belongs to signed projects.
 */
export function notifications(data: AppData, now = new Date()): Notification[] {
  const talentZone = data.talent.timeZone;
  const liveSigned = new Set(data.projects.filter((p) => !p.archived && isSigned(p.stage)).map((p) => p.id));
  const calendar = calendarPoints(data.calendar)
    .filter(({ item }) => !item.archived && !item.done && (!item.projectId || liveSigned.has(item.projectId)))
    .filter((p) => p.date <= dateInZone(p.timeZone, WINDOW_DAYS, now))
    .flatMap((p): Notification[] => {
      const { urgency, dueAt } = timing(p.date, p.time, p.timeZone, now);
      // A to-do past its time is overdue; an event that already happened isn't.
      if (urgency === "overdue" && p.item.source === "event") return [];
      return [{
        id: `calendar:${p.item.id}:${p.end ? "end:" : ""}${p.date}:${p.time}`,
        kind: "calendar",
        source: p.item.source,
        calendarKind: p.item.kind,
        marker: pointKind(p),
        title: p.item.title,
        location: p.end ? (p.item.travel?.destination ?? "") : p.item.location,
        date: p.date,
        time: p.time,
        timeZone: p.timeZone,
        urgency,
        dueAt,
        href: `/calendar?day=${p.date}`,
      }];
    });
  const soon = dateInZone(talentZone, WINDOW_DAYS, now);
  const payments = data.payments
    .filter((p) => !p.voided && p.status === "expected" && p.dueDate && p.dueDate <= soon)
    .map((p): Notification => ({
      id: `payment:${p.id}:${p.dueDate}`,
      kind: p.direction === "in" ? "receivable" : "payable",
      title: p.label,
      amount: paymentTotal(p),
      date: p.dueDate!,
      time: "",
      timeZone: talentZone,
      ...timing(p.dueDate!, "", talentZone, now),
      href: "/finance",
    }));
  return [...calendar, ...payments].sort(compareNotifications);
}

/** A notification id as the server accepts it: what notifications() produces. */
export const notificationIdPattern = /^(calendar:[0-9a-f-]{36}:(end:)?\d{4}-\d{2}-\d{2}:(\d{2}:\d{2})?|payment:[0-9a-f-]{36}:\d{4}-\d{2}-\d{2})$/;

/**
 * Notifications with this person's read and snooze state. A snooze that has
 * run out no longer counts; snoozed ones sort last and don't count as unread.
 */
export function withState(list: Notification[], state: NotificationState, now = new Date()) {
  const rows = list.map((n) => {
    const s = state[n.id];
    const snoozedUntil = s?.snoozedUntil && Date.parse(s.snoozedUntil) > now.getTime() ? s.snoozedUntil : null;
    return { ...n, read: Boolean(s?.readAt), snoozedUntil };
  });
  return [...rows.filter((n) => !n.snoozedUntil), ...rows.filter((n) => n.snoozedUntil)];
}
export type StatefulNotification = ReturnType<typeof withState>[number];
export const isUnread = (n: StatefulNotification) => !n.read && !n.snoozedUntil;
