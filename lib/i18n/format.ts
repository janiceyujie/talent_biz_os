"use client";

import { useLocale } from "next-intl";
import { money } from "@/lib/domain/money";

/** money() bound to the active UI locale. */
export function useMoney() {
  const locale = useLocale();
  return (n: number, currency = "TWD") => money(n, locale, currency);
}

/** Per-currency totals (totalsByCurrency) side by side, "NT$1,000 · US$200"; zero when there are none. */
export function useMoneyTotals() {
  const locale = useLocale();
  return (totals: { currency: string; amount: number }[]) =>
    totals.length ? totals.map((x) => money(x.amount, locale, x.currency)).join(" · ") : money(0, locale);
}

/** A currency's name in the active UI locale, from the browser's own data ("New Taiwan Dollar"). */
export function useCurrencyName() {
  const locale = useLocale();
  const names = new Intl.DisplayNames([locale], { type: "currency" });
  return (currency: string) => names.of(currency) ?? currency;
}
