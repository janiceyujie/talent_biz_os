"use client";

import { useTranslations } from "next-intl";
import { useAppData } from "@/components/app/app-data";
import { calendarRecord, projectRecord, toRecord, type Editor } from "@/components/app/record-editor";
import { keptFields, projectField } from "@/lib/domain/intake";
import { useLabels } from "@/lib/i18n/labels";
import type { Project } from "@/lib/types";

/**
 * A project at a glance: what's filled in (type fields, dates, the deal
 * terms), one line for what's missing, what to confirm with the other side,
 * and the to-dos, drafts, and files linked to it. Empty parts don't show.
 */
export function ProjectOverview({ project, offerText, edit }: { project: Project; offerText: string; edit: (e: Editor) => void }) {
  const data = useAppData();
  const t = useTranslations("projects");
  const tTimeline = useTranslations("timeline");
  const tWorkflow = useTranslations("workflow");
  const labels = useLabels();
  const fields = keptFields(project.type)
    .filter((k) => !["deliverables", "usageRights", "travel"].includes(k)) // the deal terms below
    .map((k) => [labels.detailField(project.type, k), projectField(project, k)] as const)
    .filter(([, v]) => v);
  const dates = (project.details.dates ?? []).map(
    (d) => [d.what || tTimeline("date"), [d.date, d.time].filter(Boolean).join(" ")] as const,
  );
  const terms = (
    [
      [t("detail.offer"), offerText],
      [t("detail.contract"), project.details.contractNotes],
      [t("detail.deliverables"), project.details.deliverables],
      [t("detail.rights"), project.details.rights],
      [t("detail.travel"), project.details.travel],
    ] as [string, string | undefined][]
  );
  const filled = [...fields, ...dates, ...terms.filter(([, v]) => v)];
  const missing = terms.filter(([, v]) => !v).map(([label]) => label);
  const asks = project.details.toConfirm ?? [];
  // Travel, stays, and performances have their own tab.
  const items = data.calendar.filter(
    (c) => c.projectId === project.id && !c.archived && !["travel", "accommodation", "performance"].includes(c.kind),
  );
  const drafts = data.drafts.filter((d) => d.projectId === project.id && !d.archived);
  const files = data.files.filter((f) => f.projectId === project.id && !f.archived);
  const related = items.length + drafts.length + files.length > 0;

  return (
    <div className="deal-overview">
      {filled.length > 0 && (
        <dl className="deal-facts">
          {filled.map(([label, value], i) => (
            <div key={`${label}-${i}`}>
              <dt>{label}</dt>
              <dd className="prewrap">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {missing.length > 0 && (
        <p className="deal-missing">
          {t("missingDetails", { list: missing.join("、") })}{" "}
          <button className="text-button" onClick={() => edit({ kind: "project", item: projectRecord(project) })}>
            {t("editFull")}
          </button>
        </p>
      )}
      {asks.length > 0 && (
        <section>
          <h3>{tTimeline("toConfirm")}</h3>
          <ul className="deal-check-list">
            {asks.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      )}
      {/* The type's standard questions: reference for a reply, so collapsed. */}
      <details className="deal-reference">
        <summary>{tWorkflow("toConfirm")}</summary>
        <ul>
          {labels.projectQuestions(project.type).map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      </details>
      {related && (
        <section>
          <h3>{tWorkflow("related")}</h3>
          <ul className="deal-records">
            {items.map((c) => (
              <li key={c.id}>
                <button className="deal-record" onClick={() => edit({ kind: "calendar", item: calendarRecord(c) })}>
                  <span>{c.title}</span>
                  <small>
                    {c.source === "todo" ? (c.done ? tWorkflow("todoDone") : tWorkflow("todoOpen")) : labels.calendarKind(c.kind)}
                  </small>
                  <small>{c.date}</small>
                </button>
              </li>
            ))}
            {drafts.map((d) => (
              <li key={d.id}>
                <button className="deal-record" onClick={() => edit({ kind: "draft", item: toRecord(d) })}>
                  <span>{tWorkflow("draftItem", { subject: d.subject })}</span>
                </button>
              </li>
            ))}
            {files.map((f) => (
              <li key={f.id} className="deal-record">
                <span>{tWorkflow("fileItem", { name: f.filename })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
