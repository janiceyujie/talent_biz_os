// The day and week calendar's rules. Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AppData, CalendarItem, Payment, Project } from "@/lib/types";
import { conflicts, layoutDay, moveItem, planItems, plusDays, segment, validItem, weekStart, type PlanItem } from "./planner";

const item = (over: Partial<PlanItem> = {}): PlanItem => ({
  id: "event:a",
  ref: { source: "event", id: "a" },
  title: "Soundcheck",
  kind: "meeting",
  date: "2026-10-05",
  start: "17:00",
  endDate: "2026-10-05",
  end: "18:00",
  fixed: true,
  movable: true,
  projectId: null,
  project: "",
  client: "",
  done: false,
  note: "",
  amount: null,
  ...over,
});

const cal = (over: Partial<CalendarItem> = {}): CalendarItem => ({
  id: "a",
  source: "event",
  kind: "performance",
  title: "演出",
  date: "2026-10-05",
  time: "20:00",
  timeZone: "Asia/Taipei",
  location: "",
  projectId: null,
  notes: "",
  done: false,
  archived: false,
  travel: null,
  endDate: "",
  endTime: "21:00",
  ...over,
});

const data = (calendar: CalendarItem[], payments: Payment[] = [], projects: Project[] = []) =>
  ({ calendar, payments, projects, talent: { id: "t", name: "", timeZone: "Asia/Taipei" } }) as Pick<AppData, "calendar" | "payments" | "projects" | "talent">;

test("dates: weeks start on Monday; days roll over months", () => {
  assert.equal(weekStart("2026-10-04"), "2026-09-28"); // a Sunday
  assert.equal(weekStart("2026-10-05"), "2026-10-05");
  assert.equal(plusDays("2026-10-31", 1), "2026-11-01");
});

describe("moving", () => {
  test("keeps the length, across midnight too", () => {
    const moved = moveItem(item(), "2026-10-06", "09:15");
    assert.deepEqual([moved.start, moved.endDate, moved.end], ["09:15", "2026-10-06", "10:15"]);
    const late = moveItem(item(), "2026-10-05", "23:30");
    assert.deepEqual([late.endDate, late.end], ["2026-10-06", "00:30"]);
  });
  test("edges: a new end (on a later day too) or a new start; an edge never crosses the other", () => {
    assert.deepEqual([moveItem(item(), "2026-10-06", "01:00", "end").endDate, moveItem(item(), "2026-10-06", "01:00", "end").end], ["2026-10-06", "01:00"]);
    assert.equal(moveItem(item(), "2026-10-05", "16:30", "start").start, "16:30");
    assert.deepEqual(moveItem(item(), "2026-10-05", "16:00", "end"), item(), "an end before the start is refused");
    assert.equal(moveItem(item(), "2026-10-05", "18:30", "start").start, "17:00");
  });
  test("an item without an end keeps none (a length is never invented)", () => {
    assert.equal(moveItem(item({ endDate: "", end: "" }), "2026-10-06", "10:00").end, "");
  });
  test("validity: real dates, an end after the start, possibly on a later day", () => {
    assert.ok(validItem({ date: "2026-10-05", start: "09:00", endDate: "", end: "" }));
    assert.ok(validItem({ date: "2026-10-05", start: "22:00", endDate: "2026-10-06", end: "02:00" }));
    assert.ok(!validItem({ date: "2026-02-30", start: "", endDate: "", end: "" }));
    assert.ok(!validItem({ date: "2026-10-05", start: "10:00", endDate: "2026-10-05", end: "09:00" }));
  });
});

describe("placing on the grid", () => {
  test("an overnight item has a part on each day", () => {
    const night = item({ start: "22:00", endDate: "2026-10-06", end: "02:00" });
    assert.deepEqual(segment(night, "2026-10-05"), { from: 1320, to: 1440, open: false });
    assert.deepEqual(segment(night, "2026-10-06"), { from: 0, to: 120, open: false });
    assert.equal(segment(night, "2026-10-07"), null);
  });
  test("overlapping blocks share the width; separate ones get the whole column", () => {
    const lanes = layoutDay([
      { id: "a", from: 540, to: 600 },
      { id: "b", from: 570, to: 630 },
      { id: "c", from: 700, to: 760 },
    ]);
    assert.deepEqual([lanes.get("a"), lanes.get("b"), lanes.get("c")], [{ lane: 0, lanes: 2 }, { lane: 1, lanes: 2 }, { lane: 0, lanes: 1 }]);
  });
});

describe("conflicts", () => {
  test("overlapping timed items on the same day clash; touching ones don't", () => {
    const items = [item({ id: "b", start: "17:30", end: "19:00" }), item({ id: "c", start: "18:00", end: "19:00" })];
    assert.deepEqual(conflicts(item(), items).map((x) => x.id), ["b"]);
  });
  test("an overnight item clashes with one the next morning", () => {
    const night = item({ start: "22:00", endDate: "2026-10-06", end: "02:00" });
    assert.equal(conflicts(night, [item({ id: "m", date: "2026-10-06", start: "01:00", endDate: "2026-10-06", end: "03:00" })]).length, 1);
  });
  test("items without an end, done items, and other days never clash", () => {
    const items = [item({ id: "b", end: "", endDate: "" }), item({ id: "c", done: true }), item({ id: "d", date: "2026-10-06", endDate: "2026-10-06" })];
    assert.deepEqual(conflicts(item(), items), []);
  });
});

describe("planItems", () => {
  test("a project's events are fixed; the person's own events and to-dos are flexible; all movable in the talent's zone", () => {
    const items = planItems(data([cal({ projectId: "p" }), cal({ id: "own", time: "08:00", endTime: "09:00" }), cal({ id: "b", source: "todo", kind: "todo", time: "09:00", endTime: "" })]));
    const byId = (id: string) => items.find((i) => i.ref.id === id)!;
    assert.deepEqual([byId("a").fixed, byId("a").movable, byId("a").start, byId("a").endDate, byId("a").end], [true, true, "20:00", "2026-10-05", "21:00"]);
    assert.deepEqual([byId("own").fixed, byId("b").fixed, byId("b").movable], [false, false, true]);
  });

  test("an event can end on a later day", () => {
    const [x] = planItems(data([cal({ time: "22:00", endDate: "2026-10-06", endTime: "02:00" })]));
    assert.deepEqual([x.date, x.start, x.endDate, x.end], ["2026-10-05", "22:00", "2026-10-06", "02:00"]);
  });

  test("an item in another zone shows at the talent's time and isn't dragged", () => {
    const [x] = planItems(data([cal({ time: "20:00", endTime: "21:00", timeZone: "Asia/Tokyo" })]));
    assert.deepEqual([x.start, x.end, x.movable], ["19:00", "20:00", false]);
    assert.match(x.note, /Asia\/Tokyo/);
  });

  test("a trip is untimed with an arrival marker on its last day", () => {
    const trip = cal({
      kind: "travel",
      endTime: "",
      travel: { endDate: "2026-10-06", endTime: "08:00", endTimeZone: "Asia/Tokyo", transportMode: "flight", operator: "", serviceNumber: "", destination: "", seat: "", hotelName: "" },
    });
    const items = planItems(data([trip]));
    assert.deepEqual(items.map((i) => [i.date, i.start, i.movable]), [["2026-10-05", "", false], ["2026-10-06", "", false]]);
  });

  test("expected payments with a due date appear for signed work; not for talks still in progress", () => {
    const pay = (id: string, projectId: string | null): Payment => ({
      id, projectId, projectType: "gig", direction: "in", installment: "balance", label: "尾款", amount: 21000, currency: "TWD", taxRate: 0, taxIncluded: true,
      recordedDate: "2026-10-01", dueDate: "2026-10-10", status: "expected", settledAmount: null, settledDate: null, invoiceRef: "", notes: "", voided: false,
    });
    const project = (id: string, stage: Project["stage"]) => ({ id, stage, archived: false, title: id, counterparty: "" }) as Project;
    const items = planItems(data([], [pay("p1", "signed"), pay("p2", "talking"), pay("p3", null)], [project("signed", "signed"), project("talking", "negotiating")]));
    assert.deepEqual(items.map((i) => i.id), ["payment:p1", "payment:p3"]);
    assert.equal(items[0].amount, 21000);
  });
});
