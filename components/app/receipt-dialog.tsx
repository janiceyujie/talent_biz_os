"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { correctReceipt, recordReceipt, withdrawReceipt } from "@/lib/actions/payments";
import { dateInZone } from "@/lib/domain/dates";
import { minorUnitFactor, minorUnits, quote } from "@/lib/domain/money";
import { activeReceipts, paymentCash, paymentTotal, paymentWithheld } from "@/lib/domain/workflow";
import { useMoney } from "@/lib/i18n/format";
import type { Payment, PaymentReceipt } from "@/lib/types";
import { useAppData } from "./app-data";
import { DateTimeInput } from "./date-time-input";
import { Modal } from "./modal";

// Taiwan's usual withholding on a fee: income tax, and the NHI supplementary premium. Shortcuts only.
const WITHHOLDING_RATES = [10, 2.11];

/**
 * Money that arrived or was paid against one payment (decision 0021): record a receipt, any part
 * of it, with what was withheld; or correct or withdraw one already recorded, below. When
 * something's still left, it asks whether more is coming or the payment closes short.
 */
export function ReceiptDialog({ payment, onClose }: { payment: Payment; onClose: () => void }) {
  const t = useTranslations("receipts");
  const money = useMoney();
  const data = useAppData();
  const today = dateInZone(data.talent.timeZone);
  const out = payment.direction === "out";
  const [correcting, setCorrecting] = useState<PaymentReceipt | null>(null);
  // Without the receipt being corrected: what's covered by the others.
  const others = { ...payment, receipts: payment.receipts.filter((r) => r.id !== correcting?.id) };
  const total = paymentTotal(payment);
  const units = (n: number) => minorUnits(n, payment.currency);
  const leftBefore = Math.max(0, units(total) - units(paymentCash(others)) - units(paymentWithheld(others))) / minorUnitFactor(payment.currency);
  const [form, setForm] = useState({ date: today, cash: String(leftBefore), withheld: "", note: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const cash = Number(form.cash) || 0;
  const withheld = Number(form.withheld) || 0;
  const leftAfter = Math.max(0, units(leftBefore) - units(cash) - units(withheld)) / minorUnitFactor(payment.currency);
  const step = payment.currency === "JPY" ? "1" : "0.01";
  const net = quote(payment.amount, payment.taxRate, payment.taxIncluded, payment.currency).net;
  const active = new Set(activeReceipts(payment).map((r) => r.id));
  const replaced = new Set(payment.receipts.flatMap((r) => (r.replacesId ? [r.replacesId] : [])));

  const startCorrecting = (r: PaymentReceipt) => {
    setCorrecting(r);
    setForm({ date: r.date, cash: String(r.cash), withheld: r.withheld ? String(r.withheld) : "", note: r.note ?? "" });
    setError(null);
  };
  const startNew = () => {
    setCorrecting(null);
    setForm({ date: today, cash: String(Math.max(0, units(total) - units(paymentCash(payment)) - units(paymentWithheld(payment))) / minorUnitFactor(payment.currency)), withheld: "", note: "" });
    setError(null);
  };
  const submit = () =>
    startTransition(async () => {
      const values = { ...form, withheld: form.withheld || 0, rest:"coming" };
      const failure = correcting ? await correctReceipt({ ...values, receiptId: correcting.id }) : await recordReceipt({ ...values, paymentId: payment.id });
      setError(failure);
      if (!failure) onClose();
    });
  const withdraw = (r: PaymentReceipt) =>
    startTransition(async () => {
      const failure = await withdrawReceipt(r.id);
      setError(failure);
      if (!failure) onClose();
    });

  return (
    <Modal title={t(correcting ? "correctTitle" : "title", { direction: payment.direction })} onClose={onClose}>
      <form
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <fieldset className="editor-fields" disabled={pending}>
          <p>
            <strong>{payment.label}</strong>
            <br />
            {t("summary", {
              total: money(total, payment.currency),
              cash: money(paymentCash(payment), payment.currency),
              withheld: money(paymentWithheld(payment), payment.currency),
            })}
          </p>
          <div className="form-grid">
            <DateTimeInput kind="date" required label={t(out ? "datePaid" : "dateReceived")} value={form.date} today={today} onChange={(date) => setForm((f) => ({ ...f, date }))} />
            <label>
              {t(out ? "cashPaid" : "cashReceived")} *
              <input type="number" required min="0" step={step} value={form.cash} onChange={(e) => setForm((f) => ({ ...f, cash: e.target.value }))} />
            </label>
            <div>
              <label>
                {t("withheld")}
                <input type="number" min="0" step={step} value={form.withheld} onChange={(e) => setForm((f) => ({ ...f, withheld: e.target.value }))} />
              </label>
              <div className="row-actions">
                {WITHHOLDING_RATES.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    className="text-button"
                    onClick={() => setForm((f) => ({ ...f, withheld: String((units(Number(f.withheld) || 0) + units((net * rate) / 100)) / minorUnitFactor(payment.currency)) }))}
                  >
                    {t("addRate", { rate })}
                  </button>
                ))}
              </div>
            </div>
            <label>
              {t("note")}
              <input type="text" maxLength={500} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
            </label>
          </div>
          <p className="muted">{t("withheldHelp")}</p>
          {leftAfter > 0 && (
            <fieldset className="form-section">
              <legend>{t("restLegend", { amount: money(leftAfter, payment.currency) })}</legend>
              <p>{t(out ? "restComingOut" : "restComing")}</p>
            </fieldset>
          )}
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <footer className="modal-actions">
            <button type="button" className="secondary" onClick={correcting ? startNew : onClose}>
              {t("cancel")}
            </button>
            <button type="submit" className="primary">
              {t(correcting ? "saveCorrection" : "save")}
            </button>
          </footer>
        </fieldset>
      </form>
      {payment.receipts.length > 0 && (
        <section className="section-gap" aria-label={t("history")}>
          <h3>{t("history")}</h3>
          <ul className="deal-records">
            {payment.receipts
              .filter((r) => !r.withdrawn)
              .map((r) => (
                <li key={r.id} className="deal-record">
                  <span className={active.has(r.id) ? "" : "struck"}>
                    {r.date} · {money(r.cash, payment.currency)}
                    {r.withheld > 0 && ` · ${t("withheldAmount", { amount: money(r.withheld, payment.currency) })}`}
                    {r.note && ` · ${r.note}`}
                  </span>
                  <small>{active.has(r.id) ? "" : t(replaced.has(r.id) && payment.receipts.some((x) => x.replacesId === r.id && x.withdrawn) ? "withdrawnLabel" : "correctedLabel")}</small>
                  {active.has(r.id) && (
                    <span className="row-actions">
                      <button type="button" className="text-button" disabled={pending} onClick={() => startCorrecting(r)}>
                        {t("correct")}
                      </button>
                      <button type="button" className="text-button" disabled={pending} onClick={() => withdraw(r)}>
                        {t("withdraw")}
                      </button>
                    </span>
                  )}
                </li>
              ))}
          </ul>
        </section>
      )}
    </Modal>
  );
}
