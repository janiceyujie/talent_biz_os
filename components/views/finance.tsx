"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { FinanceInsights } from "./finance-insights";
import { RecordEditor, toRecord, type Editor } from "@/components/app/record-editor";
import { voidPayment } from "@/lib/actions/payments";
import { dateInZone } from "@/lib/domain/dates";
import { quote, supportedCurrencies } from "@/lib/domain/money";
import { useMoney } from "@/lib/i18n/format";
import { paymentCash, paymentDate, paymentTotal, summarize } from "@/lib/domain/workflow";
import { useLabels } from "@/lib/i18n/labels";
import type { AppData } from "@/lib/types";

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

export function Revenue({ data, from = "", to = "9999-12-31" }: { data: AppData; from?: string; to?: string }) {
  const t = useTranslations("finance");
  const tEyebrow = useTranslations("eyebrow");
  const labels = useLabels();
  const money = useMoney();
  const s = summarize(data, from, to);
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
          aria-label={t("revenueAria", { amount: money(s.received) })}
          style={{ background: s.received ? `conic-gradient(${gradient})` : "var(--line)" }}
        >
          <div>
            <strong>{money(s.received)}</strong>
            <span>{t("revenueCaption")}</span>
          </div>
        </div>
        <div className="legend">
          {s.split.map((v, i) => (
            <div key={v.type}>
              <i style={{ background: donutColors[i] }} />
              <span>{labels.projectType(v.type)}</span>
              <strong>{s.received ? Math.round((v.amount / s.received) * 100) : 0}%</strong>
              <small>{money(v.amount)}</small>
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

export function FinanceView() {
  const data = useAppData();
  const t = useTranslations("finance");
  const tEyebrow = useTranslations("eyebrow");
  const labels = useLabels();
  const money = useMoney();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [base, setBase] = useState(50000);
  const [rate, setRate] = useState(5);
  const [included, setIncluded] = useState(false);
  const [showVoided, setShowVoided] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const today = dateInZone(data.talent.timeZone);
  const s = summarize(data, from, to || "9999-12-31");
  const q = quote(Math.max(0, base || 0), Math.max(0, Math.min(100, rate || 0)), included);
  const rows = showVoided
    ? data.payments.filter((p) => p.voided && paymentDate(p) >= from && paymentDate(p) <= (to || "9999-12-31"))
    : s.rows;

  function exportCsv() {
    const table = [
      (["recorded", "settled", "installment", "name", "direction", "category", "currency", "net", "tax", "total", "status", "due", "invoice"] as const).map(
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
          labels.paymentStatus(p),
          p.dueDate,
          p.invoiceRef,
        ];
      }),
    ];
    download("﻿" + table.map((row) => row.map(csvCell).join(",")).join("\r\n"), t("csv.filename"));
  }

  return (
    <>
      <div className="toolbar wrap">
        <label>
          {t("currency")}
          <select value="TWD" disabled>
            {supportedCurrencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          {t("from")}
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          {t("to")}
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button className="secondary" onClick={exportCsv}>
          {t("exportCsv")}
        </button>
      </div>
      <section className="metrics-grid finance-metrics">
        <Metric label={t("metricReceived")} value={money(s.received)} note={t("metricReceivedNote")} tone="dark" />
        <Metric label={t("metricReceivable")} value={money(s.receivable)} note={t("metricReceivableNote")} />
        <Metric label={t("metricPaid")} value={money(s.paid)} note={t("metricPaidNote")} />
        <Metric label={t("metricPayable")} value={money(s.payable)} note={t("metricPayableNote")} />
        <Metric label={t("metricNet")} value={money(s.received - s.paid)} note={t("metricNetNote")} tone="lime" />
      </section>
      <div className="finance-grid">
        <Revenue data={data} from={from} to={to || "9999-12-31"} />
        <section className="surface tax-card">
          <div className="section-header">
            <div>
              <span>{tEyebrow("quoteCalculator")}</span>
              <h2>{t("calculatorTitle")}</h2>
            </div>
          </div>
          <label>
            {t("quoteAmount")}
            <input type="number" min="0" step="0.01" value={base} onChange={(e) => setBase(Number(e.target.value))} />
          </label>
          <label>
            {t("taxRate")}
            <input type="number" min="0" max="100" step="0.01" value={rate} onChange={(e) => setRate(Number(e.target.value))} />
          </label>
          <div className="segmented">
            <button className={!included ? "active" : ""} onClick={() => setIncluded(false)}>
              {t("enterExclusive")}
            </button>
            <button className={included ? "active" : ""} onClick={() => setIncluded(true)}>
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
                <dd>{money(Number(v))}</dd>
              </div>
            ))}
          </dl>
          <button
            className="secondary full"
            onClick={() =>
              setEditor({ kind: "payment", item: { label: t("quoteRecordLabel"), amount: base, taxRate: rate, taxIncluded: included } })
            }
          >
            {t("useInLedger")}
          </button>
        </section>
      </div>
      <FinanceInsights />
      <section className="surface ledger-card">
        <div className="section-header">
          <div>
            <span>{tEyebrow("ledger")}</span>
            <h2>{t("ledgerTitle")}</h2>
          </div>
          <button onClick={() => setEditor({ kind: "payment" })}>{t("newEntry")}</button>
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
                    {p.status === "settled" && paymentCash(p) !== paymentTotal(p) && (
                      <small>
                        {t("settledGap", { direction: p.direction, cash: money(paymentCash(p)), gap: money(paymentTotal(p) - paymentCash(p)) })}
                      </small>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="secondary compact" onClick={() => setEditor({ kind: "payment", item: toRecord(p) })}>
                        {t("edit")}
                      </button>
                      {p.status === "expected" && !p.voided && (
                        <button
                          className="secondary compact"
                          onClick={() =>
                            setEditor({ kind: "payment", item: { ...toRecord(p), status: "settled", settledDate: today } })
                          }
                        >
                          {t("markSettled", { direction: p.direction })}
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
      {editor && <RecordEditor editor={editor} onClose={() => setEditor(null)} />}
    </>
  );
}
