import { test } from "node:test";
import assert from "node:assert/strict";
import { moneyPreview, settlementDifference } from "./money-preview";
import { paymentCash } from "./workflow";
import type { Payment } from "../types";

test("tax-inclusive and exclusive previews agree with ledger cash", () => {
  for (const [included, expected] of [[true, 55500], [false, 58275]] as const) {
    const totals = moneyPreview(55500, 5, included, "TWD")!;
    assert.equal(totals.total, expected);
    assert.equal(totals.net + totals.tax, totals.total);
    assert.equal(paymentCash({ amount: 55500, taxRate: 5, taxIncluded: included, currency: "TWD", status: "settled", settledAmount: null,receipts:[{id:"receipt",date:"2026-10-01",cash:expected,withheld:0}] } as Payment), totals.total);
  }
});

test("blank and invalid inputs are not presented as zero totals", () => {
  for (const amount of ["", " ", undefined, null, false, NaN, Infinity, -1, 1e20]) assert.equal(moneyPreview(amount, 5, false, "USD"), null);
  for (const rate of ["", null, NaN, Infinity, -1, 101]) assert.equal(moneyPreview(100, rate, false, "USD"), null);
  assert.equal(moneyPreview(100, 5, false, "INVALID"), null);
  assert.deepEqual(moneyPreview(0, 0, false, "USD"), { net: 0, tax: 0, total: 0 });
});

test("differences distinguish blank, zero, shortfall and excess in minor units", () => {
  assert.equal(settlementDifference("", 55500, "TWD"), null);
  assert.equal(settlementDifference(NaN, 55500, "TWD"), null);
  assert.equal(settlementDifference(0, 55500, "TWD"), -55500);
  assert.equal(settlementDifference(55000, 55500, "TWD"), -500);
  assert.equal(settlementDifference(56000, 55500, "TWD"), 500);
  assert.equal(settlementDifference(55500, 55500, "TWD"), 0);
  assert.equal(settlementDifference(0.3, 0.1 + 0.2, "USD"), 0);
});

test("currency rounding and fractional percentage rates use the shared quote rules", () => {
  assert.deepEqual(moneyPreview(100, 8.875, false, "USD"), { net: 100, tax: 8.88, total: 108.88 });
  assert.deepEqual(moneyPreview(1001, 5, true, "JPY"), { net: 953, tax: 48, total: 1001 });
  assert.equal(settlementDifference(1000, 1001, "JPY"), -1);
  assert.deepEqual(moneyPreview("55500", "5", true, "TWD"), { net: 52857.14, tax: 2642.86, total: 55500 });
});
