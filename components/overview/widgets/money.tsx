"use client";

import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMoney } from "@/lib/i18n/format";
import { outstandingMoney } from "@/lib/overview/money";
import type { OverviewContext } from "../context";
import { Widget } from "../widget";

/** Money: money still expected — overdue first; zero rows left out; says so when nothing is open. */
export function MoneyWidget({ ctx: { data, today } }: { ctx: OverviewContext }) {
  const t = useTranslations("today");
  const money = useMoney();
  const m = outstandingMoney(data.payments, today);
  const rows = [
    ["moneyOverdue", m.overdue],
    ["moneyThisWeek", m.thisWeek],
    ["moneyToReceive", m.toReceive],
    ["moneyToPay", m.toPay],
  ] as const;
  return (
    <Widget
      id="money"
      title={t("money")}
      link={{
        href: "/finance",
        label: (
          <>
            {t("viewFinance")} <ArrowUpRight size={14} aria-hidden="true" />
          </>
        ),
      }}
    >
      {rows.every(([, amounts]) => !amounts.length) && <p className="empty">{t("moneyNone")}</p>}
      <dl className="widget-figures">
        {rows.flatMap(([key, amounts]) => amounts.filter((item) => item.amount > 0).map((item) => (
          <div key={`${key}-${item.currency}`} className={key === "moneyOverdue" ? "is-overdue" : undefined}>
            <dt>{t(key)}</dt>
            <dd>{money(item.amount, item.currency)}</dd>
          </div>
        )))}
      </dl>
    </Widget>
  );
}
