"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { defaultTaiwanSetup, taiwanReadiness, type TaiwanSetup } from "@/lib/invoices/taiwan-setup";
import { invoiceRequest } from "./request";
import { InfoHint } from "@/components/app/info-hint";
import { ActionNotice } from "@/components/app/action-notice";

type SetupResponse = { setup: TaiwanSetup; readiness: ReturnType<typeof taiwanReadiness> };
export function TaiwanInvoiceSetup({ disabled = false }: { disabled?: boolean }) {
  const t = useTranslations("invoices.taiwanSetup");
  const [setup, setSetup] = useState(defaultTaiwanSetup);
  const [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(false), [saved, setSaved] = useState(false);
  const [readiness, setReadiness] = useState<SetupResponse["readiness"]>();
  const load = async () => {
    setBusy(true); setError(false);
    try {
      const result = await invoiceRequest<SetupResponse>("/api/invoices/taiwan-setup");
      setSetup(result.setup); setReadiness(result.readiness); setLoaded(true);
    } catch { setError(true); } finally { setBusy(false); }
  };
  const change = (patch: Partial<TaiwanSetup>) => { setSetup(value => ({ ...value, ...patch })); setSaved(false); setReadiness(undefined); };
  return <details className="invoice-details invoice-taiwan-setup" onToggle={event => { if (event.currentTarget.open && !loaded && !busy && !disabled) void load(); }}>
    <summary>{t("title")}</summary>
    <div className="invoice-actions"><span>{t("notEnabled")}</span><InfoHint label={t("title")} notes={[t("help"), t("providerHelp")]} /></div>
    {loaded && <form onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError(false); setSaved(false);
      try {
        const result = await invoiceRequest<SetupResponse>("/api/invoices/taiwan-setup", setup);
        setSetup(result.setup); setReadiness(result.readiness); setSaved(true);
      } catch { setError(true); } finally { setBusy(false); }
    }}>
      <fieldset disabled={busy || disabled}>
        <label className="invoice-check"><input type="checkbox" checked={setup.registered} onChange={e => change({ registered: e.target.checked })}/>{t("registered")}</label>
        <div className="invoice-fields">
          <label>{t("businessName")}<input value={setup.businessName} maxLength={150} required={setup.registered} onChange={e => change({ businessName: e.target.value })}/></label>
          <label>{t("taxId")}<input value={setup.taxId} inputMode="numeric" pattern="[0-9]{8}" maxLength={8} required={setup.registered} onChange={e => change({ taxId: e.target.value })}/></label>
          <label>{t("route")}<select value={setup.route} onChange={e => change({ route: e.target.value as TaiwanSetup["route"] })}>
            {(["undecided", "provider", "turnkey"] as const).map(route => <option key={route} value={route}>{t(`routes.${route}`)}</option>)}
          </select></label>
          {setup.route === "provider" && <label>{t("providerName")}<input value={setup.providerName} maxLength={100} onChange={e => change({ providerName: e.target.value })}/></label>}
        </div>
        <label className="invoice-check"><input type="checkbox" checked={setup.numberTracksReady} onChange={e => change({ numberTracksReady: e.target.checked })}/>{t("numberTracks")}</label>
        <button className="secondary" type="submit">{t(busy ? "saving" : "save")}</button>
      </fieldset>
    </form>}
    {busy && <p role="status">{t("loading")}</p>}
    {saved && <p role="status">{t("saved")}</p>}
    {readiness && <ul>{readiness.pending.map(item => <li key={item}>{t(`pending.${item}`)}</li>)}</ul>}
    {error && <ActionNotice role="alert" className="error" actions={<button className="text-button" disabled={busy} onClick={() => void load()}>{t("reload")}</button>}>{t("error")}</ActionNotice>}
    <a href="https://www.gov.tw/News_Content_2_508287" target="_blank" rel="noreferrer">{t("official")}</a>
  </details>;
}
