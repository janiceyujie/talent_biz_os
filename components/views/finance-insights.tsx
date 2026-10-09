"use client";

import { useLocale, useTranslations } from "next-intl";
import { useAppData } from "@/components/app/app-data";
import { financeInsights } from "@/lib/domain/insights";
import { useMoney } from "@/lib/i18n/format";
import type { Currency } from "@/lib/domain/money";

/** Contract totals, six months of cash, and outstanding income by age. */
export function FinanceInsights({ currency }: { currency: Currency }) {
  const data = useAppData();
  const t = useTranslations("finance.insights");
  const money = useMoney();
  const locale = useLocale();
  const now = data.previewDate ? new Date(`${data.previewDate}T04:00:00Z`) : new Date();
  const report = financeInsights(data, now, currency);
  const max = Math.max(1, ...report.monthly.flatMap((m) => [m.received, m.paid]));
  const asOf = new Intl.DateTimeFormat(locale, { timeZone: data.talent.timeZone, month: "numeric", day: "numeric" }).format(now);
  return (
    <>
      <div className="finance-insights-grid">
        <section className="surface padded cash-trend-card">
          <div className="section-header">
            <h2>{t("cashTitle")}</h2>
            <span className="chart-key">
              <i />
              {t("keyIn")} <i />
              {t("keyOut")}
            </span>
          </div>
          <div className="cash-chart">
            {report.monthly.map((m) => (
              <div className="cash-month" key={m.month}>
                <div
                  className="cash-bars"
                  role="img"
                  aria-label={t("barLabel", { month: m.month, received: money(m.received, currency), paid: money(m.paid, currency) })}
                >
                  <i title={money(m.received, currency)} style={{ height: `${(m.received / max) * 100}%` }} />
                  <i title={money(m.paid, currency)} style={{ height: `${(m.paid / max) * 100}%` }} />
                </div>
                <span>{m.month.slice(2)}</span>
              </div>
            ))}
          </div>
          <details className="chart-data">
            <summary>{t("showValues")}</summary>
            <table>
              <thead>
                <tr>
                  <th>{t("month")}</th>
                  <th>{t("received")}</th>
                  <th>{t("paid")}</th>
                </tr>
              </thead>
              <tbody>
                {report.monthly.map((m) => (
                  <tr key={m.month}>
                    <td>{m.month}</td>
                    <td>{money(m.received, currency)}</td>
                    <td>{money(m.paid, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
        <section className="surface padded aging-card">
          <div className="section-header">
            <h2>{t("agingTitle")}</h2>
            <span className="muted">{t("asOf", { date: asOf })}</span>
          </div>
          <div className="aging-list">
            {report.aging.map((a, i) => (
              <div key={a.bucket}>
                <span>
                  <i className={`aging-dot dot-${i}`} />
                  {t(`aging.${a.bucket}`)}
                </span>
                <strong>{money(a.amount, currency)}</strong>
              </div>
            ))}
          </div>
          <p className="muted">{t("agingNote")}</p>
        </section>
      </div>
      {/* Signed-contract totals ignore the date filter, so they follow the dated charts. */}
      <section className="surface contract-metrics">
        <div>
          <small>{t("contracted")}</small>
          <strong>{money(report.contracted, currency)}</strong>
        </div>
        <div>
          <small>{t("unbilled")}</small>
          <strong>{money(report.unbilled, currency)}</strong>
        </div>
        <p>{t("contractNote")}</p>
        {report.unknownQuotes > 0 && <p>{t("unknownQuotes", { count: report.unknownQuotes })}</p>}
      </section>
    </>
  );
}
