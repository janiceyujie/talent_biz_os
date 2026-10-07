"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { Modal } from "@/components/app/modal";
import { toRecord, type Editor } from "@/components/app/record-editor";
import { createPaymentPlan } from "@/lib/actions/payments";
import { dateInZone } from "@/lib/domain/dates";
import { splitPayments } from "@/lib/domain/money";
import { useMoney } from "@/lib/i18n/format";
import { isSigned } from "@/lib/domain/phases";
import { projectQuoteTotal, projectSettlement } from "@/lib/domain/workflow";
import { useLabels } from "@/lib/i18n/labels";
import type { Project } from "@/lib/types";

/** What's still open on a project before it can close: shown as one count in the summary, listed under Money. */
export function useClosingChecks(project: Project | null) {
  const data = useAppData();
  const t = useTranslations("workflow");
  const money = useMoney();
  if (!project) return []; // until the full project has loaded
  const settlement = projectSettlement(data, project);
  const items = data.calendar.filter((c) => c.projectId === project.id && !c.archived);
  return [
    project.quotedAmount === null && t("warn.quoteNotSet"),
    !project.details.contractNotes && t("warn.noContract"),
    !project.details.deliverables && t("warn.noDeliverables"),
    !items.length && t("warn.noItems"),
    settlement.openItems.length > 0 && t("warn.openTodos", { count: settlement.openItems.length }),
    settlement.unbilled > 0 && t("warn.unbilled", { amount: money(settlement.unbilled) }),
    settlement.unbilled < 0 && t("warn.overbilled", { amount: money(-settlement.unbilled) }),
    settlement.pending > 0 && t("warn.pending", { amount: money(settlement.pending) }),
    settlement.shortfall > 0 && t("warn.shortfall", { amount: money(settlement.shortfall) }),
    settlement.unpaidCosts.length > 0 && t("warn.unpaidCosts", { count: settlement.unpaidCosts.length }),
  ].filter((w): w is string => !!w);
}

/** A project's money: settlement totals, its payments, the deposit/balance split, and the closing check. */
export function ProjectWorkflowPanel({ project, edit }: { project: Project; edit: (e: Editor) => void }) {
  const data = useAppData();
  const t = useTranslations("workflow");
  const tProjects = useTranslations("projects");
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
  const payments = data.payments.filter((p) => p.projectId === project.id && !p.voided);
  const hasIncome = payments.some((p) => p.direction === "in");
  const quoteSet = project.quotedAmount !== null;
  // New payments need a live, signed project; the server enforces the same rule.
  const canAdd = !project.archived && isSigned(project.stage);
  const checks = useClosingChecks(project);

  let preview: ReturnType<typeof splitPayments> | undefined;
  try {
    if (quoteSet) preview = splitPayments(projectQuoteTotal(project)!, percent);
  } catch {}

  return (
    <section className="deal-workflow" aria-label={t("section")}>
      <dl>
        {[
          [t("quoted"), settlement.quoted ?? tProjects("quoteNotSet")],
          [t("billed"), settlement.billed],
          [t("received"), settlement.received],
          [t("outstanding"), settlement.pending],
          ...(settlement.shortfall > 0 ? [[t("shortfall"), settlement.shortfall] as const] : []),
        ].map(([label, value]) => (
          <div key={String(label)}>
            <dt>{label}</dt>
            <dd>{typeof value === "number" ? money(value) : value}</dd>
          </div>
        ))}
      </dl>
      {canAdd && (
        <div className="deal-tab-actions">
          <button
            className="secondary"
            onClick={() =>
              edit({
                kind: "payment",
                item: {
                  projectId: project.id,
                  label: tProjects("paymentLabel", { title: project.title.slice(0, 190) }),
                  amount: project.quotedAmount === null ? "" : Math.max(0, settlement.unbilled),
                  taxRate: project.taxRate,
                  taxIncluded: true,
                },
              })
            }
          >
            <Plus size={16} aria-hidden="true" />
            {tProjects("addPayment")}
          </button>
          {/* A split only makes sense once, on a set quote, before any payment exists. */}
          {!hasIncome && quoteSet && project.quotedAmount! > 0 && (
            <button className="secondary" onClick={() => setPlan(true)}>
              {t("createPlan")}
            </button>
          )}
          {!quoteSet && <p className="muted">{t("planNeedsQuote")}</p>}
        </div>
      )}
      {payments.length > 0 && (
        <ul className="deal-records">
          {payments.map((p) => (
            <li key={p.id}>
              <button className="deal-record" onClick={() => edit({ kind: "payment", item: toRecord(p) })}>
                <span>{p.label}</span>
                <small>{labels.paymentStatus(p)}</small>
                <strong>{money(p.amount)}</strong>
              </button>
            </li>
          ))}
        </ul>
      )}
      <h3>{t("closingCheck")}</h3>
      {checks.length ? (
        <ul className="deal-check-list">
          {checks.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t("allClear")}</p>
      )}
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
