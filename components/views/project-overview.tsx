"use client";

import { ArrowRight, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useAppData } from "@/components/app/app-data";
import { calendarRecord, projectRecord, toRecord, type Editor } from "@/components/app/record-editor";
import { calendarPoints } from "@/lib/calendar/points";
import { dateInZone } from "@/lib/domain/dates";
import { keptFields, projectField } from "@/lib/domain/intake";
import { phaseOf, type Phase } from "@/lib/domain/phases";
import { projectSettlement } from "@/lib/domain/workflow";
import { useMoney } from "@/lib/i18n/format";
import { useLabels } from "@/lib/i18n/labels";
import type { Project, ProjectDetail } from "@/lib/types";
import { DealCard } from "./deal-card";
import { ProjectPeople } from "./project-people";

type Card = "partners" | "upcoming" | "money" | "deal" | "questions" | "offer" | "related";

/**
 * The cards in the order a phase needs them: what to send back while
 * negotiating, what's next and when once signed, what's owed when settling.
 */
const cardOrder: Record<Phase, Card[]> = {
  negotiation: ["offer", "partners", "questions", "deal", "related"],
  execution: ["upcoming", "partners", "deal", "related", "questions", "offer"],
  settlement: ["money", "partners", "related", "deal", "questions", "offer"],
  ended: ["partners", "deal", "offer", "questions", "related"],
};

const UPCOMING = 3; // stops shown in Coming up; the Travel tab has them all

/**
 * A project at a glance, as cards ordered by its phase: who it's with, the deal (what's
 * filled in, and a chip for each term still missing), the questions for the
 * other side (ticked ones go into a reply), the original offer, what's coming
 * up, the money still owed, and the to-dos, drafts, and files linked to it.
 */
export function ProjectOverview({
  project,
  people,
  organizations,
  offerText,
  edit,
  showTab,
}: {
  project: Project;
  people: ProjectDetail["people"];
  organizations: ProjectDetail["organizations"];
  offerText: string;
  edit: (e: Editor) => void;
  showTab: (tab: "money" | "travel") => void;
}) {
  const data = useAppData();
  const router = useRouter();
  const money = useMoney();
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

  const today = dateInZone(data.talent.timeZone);
  const upcoming = calendarPoints(
    data.calendar.filter((c) => c.projectId === project.id && !c.archived && ["travel", "accommodation", "performance"].includes(c.kind)),
  )
    .filter((p) => p.date >= today)
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
    .slice(0, UPCOMING);
  const settlement = projectSettlement(data, project);

  const cards: Record<Card, ReactNode> = {
    partners: <ProjectPeople key="partners" project={project} people={people} organizations={organizations} />,

    upcoming: upcoming.length > 0 && (
      <DealCard
        key="upcoming"
        title={t("card.upcoming")}
        action={
          <button className="text-button" onClick={() => showTab("travel")}>
            {t("card.allTravel")}
          </button>
        }
      >
        <ul className="deal-records">
          {upcoming.map((p) => (
            <li key={p.key}>
              <button className="deal-record" onClick={() => edit({ kind: "calendar", item: calendarRecord(p.item) })}>
                <span>{p.item.title}</span>
                <small>{labels.calendarKind(p.item.kind)}</small>
                <small>{[p.date, p.time].filter(Boolean).join(" ")}</small>
              </button>
            </li>
          ))}
        </ul>
      </DealCard>
    ),

    money: (
      <DealCard
        key="money"
        title={t("card.money")}
        action={
          <button className="text-button" onClick={() => showTab("money")}>
            {t("card.seeMoney")}
          </button>
        }
      >
        <dl className="deal-facts">
          <div>
            <dt>{tWorkflow("received")}</dt>
            <dd>{money(settlement.received)}</dd>
          </div>
          <div>
            <dt>{tWorkflow("outstanding")}</dt>
            <dd className={settlement.pending > 0 ? "owed" : ""}>{money(settlement.pending)}</dd>
          </div>
        </dl>
      </DealCard>
    ),

    deal: (
      // Editing the whole project is the header's Edit; here, only a missing term opens the form, at that field.
      <DealCard key="deal" title={t("card.deal")}>
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
