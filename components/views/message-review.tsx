"use client";

// Which project a message belongs to, and the changes it proposes there — a
// checklist the person edits and ticks (docs/design/intake-to-project.md).
// The proposal is computed here for display; the server recomputes it on apply.
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { applyMessage } from "@/lib/actions/intake";
import { dateInZone } from "@/lib/domain/dates";
import { proposeChanges, suggestTargets, type Change, type IntakeContext, type TargetReason } from "@/lib/domain/intake";
import { useMoney } from "@/lib/i18n/format";
import { useLabels } from "@/lib/i18n/labels";
import type { InboxMessage, Project, Stage } from "@/lib/types";

type Analysis = NonNullable<InboxMessage["analysis"]>;
type Edit = Record<string, unknown>;

/** The editable part of each item, in the shape the server's apply action takes. */
function initialEdit(c: Change): Edit {
  switch (c.kind) {
    case "fee":
    case "field":
    case "contractNotes":
      return { to: c.to };
    case "date":
      return { date: c.to.date, time: c.to.time };
    case "settlePayment":
      return { amount: c.amount, settledOn: c.settledOn };
    case "newPayment":
      return { amount: c.amount, date: c.date };
    case "todo":
      return { dueDate: c.dueDate };
    case "toConfirm":
      return { items: c.items };
    default:
      return {};
  }
}

export function MessageReview({ message, onNewProject }: { message: InboxMessage; onNewProject: () => void }) {
  const data = useAppData();
  const t = useTranslations("intake");
  const tInbox = useTranslations("inbox");
  const a = message.analysis!;
  const ctx = useMemo<IntakeContext>(
    () => ({
      projects: data.projects,
      contacts: data.contacts,
      payments: data.payments,
      calendar: data.calendar,
      receivedOn: dateInZone(data.talent.timeZone, 0, new Date(message.receivedAt)),
      replyWithinDays: data.person.replyWithinDays,
    }),
    [data, message.receivedAt],
  );
  const suggestions = useMemo(() => suggestTargets(a, ctx).slice(0, 3), [a, ctx]);
  const [target, setTarget] = useState<string>(suggestions[0]?.projectId ?? "new");
  const [other, setOther] = useState("");
  const live = data.projects.filter((p) => !p.archived);
  const chosen = target === "other" ? live.find((p) => p.id === other) : live.find((p) => p.id === target);

  return (
    <section className="message-review" aria-label={t("targetHeading")}>
      <h3>{t("targetHeading")}</h3>
      <div className="target-options" role="radiogroup" aria-label={t("targetHeading")}>
        {suggestions.map((s) => {
          const p = live.find((x) => x.id === s.projectId)!;
          return (
            <label key={s.projectId} className={target === s.projectId ? "target on" : "target"}>
              <input type="radio" name={`target-${message.id}`} checked={target === s.projectId} onChange={() => setTarget(s.projectId)} />
              <span>
                <strong>{p.title}</strong> <em className="target-chip">{t("suggested")}</em>
                <span className="muted target-reasons">{s.reasons.map((r) => <Reason key={r.kind} reason={r} />)}</span>
              </span>
            </label>
          );
        })}
        <label className={target === "new" ? "target on" : "target"}>
          <input type="radio" name={`target-${message.id}`} checked={target === "new"} onChange={() => setTarget("new")} />
          <strong>{t("newProject")}</strong>
        </label>
        {live.length > 0 && (
          <div className={target === "other" ? "target on" : "target"}>
            <label className="target-other">
              <input type="radio" name={`target-${message.id}`} checked={target === "other"} onChange={() => setTarget("other")} />
              <strong>{t("otherProject")}</strong>
            </label>
            {target === "other" && (
              <select aria-label={tInbox("pickProject")} value={other} onChange={(e) => setOther(e.target.value)}>
                <option value="">{tInbox("pickProject")}</option>
                {live.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>
      {target === "new" && (
        <div className="row-actions section-gap">
          <button className="primary" onClick={onNewProject}>
            {tInbox("createProject")}
          </button>
        </div>
      )}
      {chosen && <Changes key={chosen.id} message={message} analysis={a} project={chosen} ctx={ctx} />}
    </section>
  );
}

function Reason({ reason }: { reason: TargetReason }) {
  const t = useTranslations("intake");
  const money = useMoney();
  const value = reason.kind === "payment" ? money(reason.value) : reason.value;
  return <span>{t(`reason.${reason.kind}`, { value })}</span>;
}

function Changes({ message, analysis, project, ctx }: { message: InboxMessage; analysis: Analysis; project: Project; ctx: IntakeContext }) {
  const t = useTranslations("intake");
  const labels = useLabels();
  const { changes, question } = useMemo(() => proposeChanges(analysis, project, ctx), [analysis, project, ctx]);
  const [answer, setAnswer] = useState<Stage | null>(null);
  const items = answer === "signed" && question ? [...changes, ...question.ifSigned] : changes;
  const [ticked, setTicked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries([...changes, ...(question?.ifSigned ?? [])].map((c) => [c.id, c.ticked])),
  );
  const [edits, setEdits] = useState<Record<string, Edit>>(() =>
    Object.fromEntries([...changes, ...(question?.ifSigned ?? [])].map((c) => [c.id, initialEdit(c)])),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const edit = (id: string, patch: Edit) => setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }));
  const count = items.filter((c) => ticked[c.id]).length + (answer && answer !== project.stage ? 1 : 0);
  const apply = () =>
    startTransition(async () => {
      const chosen = Object.fromEntries(items.filter((c) => ticked[c.id]).map((c) => [c.id, edits[c.id]]));
      setError(await applyMessage({ messageId: message.id, projectId: project.id, items: chosen, stage: answer }));
    });

  return (
    <div className="proposed-changes">
      <h3>{t("changesHeading")}</h3>
      {!items.length && !question && <p className="muted">{t("noChanges")}</p>}
      {changes.map((c) => (
        <ChangeRow
          key={c.id}
          change={c}
          project={project}
          intent={analysis.intent}
          ticked={!!ticked[c.id]}
          onTick={(v) => setTicked((x) => ({ ...x, [c.id]: v }))}
          edit={edits[c.id]}
          onEdit={(patch) => edit(c.id, patch)}
          signing={answer === "signed"}
        />
      ))}
      {question && (
        <div className="stage-question" role="group" aria-label={labels.stage("signed")}>
          <strong>{t("question", { signed: labels.stage("signed") })}</strong>
          <p className="muted">{t("questionHint")}</p>
          <div className="row-actions">
            <button type="button" className={answer === "signed" ? "choice on" : "choice"} aria-pressed={answer === "signed"} onClick={() => setAnswer("signed")}>
              {t("moveSigned", { stage: labels.stage("signed") })}
            </button>
            <button
              type="button"
              className={answer === question.choices[1] ? "choice on" : "choice"}
              aria-pressed={answer === question.choices[1]}
              onClick={() => setAnswer(question.choices[1])}
            >
              {t("keep", { stage: labels.stage(question.choices[1]) })}
            </button>
          </div>
          {answer === "signed" &&
            question.ifSigned.map((c) => (
              <ChangeRow
                key={c.id}
                change={c}
                project={project}
                intent={analysis.intent}
                ticked={!!ticked[c.id]}
                onTick={(v) => setTicked((x) => ({ ...x, [c.id]: v }))}
                edit={edits[c.id]}
                onEdit={(patch) => edit(c.id, patch)}
                signing
              />
            ))}
        </div>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {question && !answer && <p className="muted">{t("answerFirst")}</p>}
      <div className="row-actions section-gap">
        <button className="primary" disabled={pending || (!!question && !answer)} onClick={apply}>
          {pending ? t("applying") : t("apply", { count })}
        </button>
      </div>
    </div>
  );
}

function ChangeRow({
  change: c,
  project,
  intent,
  ticked,
  onTick,
  edit,
  onEdit,
  signing,
}: {
  change: Change;
  project: Project;
  intent: Analysis["intent"];
  ticked: boolean;
  onTick: (v: boolean) => void;
  edit: Edit;
  onEdit: (patch: Edit) => void;
  signing: boolean;
}) {
  const t = useTranslations("intake");
  const labels = useLabels();
  const money = useMoney();
  const data = useAppData();
  const id = `change-${c.id}`;
  const empty = <span className="muted">{t("empty")}</span>;
  const from = (v: string | null) => (v ? <s className="change-from">{v}</s> : empty);
  const paymentLabel = (pid: string) => data.payments.find((p) => p.id === pid)?.label ?? "";

  let label: string;
  let body: React.ReactNode = null;
  switch (c.kind) {
    case "fee":
      label = t("change.fee");
      body = (
        <>
          {from(c.from === null ? null : money(c.from))} →{" "}
          <input className="change-edit" type="number" min={0} aria-label={label} value={String(edit.to ?? "")} onChange={(e) => onEdit({ to: Number(e.target.value) })} />
          {c.taxIncluded !== null && <span className="muted"> {c.taxIncluded ? t("taxIncluded") : t("taxExcluded")}</span>}
        </>
      );
      break;
    case "field":
      label = labels.detailField(project.type, c.key);
      body = (
        <>
          {from(c.from)} → <input className="change-edit wide" aria-label={label} value={String(edit.to ?? "")} onChange={(e) => onEdit({ to: e.target.value })} />
        </>
      );
      break;
    case "contractNotes":
      label = t("change.contractNotes");
      body = <textarea className="change-edit wide" rows={3} aria-label={label} value={String(edit.to ?? "")} onChange={(e) => onEdit({ to: e.target.value })} />;
      break;
    case "date": {
      label = c.from ? t("change.date") : t("change.newDate");
      const was = c.from && c.from !== c.to ? [c.from.date, c.from.time].filter(Boolean).join(" ") : "";
      body = (
        <>
          <span>{c.to.what}</span> {was && <>{from(was)} → </>}
          <input className="change-edit" type="date" aria-label={label} value={String(edit.date ?? "")} onChange={(e) => onEdit({ date: e.target.value })} />{" "}
          <input className="change-edit" type="time" aria-label={`${label} ${t("change.date")}`} value={String(edit.time ?? "")} onChange={(e) => onEdit({ time: e.target.value })} />
          {(c.asEvent || (signing && !c.eventId)) && <span className="muted"> · {t("asEvent")}</span>}
        </>
      );
      break;
    }
    case "stage":
      label = t("change.stage");
      body = (
        <>
          {from(labels.stage(c.from))} → <strong>{labels.stage(c.to)}</strong>
        </>
      );
      break;
    case "settlePayment": {
      label = t("change.settlePayment", { label: paymentLabel(c.paymentId) });
      const amount = Number(edit.amount ?? 0);
      body = (
        <>
          {from(t("expected", { amount: money(c.expected) }))} → {t("received")}{" "}
          <input className="change-edit" type="number" min={0} aria-label={t("amount")} value={String(edit.amount ?? "")} onChange={(e) => onEdit({ amount: Number(e.target.value) })} /> · {t("settledOn")}{" "}
          <input className="change-edit" type="date" aria-label={t("settledOn")} value={String(edit.settledOn ?? "")} onChange={(e) => onEdit({ settledOn: e.target.value })} />
          {amount > 0 && amount < c.expected && <span className="change-hint">{t("shortfall", { amount: money(c.expected - amount) })}</span>}
        </>
      );
      break;
    }
    case "newPayment":
      label = c.label === "received" ? t("change.newPaymentReceived") : t("change.newPaymentCancellationFee");
      body = (
        <>
          <input className="change-edit" type="number" min={0} aria-label={t("amount")} value={String(edit.amount ?? "")} onChange={(e) => onEdit({ amount: Number(e.target.value) })} />{" "}
          <input className="change-edit" type="date" aria-label={t("settledOn")} value={String(edit.date ?? "")} onChange={(e) => onEdit({ date: e.target.value })} />
        </>
      );
      break;
    case "paymentNote":
      label = t("change.paymentNote", { label: paymentLabel(c.paymentId) });
      body = <span>{c.note}</span>;
      break;
    case "todo":
      label = t(c.purpose === "reply" ? "change.todoReply" : c.purpose === "awaitContract" ? "change.todoAwaitContract" : "change.todoSendInvoice");
      body = (
        <>
          {t("dueBy")} <input className="change-edit" type="date" aria-label={`${label} ${t("dueBy")}`} value={String(edit.dueDate ?? "")} onChange={(e) => onEdit({ dueDate: e.target.value })} />
        </>
      );
      break;
    case "toConfirm":
      label = t("change.toConfirm");
      body = (
        <textarea
          className="change-edit wide"
          rows={Math.max(2, c.items.length)}
          aria-label={label}
          value={((edit.items as string[]) ?? []).join("\n")}
          onChange={(e) => onEdit({ items: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
        />
      );
      break;
  }

  const proposalOnly = intent === "negotiation" && (c.kind === "fee" || c.kind === "field" || c.kind === "date");
  return (
    <div className={ticked ? "change on" : "change"}>
      <input id={id} type="checkbox" checked={ticked} onChange={(e) => onTick(e.target.checked)} />
      <div>
        <label htmlFor={id} className="change-label">
          {label}
        </label>{" "}
        {body}
        {c.asStated && <span className="stated">「{c.asStated}」</span>}
        {proposalOnly && <span className="change-hint">{t("notAgreed")}</span>}
      </div>
    </div>
  );
}
