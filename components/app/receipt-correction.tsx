"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { amendPaymentReceipt } from "@/lib/actions/payments";
import { amendReceipt, paymentBalance, receiptHistory, ReceiptError, type PaymentReceipt } from "@/lib/domain/payment-receipts";
import { money, minorUnitFactor } from "@/lib/domain/money";
import type { Payment } from "@/lib/types";
import { Modal } from "./modal";
import { DateTimeInput } from "./date-time-input";
import { useReminderFeed } from "./reminder-feed";

export function ReceiptCorrection({ payment, receipt, operation, today, onCancel, onDone }: {
  payment: Payment; receipt: PaymentReceipt; operation: "correct" | "withdraw"; today: string;
  onCancel: () => void; onDone: () => void;
}) {
  const t = useTranslations("editor.receiptCorrection"), common = useTranslations("common"), locale = useLocale();
  const errors = useTranslations("errors");
  const feed = useReminderFeed();
  const [requestId] = useState(() => crypto.randomUUID());
  const [date, setDate] = useState(receipt.date || today);
  const [cash, setCash] = useState(String(receipt.cash));
  const [withheld, setWithheld] = useState(String(receipt.withheld));
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const withdraw = operation === "withdraw";
  const revision = receiptHistory(payment).length;
  const before = paymentBalance(payment);
  const input = { id: requestId, targetId: receipt.id, revision, operation, date,
    cash: withdraw ? 0 : cash === "" ? NaN : Number(cash), withheld: withdraw ? 0 : withheld === "" ? NaN : Number(withheld),
    note: note.trim() || "Preview", recordedAt: "", recordedBy: "" };
  let after: ReturnType<typeof paymentBalance> | null = null;
  let previewError: string | null = null;
  try { after = paymentBalance({ ...payment, ...amendReceipt(payment, input) }); }
  catch (error) { if (error instanceof ReceiptError) previewError = errors(error.code); }
  const close = () => { if (!pending) { if (confirming) setConfirming(false); else onCancel(); } };
  return <Modal title={t(withdraw ? "withdrawTitle" : "correctTitle")} onClose={close} narrow>
    <form onSubmit={async event => {
      event.preventDefault();
      if (!after) { setError(errors("receiptInvalid")); return; }
      if (!confirming) { setError(null); setConfirming(true); return; }
      setPending(true); setError(null);
      try {
        const failure = await amendPaymentReceipt({ paymentId: payment.id, targetId: receipt.id, requestId,
          revision, operation, date, cash: input.cash, withheld: input.withheld, note });
        if (failure) { setError(failure); setConfirming(false); }
        else { await feed.reload(); onDone(); }
      } catch { setError(t("failed")); }
      finally { setPending(false); }
    }}>
      <fieldset className="editor-fields" disabled={pending}>
        <p>{payment.label} · {receipt.date}</p>
        {!confirming && !withdraw && <div className="form-grid">
          <DateTimeInput kind="date" label={t("date")} value={date} onChange={setDate} today={today} required/>
          <label>{t(payment.direction === "out" ? "cashOut" : "cash")}<input type="number" required min={0} max={9_999_999_999.99} step={1 / minorUnitFactor(payment.currency)} value={cash} onChange={e => setCash(e.target.value)}/></label>
          {payment.direction === "in" && <label>{t("withheld")}<input type="number" required min={0} max={9_999_999_999.99} step={1 / minorUnitFactor(payment.currency)} value={withheld} onChange={e => setWithheld(e.target.value)}/></label>}
        </div>}
        {!confirming && <label>{t("reason")}<textarea required maxLength={500} value={note} onChange={e => setNote(e.target.value)}/></label>}
        <dl className="editor-money-summary" aria-live="polite" aria-atomic="true">
          <div><dt>{t("before")}</dt><dd>{money(before.remaining, locale, payment.currency)}</dd></div>
          <div className="is-total"><dt>{t("after")}</dt><dd>{after ? money(after.remaining, locale, payment.currency) : "—"}</dd></div>
        </dl>
        {confirming && <><p>{withdraw ? t("withdrawConfirm") : t("correctConfirm", {cash: money(input.cash, locale, payment.currency), withheld: money(input.withheld, locale, payment.currency), date})}</p><p className="muted">{note}</p></>}
        {payment.projectId && after && after.remaining > 0 && <p role="status">{t("projectReopens")}</p>}
        <p className="muted">{t("auditHelp")}</p>
        {(error || previewError) && <p role="alert">{error || previewError}</p>}
        <footer className="modal-actions">
          <button type="button" className="secondary" onClick={close}>{common("cancel")}</button>
          <button type="submit" className="primary" disabled={!after || !note.trim() || pending}>{pending ? t("saving") : confirming ? t("confirm") : t("review")}</button>
        </footer>
      </fieldset>
    </form>
  </Modal>;
}
