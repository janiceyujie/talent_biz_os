"use client";

import { ActionNotice } from "@/components/app/action-notice";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getPaymentReceiptActors } from "@/lib/actions/payment-history";
import { receiptAudit, type PaymentReceipt } from "@/lib/domain/payment-receipts";
import { useMoney } from "@/lib/i18n/format";
import type { Payment } from "@/lib/types";

export function PaymentReceiptHistory({payment, timeZone, disabled, preview, onAmend}: {
  payment: Payment; timeZone: string; disabled: boolean; preview: boolean;
  onAmend: (receipt: PaymentReceipt, operation: "correct" | "withdraw") => void;
}) {
  const t = useTranslations("editor.receiptAudit");
  const actions = useTranslations("editor.receiptCorrection");
  const locale = useLocale(), money = useMoney();
  const [actors, setActors] = useState<Record<string, string> | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const entries = receiptAudit(payment);
  const needsActors = entries.some(({row}) => row.recordedBy);
  useEffect(() => {
    if (preview || !needsActors) return;
    let cancelled = false;
    getPaymentReceiptActors(payment.id).then(result => {
      if (cancelled) return;
      setActors(result); setFailed(result === null);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [payment.id, payment.receipts?.length, preview, needsActors, retry]);
  const amount = (value: number) => money(value, payment.currency);
  const delta = (value: number) => value === 0 ? t("unchanged") : t(value > 0 ? "increase" : "decrease", {amount:amount(Math.abs(value))});
  return <>
    {failed && <ActionNotice role="status" actions={<button type="button" className="text-button" onClick={() => {setFailed(false);setRetry(n => n + 1);}}>{t("retry")}</button>}>{t("loadFailed")}</ActionNotice>}
    <ol className="receipt-audit-list">{entries.map(({row, previous, successor, active, cashDelta, withheldDelta}) => {
      const actor = !row.recordedBy ? t("actorUnknown") : actors?.[row.recordedBy] || (preview ? t("actorUnknown") : failed ? t("actorUnavailable") : actors ? t("actorUnavailable") : t("loading"));
      const timestamp = row.recordedAt && Number.isFinite(Date.parse(row.recordedAt)) ? row.recordedAt : null;
      const stamp = timestamp ? new Intl.DateTimeFormat(locale, {timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false,timeZoneName:"short"}).format(new Date(timestamp)) : t("timeUnknown");
      const type = row.withdrawn ? "withdrawn" : row.replaces ? "corrected" : "recorded";
      const values: {key:"cashIn" | "cashOut" | "withheld"; before:number | undefined; after:number; difference:number | null}[] = [{key:payment.direction === "in" ? "cashIn" : "cashOut",before:previous?.cash,after:row.cash,difference:cashDelta},
        ...((row.withheld > 0 || (previous?.withheld ?? 0) > 0) ? [{key:"withheld" as const,before:previous?.withheld,after:row.withheld,difference:withheldDelta}] : [])];
      return <li key={row.id}>
        <div className="receipt-audit-heading"><strong>{t(type)}</strong><span>{active ? t("effective") : successor?.withdrawn || row.withdrawn ? t("voided") : t("superseded")}</span></div>
        <div className="receipt-audit-meta"><span>{t("by", {name:actor})}</span>{timestamp ? <time dateTime={timestamp}>{stamp}</time> : <span>{stamp}</span>}</div>
        <div className="receipt-audit-date">{previous && previous.date !== row.date ? t("dateChanged", {before:previous.date || t("timeUnknown"),after:row.date}) : t("paymentDate", {date:row.date || t("timeUnknown")})}</div>
        {previous ? <div className="receipt-audit-table-wrap"><table className="receipt-audit-table">
          <caption className="sr-only">{t("comparison")}</caption>
          <thead><tr><th scope="col">{t("item")}</th><th scope="col">{t("before")}</th><th scope="col">{t("after")}</th><th scope="col">{t("difference")}</th></tr></thead>
          <tbody>{values.map(value => <tr key={value.key}><th scope="row">{t(value.key)}</th><td data-label={t("before")}>{amount(value.before!)}</td><td data-label={t("after")}>{amount(value.after)}</td><td data-label={t("difference")}>{delta(value.difference!)}</td></tr>)}</tbody>
        </table></div> : <div className="receipt-audit-amounts">{values.map(value => <span key={value.key}>{t(value.key)} {amount(value.after)}</span>)}</div>}
        {row.replaces && !previous && <p className="receipt-audit-note">{t("missingOriginal")}</p>}
        {row.note && <p className="receipt-audit-note">{t("reason", {reason:row.note})}</p>}
        {active && <div className="receipt-actions">
          <button type="button" className="text-button" disabled={disabled} onClick={() => onAmend(row,"correct")}>{actions("correct")}</button>
          <button type="button" className="text-button" disabled={disabled} onClick={() => onAmend(row,"withdraw")}>{actions("withdraw")}</button>
        </div>}
      </li>;
    })}</ol>
  </>;
}
