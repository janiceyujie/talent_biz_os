// The assistant's answers worked out in code (decision 0023). Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { CalendarItem, Payment, ProjectSummary } from "@/lib/types";
import { outstandingMoney } from "@/lib/overview/money";
import { countedPayments } from "@/lib/domain/workflow";
import { ANSWER_LINES, dayOf, moneyAnswer, scheduleAnswer } from "./answers";

const TODAY = "2026-10-21";
const ZONE = "Asia/Taipei";

const project = (over: Partial<ProjectSummary> = {}) =>
  ({ id: "p1", title: "Zepp spring tour", counterparty: "Zepp", stage: "signed", archived: false, ...over }) as ProjectSummary;
const item = (over: Partial<CalendarItem> = {}): CalendarItem => ({
  id: "e1", source: "event", kind: "meeting", title: "Sound check", date: TODAY, time: "14:00", timeZone: ZONE, location: "",
  projectId: "p1", suggestedProjectId: null, notes: "", done: false, archived: false, travel: null, endDate: "", endTime: "", ...over,
});
const payment = (over: Partial<Payment> = {}): Payment => ({
  id: "x", projectId: "p1", projectType: "gig", direction: "in", installment: "regular", label: "Deposit", amount: 1000, currency: "TWD",
  taxRate: 0, taxIncluded: true, recordedDate: "2026-10-01", dueDate: "2026-10-25", status: "expected", receipts: [],
  settledDate: null, invoiceRef: "", notes: "", voided: false, ...over,
});
const receipt = (cash: number, withheld = 0) => ({ id: "r", date: "2026-10-10", cash, withheld, note: "", replacesId: null, withdrawn: false, recordedAt: "" });
const source = (calendar: CalendarItem[], payments: Payment[] = [], projects = [project()]) => ({ talent: { id: "t", name: "T", timeZone: ZONE }, calendar, payments, projects });

describe("dayOf", () => {
  test("today, and tomorrow across a month end", () => {
    assert.equal(dayOf("today", TODAY), TODAY);
    assert.equal(dayOf("tomorrow", "2026-10-31"), "2026-11-01");
  });
});

describe("scheduleAnswer", () => {
  test("the day's items in time order with their project; other days, finished to-dos, and archived items left out", () => {
    const got = scheduleAnswer(
      source([
        item({ id: "late", title: "Show", time: "20:00" }),
        item({ id: "early", title: "Rehearsal", time: "10:00" }),
        item({ id: "other-day", date: "2026-10-22" }),
        item({ id: "done", source: "todo", kind: "todo", title: "Send rider", time: "", done: true }),
        item({ id: "archived", archived: true }),
      ]),
      TODAY,
    );
    assert.equal(got.kind, "schedule");
    if (got.kind !== "schedule") return;
    assert.deepEqual(got.lines.map((l) => [l.start, l.title, l.project]), [["10:00", "Rehearsal", "Zepp spring tour"], ["20:00", "Show", "Zepp spring tour"]]);
    assert.equal(got.timeZone, ZONE);
    assert.equal(got.more, 0);
  });

  test("an event set in another zone lands on the talent's day: 23:30 in Tokyo the night before is 22:30 here", () => {
    const got = scheduleAnswer(source([item({ date: "2026-10-20", time: "23:30", timeZone: "Asia/Tokyo" })]), "2026-10-20");
    assert.deepEqual(got.kind === "schedule" && got.lines.map((l) => l.start), ["22:30"]);
  });

  test("money expected that day is on it, with its amount; unsigned deals' payments aren't", () => {
    const got = scheduleAnswer(
      source([], [payment({ dueDate: TODAY }), payment({ id: "y", projectId: "p2", dueDate: TODAY })], [project(), project({ id: "p2", stage: "negotiating" })]),
      TODAY,
    );
    assert.deepEqual(got.kind === "schedule" && got.lines.map((l) => [l.kind, l.amount]), [["payment", { value: 1000, currency: "TWD" }]]);
  });

  test("a long day stops at the limit and says how many more", () => {
    const many = Array.from({ length: ANSWER_LINES + 4 }, (_, i) => item({ id: `e${i}` }));
    const got = scheduleAnswer(source(many), TODAY);
    assert.equal(got.kind === "schedule" && got.lines.length, ANSWER_LINES);
    assert.equal(got.kind === "schedule" && got.more, 4);
  });

  test("nothing on: no lines", () => {
    const got = scheduleAnswer(source([]), TODAY);
    assert.deepEqual(got.kind === "schedule" && got.lines, []);
  });
});

describe("moneyAnswer", () => {
  test("what's left on each open payment, one total per currency, earliest due first; overdue counted on its own", () => {
    const payments = [
      payment({ id: "a", label: "Balance", dueDate: "2026-11-30", amount: 5000 }),
      payment({ id: "b", label: "Deposit", dueDate: "2026-10-01", amount: 3000, receipts: [receipt(1000, 200)] }), // part arrived, part withheld
      payment({ id: "c", label: "Licence", currency: "USD", amount: 800, dueDate: null }),
    ];
    const got = moneyAnswer(payments, [project()], TODAY, "in");
    assert.equal(got.kind, "money");
    if (got.kind !== "money") return;
    assert.deepEqual(got.totals, [{ currency: "TWD", amount: 6800 }, { currency: "USD", amount: 800 }]);
    assert.deepEqual(got.overdue, [{ currency: "TWD", amount: 1800 }]);
    assert.deepEqual(got.lines.map((l) => [l.label, l.amount, l.overdue]), [["Deposit", 1800, true], ["Balance", 5000, false], ["Licence", 800, false]]);
  });

  test("totals match Today's money widget", () => {
    const projects = [project(), project({ id: "p2", stage: "offer" })];
    const payments = [payment({ id: "a" }), payment({ id: "b", projectId: "p2" }), payment({ id: "c", projectId: null, currency: "JPY", amount: 5000 }), payment({ id: "d", voided: true })];
    const widget = outstandingMoney(countedPayments(payments, projects), TODAY);
    const got = moneyAnswer(payments, projects, TODAY, "in");
    assert.deepEqual(got.kind === "money" && got.totals, widget.toReceive);
  });

  test("payables are the outgoing ones; settled, cancelled, and void ones are left out", () => {
    const payments = [
      payment({ id: "out", direction: "out", label: "Editor", amount: 2000 }),
      payment({ id: "in", direction: "in" }),
      payment({ id: "paid", direction: "out", status: "settled", receipts: [receipt(2000)] }),
      payment({ id: "cancelled", direction: "out", status: "cancelled" }),
      payment({ id: "void", direction: "out", voided: true }),
    ];
    const got = moneyAnswer(payments, [project()], TODAY, "out");
    assert.deepEqual(got.kind === "money" && got.lines.map((l) => l.label), ["Editor"]);
  });

  test("a payment with no project, and one whose project isn't loaded, still count, without a project name", () => {
    const got = moneyAnswer([payment({ projectId: null })], [], TODAY, "in");
    assert.deepEqual(got.kind === "money" && got.lines.map((l) => l.project), [""]);
  });

  test("nothing open: no totals", () => {
    const got = moneyAnswer([], [], TODAY, "in");
    assert.deepEqual(got.kind === "money" && [got.totals, got.lines, got.more], [[], [], 0]);
  });
});
