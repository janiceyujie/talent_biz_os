"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { Modal } from "@/components/app/modal";
import { toRecord, type Editor } from "@/components/app/record-editor";
import { createPaymentPlan } from "@/lib/actions/payments";
import { dateInZone } from "@/lib/domain/dates";
import { splitPayments } from "@/lib/domain/money";
import { useMoney } from "@/lib/i18n/format";
import { projectQuoteTotal, projectSettlement } from "@/lib/domain/workflow";
import { useLabels } from "@/lib/i18n/labels";
import type { Project } from "@/lib/types";

/** What to confirm, settlement, the deposit/balance split, and the closing check for one project. */
export function ProjectWorkflowPanel({
  project,
  edit,
  compose,
}: {
  project: Project;
  edit: (e: Editor) => void;
  compose: (id: string) => void;
}) {
  const data = useAppData();
  const t = useTranslations("workflow");
  const labels = useLabels();
  const money = useMoney();
  const today = dateInZone(data.talent.timeZone);
  const [plan, setPlan] = useState(false);
  const [percent, setPercent] = useState(50);
  const [depositDue, setDepositDue] = useState(today);
  const [balanceDue, setBalanceDue] = useState(project.nextAction?.dueDate || today);
  const [pending, startTransition] = useTransition();
  const [planError, setPlanError] = useState<string | null>(null);
  const settlement = projectSettlement(data, project);
  const payments = data.payments.filter((p) => p.projectId === project.id && !p.archived);
  const items = data.calendar.filter((c) => c.projectId === project.id && !c.archived);
  const drafts = data.drafts.filter((d) => d.projectId === project.id && !d.archived);
  const files = data.files.filter((f) => f.projectId === project.id && !f.archived);
  const hasIncome = payments.some((p) => p.direction === "in");

  let preview: ReturnType<typeof splitPayments> | undefined;
  try {
    preview = splitPayments(projectQuoteTotal(project), percent);
  } catch {}

  const warnings = [
    !project.details.contractNotes && t("warn.noContract"),
    !project.details.deliverables && t("warn.noDeliverables"),
    !items.length && t("warn.noItems"),
    settlement.openItems.length > 0 && t("warn.openTodos", { count: settlement.openItems.length }),
    settlement.unbilled > 0 && t("warn.unbilled", { amount: money(settlement.unbilled) }),
    settlement.unbilled < 0 && t("warn.overbilled", { amount: money(-settlement.unbilled) }),
    settlement.pending > 0 && t("warn.pending", { amount: money(settlement.pending) }),
    settlement.shortfall > 0 && t("warn.shortfall", { amount: money(settlement.shortfall) }),
    settlement.unpaidCosts.length > 0 && t("warn.unpaidCosts", { count: settlement.unpaidCosts.length }),
  ].filter(Boolean);

  return (
    <section aria-label={t("section")}>
      <h3>{t("toConfirm")}</h3>
      <ul>
        {labels.projectQuestions(project.type).map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ul>
      <button className="secondary full" disabled={project.archived} onClick={() => compose(project.id)}>
        {t("draftForProject")}
      </button>
      <h3>{t("payments")}</h3>
      <dl>
        {[
          [t("quoted"), settlement.quoted],
          [t("billed"), settlement.billed],
          [t("received"), settlement.received],
          [t("outstanding"), settlement.pending],
          ...(settlement.shortfall > 0 ? [[t("shortfall"), settlement.shortfall] as const] : []),
        ].map(([label, value]) => (
          <div key={String(label)}>
            <dt>{label}</dt>
            <dd>{money(Number(value))}</dd>
          </div>
        ))}
      </dl>
      <button
        className="secondary full"
        disabled={hasIncome || project.archived || project.quotedAmount <= 0}
        onClick={() => setPlan(true)}
      >
        {t("createPlan")}
      </button>
      {hasIncome && <p className="muted">{t("hasIncome")}</p>}
      <h3>{t("closingCheck")}</h3>
      {warnings.length ? (
        <ul>
          {warnings.map((w) => (
            <li key={String(w)}>{w}</li>
          ))}
        </ul>
      ) : (
        <p>{t("allClear")}</p>
      )}
      <p className="muted">{t("stageNote")}</p>
      <h3>{t("related")}</h3>
      <div className="stack-buttons">
        {items.map((c) => (
          <button key={c.id} className="text-button left" onClick={() => edit({ kind: "calendar", item: toRecord(c) })}>
            {c.source === "todo" ? (c.done ? t("todoDone") : t("todoOpen")) : labels.calendarKind(c.kind)} · {c.date} · {c.title}
          </button>
        ))}
        {payments.map((p) => (
          <button key={p.id} className="text-button left" onClick={() => edit({ kind: "payment", item: toRecord(p) })}>
            {labels.paymentStatus(p)} · {p.label}
          </button>
        ))}
        {drafts.map((d) => (
          <button key={d.id} className="text-button left" onClick={() => edit({ kind: "draft", item: toRecord(d) })}>
            {t("draftItem", { subject: d.subject })}
          </button>
        ))}
        {files.map((f) => (
          <span key={f.id}>{t("fileItem", { name: f.filename })}</span>
        ))}
        {!items.length && !payments.length && !drafts.length && !files.length && <p className="muted">{t("noRelated")}</p>}
      </div>
      {plan && (
        <Modal title={t("planTitle")} onClose={() => setPlan(false)}>
          <form
            className="editor-form"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const failure = await createPaymentPlan({ projectId: project.id, percent, depositDue, balanceDue });
                setPlanError(failure);
                if (!failure) setPlan(false);
              });
            }}
          >
            <p>{t("planIntro")}</p>
            <label>
              {t("depositPercent")}
              <input
                type="number"
                min="0.01"
                max="99.99"
                step="0.01"
                required
                value={percent}
                onChange={(e) => setPercent(Number(e.target.value))}
              />
            </label>
            <label>
              {t("depositDue")}
              <input type="date" required value={depositDue} onChange={(e) => setDepositDue(e.target.value)} />
            </label>
            <label>
              {t("balanceDue")}
              <input type="date" required min={depositDue} value={balanceDue} onChange={(e) => setBalanceDue(e.target.value)} />
            </label>
            {preview ? (
              <p>
                {t("planPreview", { deposit: money(preview.deposit), balance: money(preview.balance), total: money(preview.total) })}
              </p>
            ) : (
              <p role="alert">{t("planInvalid")}</p>
            )}
            <p className="muted">{t("planNote")}</p>
            {planError && (
              <p className="notice error" role="alert">
                {planError}
              </p>
            )}
            <footer className="modal-actions">
              <button type="button" className="secondary" onClick={() => setPlan(false)}>
                {t("cancel")}
              </button>
              <button type="submit" className="primary" disabled={pending || !preview}>
                {t("confirmPlan")}
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </section>
  );
}
