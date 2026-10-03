"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useAppData } from "@/components/app/app-data";
import { partnerInsights } from "@/lib/domain/insights";
import { useMoney } from "@/lib/i18n/format";
import { useLabels } from "@/lib/i18n/labels";

/** How each counterparty's signed projects went, and how their payments arrived. */
export function PartnersView() {
  const data = useAppData();
  const t = useTranslations("partners");
  const labels = useLabels();
  const money = useMoney();
  const [selected, setSelected] = useState("");
  const reports = partnerInsights(data);
  const active = reports.find((r) => r.contact.id === selected) || reports[0];
  return (
    <>
      <p className="muted">{t("intro")}</p>
      <div className="partner-layout">
        <section className="surface padded partner-list" aria-label={t("listLabel")}>
          {reports.map((r) => (
            <button
              key={r.contact.id}
              aria-pressed={active?.contact.id === r.contact.id}
              className={active?.contact.id === r.contact.id ? "selected" : ""}
              onClick={() => setSelected(r.contact.id)}
            >
              <strong>{r.contact.name}</strong>
              <span>{t(`evidence.${r.evidence}`)}</span>
              <small>{t("summary", { projects: r.projects.length, overdue: r.overdueCount })}</small>
            </button>
          ))}
          {!reports.length && <p className="empty">{t("empty")}</p>}
        </section>
        {active && (
          <section className="surface padded partner-report">
            <h2>{active.contact.name}</h2>
            <div className="partner-stats">
              <div>
                <small>{t("statProjects")}</small>
                <strong>{active.projects.length}</strong>
              </div>
              <div>
                <small>{t("statOnTime")}</small>
                <strong>{active.onTimeRate === null ? "—" : `${active.onTimeRate}%`}</strong>
              </div>
              <div>
                <small>{t("statAvgLate")}</small>
                <strong>{active.averageLateDays}</strong>
              </div>
              <div>
                <small>{t("statOverdue")}</small>
                <strong>{money(active.overdueAmount)}</strong>
              </div>
            </div>
            <p className="muted">{t("counts", { paid: active.paidCount, late: active.lateCount, unknown: active.unknownDue })}</p>
            {active.paidCount < 3 && <p className="notice">{t("fewSamples")}</p>}
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t("colProject")}</th>
                    <th>{t("colDue")}</th>
                    <th>{t("colSettled")}</th>
                    <th>{t("colStatus")}</th>
                    <th>{t("colLate")}</th>
                    <th>{t("colTotal")}</th>
                  </tr>
                </thead>
                <tbody>
                  {active.rows.map((x) => (
                    <tr key={x.id}>
                      <td>
                        <strong>{x.projectTitle}</strong>
                        <small>{x.label}</small>
                      </td>
                      <td>{x.dueDate || "—"}</td>
                      <td>{x.settledDate || "—"}</td>
                      <td>{labels.paymentStatus(x)}</td>
                      <td>{x.lateDays === null ? "—" : x.lateDays}</td>
                      <td>{money(x.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!active.rows.length && <p className="empty">{t("noRows")}</p>}
            <details className="memory-note">
              <summary>{t("method")}</summary>
              <p>{t("methodBody")}</p>
            </details>
          </section>
        )}
      </div>
    </>
  );
}
