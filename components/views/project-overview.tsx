"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { useAppData } from "@/components/app/app-data";
import { calendarRecord, projectRecord, toRecord, type Editor } from "@/components/app/record-editor";
import { keptFields, projectField } from "@/lib/domain/intake";
import { useLabels } from "@/lib/i18n/labels";
import type { Project } from "@/lib/types";

/** One section of a project's screen: a titled white card, with an optional action at the right of its title. */
export function DealCard({ title, action, children }: { title: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="deal-card">
      <header className="deal-card-header">
        <h3>{title}</h3>
        {action}
      </header>
      {children}
    </section>
  );
}

/**
 * A project at a glance, as cards: the deal (what's filled in, and a chip
 * for each term still missing), the questions for the other side, the
 * original offer, and the to-dos, drafts, and files linked to it.
 */
export function ProjectOverview({ project, offerText, edit }: { project: Project; offerText: string; edit: (e: Editor) => void }) {
  const data = useAppData();
  const t = useTranslations("projects");
  const tTimeline = useTranslations("timeline");
  const tWorkflow = useTranslations("workflow");
  const labels = useLabels();
  const [offerOpen, setOfferOpen] = useState(false);
  const editAt = (focus: string) => edit({ kind: "project", item: projectRecord(project), focus });

  const fields = keptFields(project.type)
    .filter((k) => !["deliverables", "usageRights", "travel"].includes(k)) // the deal terms below
    .map((k) => [labels.detailField(project.type, k), projectField(project, k)] as const)
    .filter(([, v]) => v);
  const dates = (project.details.dates ?? []).map(
    (d) => [d.what || tTimeline("date"), [d.date, d.time].filter(Boolean).join(" ")] as const,
  );
  // The deal terms the edit form holds, by the form's field name (a missing one opens the form there).
  const terms = [
    ["contractNotes", t("detail.contract"), project.details.contractNotes],
    ["deliverables", t("detail.deliverables"), project.details.deliverables],
    ["rights", t("detail.rights"), project.details.rights],
    ["travel", t("detail.travel"), project.details.travel],
  ] as const;
  const filled = [...fields, ...dates, ...terms.filter(([, , v]) => v).map(([, label, v]) => [label, v!] as const)];
  const missing = terms.filter(([, , v]) => !v);

  const asks = project.details.toConfirm ?? [];
  const suggestions = labels.projectQuestions(project.type);

  // The next step already leads the summary above; listing it again here would repeat it.
  const next = project.nextAction;
  const items = data.calendar.filter(
    (c) =>
      c.projectId === project.id &&
      !c.archived &&
      !["travel", "accommodation", "performance"].includes(c.kind) && // these have their own tab
      !(next && c.source === "todo" && !c.done && c.title === next.title && c.date === (next.dueDate ?? "")),
  );
  const drafts = data.drafts.filter((d) => d.projectId === project.id && !d.archived);
  const files = data.files.filter((f) => f.projectId === project.id && !f.archived);

  return (
    <div className="deal-cards">
      {/* Editing the whole project is the header's Edit; here, only a missing term opens the form, at that field. */}
      <DealCard title={t("card.deal")}>
        {filled.length > 0 ? (
          <dl className="deal-facts">
            {filled.map(([label, value], i) => (
              <div key={`${label}-${i}`}>
                <dt>{label}</dt>
                <dd className="prewrap">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="muted">{t("card.dealEmpty")}</p>
        )}
        {missing.length > 0 && (
          <div className="deal-missing">
            <span>{t("card.missing")}</span>
            {missing.map(([key, label]) => (
              <button key={key} className="add-chip" onClick={() => editAt(key)}>
                <Plus size={13} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        )}
      </DealCard>

      {/* One list: what their messages left open, then the type's usual questions as optional suggestions. */}
      <DealCard title={asks.length ? t("card.questionsCount", { count: asks.length }) : t("card.questions")}>
        {asks.length > 0 ? (
          <ul className="deal-check-list">
            {asks.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t("card.questionsEmpty")}</p>
        )}
        {suggestions.length > 0 && (
          <details className="deal-reference">
            <summary>{t("card.suggestions", { count: suggestions.length })}</summary>
            <ul>
              {suggestions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </details>
        )}
      </DealCard>

      {offerText && (
        <DealCard
          title={t("card.offer")}
          action={
            <button className="text-button" aria-expanded={offerOpen} onClick={() => setOfferOpen(!offerOpen)}>
              {offerOpen ? t("card.showLess") : t("card.showAll")}
            </button>
          }
        >
          <p className={`prewrap deal-offer ${offerOpen ? "" : "clamped"}`}>{offerText}</p>
        </DealCard>
      )}

      {items.length + drafts.length + files.length > 0 && (
        <DealCard title={tWorkflow("related")}>
          <ul className="deal-records">
            {items.map((c) => (
              <li key={c.id}>
                <button className="deal-record" onClick={() => edit({ kind: "calendar", item: calendarRecord(c) })}>
                  <span>{c.title}</span>
                  <small>{c.source === "todo" ? (c.done ? tWorkflow("todoDone") : tWorkflow("todoOpen")) : labels.calendarKind(c.kind)}</small>
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
        </DealCard>
      )}
    </div>
  );
}
