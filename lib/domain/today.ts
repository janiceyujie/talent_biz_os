// 今日總覽's 需要你處理: what's yours to act on, in one list, most urgent first.
// Built from the reminders (payments and to-dos, not events: those are in
// the schedule beside it), messages waiting for review, and clashes in the
// coming week. Pure; the view words each row.
import { conflicts, plusDays, type PlanItem } from "@/lib/calendar/planner";
import type { InboxMessage } from "@/lib/types";
import { urgencies, type StatefulNotification, type Urgency } from "./notifications";

const CLASH_WINDOW_DAYS = 7; // as the reminders

export type TodayAction =
  | { kind: "reminder"; id: string; urgency: Urgency; date: string; reminder: StatefulNotification }
  | { kind: "review"; id: string; urgency: Urgency; date: string; message: InboxMessage }
  | { kind: "clash"; id: string; urgency: Urgency; date: string; items: [PlanItem, PlanItem] };

export function todayActions({
  reminders,
  inbox,
  items,
  today,
}: {
  reminders: StatefulNotification[]; // already without snoozed ones
  inbox: InboxMessage[];
  items: PlanItem[];
  today: string;
}): TodayAction[] {
  const due: TodayAction[] = reminders
    .filter((n) => n.kind !== "calendar" || n.source === "todo")
    .map((n) => ({ kind: "reminder", id: n.id, urgency: n.urgency, date: n.date, reminder: n }));
  // A message waiting for review is today's business, whenever it arrived.
  const review: TodayAction[] = inbox
    .filter((m) => m.status === "analyzed")
    .map((m) => ({ kind: "review", id: `review:${m.id}`, urgency: "today", date: today, message: m }));
  // Each clashing pair once, in the coming week; two of the person's own Google events aren't ours to sort out.
  const last = plusDays(today, CLASH_WINDOW_DAYS - 1);
  const ahead = items.filter((i) => i.date >= today && i.date <= last && !i.done);
  const pairs = new Map<string, [PlanItem, PlanItem]>();
  for (const a of ahead)
    for (const b of conflicts(a, items)) {
      if (a.external && b.external) continue;
      const pair = [a, b].sort((x, y) => `${x.date}${x.start}${x.id}`.localeCompare(`${y.date}${y.start}${y.id}`)) as [PlanItem, PlanItem];
      pairs.set(`${pair[0].id}|${pair[1].id}`, pair);
    }
  const clashes: TodayAction[] = [...pairs].map(([key, pair]) => ({
    kind: "clash",
    id: `clash:${key}`,
    urgency: pair[0].date === today ? "today" : "upcoming",
    date: pair[0].date,
    items: pair,
  }));
  return [...due, ...review, ...clashes].sort(
    (a, b) => urgencies.indexOf(a.urgency) - urgencies.indexOf(b.urgency) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
}
