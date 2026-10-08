"use client";

import { Check, ChevronRight, Circle, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { calendarRecord, projectRecord, toRecord, type Editor } from "@/components/app/record-editor";
import { setTodoDone } from "@/lib/actions/calendar";
import { calendarPoints } from "@/lib/calendar/points";
import { dateInZone } from "@/lib/domain/dates";
import { isSigned } from "@/lib/domain/phases";
import { projectSettlement } from "@/lib/domain/workflow";
import { useMoney } from "@/lib/i18n/format";
import type { Project, ProjectSummary } from "@/lib/types";
import { useClosingChecks, type ClosingCheck } from "./project-workflow-panel";
import { useDue } from "./use-due";

type Notice = { message: string; action?: { label: string; onClick: () => void } };
type Tab = "money" | "travel";

/**
 * What needs doing on a project, in one list, first thing on its screen: its
 * open to-dos (any can be ticked; the soonest is the next step), then, once
 * signed, what it still needs before it can close, each with the action that
 * fixes it. Checks aren't ticked: they're met when the data says so, and then
 * fold into "done". Folded, the header still names the next thing to do.
 */
export function ProjectActions({
  project,
  full,
  edit,
  showTab,
  notify,
  folded,
  onFold,
}: {
  project: ProjectSummary;
  full: Project | null;
  edit: (e: Editor) => void;
  showTab: (tab: Tab) => void;
  notify: (n: Notice) => void;
  folded: boolean;
  onFold: (folded: boolean) => void;
}) {
  const data = useAppData();
  const t = useTranslations("projects.actions");
  const tProjects = useTranslations("projects");
  const due = useDue();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Ticked here and not back from the server yet: shown ticked, then gone.
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const live = !project.archived;
  const signed = live && isSigned(project.stage);
  const checks = useClosingChecks(signed ? full : null);
  const open = checks.filter((c) => !c.met);
  const met = checks.filter((c) => c.met);

  const todos = data.calendar
    .filter((c) => c.projectId === project.id && c.source === "todo" && !c.archived && !c.done)
    .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || a.title.localeCompare(b.title));

  const complete = (id: string, title: string) => {
    setTicked((s) => new Set(s).add(id)); // outside the transition, so it shows now
    startTransition(async () => {
      const failure = await setTodoDone(id, true);
      setError(failure);
      if (failure) return setTicked((s) => new Set([...s].filter((x) => x !== id)));
      notify({
        message: tProjects("doneToast", { title }),
        action: {
          label: tProjects("undo"),
          onClick: () => {
            setTicked((s) => new Set([...s].filter((x) => x !== id)));
            startTransition(async () => setError(await setTodoDone(id, false)));
          },
        },
      });
    });
  };

  const fix = (c: ClosingCheck) => {
    const f = c.fix;
    if (f.kind === "edit" && full) edit({ kind: "project", item: projectRecord(full), focus: f.field });
    else if (f.kind === "billing" && full)
      edit({
        kind: "payment",
        item: {
          projectId: project.id,
          label: tProjects("paymentLabel", { title: project.title.slice(0, 190) }),
          amount: f.amount || "",
          taxRate: full.taxRate,
          taxIncluded: true,
        },
      });
    else if (f.kind === "received" && f.paymentId) {
      const payment = data.payments.find((p) => p.id === f.paymentId);
      // Recording money that came in starts at its status (expected → received).
      if (payment) edit({ kind: "payment", item: toRecord(payment), focus: "status" });
    } else if (f.kind === "schedule") showTab("travel");
    else showTab("money");
  };
  const fixLabel = (c: ClosingCheck) => {
    if (c.fix.kind === "received" && !c.fix.paymentId) return t("fixMoney"); // nothing requested to record against yet
    return { edit: t("fixEdit"), billing: t("fixBilling"), received: t("fixReceived"), schedule: t("fixSchedule"), money: t("fixMoney") }[c.fix.kind];
  };

  const left = todos.filter((x) => !ticked.has(x.id));
  const count = left.length + open.length;
  const nextUp = left[0]?.title ?? open[0]?.open;

  return (
    <section className={`actions-card ${folded ? "is-folded" : ""}`} aria-label={t("title")}>
      <header className="actions-header">
        <h3>
          <button className="actions-toggle" aria-expanded={!folded} onClick={() => onFold(!folded)}>
            <ChevronRight className="actions-chevron" size={16} aria-hidden="true" />
            {t("title")}
            {count > 0 && <span className="count-pill">{count}</span>}
            {folded && nextUp && <span className="actions-summary">{nextUp}</span>}
          </button>
        </h3>
      </header>

      {!folded && todos.length > 0 && (
        <ul className="todo-list">
          {todos.map((x, i) => {
            const d = due(x.date || null);
            const isTicked = ticked.has(x.id);
            return (
              <li key={x.id} className={isTicked ? "is-ticked" : ""}>
                <input
                  type="checkbox"
                  checked={isTicked}
                  disabled={!live || isTicked}
                  aria-label={tProjects("markDone", { title: x.title })}
                  onChange={() => complete(x.id, x.title)}
                />
                <button className="todo-title" onClick={() => edit({ kind: "calendar", item: calendarRecord(x) })}>
                  {x.title}
                </button>
                {i === 0 && !isTicked && <span className="person-role main">{t("next")}</span>}
                {d && <span className={`due ${d.tone}`}>{d.text}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {/* Under the list, where the next one would go, rather than across the card in the header. */}
      {!folded && signed && (
        <button
          className="text-button with-icon add-todo"
          onClick={() => edit({ kind: "calendar", item: { projectId: project.id, title: "" } })}
        >
          <Plus size={14} aria-hidden="true" />
          {t("addTodo")}
        </button>
      )}

      {!folded && signed && full && open.length > 0 && (
        <div className="checks-block">
          <h4>{t("beforeClosing", { count: open.length })}</h4>
          <ul className="check-items">
            {open.map((c) => (
              <li key={c.key}>
                <Circle size={14} aria-hidden="true" className="check-icon" />
                <span>{c.open}</span>
                {live && (
                  <button className="secondary fix-button" onClick={() => fix(c)}>
                    {fixLabel(c)}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!folded && signed && met.length > 0 && (
        <details className="checks-done">
          <summary>
            <Check size={14} aria-hidden="true" />
            {t("doneCount", { count: met.length })}
          </summary>
          <ul className="check-items">
            {met.map((c) => (
              <li key={c.key} className="is-met">
                <Check size={14} aria-hidden="true" className="check-icon" />
                <span>{c.done}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {!folded && count === 0 && <p className="muted actions-empty">{signed && full && !open.length ? t("allClear") : t("nothing")}</p>}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

const SHOWN_STOPS = 2; // trips and performances on the Coming up card

/**
 * Three things at a glance, equal in width: money, what's coming up, and the
 * project's notes. Each opens where it's dealt with in full.
 */
export function ProjectGlance({
  project,
  full,
  edit,
  showTab,
}: {
  project: ProjectSummary;
  full: Project | null;
  edit: (e: Editor) => void;
  showTab: (tab: Tab) => void;
}) {
  const data = useAppData();
  const t = useTranslations("projects.glance");
  const tProjects = useTranslations("projects");
  const tWorkflow = useTranslations("workflow");
  const money = useMoney();
  const signed = isSigned(project.stage);
  const settlement = projectSettlement(data, project);
  const today = dateInZone(data.talent.timeZone);
  const coming = calendarPoints(
    data.calendar.filter((c) => c.projectId === project.id && !c.archived && ["travel", "accommodation", "performance"].includes(c.kind)),
  )
    .filter((p) => p.date >= today)
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
    .slice(0, SHOWN_STOPS);
  const notes = full?.notes.trim() ?? "";

  return (
    <div className="glance">
      <button className="glance-card" onClick={() => showTab("money")}>
        {/* Before signing, the quote is what matters; after, how much of it has come in. */}
        <small>{signed ? tWorkflow("payments") : tWorkflow("quoted")}</small>
        {settlement.quoted === null ? (
          <strong>{tProjects("quoteNotSet")}</strong>
        ) : signed ? (
          <>
            <strong>{tWorkflow("receivedOf", { received: money(settlement.received), quoted: money(settlement.quoted) })}</strong>
            <span className="meter" aria-hidden="true">
              <span style={{ width: `${Math.min(100, settlement.quoted ? (settlement.received / settlement.quoted) * 100 : 0)}%` }} />
            </span>
          </>
        ) : (
          <strong>{money(settlement.quoted)}</strong>
        )}
      </button>
      <button className="glance-card" onClick={() => showTab("travel")}>
        <small>{t("comingUp")}</small>
        {coming.length ? (
          coming.map((p) => (
            <span key={p.key} className="glance-line">
              <b>{p.date.slice(5).replace("-", "/")}</b> {p.item.title}
            </span>
          ))
        ) : (
          <span className="muted">{t("nothingComing")}</span>
        )}
      </button>
      <button
        className="glance-card"
        disabled={!full || project.archived}
        onClick={() => full && edit({ kind: "project", item: projectRecord(full), focus: "notes" })}
      >
        <small>{t("notes")}</small>
        {notes ? <span className="glance-notes">{notes}</span> : <span className="muted">{t("addNotes")}</span>}
      </button>
    </div>
  );
}
