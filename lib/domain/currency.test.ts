// Amounts in more than one currency: recorded as they are, totalled apart, never converted. Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AppData, Payment, ProjectSummary } from "@/lib/types";
import { financeInsights, partnerInsights } from "./insights";
import { quote, splitPayments, totalsByCurrency } from "./money";
import { projectSettlement, summarize } from "./workflow";

// A settled one received its settled amount, or its whole total, on its settled date: one receipt.
const payment = ({ settledAmount = null, ...over }: Partial<Payment> & { settledAmount?: number | null } = {}): Payment => {
  const p = {
    id: "x", projectId: "p1", projectType: "gig", direction: "in", installment: "regular", label: "", amount: 1000, currency: "TWD",
    taxRate: 0, taxIncluded: true, recordedDate: "2026-10-01", dueDate: null, status: "settled",
    settledDate: "2026-10-02", invoiceRef: "", notes: "", voided: false, receipts: [], ...over,
  } as Payment;
  const cash = settledAmount ?? quote(p.amount, p.taxRate, p.taxIncluded, p.currency).total;
  const receipt = { id: `${p.id}-r`, date: p.settledDate!, cash, withheld: 0, note: "", replacesId: null, withdrawn: false, recordedAt: "" };
  return over.receipts || p.status !== "settled" ? p : { ...p, receipts: [receipt] };
};
const project = (over: Partial<ProjectSummary> = {}): ProjectSummary =>
  ({ id: "p1", title: "Tokyo show", stage: "signed", archived: false, quotedAmount: 3000, currency: "TWD", taxRate: 0, taxIncluded: true, clientId: "o1", ...over }) as ProjectSummary;
const data = (payments: Payment[], projects: ProjectSummary[] = [project()]) =>
  ({ talent: { id: "t", name: "", timeZone: "Asia/Taipei" }, payments, projects, calendar: [], organizations: [{ id: "o1", name: "Org", archived: false }] }) as unknown as AppData;

describe("totalsByCurrency", () => {
  test("one total per currency present, in the supported order, summed in minor units", () => {
    const rows = [payment({ currency: "USD", amount: 0.1 }), payment({ amount: 500 }), payment({ currency: "USD", amount: 0.2 })];
    assert.deepEqual(totalsByCurrency(rows, (p) => p.amount), [
      { currency: "TWD", amount: 500 },
      { currency: "USD", amount: 0.3 },
    ]);
    assert.deepEqual(totalsByCurrency([], (p: Payment) => p.amount), []);
  });
});

describe("yen", () => {
  test("tax and splits round to whole yen", () => {
    assert.deepEqual(quote(1001, 10, false, "JPY"), { net: 1001, tax: 100, total: 1101 });
    assert.deepEqual(splitPayments(1001, 50, "JPY"), { deposit: 501, balance: 500, total: 1001 });
  });
});

describe("summarize", () => {
  test("only the chosen currency's payments count", () => {
    const d = data([payment({ amount: 1000 }), payment({ currency: "USD", amount: 40 }), payment({ currency: "JPY", amount: 5000, status: "expected" })]);
    assert.equal(summarize(d).received, 1000);
    assert.equal(summarize(d, "", "9999-12-31", "USD").received, 40);
    assert.equal(summarize(d, "", "9999-12-31", "JPY").receivable, 5000);
    assert.deepEqual(summarize(d, "", "9999-12-31", "USD").rows.map((p) => p.currency), ["USD"]);
  });
});

describe("projectSettlement", () => {
  test("settles in the project's currency; income in another is totalled apart, not set against the quote", () => {
    const p = project({ currency: "JPY", quotedAmount: 3000 });
    const s = projectSettlement(data([payment({ currency: "JPY", amount: 1000 }), payment({ currency: "USD", amount: 20 })], [p]), p);
    assert.equal(s.received, 1000);
    assert.equal(s.unbilled, 2000);
    assert.deepEqual(s.otherIncome, [{ currency: "USD", amount: 20 }]);
  });
});

describe("insights", () => {
  test("finance insights take the projects quoted in, and the payments recorded in, one currency", () => {
    const projects = [project(), project({ id: "p2", currency: "USD", quotedAmount: 100 })];
    const d = data([payment({ amount: 1000 }), payment({ id: "u", projectId: "p2", currency: "USD", amount: 30 })], projects);
    const now = new Date("2026-10-07T04:00:00Z");
    assert.deepEqual([financeInsights(d, now).contracted, financeInsights(d, now).unbilled], [3000, 2000]);
    assert.deepEqual([financeInsights(d, now, "USD").contracted, financeInsights(d, now, "USD").unbilled], [100, 70]);
    assert.equal(financeInsights(d, now, "USD").monthly.at(-1)?.received, 30);
  });

  test("a partner's overdue money is one total per currency", () => {
    const d = data([
      payment({ status: "expected", settledDate: null, dueDate: "2026-09-01", amount: 1000 }),
      payment({ id: "u", status: "expected", settledDate: null, dueDate: "2026-09-01", currency: "USD", amount: 30 }),
    ]);
    assert.deepEqual(partnerInsights(d, new Date("2026-10-07T04:00:00Z"))[0].overdueAmount, [
      { currency: "TWD", amount: 1000 },
      { currency: "USD", amount: 30 },
    ]);
  });
});
