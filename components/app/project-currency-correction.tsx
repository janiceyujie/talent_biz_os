"use client";

import { ActionNotice } from "@/components/app/action-notice";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { correctProjectCurrency, previewProjectCurrency } from "@/lib/actions/project-currency";
import { money, supportedCurrencies, type Currency } from "@/lib/domain/money";
import { Modal } from "./modal";
import { useReminderFeed } from "./reminder-feed";

type Preview = Exclude<Awaited<ReturnType<typeof previewProjectCurrency>>, {error:string}>;
export function ProjectCurrencyCorrection({projectId, currency, onClose, onDone}: {
  projectId:string; currency:Currency; onClose:()=>void; onDone:(currency:Currency)=>void;
}) {
  const t = useTranslations("editor.currencyCorrection"), common = useTranslations("common"), locale = useLocale();
  const feed = useReminderFeed();
  const [target, setTarget] = useState<Currency>(currency);
  const [review, setReview] = useState<Preview | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [requestId] = useState(()=>crypto.randomUUID());
  useEffect(()=>{
    let active = true;
    previewProjectCurrency({projectId, currency:target}).then(result=>{
      if (!active) return;
      if ("error" in result) setError(result.error ?? t("failed")); else setReview(result);
    }).catch(()=>{if(active)setError(t("failed"));});
    return ()=>{active=false;};
  },[projectId,target,version,t]);
  const reload = () => {setReview(null);setError(null);setConfirmed(false);setVersion(v=>v+1);};
  const close = () => {if(!pending)onClose();};
  return <Modal title={t("title")} onClose={close}>
    <form className="editor-form" onSubmit={async event=>{
      event.preventDefault(); if(!review || review.blocked || !confirmed || target === review.from)return;
      setPending(true);setError(null);
      try {
        const failure = await correctProjectCurrency({projectId,currency:target,token:review.token,requestId,reason,confirmed:true});
        if(failure){setError(failure);setConfirmed(false);}
        else {await feed.reload();onDone(target);}
      } catch {setError(t("failed"));}
      finally {setPending(false);}
    }}>
      <fieldset className="editor-fields" disabled={pending}>
        <p>{t("intro")}</p>
        <label>{t("target")}<select autoFocus value={target} onChange={e=>{setTarget(e.target.value as Currency);setReview(null);setError(null);setConfirmed(false);}}>
          {supportedCurrencies.map(c=><option key={c} value={c}>{c}</option>)}
        </select></label>
        {!review && !error && <p role="status">{t("loading")}</p>}
        {review && <>
          <dl className="editor-money-summary">
            <div><dt>{review.title}</dt><dd>{review.from}{target !== review.from && <> → {target}</>}</dd></div>
            <div><dt>{t("quote")}</dt><dd>{review.quotedAmount === null ? "—" : <>{money(review.quotedAmount,locale,review.from)}{target !== review.from && <> → {money(review.quotedAmount,locale,target)}</>}</>}</dd></div>
          </dl>
          <details open><summary>{t("payments",{count:review.payments.length})}</summary>
            {review.payments.map(p=><div key={p.id} className="notice">
              <strong>{p.label}{p.voided ? ` · ${t("voided")}` : ""}</strong>
              <p>{money(p.amount,locale,p.currency)}{target !== p.currency && <> → {money(p.amount,locale,target)}</>}</p>
              <p>{t("balance",{cash:money(p.cash,locale,target),withheld:money(p.withheld,locale,target),remaining:money(p.remaining,locale,target),count:p.receipts})}</p>
            </div>)}
          </details>
          <p className="muted">{t("costs",{count:review.costs})}</p>
          {review.blocked && <ActionNotice className="error" role="alert" actions={<button className="secondary" type="button" onClick={reload}>{t("reload")}</button>}>
            <p>{t(review.blocked)}</p>
            {review.documents.map(d=><p key={d.id}><a href={`/finance?invoice=${d.id}#invoices`} target="_blank" rel="noopener noreferrer">{t("openDocument",{number:d.number})}</a></p>)}
            {review.external.map(p=><p key={p.id}>{p.label} · {p.number}</p>)}
          </ActionNotice>}
          <label>{t("reason")}<textarea required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
          {target !== review.from && <label className="check-line"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} disabled={!!review.blocked || target === review.from}/><span>{t("confirmText",{from:review.from,to:target})}</span></label>}
          {review.history.length > 0 && <details><summary>{t("history")}</summary>{review.history.map(h=><p key={h.id}>{h.from} → {h.to} · {h.actor || t("unknownActor")} · {new Date(h.at).toLocaleString(locale)}<br/>{h.reason}</p>)}</details>}
        </>}
        {error && <ActionNotice className="error" role="alert" actions={<button type="button" className="secondary" onClick={reload}>{t("reload")}</button>}>{error}</ActionNotice>}
        <footer className="modal-actions">
          <button type="button" className="secondary" onClick={close}>{common("cancel")}</button>
          <button className="primary" type="submit" disabled={pending || !review || !!review.blocked || !confirmed || !reason.trim() || target === review.from}>{pending ? t("saving") : t("save")}</button>
        </footer>
      </fieldset>
    </form>
  </Modal>;
}
