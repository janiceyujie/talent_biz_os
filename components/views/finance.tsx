"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { DateTimeInput } from "@/components/app/date-time-input";
import { FinanceInsights } from "./finance-insights";
import { ReceiptDialog } from "@/components/app/receipt-dialog";
import { RecordEditor, toRecord, type Editor } from "@/components/app/record-editor";
import { voidPayment } from "@/lib/actions/payments";
import { dateInZone } from "@/lib/domain/dates";
import { quote, supportedCurrencies, type Currency } from "@/lib/domain/money";
import { useCurrencyName, useMoney } from "@/lib/i18n/format";
import { paymentCash, paymentDate, paymentRemaining, paymentShort, paymentTotal, paymentWithheld, summarize } from "@/lib/domain/workflow";
import { useLabels } from "@/lib/i18n/labels";
import type { AppData, Payment } from "@/lib/types";

export function Metric({ label, value, note, tone = "plain" }: { label: string; value: string; note: string; tone?: string }) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{note}</span>
    </article>
  );
}

const donutColors = ["var(--lime)", "var(--orange)", "var(--blue)", "var(--violet)", "#80887c"];

export function Revenue({ data, from = "", to = "9999-12-31", currency = "TWD" }: { data: AppData; from?: string; to?: string; currency?: Currency }) {
  const t = useTranslations("finance");
  const tEyebrow = useTranslations("eyebrow");
  const labels = useLabels();
  const money = useMoney();
  const s = summarize(data, from, to, currency);
  let pos = 0;
  const gradient = s.split
    .map((part, i) => {
      const start = pos;
      pos += s.received ? (part.amount / s.received) * 100 : 0;
      return `${donutColors[i]} ${start}% ${pos}%`;
    })
    .join(",");
  return (
    <section className="surface revenue-card">
      <div className="section-header">
        <div>
          <span>{tEyebrow("revenueMix")}</span>
          <h2>{t("revenueTitle")}</h2>
        </div>
      </div>
      <div className="revenue-body">
        <div
          className="donut"
          role="img"
          aria-label={t("revenueAria", { amount: money(s.received, currency) })}
          style={{ background: s.received ? `conic-gradient(${gradient})` : "var(--line)" }}
        >
          <div>
            <strong>{money(s.received, currency)}</strong>
            <span>{t("revenueCaption")}</span>
          </div>
        </div>
        <div className="legend">
          {s.split.map((v, i) => (
            <div key={v.type}>
              <i style={{ background: donutColors[i] }} />
              <span>{labels.projectType(v.type)}</span>
              <strong>{s.received ? Math.round((v.amount / s.received) * 100) : 0}%</strong>
              <small>{money(v.amount, currency)}</small>
            </div>
          ))}
        </div>
      </div>
      {!s.received && <p className="muted">{t("revenueEmpty")}</p>}
    </section>
  );
}

export function download(content: string, name: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Prefix cells that spreadsheets would treat as formulas.
function csvCell(v: unknown) {
  const s = String(v ?? "");
  return `"${(/^[=+@\-\t\r]/.test(s) ? "'" : "") + s.replaceAll('"', '""')}"`;
}

export function FinanceView({readOnly=false}:{readOnly?:boolean}) {
  const data = useAppData();
  const t = useTranslations("finance");
  const tEyebrow = useTranslations("eyebrow");
  const labels = useLabels();
  const money = useMoney();
  const currencyName = useCurrencyName();
  // Totals are per currency (no conversion yet); the ledger and every figure follow this choice.
  const [currency, setCurrency] = useState<Currency>("TWD");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [receiptFor, setReceiptFor] = useState<Payment | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [base, setBase] = useState(50000);
  const [rate, setRate] = useState(5);
  const [included, setIncluded] = useState(false);
  const [showVoided, setShowVoided] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const today = dateInZone(data.talent.timeZone);
  const s = summarize(data, from, to || "9999-12-31", currency);
  const q = quote(Math.max(0, base || 0), Math.max(0, Math.min(100, rate || 0)), included, currency);
  const rows = showVoided
    ? data.payments.filter((p) => p.voided && p.currency === currency && paymentDate(p) >= from && paymentDate(p) <= (to || "9999-12-31"))
    : s.rows;

  function exportCsv() {
    const table = [
      (["recorded", "settled", "installment", "name", "direction", "category", "currency", "net", "tax", "total", "received", "withheld", "status", "due", "invoice"] as const).map(
        (column) => t(`csv.${column}`),
      ),
      ...rows.map((p) => {
        const amounts = quote(p.amount, p.taxRate, p.taxIncluded, p.currency);
        return [
          p.recordedDate,
          p.settledDate,
          labels.installment(p.installment),
          p.label,
          labels.direction(p.direction),
          labels.projectType(p.projectType),
          p.currency,
          amounts.net,
          amounts.tax,
          amounts.total,
          paymentCash(p),
          paymentWithheld(p),
          labels.paymentStatus(p),
          p.dueDate,
          p.invoiceRef,
        ];
      }),
    ];
    download("﻿" + table.map((row) => row.map(csvCell).join(",")).join("\r\n"), t("csv.filename", { currency }));
  }

  return (
    <div className="finance-workspace">
      <div className="toolbar wrap">
        <label>
          {t("currency")}
          <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
            {supportedCurrencies.map((c) => (
              <option key={c} value={c}>
                {c} · {currencyName(c)}
              </option>
            ))}
          </select>
        </label>
        <DateTimeInput kind="date" label={t("from")} value={from} onChange={setFrom} today={today} />
        <DateTimeInput kind="date" label={t("to")} value={to} onChange={setTo} today={today} />
        <button className="secondary" onClick={exportCsv}>
          {t("exportCsv")}
        </button>
      </div>
      {/* One summary: net cash leads, the four flows support it. */}
      <section className="finance-summary" aria-label={t("summaryLabel")}>
        <Metric label={t("metricNet")} value={money(s.received - s.paid, currency)} note={t("metricNetNote")} tone="dark" />
        <Metric label={t("metricReceived")} value={money(s.received, currency)} note={t("metricReceivedNote")} />
        <Metric label={t("metricReceivable")} value={money(s.receivable, currency)} note={t("metricReceivableNote")} />
        <Metric label={t("metricPaid")} value={money(s.paid, currency)} note={t("metricPaidNote")} />
        <Metric label={t("metricPayable")} value={money(s.payable, currency)} note={t("metricPayableNote")} />
      </section>
      <FinanceInsights currency={currency} />
      <div className="finance-grid">
        <Revenue data={data} from={from} to={to || "9999-12-31"} currency={currency} />
        <section className="surface tax-card">
          <div className="section-header">
            <div>
              <span>{tEyebrow("quoteCalculator")}</span>
              <h2>{t("calculatorTitle")}</h2>
            </div>
          </div>
          <label>
            {t("quoteAmount")}
            <input type="number" min="0" step={currency === "JPY" ? "1" : "0.01"} value={base} onChange={(e) => setBase(Number(e.target.value))} />
          </label>
          <label>
            {t("taxRate")}
            <input type="number" min="0" max="100" step="0.01" value={rate} onChange={(e) => setRate(Number(e.target.value))} />
          </label>
          <div className="segmented">
            <button className={!included ? "active" : ""} aria-pressed={!included} onClick={() => setIncluded(false)}>
              {t("enterExclusive")}
            </button>
            <button className={included ? "active" : ""} aria-pressed={included} onClick={() => setIncluded(true)}>
              {t("enterInclusive")}
            </button>
          </div>
          <dl>
            {[
              [t("net"), q.net],
              [t("tax"), q.tax],
              [t("total"), q.total],
            ].map(([l, v]) => (
              <div key={String(l)}>
                <dt>{l}</dt>
                <dd>{money(Number(v), currency)}</dd>
              </div>
            ))}
          </dl>
          <button
            className="secondary full" disabled={readOnly}
            onClick={() =>
              setEditor({ kind: "payment", item: { label: t("quoteRecordLabel"), amount: base, currency, taxRate: rate, taxIncluded: included } })
            }
          >
            {t("useInLedger")}
          </button>
        </section>
      </div>
      <section className="surface ledger-card">
        <div className="section-header">
          <div>
            <span>{tEyebrow("ledger")}</span>
            <h2>{t("ledgerTitle")}</h2>
          </div>
          <button disabled={readOnly} className="primary" onClick={() => setEditor({ kind: "payment", item: { currency } })}>{t("newEntry")}</button>
        </div>
        <label className="check-line">
          <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} />
          {t("showVoided")}
        </label>
        <p className="muted">{t("voidHelp")}</p>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("colDateName")}</th>
                <th>{t("colCategory")}</th>
                <th>{t("colStatus")}</th>
                <th>{t("colTotal")}</th>
                <th>{t("colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.label}</strong>
                    <small>
                      {t("recorded", { date: p.recordedDate, installment: labels.installment(p.installment), invoice: p.invoiceRef || t("noInvoice") })}
                    </small>
                    {p.settledDate && <small>{t("settledOn", { date: p.settledDate })}</small>}
                  </td>
                  <td>
                    {p.projectId ? labels.projectType(p.projectType) : labels.unlinked()} · {labels.direction(p.direction)}
                  </td>
                  <td>
                    {labels.paymentStatus(p)}
                    {p.direction === "in" && p.status === "expected" && p.dueDate && p.dueDate < today && (
                      <span className="danger-text"> · {t("overdue")}</span>
                    )}
                  </td>
                  <td>
                    {money(paymentTotal(p), p.currency)}
                    {paymentCash(p) + paymentWithheld(p) > 0 && paymentCash(p) !== paymentTotal(p) && (
                      <small>
                        {t("receivedSoFar", { direction: p.direction, cash: money(paymentCash(p), p.currency) })}
                        {paymentWithheld(p) > 0 && ` · ${t("withheldSoFar", { amount: money(paymentWithheld(p), p.currency) })}`}
                      </small>
                    )}
                    {paymentRemaining(p) > 0 && paymentRemaining(p) !== paymentTotal(p) && (
                      <small>{t("left", { direction: p.direction, amount: money(paymentRemaining(p), p.currency) })}</small>
                    )}
                    {paymentShort(p) > 0 && <small>{t("short", { amount: money(paymentShort(p), p.currency) })}</small>}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button disabled={readOnly} className="secondary compact" onClick={() => setEditor({ kind: "payment", item: toRecord(p) })}>
                        {t("edit")}
                      </button>
                      {!p.voided && (p.status === "expected" || p.receipts.length > 0) && (
                        <button disabled={readOnly} className="secondary compact" onClick={() => setReceiptFor(p)}>
                          {p.status === "expected" ? t("markSettled", { direction: p.direction }) : t("receipts")}
                        </button>
                      )}
                      <button
                        className="text-button"
                        disabled={pending}
                        onClick={() => startTransition(async () => setError(await voidPayment(p.id, !p.voided)))}
                      >
                        {p.voided ? t("restore") : t("void")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <p className="empty">{t("empty")}</p>}
      </section>
      <p className="finance-note">
        {t("footnote")}
      </p>
      {!readOnly && editor && <RecordEditor editor={editor} onClose={() => setEditor(null)} />}
      {!readOnly && receiptFor && <ReceiptDialog payment={receiptFor} onClose={() => setReceiptFor(null)} />}
    </div>
  );
}
