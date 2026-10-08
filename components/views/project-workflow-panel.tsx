"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { Modal } from "@/components/app/modal";
import { DealCard } from "./deal-card";
import { toRecord, type Editor } from "@/components/app/record-editor";
import { createPaymentPlan } from "@/lib/actions/payments";
import { dateInZone } from "@/lib/domain/dates";
import { splitPayments } from "@/lib/domain/money";
import { useMoney } from "@/lib/i18n/format";
import { isSigned } from "@/lib/domain/phases";
import { projectQuoteTotal, projectSettlement } from "@/lib/domain/workflow";
import { useLabels } from "@/lib/i18n/labels";
import type { Project } from "@/lib/types";

/**
 * What a check is about, which decides how it's fixed: a field of the
 * project (`edit`), money (`billing`: request a payment; `received`: record
 * one coming in), the schedule (`schedule`), or a look at the Money tab
 * (`money`). To-dos aren't here: they're tasks, listed and ticked on their own.
 */
export type CheckFix =
  | { kind: "edit"; field: string }
  | { kind: "billing"; amount: number }
  | { kind: "received"; paymentId: string | null }
  | { kind: "schedule" }
  | { kind: "money" };

/** One thing a project needs before it can close: met or not, worded for each, and how it's fixed. */
export type ClosingCheck = { key: string; met: boolean; open: string; done: string; fix: CheckFix };

/**
 * Everything a signed project needs before it can close, met or not (the
 * "what needs doing" list shows both; the Money tab lists what's open). A
 * money check that can't be met in the usual way (billed too much, received
 * short, costs unpaid) only shows while it's open.
 */
export function useClosingChecks(project: Project | null): ClosingCheck[] {
  const data = useAppData();
  const t = useTranslations("workflow");
  const money = useMoney();
  if (!project) return []; // until the full project has loaded
  const settlement = projectSettlement(data, project);
  const items = data.calendar.filter((c) => c.projectId === project.id && !c.archived);
  const expected = data.payments
    .filter((p) => p.projectId === project.id && !p.voided && p.direction === "in" && p.status === "expected")
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  const all: (ClosingCheck & { always: boolean })[] = [
    { key: "quote", always: true, met: project.quotedAmount !== null, open: t("warn.quoteNotSet"), done: t("met.quote"), fix: { kind: "edit", field: "quotedAmount" } },
    { key: "contract", always: true, met: !!project.details.contractNotes, open: t("warn.noContract"), done: t("met.contract"), fix: { kind: "edit", field: "contractNotes" } },
    { key: "deliverables", always: true, met: !!project.details.deliverables, open: t("warn.noDeliverables"), done: t("met.deliverables"), fix: { kind: "edit", field: "deliverables" } },
    { key: "schedule", always: true, met: items.length > 0, open: t("warn.noItems"), done: t("met.schedule"), fix: { kind: "schedule" } },
    {
      key: "billing",
      always: true,
      met: settlement.unbilled <= 0 && settlement.billed > 0,
      open: settlement.unbilled > 0 ? t("warn.unbilled", { amount: money(settlement.unbilled) }) : t("warn.notBilled"),
      done: t("met.billing"),
      fix: { kind: "billing", amount: Math.max(0, settlement.unbilled) },
    },
    {
      key: "received",
      always: true,
      met: settlement.pending <= 0 && settlement.received > 0,
      open: settlement.pending > 0 ? t("warn.pending", { amount: money(settlement.pending) }) : t("warn.nothingReceived"),
      done: t("met.received"),
      fix: { kind: "received", paymentId: expected[0]?.id ?? null },
    },
    { key: "overbilled", always: false, met: settlement.unbilled >= 0, open: t("warn.overbilled", { amount: money(-settlement.unbilled) }), done: "", fix: { kind: "money" } },
    { key: "shortfall", always: false, met: settlement.shortfall <= 0, open: t("warn.shortfall", { amount: money(settlement.shortfall) }), done: "", fix: { kind: "money" } },
    { key: "costs", always: false, met: !settlement.unpaidCosts.length, open: t("warn.unpaidCosts", { count: settlement.unpaidCosts.length }), done: "", fix: { kind: "money" } },
  ];
  return all.filter((c) => c.always || !c.met).map(({ key, met, open, done, fix }) => ({ key, met, open, done, fix }));
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
    <section className="deal-workflow deal-cards" aria-label={t("section")}>
      <DealCard title={t("payments")}>
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
      </DealCard>
      <DealCard title={t("closingCheck")}>
        {checks.some((c) => !c.met) ? (
          <ul className="deal-check-list">
            {checks
              .filter((c) => !c.met)
              .map((c) => (
                <li key={c.key}>{c.open}</li>
              ))}
          </ul>
        ) : (
          <p className="muted">{t("allClear")}</p>
        )}
      </DealCard>
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
