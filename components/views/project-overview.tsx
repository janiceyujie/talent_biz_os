"use client";

import { ArrowRight, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useAppData } from "@/components/app/app-data";
import { calendarRecord, projectRecord, toRecord, type Editor } from "@/components/app/record-editor";
import { keptFields, projectField } from "@/lib/domain/intake";
import { phaseOf, type Phase } from "@/lib/domain/phases";
import { useLabels } from "@/lib/i18n/labels";
import type { Project, ProjectDetail } from "@/lib/types";
import { DealCard } from "./deal-card";
import { ProjectPeople } from "./project-people";

type Card = "partners" | "deal" | "questions" | "offer" | "related";

/** The cards in the order a phase needs them: the offer and questions first while negotiating, who and what once signed. */
const cardOrder: Record<Phase, Card[]> = {
  negotiation: ["offer", "partners", "questions", "deal", "related"],
  execution: ["partners", "deal", "related", "questions", "offer"],
  settlement: ["partners", "related", "deal", "questions", "offer"],
  ended: ["partners", "deal", "offer", "questions", "related"],
};

/**
 * A project at a glance, as cards ordered by its phase: who it's with, the deal (what's
 * filled in, and a chip for each term still missing), the questions for the
 * other side (ticked ones go into a reply), the original offer, and the
 * to-dos, drafts, and files linked to it. What needs doing, money, and what's
 * coming up sit above the tabs (project-actions.tsx).
 */
export function ProjectOverview({
  project,
  people,
  organizations,
  offerText,
  edit,
}: {
  project: Project;
  people: ProjectDetail["people"];
  organizations: ProjectDetail["organizations"];
  offerText: string;
  edit: (e: Editor) => void;
}) {
  const data = useAppData();
  const router = useRouter();
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

  // What their messages left open is ticked to ask; the type's usual questions are there to add.
  const asks = project.details.toConfirm ?? [];
  const suggestions = labels.projectQuestions(project.type).filter((q) => !asks.includes(q));
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(asks));
  const tick = (q: string) =>
    setTicked((s) => {
      const next = new Set(s);
      if (next.has(q)) next.delete(q);
      else next.add(q);
      return next;
    });
  const toAsk = [...asks, ...suggestions].filter((q) => ticked.has(q));
  const askInReply = () =>
    router.push(`/drafts?${new URLSearchParams([["project", project.id], ...toAsk.map((q) => ["ask", q])])}`);

  // The next step already leads the summary above; listing it again here would repeat it.
  const next = project.nextAction;
  const items = data.calendar.filter(
    (c) =>
      c.projectId === project.id &&
      !c.archived &&
      !["travel", "accommodation", "performance"].includes(c.kind) && // these have their own tab
      !(next && c.source === "todo" && c.id === next.id),
  );
  const drafts = data.drafts.filter((d) => d.projectId === project.id && !d.archived);
  const files = data.files.filter((f) => f.projectId === project.id && !f.archived);

  const cards: Record<Card, ReactNode> = {
    partners: <ProjectPeople key="partners" project={project} people={people} organizations={organizations} />,

    deal: (
      // Its own Edit as well as the one at the top of the screen, which is out of sight by the time you read this far.
      // It opens the form at the deal terms (their section unfolded); a missing term's chip, at that term.
      <DealCard
        key="deal"
        title={t("card.deal")}
        action={
          !project.archived && (
            <button className="text-button" onClick={() => editAt(terms[0][0])}>
              {t("editFull")}
            </button>
          )
        }
      >
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
        {missing.length > 0 && !project.archived && (
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
    ),

    // One list: what their messages left open (ticked), then the type's usual questions to add.
    questions: (
      <DealCard
        key="questions"
        title={asks.length ? t("card.questionsCount", { count: asks.length }) : t("card.questions")}
        action={
          !project.archived &&
          toAsk.length > 0 && (
            <button className="secondary ask-button" onClick={askInReply}>
              {t("card.askInReply", { count: toAsk.length })}
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          )
        }
      >
        {asks.length > 0 ? (
          <ul className="question-list">
            {asks.map((q) => (
              <li key={q}>
                <label>
                  <input type="checkbox" checked={ticked.has(q)} onChange={() => tick(q)} />
                  {q}
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t("card.questionsEmpty")}</p>
        )}
        {suggestions.length > 0 && (
          <details className="deal-reference">
            <summary>{t("card.suggestions", { count: suggestions.length })}</summary>
            <ul className="question-list">
              {suggestions.map((q) => (
                <li key={q}>
                  <label>
                    <input type="checkbox" checked={ticked.has(q)} onChange={() => tick(q)} />
                    {q}
                  </label>
                </li>
              ))}
            </ul>
          </details>
        )}
      </DealCard>
    ),

    offer: offerText && (
      <DealCard
        key="offer"
        title={t("card.offer")}
        action={
          <button className="text-button" aria-expanded={offerOpen} onClick={() => setOfferOpen(!offerOpen)}>
            {offerOpen ? t("card.showLess") : t("card.showAll")}
          </button>
        }
      >
        <p className={`prewrap deal-offer ${offerOpen ? "" : "clamped"}`}>{offerText}</p>
      </DealCard>
    ),

    related: items.length + drafts.length + files.length > 0 && (
      <DealCard key="related" title={tWorkflow("related")}>
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
    ),
  };

  return <div className="deal-cards">{cardOrder[phaseOf(project.stage)].map((card) => cards[card])}</div>;
}
