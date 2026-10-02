// Money and tax arithmetic, done in minor units (cents; whole yen) so that
// net + tax always equals total. Ported from the prototype's domain rules.

export const money = (n: number, currency = "TWD") =>
  new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "JPY" ? 0 : 2,
  }).format(n);

const scaleOf = (currency: string) => (currency === "JPY" ? 1 : 100);

export function minorUnits(amount: number, currency: string) {
  return Number(amount.toFixed(currency === "JPY" ? 0 : 2).replace(".", ""));
}

/** Net, tax, and total for an amount entered with or without tax. */
export function quote(amount: number, rate: number, included: boolean, currency = "TWD") {
  const scale = scaleOf(currency);
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

/** Split a tax-inclusive total into deposit and balance; the balance absorbs rounding. */
export function splitPayments(total: number, percent: number, currency = "TWD") {
  const scale = scaleOf(currency);
  const units = minorUnits(total, currency);
  if (!Number.isFinite(percent) || percent <= 0 || percent >= 100 || units <= 1)
    throw new Error("請設定正數報價與 0–100% 之間的訂金比例。");
  const deposit = Number((BigInt(units) * BigInt(Math.round(percent * 100)) + BigInt(5000)) / BigInt(10000));
  if (deposit <= 0 || deposit >= units) throw new Error("拆分後訂金與尾款都必須大於零。");
  return { deposit: deposit / scale, balance: (units - deposit) / scale, total: units / scale };
}
