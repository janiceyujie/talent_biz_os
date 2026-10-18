"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toRecord, type Editor } from "@/components/app/record-editor";
import { paymentRemaining } from "@/lib/domain/workflow";
import { useMoney } from "@/lib/i18n/format";
import { useLabels } from "@/lib/i18n/labels";
import type { Payment } from "@/lib/types";
import { useDue } from "./use-due";

const PAGE_SIZE = 5;

/** Work directly on the outstanding balance, using the shared audited receipt editor. */
export function ProjectOutstandingPayments({ payments, direction, edit }: {
  payments: Payment[];
  direction: Payment["direction"];
  edit: (editor: Editor) => void;
}) {
  const t = useTranslations("projects.outstanding");
  const labels = useLabels();
  const money = useMoney();
  const due = useDue();
  const [shown, setShown] = useState(PAGE_SIZE);
  const [expanded, setExpanded] = useState(true);
  if (!payments.length) return null;
  const action = t(direction === "in" ? "recordReceipt" : "recordPayment");
  return (
    <details className="project-open-payments" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary>
        <ChevronRight size={14} aria-hidden="true" />
        {t(direction === "in" ? "receivable" : "payable")}
        <span className="count-pill">{payments.length}</span>
      </summary>
      <ul>
        {payments.slice(0, shown).map(payment => {
          const deadline = due(payment.dueDate);
          return (
            <li key={payment.id}>
              <div className="project-open-payment-copy">
                <strong>{payment.label}</strong>
                <div className="project-open-payment-meta">
                  <span>{labels.installment(payment.installment)}</span>
                  {payment.dueDate ? <time dateTime={payment.dueDate} className={deadline ? `due ${deadline.tone}` : undefined}>{payment.dueDate}{deadline && ` · ${deadline.text}`}</time> : <span>{t("noDeadline")}</span>}
                </div>
              </div>
              <div className="project-open-payment-action">
                <strong aria-label={t("remaining", { amount: money(paymentRemaining(payment), payment.currency) })}>{money(paymentRemaining(payment), payment.currency)}</strong>
                <button type="button" className="secondary" aria-label={t("recordNamed", { action, title: payment.label })}
                  onClick={() => edit({ kind:"payment", item:{...toRecord(payment),receiptEntry:true}, focus:"settledAmount" })}>
                  {action}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {payments.length > shown && <button type="button" className="text-button" onClick={() => setShown(n => n + PAGE_SIZE)}>{t("more", { count:payments.length - shown })}</button>}
    </details>
  );
}
