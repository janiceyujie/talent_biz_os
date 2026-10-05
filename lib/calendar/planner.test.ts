// The day and week calendar's rules. Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AppData, CalendarItem, Payment, Project } from "@/lib/types";
import { conflicts, moveItem, planItems, plusDays, validItem, weekStart, type PlanItem } from "./planner";

const item = (over: Partial<PlanItem> = {}): PlanItem => ({
  id: "event:a",
  ref: { source: "event", id: "a" },
  title: "Soundcheck",
  kind: "meeting",
  date: "2026-10-05",
  start: "17:00",
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
  test("keeps the length; a resize sets the end on the same day", () => {
    assert.deepEqual([moveItem(item(), "2026-10-06", "09:15").start, moveItem(item(), "2026-10-06", "09:15").end], ["09:15", "10:15"]);
    assert.equal(moveItem(item(), "2026-10-05", "19:30", true).end, "19:30");
  });
  test("an item without an end keeps none (a length is never invented)", () => {
    assert.equal(moveItem(item({ end: "" }), "2026-10-06", "10:00").end, "");
  });
  test("validity: real dates, an end after the start", () => {
    assert.ok(validItem({ date: "2026-10-05", start: "09:00", end: "" }));
    assert.ok(!validItem({ date: "2026-02-30", start: "", end: "" }));
    assert.ok(!validItem({ date: "2026-10-05", start: "10:00", end: "09:00" }));
  });
});

describe("conflicts", () => {
  test("overlapping timed items on the same day clash; touching ones don't", () => {
    const items = [item({ id: "b", start: "17:30", end: "19:00" }), item({ id: "c", start: "18:00", end: "19:00" })];
    assert.deepEqual(conflicts(item(), items).map((x) => x.id), ["b"]);
  });
  test("items without an end, done items, and other days never clash", () => {
    const items = [item({ id: "b", end: "" }), item({ id: "c", done: true }), item({ id: "d", date: "2026-10-06" })];
    assert.deepEqual(conflicts(item(), items), []);
  });
});

describe("planItems", () => {
  test("events are fixed, to-dos flexible; both movable in the talent's zone", () => {
    const [e, t] = planItems(data([cal(), cal({ id: "b", source: "todo", kind: "todo", time: "09:00", endTime: "" })])).sort((x, y) => x.start.localeCompare(y.start)).reverse();
    assert.deepEqual([e.fixed, e.movable, e.start, e.end], [true, true, "20:00", "21:00"]);
    assert.deepEqual([t.fixed, t.movable], [false, true]);
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
