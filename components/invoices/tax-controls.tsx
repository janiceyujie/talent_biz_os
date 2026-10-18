"use client";
import { TaxCatalogueLookup } from "./tax-catalogue";
import type { TaxContext } from "@/lib/tax/domain";
import { useTranslations } from "next-intl";
import { InfoHint } from "@/components/app/info-hint";
import { invoiceTaxInput, taxGuidanceUrl, taxTreatments, usStates, type InvoiceTaxReview } from "@/lib/invoices/tax";

export type TaxDraft = {
  catalogue?: TaxContext; state: string; location: string; treatment: string; rate: string; included: boolean; source: string;
};
export function initialTaxDraft(review?: InvoiceTaxReview, included = false): TaxDraft {
  return review ? { catalogue: review.catalogue, state: review.state, location: review.location, treatment: review.treatment, rate: String(review.rate), included: review.included, source: review.source }
    : { state: "", location: "", treatment: "", rate: "", included, source: "" };
}
export function taxDraftInput(draft: TaxDraft) {
  return { ...draft, country: "US" as const, rate: draft.treatment === "taxable" ? Number(draft.rate) : 0 };
}
export function taxPreview(draft: TaxDraft) {
  if (draft.treatment === "taxable" && !draft.rate.trim()) return undefined;
  const result = invoiceTaxInput.safeParse(taxDraftInput(draft));
  return result.success ? result.data : undefined;
}
export function InvoiceTaxControls({ enabled, value, onEnabled, onChange, disabled, currentRate, currentIncluded, saleOn }: {
  saleOn: string; enabled: boolean; value: TaxDraft; onEnabled: (value: boolean) => void;
  onChange: (value: TaxDraft) => void; disabled: boolean; currentRate: number; currentIncluded: boolean;
}) {
  const t = useTranslations("invoices.taxSetup");
  const change = (patch: Partial<TaxDraft>) => onChange({ ...value, catalogue: undefined, ...patch });
  return <details className="invoice-details invoice-tax" open={enabled || undefined}>
    <summary>{t("title")} · {enabled ? t("us") : `${currentRate}%`}</summary>
    <fieldset disabled={disabled}>
      <div className="invoice-actions">
        <label className="invoice-tax-mode">{t("mode")}
          <select value={enabled ? "US" : "existing"} onChange={e => onEnabled(e.target.value === "US")}>
            <option value="existing">{t("existing")}</option>
            <option value="US">{t("us")}</option>
          </select>
        </label>
        <InfoHint label={t("title")} notes={[t("help"), t("syncHelp")]} />
      </div>
      {!enabled ? <p className="muted">{t("current", { rate: currentRate, basis: t(currentIncluded ? "included" : "excluded") })}</p> : <>
        <p className="invoice-tax-limitation">{t("manual")}</p>
        <div className="invoice-fields">
          <label>{t("state")}
            <select required value={value.state} onChange={e => change({ state: e.target.value, location: "", rate: "", treatment: "", source: "" })}>
              <option value="">{t("choose")}</option>
              {usStates.map(state => <option key={state} value={state}>{state} · {t(`states.${state}`)}</option>)}
            </select>
          </label>
          <label>{t("treatment")}
            <select required value={value.treatment} onChange={e => change({ treatment: e.target.value, rate: "", source: "" })}>
              <option value="">{t("choose")}</option>
              {taxTreatments.map(key => <option key={key} value={key}>{t(`treatments.${key}`)}</option>)}
            </select>
          </label>
        </div>
        <label>{t("location")}<textarea required rows={2} maxLength={600} value={value.location} onChange={e => change({ location: e.target.value })} /></label>
        <TaxCatalogueLookup key={`${value.state}:${value.location}`} state={value.state} location={value.location} saleOn={saleOn} initial={value.catalogue} disabled={disabled}
          onInvalidate={() => { if (value.catalogue) onChange({ ...value, catalogue: undefined, rate: "", treatment: "", source: "" }); }}
          onApply={(catalogue, result) => onChange({ ...value, catalogue, rate: String(result.rate), treatment: result.treatment, source: result.source })} />
        {value.treatment === "taxable" && <div className="invoice-fields">
          <label>{t("rate")}<input required type="number" inputMode="decimal" min={0} max={100} step="0.0001" value={value.rate} onChange={e => change({ rate: e.target.value })} /></label>
          <label>{t("amountBasis")}<select value={value.included ? "included" : "excluded"} onChange={e => change({ included: e.target.value === "included" })}>
            <option value="excluded">{t("excluded")}</option><option value="included">{t("included")}</option>
          </select></label>
        </div>}
        <label>{t("source")}<input required maxLength={500} value={value.source} onChange={e => change({ source: e.target.value })} /></label>
        <a className="text-button" href={taxGuidanceUrl(value.state)} target="_blank" rel="noreferrer">{t("lookup")}</a>
      </>}
    </fieldset>
  </details>;
}
