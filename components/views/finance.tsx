"use client";

import { useState, useTransition } from "react";
import { useAppData } from "@/components/app/app-data";
import { RecordEditor, toRecord, type Editor } from "@/components/app/record-editor";
import { archivePayment } from "@/lib/actions/payments";
import { dateInZone } from "@/lib/domain/dates";
import { quote } from "@/lib/domain/money";
import { useMoney } from "@/lib/i18n/format";
import { paymentCash, paymentDate, paymentTotal, summarize } from "@/lib/domain/workflow";
import { directionLabels, installmentLabels, paymentStatusLabel } from "@/lib/labels";
import { projectType } from "@/lib/project-types";
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
          <span>Revenue mix</span>
          <h2>已收營收分布 · TWD</h2>
        </div>
      </div>
      <div className="revenue-body">
        <div
          className="donut"
          role="img"
          aria-label={`已收營收 ${money(s.received)}`}
          style={{ background: s.received ? `conic-gradient(${gradient})` : "var(--line)" }}
        >
          <div>
            <strong>{money(s.received)}</strong>
            <span>含稅現金收入</span>
          </div>
        </div>
        <div className="legend">
          {s.split.map((v, i) => (
            <div key={v.label}>
              <i style={{ background: donutColors[i] }} />
              <span>{v.label}</span>
              <strong>{s.received ? Math.round((v.amount / s.received) * 100) : 0}%</strong>
              <small>{money(v.amount)}</small>
            </div>
          ))}
        </div>
      </div>
      {!s.received && <p className="muted">還沒有已收款紀錄，新增內帳後圖表會自動更新。</p>}
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
  const money = useMoney();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [base, setBase] = useState(50000);
  const [rate, setRate] = useState(5);
  const [included, setIncluded] = useState(false);
  const [archived, setArchived] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const today = dateInZone(data.talent.timeZone);
  const s = summarize(data, from, to || "9999-12-31");
  const q = quote(Math.max(0, base || 0), Math.max(0, Math.min(100, rate || 0)), included);
  const rows = archived
    ? data.payments.filter((p) => p.archived && paymentDate(p) >= from && paymentDate(p) <= (to || "9999-12-31"))
    : s.rows;

  function exportCsv() {
    const table = [
      ["登錄日期", "實際收付日期", "款項階段", "名稱", "類型", "分類", "幣別", "未稅", "稅額", "含稅", "狀態", "付款期限", "發票"],
      ...rows.map((p) => {
        const t = quote(p.amount, p.taxRate, p.taxIncluded, p.currency);
        return [
          p.recordedDate,
          p.settledDate,
          installmentLabels[p.installment],
          p.label,
          directionLabels[p.direction],
          projectType(p.projectType).label,
          p.currency,
          t.net,
          t.tax,
          t.total,
          paymentStatusLabel(p),
          p.dueDate,
          p.invoiceRef,
        ];
      }),
    ];
    download("﻿" + table.map((row) => row.map(csvCell).join(",")).join("\r\n"), "talent-ledger-TWD.csv");
  }

  return (
    <>
      <div className="toolbar wrap">
        <label>
          幣別
          <select value="TWD" disabled>
            <option>TWD</option>
          </select>
        </label>
        <label>
          起日
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          迄日
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button className="secondary" onClick={exportCsv}>
          匯出 CSV
        </button>
      </div>
      <section className="metrics-grid">
        <Metric label="已收收入（含稅）" value={money(s.received)} note="依實際收款日期篩選" tone="dark" />
        <Metric label="待收款（含稅）" value={money(s.receivable)} note="依登錄日期篩選的未收款" />
        <Metric label="已付成本（含稅）" value={money(s.paid)} note={`另有待付 ${money(s.payable)}`} />
        <Metric label="現金淨額" value={money(s.received - s.paid)} note="已收減已付，不等於會計淨利" tone="lime" />
      </section>
      <div className="finance-grid">
        <Revenue data={data} from={from} to={to || "9999-12-31"} />
        <section className="surface tax-card">
          <div className="section-header">
            <div>
              <span>Quote calculator</span>
              <h2>含稅／未稅報價 · TWD</h2>
            </div>
          </div>
          <label>
            報價金額
            <input type="number" min="0" step="0.01" value={base} onChange={(e) => setBase(Number(e.target.value))} />
          </label>
          <label>
            稅率 %
            <input type="number" min="0" max="100" step="0.01" value={rate} onChange={(e) => setRate(Number(e.target.value))} />
          </label>
          <div className="segmented">
            <button className={!included ? "active" : ""} onClick={() => setIncluded(false)}>
              輸入未稅價
            </button>
            <button className={included ? "active" : ""} onClick={() => setIncluded(true)}>
              輸入含稅價
            </button>
          </div>
          <dl>
            {[
              ["未稅金額", q.net],
              ["稅額", q.tax],
              ["含稅總額", q.total],
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
              setEditor({ kind: "payment", item: { label: "報價紀錄", amount: base, taxRate: rate, taxIncluded: included } })
            }
          >
            帶入新增內帳
          </button>
        </section>
      </div>
      <section className="surface ledger-card">
        <div className="section-header">
          <div>
            <span>Ledger</span>
            <h2>內帳明細</h2>
          </div>
          <button onClick={() => setEditor({ kind: "payment" })}>＋新增紀錄</button>
        </div>
        <label className="check-line">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          顯示已歸檔
        </label>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>日期／名稱</th>
                <th>分類</th>
                <th>狀態</th>
                <th>含稅金額</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.label}</strong>
                    <small>
                      登錄 {p.recordedDate} · {installmentLabels[p.installment]} · {p.invoiceRef || "無發票編號"}
                    </small>
                    {p.settledDate && <small>實際收付 {p.settledDate}</small>}
                  </td>
                  <td>
                    {p.projectId ? projectType(p.projectType).label : "未關聯"} · {directionLabels[p.direction]}
                  </td>
                  <td>
                    {paymentStatusLabel(p)}
                    {p.direction === "in" && p.status === "expected" && p.dueDate && p.dueDate < today && (
                      <span className="danger-text"> · 逾期</span>
                    )}
                  </td>
                  <td>
                    {money(paymentTotal(p), p.currency)}
                    {p.status === "settled" && paymentCash(p) !== paymentTotal(p) && (
                      <small>
                        實{p.direction === "in" ? "收" : "付"} {money(paymentCash(p))} · 差額 {money(paymentTotal(p) - paymentCash(p))}
                      </small>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="secondary compact" onClick={() => setEditor({ kind: "payment", item: toRecord(p) })}>
                        編輯
                      </button>
                      {p.status === "expected" && !p.archived && (
                        <button
                          className="secondary compact"
                          onClick={() =>
                            setEditor({ kind: "payment", item: { ...toRecord(p), status: "settled", settledDate: today } })
                          }
                        >
                          記為{p.direction === "in" ? "已收" : "已付"}
                        </button>
                      )}
                      <button
                        className="text-button"
                        disabled={pending}
                        onClick={() => startTransition(async () => setError(await archivePayment(p.id, !p.archived)))}
                      >
                        {p.archived ? "還原" : "歸檔"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <p className="empty">沒有符合條件的內帳紀錄。</p>}
      </section>
      <p className="finance-note">
        已收／已付按實際收付日期，待收／待付按登錄日期篩選。稅率由你依交易設定；未包含扣繳、匯差與正式稅務申報調整。目前僅支援 TWD。
      </p>
      {editor && <RecordEditor editor={editor} onClose={() => setEditor(null)} />}
    </>
  );
}
