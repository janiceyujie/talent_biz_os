"use client";

import { InfoHint } from "@/components/app/info-hint";
import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toLocale, type Locale } from "@/lib/i18n/config";
import { type DocumentKind } from "@/lib/templates/documents";

import { useAppData } from "@/components/app/app-data";
import type { CatalogDocument } from "@/lib/templates/catalog";

export function DocumentLibrary() {
  const t = useTranslations("documentLibrary");
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const collapse = () => {
    setExpanded(false);
    toggleRef.current?.focus({ preventScroll: true });
    toggleRef.current?.scrollIntoView({ block: "nearest" });
  };
  const currentRole = useAppData().person.role;
  const [roleChoice, setRoleChoice] = useState<{ ownerRole: string; value: string } | null>(null);
  const role = roleChoice?.ownerRole === currentRole ? roleChoice.value : currentRole;
  const setRole = (value: string) => setRoleChoice({ ownerRole: currentRole, value });
  const [language, setLanguage] = useState<Locale>(toLocale(useLocale()));
  const [kind, setKind] = useState<DocumentKind>("contract");
  const [status,setStatus] = useState("");
  const [retry, setRetry] = useState(0);
  const requestKey = `${language}:${kind}:${retry}`;
  const [result, setResult] = useState<{ key: string; documents: CatalogDocument[]; failed: boolean }>({ key: "", documents: [], failed: false });
  const loading = expanded && result.key !== requestKey;
  const documents = result.key === requestKey ? result.documents : [];
  const failed = result.key === requestKey && result.failed;
  const visibleDocuments = documents.filter(doc => role === "all" || (role === "general" ? doc.scenario === "general" : doc.role === role || doc.scenario === "general"));
  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    fetch(`/api/document-templates?${new URLSearchParams({ locale: language, kind })}`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(String(response.status)); return response.json() as Promise<CatalogDocument[]>; })
      .then(rows => { if (!controller.signal.aborted) setResult({ key: requestKey, documents: rows, failed: false }); })
      .catch(() => { if (!controller.signal.aborted) setResult({ key: requestKey, documents: [], failed: true }); });
    return () => controller.abort();
  }, [expanded, language, kind, requestKey]);
  return <section className="surface document-library" aria-label={t("title")}>
    <div className="document-library-heading-row">
      <h2 className="document-library-heading">{t("title")}</h2>
      <InfoHint label={t("title")} notes={[t("intro"), t("notice")]} />
      <button ref={toggleRef} type="button" className="document-library-toggle" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(value => !value)}>
        <span className="document-library-toggle-label">{t(expanded ? "collapse" : "expand")}<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d={expanded ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} /></svg></span>
      </button>
    </div>
    <div id={panelId} hidden={!expanded} className="document-library-body">
    <div className="toolbar wrap document-toolbar">
      <label>{t("role")}<select value={role} onChange={e=>setRole(e.target.value)}>
        <option value="all">{t("all")}</option>
        <option value="general">{t("general")}</option>
        {(["musician","manager","model","influencer","video","other"] as const).map(r=><option key={r} value={r}>{t(`roles.${r}`)}</option>)}
      </select></label>
      <label>{t("language")}<select value={language} onChange={e=>setLanguage(e.target.value as Locale)}><option value="zh-TW">{t("zh")}</option><option value="en">{t("en")}</option></select></label>
      <div className="row-actions">{(["contract","quote"] as const).map(k=><button type="button" className={kind===k?"primary":"secondary"} aria-pressed={kind===k} key={k} onClick={()=>setKind(k)}>{t(k)}</button>)}</div>
    </div>
    {status&&<p role="status">{status}</p>}
    {loading && <p role="status">{t("loading")}</p>}
    {failed && <p role="alert">{t("loadFailed")} <button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>{t("retry")}</button></p>}
    {!loading && !failed && documents.length === 0 && <p>{t("empty")}</p>}
    {!loading && !failed && documents.length > 0 && visibleDocuments.length === 0 && <p role="status">{t("noMatch")} <button type="button" className="text-button" onClick={() => setRole("all")}>{t("all")}</button></p>}
    <div className="document-grid" aria-busy={loading}>{visibleDocuments.map(doc=>{
      return <article key={doc.id} className="document-card"><h3>{doc.title}</h3>
        <details name={panelId + "-preview"}><summary>{t("preview")}</summary><div className="prewrap" role="region" aria-label={doc.title} tabIndex={0}>{doc.text}</div></details>
        <div className="row-actions"><a className="secondary" href={`/api/document-templates/${doc.id}/download`} download>{t("download")}</a>
        <button type="button" className="text-button" onClick={async()=>{try{await navigator.clipboard.writeText(doc.text);setStatus(t("copied"));}catch{setStatus(t("copyFailed"));}}}>{t("copy")}</button></div>
      </article>;
    })}</div>
    <details className="section-gap"><summary>{t("sources")}</summary><ul>
      <li><a href="https://commonpaper.com/standards/professional-services-agreement/" target="_blank" rel="noreferrer">{t("commonPaper")}</a></li>
      <li><a href="https://blog.freelancersunion.org/2013/09/11/8-contract-provisions-every-freelancer-should-know-2/" target="_blank" rel="noreferrer">{t("freelancersUnion")}</a></li>
      <li><a href="https://musiciansunion.org.uk/legal-money/contracts-and-agreements/standard-contracts" target="_blank" rel="noreferrer">{t("mu")}</a></li>
      <li><a href="https://www.artslaw.com.au/wp-content/uploads/2024/06/02_Booking_Agreement_Checklist.pdf" target="_blank" rel="noreferrer">{t("artsLaw")}</a></li>
      <li><a href="https://www.ftc.gov/business-guidance/advertising-marketing/endorsements-influencers-reviews" target="_blank" rel="noreferrer">{t("ftc")}</a></li>
    </ul></details>
    <div className="document-library-footer"><button type="button" className="text-button" onClick={collapse}>{t("collapse")}</button></div>
    </div>
  </section>;
}
