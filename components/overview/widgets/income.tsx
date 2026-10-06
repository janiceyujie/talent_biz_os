"use client";

import { useTranslations } from "next-intl";
import { useMoney } from "@/lib/i18n/format";
import { monthIncome } from "@/lib/overview/income";
import type { OverviewContext } from "../context";
import { Widget } from "../widget";

/** 本月收入: cash received this month, with last month beside it (zero included). */
export function IncomeWidget({ ctx: { data, today } }: { ctx: OverviewContext }) {
  const t = useTranslations("today");
  const money = useMoney();
  const { thisMonth, lastMonth } = monthIncome(data, today);
  return (
    <Widget id="income" title={t("incomeTitle")}>
      <p className="widget-big">{money(thisMonth)}</p>
      <p className="widget-note">{t("incomeLastMonth", { amount: money(lastMonth) })}</p>
    </Widget>
  );
}
