// Money and tax arithmetic, done in minor units (cents; whole yen) so that
// net + tax always equals total. Ported from the prototype's domain rules.

/** ISO currencies supported for recording and same-currency financial views. */
export const supportedCurrencies = ["TWD", "HKD", "USD", "JPY", "EUR", "GBP"] as const;
export type Currency = (typeof supportedCurrencies)[number];

/** Currency for display in a UI locale: TWD reads "$21,000.00" in zh-TW, "NT$21,000.00" in en. */
export const money = (n: number, locale: string, currency = "TWD") =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "JPY" ? 0 : 2,
  }).format(n);

export const minorUnitFactor = (currency: string) => (currency === "JPY" ? 1 : 100);

export function minorUnits(amount: number, currency: string) {
  return Number(amount.toFixed(currency === "JPY" ? 0 : 2).replace(".", ""));
}

export function totalsByCurrency<T extends { currency: Currency }>(rows: T[], amount: (row: T) => number) {
  const totals = new Map<Currency, number>();
  for (const row of rows) totals.set(row.currency, (totals.get(row.currency) ?? 0) + minorUnits(amount(row), row.currency));
  return supportedCurrencies.flatMap((currency) => totals.has(currency)
    ? [{ currency, amount: totals.get(currency)! / minorUnitFactor(currency) }]
    : []);
}

/** Net, tax, and total for an amount entered with or without tax. */
export function quote(amount: number, rate: number, included: boolean, currency = "TWD") {
  const scale = minorUnitFactor(currency);
  const units = minorUnits(amount, currency);
  // Rates are converted to integer basis points before multiplying to avoid
  // binary float rounding at half-unit tax boundaries.
  const basis = BigInt(Math.round(rate * 100));
  const base = BigInt(10000);
  const round = (n: bigint, d: bigint) => Number((n * BigInt(2) + d) / (d * BigInt(2)));
  const net = included ? round(BigInt(units) * base, base + basis) : units;
  const total = included ? units : units + round(BigInt(units) * basis, base);
  return { net: net / scale, tax: (total - net) / scale, total: total / scale };
}

/** Why a split was refused; callers word it in the user's language. */
export class SplitError extends Error {
  constructor(public code: "splitInvalid" | "splitPartsPositive") {
    super(code);
  }
}

/** Split a tax-inclusive total into deposit and balance; the balance absorbs rounding. */
export function splitPayments(total: number, percent: number, currency = "TWD") {
  const scale = minorUnitFactor(currency);
  const units = minorUnits(total, currency);
  if (!Number.isFinite(percent) || percent <= 0 || percent >= 100 || units <= 1)
    throw new SplitError("splitInvalid");
  const deposit = Number((BigInt(units) * BigInt(Math.round(percent * 100)) + BigInt(5000)) / BigInt(10000));
  if (deposit <= 0 || deposit >= units) throw new SplitError("splitPartsPositive");
  return { deposit: deposit / scale, balance: (units - deposit) / scale, total: units / scale };
}
