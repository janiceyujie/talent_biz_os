"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useAppData } from "@/components/app/app-data";
import { InfoHint } from "@/components/app/info-hint";
import { cashScenarioExample } from "@/lib/domain/cash-scenario-example";
import { cashScenario } from "@/lib/domain/cash-scenario";
import { dateInZone } from "@/lib/domain/dates";
import { useMoney } from "@/lib/i18n/format";
import type { Payment } from "@/lib/types";
import type { Currency } from "@/lib/domain/money";

export function CashScenario({ currency, payments }: { currency: Currency; payments: Payment[] }) {
  const data = useAppData(), t = useTranslations("finance.scenario"), money = useMoney();
  const [example, setExample] = useState(false);
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const spotlightTitleId = useId();
  const dialogTitleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  const [opening, setOpening] = useState("");
  const [delay, setDelay] = useState(0);
  const [collection, setCollection] = useState("100");
  const [extra, setExtra] = useState("");
  const [horizon, setHorizon] = useState(30);
  const today = data.previewDate ?? dateInZone(data.talent.timeZone);
  const validOpening = Number.isFinite(Number(opening)) && Math.abs(Number(opening)) <= 1e12;
  const validExtra = Number.isFinite(Number(extra)) && Number(extra) >= 0 && Number(extra) <= 1e12;
  const validCollection = collection.trim() !== "" && Number.isFinite(Number(collection)) && Number(collection) >= 0 && Number(collection) <= 100;
  const ready = opening.trim() !== "" && validOpening && validExtra && validCollection;
  const report = cashScenario(example ? cashScenarioExample(today, currency) : payments, today, { opening: Number(opening), delayDays: delay, collectionPercent: Number(collection), extraPer30Days: Number(extra), currency });
  const point = report.points.find(p => p.days === horizon)!;
  const adjusted = delay !== 0 || Number(collection) !== 100 || Number(extra) !== 0;
  const reset = () => { setDelay(0); setCollection("100"); setExtra(""); };
  const useExample = () => { setExample(true); setOpening("50000"); setDelay(0); setCollection("100"); setExtra(""); setHorizon(30); };
  const exitExample = () => { setExample(false); setOpening(""); reset(); setHorizon(30); };
  return <>
    <section className="finance-cash-spotlight" aria-labelledby={spotlightTitleId}>
      <div className="finance-cash-spotlight-copy">
        <h2 id={spotlightTitleId}>{t("title")}</h2>
        <p>{t("purpose")}</p>
      </div>
      <button type="button" className="primary cash-scenario-launch" onClick={() => setOpen(true)}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
          <path d="M4 19.5h16M6.5 16V12m5 4V8m5 8V4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {t("openPanel")}
        <span aria-hidden="true">→</span>
      </button>
    </section>
    <dialog ref={dialogRef} className="cash-scenario-panel" aria-labelledby={dialogTitleId}
      onCancel={event => { event.preventDefault(); setOpen(false); }}
      onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <header className="cash-scenario-panel-header">
        <h2 id={dialogTitleId}>{t("title")}</h2>
        <button type="button" className="icon-button" aria-label={t("closePanel")} onClick={() => setOpen(false)}>×</button>
      </header>
      <div className="cash-scenario-body">
        <p className="cash-scenario-purpose">{t("purpose")} <InfoHint label={t("title")} notes={[t("help"), t("scope", { date: today })]} /></p>
      <div className="row-actions cash-example-actions">
        <button type="button" className="secondary" onClick={useExample}>{t("tryExample")}</button>
        {example && <button type="button" className="text-button" onClick={exitExample}>{t("exitExample")}</button>}
      </div>
      {example && <aside className="notice cash-example-notice" role="status">
        <strong>{t("exampleTitle")}</strong>
        <p>{t("exampleSummary", { opening: money(50000, currency), incoming: money(30000, currency), outgoing: money(20000, currency) })}</p>
      </aside>}
      <div className="cash-scenario-inputs">
        <label><span>{t("openingStep", { currency })} <InfoHint label={t("openingStep", { currency })} notes={[t("openingHelp")]} /></span><input type="number" step={currency === "JPY" ? "1" : "0.01"} min="-1000000000000" max="1000000000000" placeholder={t("openingPlaceholder")} value={opening} aria-invalid={!validOpening} onChange={e => setOpening(e.target.value)} /></label>
        <label><span>{t("delayStep")} <InfoHint label={t("delayStep")} notes={[t("delayHelp")]} /></span><select value={delay} onChange={e => setDelay(Number(e.target.value))}>{[0, 7, 14, 30, 60, 90].map(days => <option key={days} value={days}>{days === 0 ? t("onTime") : t("late", { days })}</option>)}</select></label>
      </div>
      <details className="cash-advanced">
        <summary>{t("advanced")} <InfoHint label={t("advanced")} notes={[t("collectionHelp"), t("extraHelp")]} />{(Number(collection) !== 100 || Number(extra) !== 0) && <span className="muted"> · {t("customActive")}</span>}</summary>
        <div className="cash-scenario-inputs">
          <label><span>{t("collection")} <InfoHint label={t("collection")} notes={[t("collectionHelp")]} /></span><input type="number" min="0" max="100" value={collection} aria-invalid={!validCollection} onChange={e => setCollection(e.target.value)} /></label>
        <label><span>{t("extra", { currency })} <InfoHint label={t("extra", { currency })} notes={[t("extraHelp")]}/></span><input type="number" min="0" max="1000000000000" step={currency === "JPY" ? "1" : "0.01"} placeholder="0" value={extra} aria-invalid={!validExtra} onChange={e => setExtra(e.target.value)} /></label>
        </div>
        <button type="button" className="text-button" onClick={reset}>{t("reset")}</button>
      </details>
      {!validOpening || !validExtra || !validCollection ? <p role="alert" className="notice">{t("invalid")}</p> : !ready ? <p className="muted">{t("start")}</p> : <>
        <div className="cash-summary">
          <label>{t("viewHorizon")}<select value={horizon} onChange={e => setHorizon(Number(e.target.value))}>{report.points.map(p => <option key={p.days} value={p.days}>{t("horizon", { days: p.days })}</option>)}</select></label>
          <p className="cash-summary-label">{t("remaining", { days: horizon })}</p>
          <p className={`cash-summary-amount ${point.scenario < 0 ? "cash-negative" : "cash-result"}`}>{money(point.scenario, currency)}</p>
          {point.scenario < 0 && <p className="cash-negative">{t("shortfall", { amount: money(-point.scenario, currency) })}</p>}
          {adjusted && <p className="muted">{t("comparison", { amount: money(point.base, currency) })}</p>}
          <dl className="cash-breakdown">
            <div><dt>{t("cashNow")}</dt><dd>{money(Number(opening), currency)}</dd></div>
            <div><dt>{t("incoming")}</dt><dd>+ {money(point.scenarioIncoming, currency)}</dd></div>
            <div><dt>{t("outgoing")}</dt><dd>− {money(point.outgoing, currency)}</dd></div>
            {point.extraCosts > 0 && <div><dt>{t("additionalCosts")}</dt><dd>− {money(point.extraCosts, currency)}</dd></div>}
          </dl>
          <small className="muted">{t("checkpointNotice")}</small>
        </div>
        <details className="cash-comparison"><summary>{t("compareAll")}</summary>
          <div className="cash-table-scroll"><table><caption className="sr-only">{t("compareAll")}</caption><thead><tr><th scope="col">{t("period")}</th><th scope="col">{t("base")}</th><th scope="col">{t("adjusted")}</th></tr></thead><tbody>{report.points.map(p => <tr key={p.days}><th scope="row">{t("horizon", { days: p.days })}</th><td>{money(p.base, currency)}</td><td className={p.scenario < 0 ? "cash-negative" : ""}>{money(p.scenario, currency)}</td></tr>)}</tbody></table></div>
        </details>
      </>}
      {report.excludedCount > 0 && <p className="notice">{t("excluded", { count: report.excludedCount, incoming: money(report.excludedIn, currency), outgoing: money(report.excludedOut, currency) })}</p>}
      {report.excludedCurrencyCount > 0 && <p className="notice">{t("excludedCurrency", { count: report.excludedCurrencyCount, currencies: report.excludedCurrencies.join(", ") })}</p>}
      {report.scheduledCount === 0 && <p className="muted">{t("empty")}</p>}
      </div>
    </dialog>
  </>;
}
