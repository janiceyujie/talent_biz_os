"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/app/modal";
import { InfoHint } from "@/components/app/info-hint";
import { savePreference } from "@/lib/actions/preferences";
import { applicantCountries, applicantTypes, assessEligibility, eligibilityRuleSchema, emptyEligibilityProfile, type EligibilityProfile } from "@/lib/grants/eligibility";
import type { GrantOpportunity } from "@/lib/grants/types";

export function EligibilitySummary({opportunity,profile,compact=false}:{opportunity:GrantOpportunity;profile:EligibilityProfile|null;compact?:boolean}) {
  const t=useTranslations("grants.qualification"), locale=useLocale();
  const result=assessEligibility(opportunity.eligibility,profile,new Date().toISOString().slice(0,10));
  if(compact) return <span className={`eligibility-badge ${result.status}`}>{t(`status.${result.status}`)}</span>;
  const rule=eligibilityRuleSchema.safeParse(opportunity.eligibility);
  return <details className="grant-reference eligibility-summary">
    <summary><span>{t("title")}</span><span className={`eligibility-badge ${result.status}`}>{t(`status.${result.status}`)}</span></summary>
    <ul>{result.reasons.map(reason=><li key={reason}>{t(`reasons.${reason}`)}</li>)}</ul>
    {rule.success&&<><p>{rule.data.notes[locale==="zh-TW"?"zh-TW":"en"]}</p><a href={rule.data.evidenceUrl} target="_blank" rel="noopener noreferrer">{t("evidence",{date:rule.data.verifiedOn})}</a></>}
    <p>{t("caution")}</p>
  </details>;
}
export function EligibilityProfileDialog({profile,onClose,run,pending}:{profile:EligibilityProfile|null;onClose:()=>void;run:(action:()=>Promise<string|null>,success?:string)=>void;pending:boolean}) {
  const t=useTranslations("grants.qualification"), g=useTranslations("grants");
  const [value,setValue]=useState(profile??emptyEligibilityProfile);
  const [error,setError]=useState<string|null>(null);
  return <Modal title={t("profile")} narrow onClose={onClose}><form className="editor-form" onSubmit={e=>{e.preventDefault();run(async()=>{const failure=await savePreference("opportunities.profile",value);setError(failure);if(!failure)onClose();return failure;});}}>
    <div className="grant-section-title"><span>{t("profileScope")}</span><InfoHint label={t("profile")} notes={[t("profileHint")]}/></div>
    <label>{t("entity")}<select value={value.applicantType??""} onChange={e=>setValue({...value,applicantType:e.target.value as EligibilityProfile["applicantType"]||null})}><option value="">{t("unknown")}</option>{applicantTypes.map(k=><option value={k} key={k}>{t(`entities.${k}`)}</option>)}</select></label>
    <label>{t("country")}<select value={value.country??""} onChange={e=>setValue({...value,country:e.target.value as EligibilityProfile["country"]||null})}><option value="">{t("unknown")}</option>{applicantCountries.map(k=><option value={k} key={k}>{t(`countries.${k}`)}</option>)}</select></label>
    {error&&<p role="alert" className="notice error">{error}</p>}
    <footer className="modal-actions"><button type="button" className="secondary" onClick={onClose}>{g("cancel")}</button><button type="submit" className="primary" disabled={pending}>{g("saveChanges")}</button></footer>
  </form></Modal>;
}
