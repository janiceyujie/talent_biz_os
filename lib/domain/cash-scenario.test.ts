import assert from "node:assert/strict";
import test from "node:test";
import { cashScenarioExample } from "./cash-scenario-example";
import { cashScenario } from "./cash-scenario";
import type { Payment } from "@/lib/types";

const payment = (overrides: Partial<Payment> = {}): Payment => ({
  id: "test", projectId: null, projectType: "other", direction: "in", installment: "regular",
  label: "Test payment", amount: 100, currency: "TWD", taxRate: 5, taxIncluded: false,
  recordedDate: "2026-10-01", dueDate: "2026-10-31", status: "expected", settledAmount: null,
  settledDate: null, invoiceRef: "", notes: "", voided: false, ...overrides,
});
const paymentInCurrency = (currency: string, overrides: Partial<Payment> = {}): Payment =>
  ({ ...payment(overrides), currency } as Payment);
const assumptions = { opening: 1000, delayDays: 0, collectionPercent: 100, extraPer30Days: 0 };

test("cash scenarios include due-today and boundary payments, with tax and scheduled outgoing cash", () => {
  const report = cashScenario([
    payment({ dueDate: "2026-10-01" }), payment(),
    payment({ direction: "out", amount: 50, taxIncluded: true }),
    payment({ dueDate: "2026-11-01", amount: 200 }),
  ], "2026-10-01", assumptions);
  assert.deepEqual(report.points.map(p => p.base), [1160, 1370, 1370]);
  assert.deepEqual(report.points.map(p => p.scenario), [1160, 1370, 1370]);
});

test("delays only move incoming cash; collection reductions and extra expenses accumulate", () => {
  const report = cashScenario([payment(), payment({ direction: "out", amount: 20, taxIncluded: true })], "2026-10-01",
    { ...assumptions, delayDays: 7, collectionPercent: 50, extraPer30Days: 100 });
  assert.deepEqual(report.points.map(p => p.base), [1085, 1085, 1085]);
  assert.deepEqual(report.points.map(p => p.scenario), [880, 832.5, 732.5]);
  assert.deepEqual(report.points.map(p => p.scenarioIncoming), [0, 52.5, 52.5]);
  assert.deepEqual(report.points.map(p => p.extraCosts), [100, 200, 300]);
  assert.deepEqual(report.points.map(p => p.outgoing), [20, 20, 20]);
});

test("overdue and undated obligations are disclosed, never guessed; settled, void and cancelled are excluded", () => {
  const report = cashScenario([
    payment({ dueDate: "2026-09-30" }), payment({ dueDate: null, direction: "out" }),
    payment({ status: "settled" }), payment({ voided: true }), payment({ status: "cancelled" }),
  ], "2026-10-01", assumptions);
  assert.equal(report.excludedCount, 2);
  assert.equal(report.excludedIn, 105);
  assert.equal(report.excludedOut, 105);
  assert.equal(report.scheduledCount, 0);
  assert.deepEqual(report.points.map(p => p.scenario), [1000, 1000, 1000]);
});

test("empty ledgers preserve negative opening cash; tiny amounts round per payment without float drift", () => {
  assert.deepEqual(cashScenario([], "2026-10-01", { ...assumptions, opening: -10, extraPer30Days: 2 }).points.map(p => p.scenario), [-12, -14, -16]);
  const report = cashScenario(Array.from({ length: 100 }, () => payment({ amount: 0.1, taxRate: 0 })), "2026-10-01", { ...assumptions, opening: 0, collectionPercent: 50 });
  assert.equal(report.points[0].base, 10);
  assert.equal(report.points[0].scenario, 5);
});

test("example explains delayed collection without mixing workspace records", () => {
  for (const today of ["2026-10-09", "2026-12-25"]) {
    const payments = cashScenarioExample(today);
    const onTime = cashScenario(payments, today, { ...assumptions, opening: 50000 });
    const delayed = cashScenario(payments, today, { ...assumptions, opening: 50000, delayDays: 30 });
    assert.equal(onTime.points[0].scenario, 160250);
    assert.equal(delayed.points[0].scenario, 4850);
    assert.equal(delayed.points[1].scenario, 130850);
    assert.equal(delayed.points[2].scenario, 160250);
    assert.equal(payments.length, 14);
    assert.equal(onTime.scheduledCount, 12);
    assert.equal(onTime.excludedCount, 2);
    assert.equal(onTime.excludedIn, 21000);
    assert.equal(onTime.excludedOut, 5250);
    assert.ok(payments.every(p => p.id.startsWith("cash-demo-") && p.notes.includes("not a real")));
  }
});


test("cash totals stay in TWD and disclose other currencies instead of mixing them", () => {
  const report = cashScenario([
    paymentInCurrency("TWD", { id: "twd", dueDate: "2026-10-15", amount: 1000 }),
    paymentInCurrency("USD", { id: "usd", dueDate: "2026-10-15", amount: 1000 }),
    paymentInCurrency("EUR", { id: "eur", direction: "out", dueDate: "2026-10-20", amount: 500 }),
  ], "2026-10-01", assumptions);
  assert.equal(report.points[0].base, 2050);
  assert.equal(report.excludedCurrencyCount, 2);
  assert.deepEqual(report.excludedCurrencies, ["EUR", "USD"]);
});

test("a selected foreign currency is included and JPY uses whole-yen precision", () => {
  const report = cashScenario([
    payment({ id: "yen", currency: "JPY", dueDate: "2026-10-15", amount: 1000, taxRate: 5 }),
    payment({ id: "dollars", currency: "USD", dueDate: "2026-10-15", amount: 1000 }),
  ], "2026-10-01", { ...assumptions, opening: 5000, currency: "JPY" });
  assert.equal(report.points[0].base, 6050);
  assert.equal(report.scheduledCount, 1);
  assert.deepEqual(report.excludedCurrencies, ["USD"]);
});
