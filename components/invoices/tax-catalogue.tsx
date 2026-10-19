"use client";
import { ActionNotice } from "@/components/app/action-notice";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { DateTimeInput } from "@/components/app/date-time-input";
import { InfoHint } from "@/components/app/info-hint";
import { serviceCategories, type TaxContext, type TaxResolution } from "@/lib/tax/domain";
import type { referenceReasons } from "@/lib/tax/reference-input";
import { usStates } from "@/lib/invoices/tax";

type Locality = { id: string; name: string; county: string; rate: number; notes: string };
type Reference = { id: string; name: string; level: "state" | "local" | "combined" | "localSummary"; scope: string; rate: number | null;
  sourceUrl: string; sourceStatus: string; checkedAt: string; validFrom: string | null; validThrough: string | null;
  dateBasis: "effective" | "snapshot" | "administrative" | "unknown"; reasons: (typeof referenceReasons)[number][]; notes: string };
type SearchResult = { references: { summary: Reference[]; items: Reference[]; nextOffset: number | null }; items: Locality[]; nextOffset: number | null; coverage: { coverage: "pending" | "componentsOnly" | "localityReference" | "officialReference"; rateIndexUrl?: string; boundaryIndexUrl?: string } | null };
export function TaxCatalogueLookup({ state, location, saleOn, initial, disabled, onInvalidate, onApply }: {
  state: string; location: string; saleOn: string; initial?: TaxContext; disabled: boolean;
  onInvalidate: () => void; onApply: (context: TaxContext, result: Extract<TaxResolution, { status: "ready" }>) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const t = useTranslations("invoices.taxCatalogue"), tax = useTranslations("invoices.taxSetup");
  const [context, setContext] = useState<TaxContext>(() => initial ?? { state, location, saleOn, sellerState: "", category: "mixed", delivery: "mixed", collection: "unknown", exemption: "unknown", jurisdictionConfirmed: false, standardSaleConfirmed: false });
  const [query, setQuery] = useState(""), [localities, setLocalities] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(false), [result, setResult] = useState<TaxResolution | null>(null);
  const change = (patch: Partial<TaxContext>) => { setContext(c => ({ ...c, ...patch })); setResult(null); onInvalidate(); };
  const search = async (offset = 0) => {
    setBusy(true); setError(false);
    try {
      const params = new URLSearchParams({ state, q: query, saleOn: context.saleOn, offset: String(offset) });
      const response = await fetch(`/api/invoices/tax-catalogue?${params}`);
      if (!response.ok) throw new Error("lookup");
      const data: SearchResult = await response.json();
      setLocalities(old => ({ ...data, items: offset ? [...(old?.items ?? []), ...data.items] : data.items, references: { ...data.references, items: offset ? [...(old?.references.items ?? []), ...data.references.items] : data.references.items } }));
    } catch { setError(true); } finally { setBusy(false); }
  };
  return <details ref={detailsRef} className="invoice-details invoice-tax-catalogue">
    <summary>{t("title")}</summary>
    <fieldset disabled={disabled || busy}>
      <div className="invoice-actions"><span>{t("scope")}</span><InfoHint label={t("title")} notes={[t("help")]} /></div>
      <div className="invoice-fields">
        <label>{t("sellerState")}<select value={context.sellerState} onChange={e => change({ sellerState: e.target.value })}>
          <option value="">{tax("choose")}</option>{usStates.map(s => <option key={s} value={s}>{s} · {tax(`states.${s}`)}</option>)}
        </select></label>
        <DateTimeInput kind="date" label={t("saleOn")} today={new Date().toISOString().slice(0, 10)} value={context.saleOn} onChange={saleOn => { change({ saleOn, jurisdictionId: undefined, jurisdictionConfirmed: false }); setLocalities(null); }} />
        <label>{t("category")}<select value={context.category} onChange={e => change({ category: e.target.value as TaxContext["category"], standardSaleConfirmed: false })}>
          {serviceCategories.map(c => <option key={c} value={c}>{t(`categories.${c}`)}</option>)}
        </select></label>
        <label>{t("delivery")}<select value={context.delivery} onChange={e => change({ delivery: e.target.value as TaxContext["delivery"], standardSaleConfirmed: false })}>
          {(["electronic", "physical", "inPerson", "mixed"] as const).map(v => <option key={v} value={v}>{t(`deliveries.${v}`)}</option>)}
        </select></label>
        <label>{t("collection")}<select value={context.collection} onChange={e => change({ collection: e.target.value as TaxContext["collection"] })}>
          {(["unknown", "registered", "notRequired"] as const).map(v => <option key={v} value={v}>{t(`collections.${v}`)}</option>)}
        </select></label>
        <label>{t("exemption")}<select value={context.exemption} onChange={e => change({ exemption: e.target.value as TaxContext["exemption"] })}>
          {(["unknown", "none", "claimed"] as const).map(v => <option key={v} value={v}>{t(`exemptions.${v}`)}</option>)}
        </select></label>
      </div>
      <label>{t("search")}<input value={query} maxLength={100} onChange={e => { setQuery(e.target.value); setLocalities(null); change({ jurisdictionId: undefined, jurisdictionConfirmed: false }); }} /></label>
      <button type="button" className="secondary" disabled={!state || !context.saleOn} onClick={() => search()}>{t("find")}</button>
      {localities && <>
        {!!localities.references.summary.length && <section className="tax-reference-list" aria-label={t("references.title")}>
          <p className="notice">{t("references.pending")}</p>
          {[...localities.references.summary.filter(r => r.level === "state"), ...localities.references.summary.filter(r => r.level !== "state"), ...localities.references.items].map(r => <details key={r.id} className="tax-reference-row">
            <summary><span>{r.level === "localSummary" ? t("references.localCoverage") : r.name}<small>{t(`references.levels.${r.level}`)}</small></span><strong>{r.rate === null ? t("references.unknown") : `${r.rate}%`}</strong></summary>
            <dl>
              <dt>{t("references.scope")}</dt><dd>{r.scope}</dd>
              <dt>{t(`references.dates.${r.dateBasis}`)}</dt><dd>{r.validFrom ?? t("references.unknown")}{r.validThrough ? ` – ${r.validThrough}` : ""}</dd>
              <dt>{t("references.checked")}</dt><dd>{r.checkedAt.slice(0, 10)}</dd>
            </dl>
            {((r.validFrom && r.validFrom > context.saleOn) || (r.validThrough && r.validThrough < context.saleOn)) && <p className="notice">{t("references.outsidePeriod")}</p>}
            <p>{r.reasons.map(reason => t(`references.reasons.${reason}`)).join(" · ")}</p>
            <p className="muted">{r.notes}</p>
            <a href={r.sourceUrl} target="_blank" rel="noreferrer">{t("source")}</a>
            {r.sourceStatus === "pending" && <p>{t("references.reasons.sourceUnavailable")}</p>}
          </details>)}
          {localities.references.nextOffset !== null && <button type="button" className="text-button" onClick={() => search(localities.references.nextOffset!)}>{t("more")}</button>}
        </section>}
        {!localities.references.summary.length && <p className="muted">{t(`coverage.${localities.coverage?.coverage ?? "pending"}`)}</p>}
        {!!localities.items.length && <label>{t("locality")}<select value={context.jurisdictionId ?? ""} onChange={e => change({ jurisdictionId: e.target.value || undefined, jurisdictionConfirmed: false })}>
          <option value="">{tax("choose")}</option>{localities.items.map(l => <option key={l.id} value={l.id}>{l.name} · {l.county} · {l.rate}%{l.notes ? " *" : ""}</option>)}
        </select></label>}
        {localities.items.find(l => l.id === context.jurisdictionId)?.notes && <p className="notice">{localities.items.find(l => l.id === context.jurisdictionId)?.notes}</p>}
        {localities.nextOffset !== null && <button type="button" className="text-button" onClick={() => search(localities.nextOffset!)}>{t("more")}</button>}
        {localities.coverage?.boundaryIndexUrl && <a className="text-button" href={localities.coverage.boundaryIndexUrl} target="_blank" rel="noreferrer">{t(localities.coverage.coverage === "officialReference" ? "references.localSource" : "verifyAddress")}</a>}
      </>}
      <label className="invoice-check"><input type="checkbox" checked={context.jurisdictionConfirmed} onChange={e => change({ jurisdictionConfirmed: e.target.checked })} />{t("jurisdictionConfirmed")}</label>
      {context.category === "photography" && <label className="invoice-check"><input type="checkbox" checked={context.standardSaleConfirmed} onChange={e => change({ standardSaleConfirmed: e.target.checked })} />{t(context.delivery === "electronic" ? "digitalConditions" : "physicalConditions")}</label>}
      <button type="button" className="secondary" disabled={!state || !location || !context.saleOn || !context.sellerState} onClick={async () => {
        setBusy(true); setError(false); setResult(null);
        try {
          const response = await fetch("/api/invoices/tax-catalogue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...context, state, location }) });
          if (!response.ok) throw new Error("lookup");
          setResult(await response.json());
        } catch { setError(true); } finally { setBusy(false); }
      }}>{t("check")}</button>
      {result && (result.status === "review" ? <p role="status" className="notice">{t(`reasons.${result.reason}`)}</p> : <ActionNotice role="status" actions={<>
        <button type="button" className="primary" onClick={() => { onApply({ ...context, state, location }, result); if (detailsRef.current) { detailsRef.current.open = false; detailsRef.current.querySelector("summary")?.focus(); } }}>{t("apply")}</button>
        <a className="text-button" href={result.source} target="_blank" rel="noreferrer">{t("source")}</a>
      </>}>
        {result.rateName ? `${result.rateName} · ` : ""}{t("result", { treatment: tax(`treatments.${result.treatment}`), rate: result.rate })}
      </ActionNotice>)}
    </fieldset>
    {busy && <p role="status">{t("loading")}</p>}
    {error && <p role="alert" className="notice error">{t("error")}</p>}
  </details>;
}
