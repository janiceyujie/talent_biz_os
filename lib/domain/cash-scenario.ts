import type { Payment } from "@/lib/types";
import { minorUnitFactor, minorUnits } from "./money";
import { paymentTotal } from "./workflow";

export type CashAssumptions = { opening: number; delayDays: number; collectionPercent: number; extraPer30Days: number; currency?: Payment["currency"] };
const dayNumber = (date: string) => Date.parse(`${date}T12:00:00Z`) / 86400000;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));

/** A what-if calculation, not a bank balance or a probability-based forecast. */
export function cashScenario(payments: Payment[], today: string, assumptions: CashAssumptions) {
  const start = dayNumber(today);
  const currency = assumptions.currency ?? "TWD";
  const factor = minorUnitFactor(currency);
  const opening = minorUnits(clamp(assumptions.opening, -1e12, 1e12), currency);
  const delay = Math.round(clamp(assumptions.delayDays, 0, 90));
  const fraction = clamp(assumptions.collectionPercent, 0, 100) / 100;
  const extra = minorUnits(clamp(assumptions.extraPer30Days, 0, 1e12), currency);
  const pending = payments.filter(p => !p.voided && p.status === "expected");
  const otherCurrency = pending.filter(p => p.currency !== currency);
  const eligible = pending.filter(p => p.currency === currency);
  const excluded = eligible.filter(p => !p.dueDate || !Number.isFinite(dayNumber(p.dueDate)) || dayNumber(p.dueDate) < start);
  const scheduled = eligible.filter(p => !excluded.includes(p)).map(p => ({
    day: Math.round(dayNumber(p.dueDate!) - start), direction: p.direction,
    amount: minorUnits(paymentTotal(p), p.currency),
  }));
  const points = [30, 60, 90].map(days => {
    const through = scheduled.filter(p => p.day <= days);
    const incoming = through.filter(p => p.direction === "in").reduce((sum, p) => sum + p.amount, 0);
    const outgoing = through.filter(p => p.direction === "out").reduce((sum, p) => sum + p.amount, 0);
    const scenarioIncoming = scheduled.filter(p => p.direction === "in" && p.day + delay <= days)
      .reduce((sum, p) => sum + Math.round(p.amount * fraction), 0);
    const extraCosts = extra * (days / 30);
    return { days, incoming: incoming / factor, outgoing: outgoing / factor,
      scenarioIncoming: scenarioIncoming / factor, extraCosts: extraCosts / factor,
      base: (opening + incoming - outgoing) / factor,
      scenario: (opening + scenarioIncoming - outgoing - extraCosts) / factor };
  });
  return { points, excludedCount: excluded.length, scheduledCount: scheduled.length,
    excludedCurrencyCount: otherCurrency.length, excludedCurrencies: [...new Set(otherCurrency.map(p => p.currency))].sort(),
    excludedIn: excluded.filter(p => p.direction === "in").reduce((sum, p) => sum + minorUnits(paymentTotal(p), p.currency), 0) / factor,
    excludedOut: excluded.filter(p => p.direction === "out").reduce((sum, p) => sum + minorUnits(paymentTotal(p), p.currency), 0) / factor };
}
