"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toRecord, type Editor } from "@/components/app/record-editor";
import { paymentBalance } from "@/lib/domain/payment-receipts";
import { useMoney } from "@/lib/i18n/format";
import type { Payment } from "@/lib/types";

/** Keep settled records discoverable without adding them to the outstanding count. */
export function ProjectSettledPayments({ payments, edit }: {
  payments: Payment[];
  edit: (editor: Editor) => void;
}) {
  const t = useTranslations("projects.settledPayments");
  const more = useTranslations("projects.outstanding");
  const money = useMoney();
  const [shown, setShown] = useState(5);
  if (!payments.length) return null;
  return <details className="project-open-payments">
    <summary><ChevronRight size={14} aria-hidden="true" />{t("title")}<span className="count-pill">{payments.length}</span></summary>
    <ul>{payments.slice(0, shown).map(payment => {
      const balance = paymentBalance(payment);
      return <li key={payment.id}>
        <div className="project-open-payment-copy">
          <strong>{payment.label}</strong>
          <div className="project-open-payment-meta">
            <span>{t(payment.direction === "in" ? "received" : "paid")} {money(balance.cash, payment.currency)}</span>
            {balance.withheld > 0 && <span>{t("withheld", {amount:money(balance.withheld, payment.currency)})}</span>}
            {payment.settledDate && <time dateTime={payment.settledDate}>{payment.settledDate}</time>}
          </div>
        </div>
        <div className="project-open-payment-action">
          <button type="button" className="secondary" aria-label={t("viewNamed", {title:payment.label})}
            onClick={() => edit({kind:"payment",item:toRecord(payment),focus:"receiptHistory"})}>{t("view")}</button>
        </div>
      </li>;
    })}</ul>
    {payments.length > shown && <button type="button" className="text-button" onClick={() => setShown(n => n + 5)}>{more("more", {count:payments.length - shown})}</button>}
  </details>;
}
