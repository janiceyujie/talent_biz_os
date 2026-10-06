// 今日總覽's action list. Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { PlanItem } from "@/lib/calendar/planner";
import type { InboxMessage } from "@/lib/types";
import type { StatefulNotification } from "./notifications";
import { todayActions } from "./today";

const TODAY = "2026-10-06";

const item = (over: Partial<PlanItem> = {}): PlanItem => ({
  id: "event:a",
  ref: { source: "event", id: "a" },
  title: "Soundcheck",
  kind: "meeting",
  date: TODAY,
  start: "17:00",
  endDate: TODAY,
  end: "18:00",
  fixed: true,
  movable: true,
  projectId: null,
  project: "",
  client: "",
  done: false,
  note: "",
  amount: null,
  external: null,
  ...over,
});

const base = { title: "x", date: TODAY, time: "", timeZone: "Asia/Taipei", dueAt: null, href: "/", read: false, snoozedUntil: null };
const payment = (over: Partial<StatefulNotification> = {}) =>
  ({ ...base, id: "payment:p", kind: "receivable", amount: 9000, urgency: "overdue", date: "2026-10-01", ...over }) as StatefulNotification;
const reminder = (source: "event" | "todo", over: Partial<StatefulNotification> = {}) =>
  ({ ...base, id: `calendar:${source}`, kind: "calendar", source, calendarKind: "meeting", marker: null, location: "", urgency: "today", ...over }) as StatefulNotification;
const message = (status: InboxMessage["status"]): InboxMessage =>
  ({ id: `m-${status}`, channel: "paste", body: "", receivedAt: "2026-10-05T00:00:00Z", status, failure: null, projectId: null, analysis: null, files: [] }) as InboxMessage;

describe("todayActions", () => {
  test("events stay in the schedule; payments and to-dos are actions", () => {
    const got = todayActions({ reminders: [reminder("event"), reminder("todo"), payment()], inbox: [], items: [], today: TODAY });
    assert.deepEqual(
      got.map((a) => a.id),
      ["payment:p", "calendar:todo"],
    );
  });

  test("messages waiting for review are today's business; filed or dismissed ones aren't", () => {
    const got = todayActions({ reminders: [], inbox: [message("analyzed"), message("confirmed"), message("dismissed")], items: [], today: TODAY });
    assert.deepEqual(
      got.map((a) => [a.id, a.urgency]),
      [["review:m-analyzed", "today"]],
    );
  });

  test("a clash is one action per pair, even across three overlapping items", () => {
    const a = item({ id: "event:a", start: "17:00", end: "18:00" });
    const b = item({ id: "event:b", title: "彩排", start: "17:30", end: "19:00" });
    const c = item({ id: "event:c", title: "Blue Room", start: "20:00", end: "21:00" });
    const got = todayActions({ reminders: [], inbox: [], items: [a, b, c], today: TODAY });
    assert.deepEqual(
      got.map((x) => x.id),
      ["clash:event:a|event:b"],
    );
  });

  test("clashes beyond the week, or between two of the person's own Google events, are left out", () => {
    const g = (id: string, start: string) => item({ id, start, end: "12:00", external: { calendar: "Personal", color: null } });
    const late = (id: string) => item({ id, date: "2026-10-20", endDate: "2026-10-20" });
    const got = todayActions({ reminders: [], inbox: [], items: [g("google:1", "10:00"), g("google:2", "11:00"), late("event:x"), late("event:y")], today: TODAY });
    assert.deepEqual(got, []);
  });

  test("most urgent first: overdue, then today, then later in the week", () => {
    const later = [item({ id: "event:a", date: "2026-10-08", endDate: "2026-10-08" }), item({ id: "event:b", date: "2026-10-08", endDate: "2026-10-08", start: "17:30", end: "19:00" })];
    const got = todayActions({ reminders: [reminder("todo"), payment()], inbox: [message("analyzed")], items: later, today: TODAY });
    assert.deepEqual(
      got.map((a) => a.kind),
      ["reminder", "reminder", "review", "clash"],
    );
    assert.equal(got[0].id, "payment:p");
  });
});
