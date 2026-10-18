import assert from "node:assert/strict";
import test from "node:test";
import { workspaceSamples } from "@/lib/ai/workspace-samples";
import type { AppData, Payment } from "@/lib/types";
import { financeInsights } from "./insights";
import { supportedCurrencies } from "./money";
import { projectSettlement, summarize } from "./workflow";

const sample = workspaceSamples({} as AppData);
const payment = (currency: Payment["currency"], overrides: Partial<Payment> = {}): Payment => ({
  ...sample.payments[0], id: currency, projectId: "test-project", currency,
  amount: 1000, taxRate: 5, taxIncluded: false, status: "settled", settledAmount: 1050,
  settledDate: "2026-10-07", ...overrides,
});

test("finance totals and ledger rows stay scoped to each of the six recorded currencies", () => {
  const payments = supportedCurrencies.flatMap(currency => [
    payment(currency), payment(currency, { id: `${currency}-pending`, status: "expected", settledAmount: null, settledDate: null }),
    payment(currency, { id: `${currency}-void`, voided: true }),
  ]);
  for (const currency of supportedCurrencies) {
    const report = summarize({ payments }, "", "9999-12-31", currency);
    assert.equal(report.received, 1050);
    assert.equal(report.receivable, 1050);
    assert.equal(report.rows.length, 2);
    assert.ok(report.rows.every(row => row.currency === currency));
  }
});

test("foreign-currency insights and project settlement use whole yen without mixing dollar payments", () => {
  const project = { ...sample.projects[0], id: "test-project", currency: "JPY" as const, quotedAmount: 2000 };
  const data = { ...sample, projects: [project], payments: [payment("JPY"), payment("USD")] };
  const insights = financeInsights(data, new Date("2026-10-07T12:00:00Z"), "JPY");
  assert.equal(insights.contracted, 2100);
  assert.equal(insights.unbilled, 1050);
  assert.equal(insights.monthly.at(-1)?.received, 1050);
  assert.equal(financeInsights(data, new Date("2026-10-07T12:00:00Z"), "USD").contracted, 0);
  const settlement = projectSettlement(data, project);
  assert.equal(settlement.received, 1050);
  assert.equal(settlement.unbilled, 1050);
});
