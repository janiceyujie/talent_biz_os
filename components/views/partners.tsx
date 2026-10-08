"use client";

import { ArrowDownUp, ArrowLeft } from "lucide-react";
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

const NARROW = "(max-width: 1000px)"; // list and report stack: show one at a time, as on Projects

/**
 * How each client organisation's signed projects went, and how their payments arrived (decision 0012).
 * A list of organisations beside the chosen one's report, as on Projects: on wide screens the list
 * scrolls on its own beside the report; on narrow ones they take turns. `?org=` keeps the choice.
 */
export function PartnersView() {
  const address = useSearchParams();
  const data = useAppData();
  const t = useTranslations("partners");
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
        {active && <PartnerReport key={active.organization.id} report={active} onBack={() => setDetailOpen(false)} />}
      </div>
    </>
  );
}

type Report = ReturnType<typeof partnerInsights>[number];
type Row = Report["rows"][number];
const statusFilters = ["all", "open", "overdue", "settled"] as const;
type StatusFilter = (typeof statusFilters)[number];
const rowSorts = ["dueNew", "dueOld", "amount", "late"] as const;
type RowSort = (typeof rowSorts)[number];

const matches = (x: Row, filter: StatusFilter) =>
  filter === "all" ||
  (filter === "settled" ? x.status === "settled" : x.status === "expected" && (filter === "open" || (x.lateDays ?? 0) > 0));
const dateOf = (x: Row) => x.dueDate ?? x.recordedDate;
const compare: Record<RowSort, (a: Row, b: Row) => number> = {
  dueNew: (a, b) => dateOf(b).localeCompare(dateOf(a)),
  dueOld: (a, b) => dateOf(a).localeCompare(dateOf(b)),
  amount: (a, b) => b.total - a.total || dateOf(b).localeCompare(dateOf(a)),
  late: (a, b) => (b.lateDays ?? 0) - (a.lateDays ?? 0) || dateOf(b).localeCompare(dateOf(a)),
};

/**
 * One company's record, for the three reasons people open it: can I trust them (the tag and the
 * numbers, how they're worked out behind the ⓘ), what do they owe me now (filter to Overdue or To
 * receive), and what have we done together (by project, or as one timeline by date, in any order).
 */
function PartnerReport({ report, onBack }: { report: Report; onBack: () => void }) {
  const data = useAppData();
  const t = useTranslations("partners");
  const labels = useLabels();
  const money = useMoney();
  const [byProject, setByProject] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<RowSort>("dueNew");
  const counts = Object.fromEntries(statusFilters.map((f) => [f, report.rows.filter((x) => matches(x, f)).length])) as Record<StatusFilter, number>;
  const rows = report.rows.filter((x) => matches(x, filter)).sort(compare[sort]);
  // By project: groups in the order their first row comes under the chosen sort; with no filter,
  // projects without payments too, at the end, so the history is complete.
  const groups = new Map<string, Row[]>();
  for (const x of rows) groups.set(x.projectId!, [...(groups.get(x.projectId!) ?? []), x]);
  if (filter === "all") for (const p of report.projects) if (!groups.has(p.id)) groups.set(p.id, []);
  const projectOf = (id: string) => data.projects.find((p) => p.id === id);
  const tone = report.evidence === "manyLate" || report.evidence === "someLate" ? "warn" : report.evidence === "allOnTime" ? "main" : "";

  const paymentRow = (x: Row) => (
    // data-label names each cell where phones stack the row (no column headers there).
    <tr key={x.id}>
      <td className="partner-pay-label">
        {x.label}
        {!byProject && (
          <Link className="partner-pay-project" href={`/projects?id=${x.projectId}`}>
            {x.projectTitle}
          </Link>
        )}
      </td>
      <td data-label={t("colDue")}>{x.dueDate || "—"}</td>
      <td data-label={t("colSettled")}>{x.settledDate || "—"}</td>
      <td data-label={t("colStatus")}>{labels.paymentStatus(x)}</td>
      {/* Only real lateness is a number; on time or not yet due is a dash. */}
      <td data-label={t("colLate")} className={x.lateDays ? "late" : ""}>
        {x.lateDays ? x.lateDays : "—"}
      </td>
      <td className="partner-pay-total">{money(x.total)}</td>
    </tr>
  );

  return (
    <section className="surface padded partner-report">
      <button className="text-button with-icon partner-back" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" />
        {t("back")}
      </button>
      <header className="partner-report-header">
        <h2>
          <Link href={`/contacts/organizations/${report.organization.id}`}>{report.organization.name}</Link>
        </h2>
        <span className={`person-role ${tone}`}>{t(`evidence.${report.evidence}`)}</span>
        {/* How the numbers are worked out, and what they're based on, behind one ⓘ. */}
        <InfoHint
          notes={[t("counts", { paid: report.paidCount, late: report.lateCount, unknown: report.unknownDue }), t("methodBody")]}
        />
      </header>
      <div className="partner-stats">
        <div>
          <small>{t("statProjects")}</small>
          <strong>{report.projects.length}</strong>
        </div>
        <div>
          <small>{t("statOnTime")}</small>
          <strong>{report.onTimeRate === null ? "—" : `${report.onTimeRate}%`}</strong>
        </div>
        <div>
          <small>{t("statAvgLate")}</small>
          <strong>{report.averageLateDays}</strong>
        </div>
        <div>
          <small>{t("statOverdue")}</small>
          <strong className={report.overdueAmount > 0 ? "late" : ""}>{money(report.overdueAmount)}</strong>
        </div>
      </div>

      <div className="partner-history-head">
        <h3>{t("history")}</h3>
        <div className="view-switch" role="group" aria-label={t("view")}>
          <button aria-pressed={byProject} onClick={() => setByProject(true)}>
            {t("viewByProject")}
          </button>
          <button aria-pressed={!byProject} onClick={() => setByProject(false)}>
            {t("viewByDate")}
          </button>
        </div>
      </div>
      <div className="partner-history-controls">
        <div className="status-chips" role="group" aria-label={t("statusFilter")}>
          {statusFilters.map((f) => (
            <button
              key={f}
              aria-pressed={filter === f}
              className={f === "overdue" && counts.overdue > 0 ? "has-overdue" : ""}
              onClick={() => setFilter(f)}
            >
              {t(`filter.${f}`)}
              <span>{counts[f]}</span>
            </button>
          ))}
        </div>
        <label className="deal-sort">
          <ArrowDownUp size={14} aria-hidden="true" />
          <span className="sr-only">{t("sort")}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as RowSort)}>
            {rowSorts.map((key) => (
              <option key={key} value={key}>
                {t(`sortBy.${key}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {rows.length > 0 || (byProject && groups.size > 0) ? (
        <div className="table-scroll">
          <table className={byProject ? "by-project" : ""}>
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
            {byProject ? (
              [...groups].map(([projectId, items]) => {
                const project = projectOf(projectId);
                const all = report.rows.filter((x) => x.projectId === projectId);
                const received = all.filter((x) => x.status === "settled").reduce((n, x) => n + x.total, 0);
                const total = all.reduce((n, x) => n + x.total, 0);
                return (
                  <tbody key={projectId}>
                    {/* A project as a bar: what it is, where it stands, and how much of it has come in. */}
                    <tr className="partner-group">
                      <th colSpan={6} scope="rowgroup">
                        <span className="partner-group-bar">
                          <Link href={`/projects?id=${projectId}`}>{project?.title ?? all[0]?.projectTitle}</Link>
                          {project && <span className="person-role">{labels.stage(project.stage)}</span>}
                          <small>
                            {all.length
                              ? t("groupSummary", { received: money(received), total: money(total), count: all.length })
                              : t("noPaymentsYet")}
                          </small>
                        </span>
                      </th>
                    </tr>
                    {items.map(paymentRow)}
                  </tbody>
                );
              })
            ) : (
              <tbody>{rows.map(paymentRow)}</tbody>
            )}
          </table>
        </div>
      ) : (
        <p className="empty">{report.rows.length ? t("filterEmpty") : t("noRows")}</p>
      )}
    </section>
  );
}

