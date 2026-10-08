"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAppData } from "@/components/app/app-data";
import { InfoHint } from "@/components/app/info-hint";
import { PageHeader } from "@/components/app/page-header";
import { useFitToWindow } from "@/components/app/use-fit-to-window";
import { partnerInsights } from "@/lib/domain/insights";
import { useMoney } from "@/lib/i18n/format";
import { useLabels } from "@/lib/i18n/labels";

const NARROW = "(max-width: 1000px)";

/** Rows in their order, gathered under each project as it first appears. */
function groupByProject<T extends { projectTitle: string }>(rows: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) groups.set(row.projectTitle, [...(groups.get(row.projectTitle) ?? []), row]);
  return [...groups];
} // list and report stack: show one at a time, as on Projects

/**
 * How each client organisation's signed projects went, and how their payments arrived (decision 0012).
 * A list of organisations beside the chosen one's report, as on Projects: on wide screens the list
 * scrolls on its own beside the report; on narrow ones they take turns. `?org=` keeps the choice.
 */
export function PartnersView() {
  const address = useSearchParams();
  const data = useAppData();
  const t = useTranslations("partners");
  const labels = useLabels();
  const money = useMoney();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(() => address.get("org") ?? "");
  const [detailOpen, setDetailOpen] = useState(() => !!address.get("org"));
  const reports = partnerInsights(data); // most overdue money first, then the most projects
  const shown = reports.filter((r) => r.organization.name.toLowerCase().includes(q.trim().toLowerCase()));
  const active = reports.find((r) => r.organization.id === selected) ?? shown[0];
  const panel = useRef<HTMLElement>(null);
  useFitToWindow(panel);
  useEffect(() => {
    const next = selected ? `${window.location.pathname}?org=${selected}` : window.location.pathname;
    if (next !== window.location.pathname + window.location.search) window.history.replaceState(null, "", next);
  }, [selected]);
  const open = (id: string) => {
    setSelected(id);
    setDetailOpen(true);
    if (window.matchMedia(NARROW).matches) window.scrollTo(0, 0); // the report replaces the list: start at its top
  };
  // The evidence tag's colour: late payments warn, all on time is good, too few to say is plain.
  const tone = (evidence: string) => (evidence === "manyLate" || evidence === "someLate" ? "warn" : evidence === "allOnTime" ? "main" : "");

  return (
    <>
      <PageHeader titleKey="partners" subtitle={<InfoHint notes={[t("intro")]} />} />
      <div className={`partner-layout ${detailOpen ? "is-detail-open" : ""}`}>
        <section ref={panel} className="surface partner-list" aria-label={t("listLabel")}>
          <div className="partner-list-header">
            <input type="search" aria-label={t("search")} placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
            <span aria-live="polite">{t("count", { count: shown.length })}</span>
          </div>
          <ul>
            {shown.map((r) => {
              const isActive = active?.organization.id === r.organization.id;
              return (
                <li key={r.organization.id}>
                  <button aria-pressed={isActive} className={isActive ? "selected" : ""} onClick={() => open(r.organization.id)}>
                    <span className="partner-row-top">
                      <strong>{r.organization.name}</strong>
                      <small>{t("projectsCount", { count: r.projects.length })}</small>
                    </span>
                    <span className="partner-row-bottom">
                      <span className={`person-role ${tone(r.evidence)}`}>{t(`evidence.${r.evidence}`)}</span>
                      {r.overdueCount > 0 && <span className="due overdue">{t("overdueCount", { count: r.overdueCount })}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!reports.length ? <p className="empty">{t("empty")}</p> : !shown.length && <p className="empty">{t("noMatches")}</p>}
        </section>
        {active && (
          <section className="surface padded partner-report">
            <button className="text-button with-icon partner-back" onClick={() => setDetailOpen(false)}>
              <ArrowLeft size={16} aria-hidden="true" />
              {t("back")}
            </button>
            <h2>
              <Link href={`/contacts/organizations/${active.organization.id}`}>{active.organization.name}</Link>
            </h2>
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
            {/* Too few payments to judge: say that, rather than a sentence of zeros. */}
            {active.paidCount < 3 ? (
              <p className="notice">{t("fewSamples")}</p>
            ) : (
              <p className="muted">{t("counts", { paid: active.paidCount, late: active.lateCount, unknown: active.unknownDue })}</p>
            )}
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
                {/* Grouped by project, so each row names only the payment (most recent first). */}
                {groupByProject(active.rows).map(([title, rows]) => (
                  <tbody key={title}>
                    <tr className="partner-group">
                      <th colSpan={6} scope="rowgroup">
                        {title}
                      </th>
                    </tr>
                    {rows.map((x) => (
                      // data-label names each cell where phones stack the row (no column headers there).
                      <tr key={x.id}>
                        <td className="partner-pay-label">{x.label}</td>
                        <td data-label={t("colDue")}>{x.dueDate || "—"}</td>
                        <td data-label={t("colSettled")}>{x.settledDate || "—"}</td>
                        <td data-label={t("colStatus")}>{labels.paymentStatus(x)}</td>
                        {/* Only real lateness is a number; on time or not yet due is a dash. */}
                        <td data-label={t("colLate")} className={x.lateDays ? "late" : ""}>
                          {x.lateDays ? x.lateDays : "—"}
                        </td>
                        <td className="partner-pay-total">{money(x.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                ))}
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
