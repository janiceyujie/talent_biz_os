// Today's widgets: arrangement and each widget's data. Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { InboxMessage, Payment, Project } from "@/lib/types";
import { monthIncome } from "./income";
import { outstandingMoney } from "./money";
import { editableLayout, moveWidget, overviewLayout, toSavedLayout } from "./layout";
import { pipeline } from "./pipeline";
import { stalledDeals } from "./stalled";

const TODAY = "2026-10-06";
const ZONE = "Asia/Taipei";

const project = (over: Partial<Project> = {}): Project =>
  ({ id: "p1", title: "Zepp 春季巡演", stage: "negotiating", archived: false, updatedAt: "2026-09-20T02:00:00Z", ...over }) as Project;
const message = (projectId: string, receivedAt: string) => ({ id: `m-${receivedAt}`, projectId, receivedAt }) as InboxMessage;
const payment = (over: Partial<Payment> = {}): Payment =>
  ({
    id: "x", projectId: null, projectType: "gig", direction: "in", installment: "regular", label: "", amount: 1000, currency: "TWD",
    taxRate: 0, taxIncluded: true, recordedDate: "2026-10-01", dueDate: null, status: "settled", settledAmount: null,
    settledDate: "2026-10-02", invoiceRef: "", notes: "", voided: false, ...over,
  }) as Payment;

describe("overviewLayout", () => {
  test("defaults per role, split into columns", () => {
    assert.deepEqual(overviewLayout("musician"), { main: ["actions", "stalled", "pipeline"], side: ["schedule", "money", "income"] });
    assert.deepEqual(overviewLayout("manager").main, ["actions", "pipeline", "stalled"]);
  });

  test("a saved order and hidden widgets apply; unknown ids are ignored; widgets the save doesn't mention still show", () => {
    const got = overviewLayout("musician", { version: 1, order: ["pipeline", "gone-widget", "actions"], hidden: ["income", "also-gone"] });
    assert.deepEqual(got, { main: ["pipeline", "actions", "stalled"], side: ["schedule", "money"] });
  });
});

describe("editing the layout", () => {
  test("one list across both columns: three spots in main, the rest in the side", () => {
    const start = editableLayout("musician", { version: 1, hidden: ["income"] });
    assert.deepEqual(start.map((w) => w.id), ["actions", "stalled", "pipeline", "schedule", "money", "income"]);
    assert.deepEqual(start.at(-1), { id: "income", hidden: true });
  });

  test("moving the side's first widget up swaps it with the main's last; each column keeps three spots", () => {
    const start = editableLayout("musician");
    const up = moveWidget(start, 3, 2); // Schedule into the main column; Deals by phase down into the side
    assert.deepEqual(overviewLayout("musician", toSavedLayout(up)), { main: ["actions", "stalled", "schedule"], side: ["pipeline", "money", "income"] });
    const down = moveWidget(start, 2, 3); // and the other way
    assert.deepEqual(overviewLayout("musician", toSavedLayout(down)), { main: ["actions", "stalled", "schedule"], side: ["pipeline", "money", "income"] });
    assert.equal(moveWidget(start, 0, -1), start, "can't move past the top");
  });

  test("a hidden widget keeps its spot, so the others don't change columns", () => {
    const saved = toSavedLayout(editableLayout("musician", { version: 1, hidden: ["stalled"] }));
    assert.deepEqual(saved, { version: 1, order: ["actions", "stalled", "pipeline", "schedule", "money", "income"], hidden: ["stalled"] });
    assert.deepEqual(overviewLayout("musician", saved), { main: ["actions", "pipeline"], side: ["schedule", "money", "income"] });
  });
});

describe("stalledDeals", () => {
  test("negotiating deals with no edit or message for a week, quietest first", () => {
    const quiet = project({ id: "a", title: "A", updatedAt: "2026-09-20T02:00:00Z" });
    const quieter = project({ id: "b", title: "B", updatedAt: "2026-09-01T02:00:00Z" });
    const recent = project({ id: "c", title: "C", updatedAt: "2026-10-04T02:00:00Z" });
    const got = stalledDeals({ projects: [quiet, quieter, recent], inbox: [], today: TODAY, timeZone: ZONE });
    assert.deepEqual(
      got.map((d) => [d.project.id, d.quietDays]),
      [["b", 35], ["a", 16]],
    );
  });

  test("a recent message about the deal counts as news", () => {
    const got = stalledDeals({ projects: [project()], inbox: [message("p1", "2026-10-05T03:00:00Z")], today: TODAY, timeZone: ZONE });
    assert.deepEqual(got, []);
  });

  test("signed, ended, and archived deals aren't chased", () => {
    const got = stalledDeals({
      projects: [project({ id: "s", stage: "signed" }), project({ id: "d", stage: "declined" }), project({ id: "x", archived: true })],
      inbox: [],
      today: TODAY,
      timeZone: ZONE,
    });
    assert.deepEqual(got, []);
  });
});

describe("pipeline", () => {
  test("live projects per phase; closed, archived, and ended ones left out", () => {
    const got = pipeline([
      project({ stage: "offer" }),
      project({ stage: "negotiating" }),
      project({ stage: "in_progress" }),
      project({ stage: "collecting_payment" }),
      project({ stage: "closed" }),
      project({ stage: "declined" }),
      project({ stage: "signed", archived: true }),
    ]);
    assert.deepEqual(got, [
      { phase: "negotiation", count: 2 },
      { phase: "execution", count: 1 },
      { phase: "settlement", count: 1 },
    ]);
  });
});

describe("monthIncome", () => {
  test("cash received this month and last month; expected, outgoing, and voided rows don't count", () => {
    const got = monthIncome(
      {
        payments: [
          payment({ amount: 1000, settledDate: "2026-10-02" }),
          payment({ amount: 500, settledAmount: 450, settledDate: "2026-10-05" }),
          payment({ amount: 2000, settledDate: "2026-09-30" }),
          payment({ amount: 9999, status: "expected", settledDate: null }),
          payment({ amount: 300, direction: "out", settledDate: "2026-10-03" }),
          payment({ amount: 700, voided: true, settledDate: "2026-10-03" }),
        ],
      },
      TODAY,
    );
    assert.deepEqual(got, { thisMonth: 1450, lastMonth: 2000 });
  });
});

describe("outstandingMoney", () => {
  test("overdue, due this week, and outstanding in; outgoing separately; settled and voided rows don't count", () => {
    const got = outstandingMoney(
      [
        payment({ amount: 9000, status: "expected", dueDate: "2026-10-01", settledDate: null }),
        payment({ amount: 1000, status: "expected", dueDate: "2026-10-12", settledDate: null }),
        payment({ amount: 21000, status: "expected", dueDate: "2026-11-05", settledDate: null }),
        payment({ amount: 500, status: "expected", direction: "out", dueDate: "2026-10-08", settledDate: null }),
        payment({ amount: 4000, status: "settled" }),
        payment({ amount: 800, status: "expected", voided: true, dueDate: "2026-10-01", settledDate: null }),
      ],
      TODAY,
    );
    assert.deepEqual(got, { overdue: 9000, thisWeek: 1000, toReceive: 31000, toPay: 500 });
  });
});
