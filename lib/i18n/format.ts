"use client";

import { useLocale } from "next-intl";
import { money } from "@/lib/domain/money";

/** money() bound to the active UI locale. */
export function useMoney() {
  const locale = useLocale();
  return (n: number, currency = "TWD") => money(n, locale, currency);
}
