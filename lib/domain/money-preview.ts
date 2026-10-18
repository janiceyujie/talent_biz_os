import { minorUnitFactor, minorUnits, quote, supportedCurrencies } from "./money";

function draftNumber(value: unknown) {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Incomplete form values must never appear as a confirmed zero total. */
export function moneyPreview(amount: unknown, rate: unknown, included: boolean, currency: string) {
  const a = draftNumber(amount), r = draftNumber(rate);
  if (a === null || r === null || a > 9_999_999_999.99 || r > 100 ||
      !supportedCurrencies.some(value => value === currency)) return null;
  return quote(a, r, included, currency);
}

/** Positive means more cash than billed; null means the user has not supplied a valid actual amount. */
export function settlementDifference(actual: unknown, total: number, currency: string) {
  const amount = draftNumber(actual);
  if (amount === null || amount > 9_999_999_999.99) return null;
  return (minorUnits(amount, currency) - minorUnits(total, currency)) / minorUnitFactor(currency);
}
