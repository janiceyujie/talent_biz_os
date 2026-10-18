"use client";

import { useId } from "react";
import { useLocale, useTranslations } from "next-intl";
import { money, minorUnitFactor, minorUnits } from "@/lib/domain/money";
import { moneyPreview, settlementDifference } from "@/lib/domain/money-preview";

type Totals = ReturnType<typeof moneyPreview>;

export function MoneyBreakdown({ totals, currency }: { totals: Totals; currency: string }) {
  const t = useTranslations("editor.moneySummary"), locale = useLocale();
  return <dl className="editor-money-summary" aria-live="polite" aria-atomic="true">
    {(["net", "tax", "total"] as const).map(key => <div key={key} className={key === "total" ? "is-total" : undefined}>
      <dt>{t(key)}</dt><dd>{totals ? money(totals[key], locale, currency) : "—"}</dd>
    </div>)}
  </dl>;
}

export function SettlementAmount({ totals, currency, out, value, onChange, reason, onReasonChange, withheldValue, onWithheldChange }: {
  totals: Totals; currency: string; out: boolean; value: string; onChange: (value: string | number) => void; reason: string; onReasonChange: (value: string) => void; withheldValue: string; onWithheldChange: (value: string) => void;
}) {
  const t = useTranslations("editor.settlement"), locale = useLocale(), id = useId();
  const difference = totals ? settlementDifference(value, totals.total, currency) : null;
  const differs = difference !== null && difference !== 0 && !(difference < 0 && reason);
  const withholding = !out && reason === "withholding";
  const gap = difference !== null && difference < 0 ? -difference : 0;
  const withheld = withheldValue.trim() === "" ? null : Number(withheldValue);
  const validWithheld = withheld !== null && Number.isFinite(withheld) && withheld > 0 && withheld <= gap && minorUnits(withheld, currency) / minorUnitFactor(currency) === withheld;
  const remaining = validWithheld ? (minorUnits(gap, currency) - minorUnits(withheld!, currency)) / minorUnitFactor(currency) : null;
  const updateCash = (next: string | number) => {
    onChange(next);
    // Remove hidden withholding when the entry becomes a full cash receipt.
    if (totals && next !== "" && Number(next) >= totals.total) onReasonChange("");
  };
  const amount = totals ? money(totals.total, locale, currency) : "";
  return <div className="editor-settlement">
    <label htmlFor={id}>{t(out ? "actualPaid" : "actualReceived")}</label>
    <input id={id} type="number" data-field="settledAmount" min={0} max={9_999_999_999.99}
      step={currency === "JPY" ? "1" : "0.01"} value={value}
      placeholder={totals ? totals.total.toFixed(currency === "JPY" ? 0 : 2) : undefined}
      aria-describedby={`${id}-expected${differs ? ` ${id}-difference` : ""}`}
      onChange={event => updateCash(event.target.value === "" ? "" : Number(event.target.value))}/>
    <div className="editor-settlement-expected" id={`${id}-expected`}>
      <span>{totals ? t(value === "" ? (out ? "blankPayable" : "blankReceivable") : (out ? "payable" : "receivable"), { amount }) : t("incomplete")}</span>
      {totals && <button type="button" className="text-button" onClick={() => updateCash(totals.total)}>{t("useTotal")}</button>}
    </div>
    {difference !== null && difference < 0 && <div className="receipt-reason">
      <label htmlFor={`${id}-reason`}>{t("shortfallReason")}</label>
      <select id={`${id}-reason`} required value={reason} onChange={event => onReasonChange(event.target.value)}>
        <option value="">{t("chooseReason")}</option>
        <option value="unpaid">{t(out ? "unpaidOut" : "unpaid")}</option>
        {!out && <option value="withholding">{t("withholding")}</option>}
      </select>
      {withholding && <>
        <label htmlFor={`${id}-withheld`}>{t("withheldAmount")}</label>
        <input id={`${id}-withheld`} type="number" data-field="withheldAmount" required
          min={1 / minorUnitFactor(currency)} max={gap} step={1 / minorUnitFactor(currency)} value={withheldValue}
          aria-invalid={withheldValue !== "" && !validWithheld} aria-describedby={`${id}-withheld-help`}
          onChange={event => onWithheldChange(event.target.value)}/>
        <p className="muted" id={`${id}-withheld-help`}>{t("withholdingHelp")}</p>
      </>}
      <div aria-live="polite" aria-atomic="true">
        {withholding && withheldValue !== "" && !validWithheld && <p className="editor-settlement-difference">{t("withholdingInvalid", { amount: money(gap, locale, currency) })}</p>}
        {reason === "unpaid" && <p className="muted">{t("unpaidHelp", { amount: money(gap, locale, currency) })}</p>}
        {withholding && remaining !== null && <p className="muted">{remaining > 0 ? t("unpaidHelp", { amount: money(remaining, locale, currency) }) : t("withholdingCleared")}</p>}
      </div>
    </div>}
    <div aria-live="polite" aria-atomic="true">
      {differs && <p className="editor-settlement-difference" id={`${id}-difference`}>
        {t(out ? (difference > 0 ? "overpaid" : "underpaid") : (difference > 0 ? "overreceived" : "underreceived"), { amount: money(Math.abs(difference), locale, currency) })}
      </p>}
    </div>
  </div>;
}
