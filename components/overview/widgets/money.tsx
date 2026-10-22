"use client";

import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMoney } from "@/lib/i18n/format";
import { countedPayments } from "@/lib/domain/workflow";
import { outstandingMoney } from "@/lib/overview/money";
import type { OverviewContext } from "../context";
import { Widget } from "../widget";

/** Money: money still expected — overdue first, one line per currency; zero rows left out; says so when nothing is open. */
export function MoneyWidget({ ctx: { data, today } }: { ctx: OverviewContext }) {
  const t = useTranslations("today");
  const money = useMoney();
  const m = outstandingMoney(countedPayments(data.payments, data.projects), today); // signed work only (decision 0018)
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
      {rows.every(([, totals]) => !totals.some((x) => x.amount > 0)) && <p className="empty">{t("moneyNone")}</p>}
      <dl className="widget-figures">
        {rows.flatMap(([key, totals]) =>
          totals
            .filter((x) => x.amount > 0)
            .map((x) => (
              <div key={`${key}-${x.currency}`} className={key === "moneyOverdue" ? "is-overdue" : undefined}>
                <dt>{t(key)}</dt>
                <dd>{money(x.amount, x.currency)}</dd>
              </div>
            )),
        )}
      </dl>
    </Widget>
  );
}
