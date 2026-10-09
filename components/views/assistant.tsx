"use client";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { InfoHint } from "@/components/app/info-hint";
import { useAppData } from "@/components/app/app-data";
import { useAssistantConversation } from "@/components/app/assistant-provider";
import { RoleAvatar } from "@/components/role/role-portrait";
import { assistantSamples } from "@/lib/ai/assistant-samples";
import { AssistantArchiveView } from "@/components/views/assistant-archive";

export function AssistantView({ compact = false }: { compact?: boolean }) {
  const t=useTranslations("assistant"), errors=useTranslations("assistant.error"), eyebrow=useTranslations("eyebrow");
  const data=useAppData();
  const { query, setQuery, lines, sample, setSample, projectId, setProjectId, error, spent, pending,
    archive, loadingHistory, historyError, loadingOlder, loadOlder, totals, restore, reset, send, activate } = useAssistantConversation();
  const end=useRef<HTMLDivElement>(null), field=useRef<HTMLTextAreaElement>(null);
  const source=sample?assistantSamples():data;
  useEffect(()=>{activate(true);},[activate]);
  useEffect(()=>{end.current?.scrollIntoView({block:"nearest"});},[lines,pending]);
  useEffect(()=>{if(!pending&&!loadingHistory)field.current?.focus({preventScroll:true});},[pending,loadingHistory]);
  return <section data-preview-safe="true" className={`assistant-panel ${compact?"":"assistant-expanded"}`}>
    {!compact&&<header><RoleAvatar role={data.person.role} appearance={data.person.appearance}/><div><span>{eyebrow("talentAssistant")}</span><small>{t("status")} <InfoHint label={t("privacyTitle")} notes={[t("privacy")]} /></small></div></header>}
    <details className="assistant-options-disclosure" open={compact?undefined:true}>
      <summary>{t("options")} · {sample?t("sample"):t("workspace")}</summary>
    <div className="assistant-controls">
      <div className="assistant-sample-control"><label><input type="checkbox" checked={sample} disabled={!!data.preview||pending||loadingHistory} onChange={e=>{setSample(e.target.checked);setProjectId("");reset();}}/>{t("sample")}</label>{sample && <InfoHint label={t("sample")} notes={[t("sampleNotice")]} />}</div>
      <label>{t("scope")}<select value={projectId} disabled={pending||loadingHistory} onChange={e=>{setProjectId(e.target.value);reset();}}><option value="">{t("overview")}</option>{source.projects.filter(p=>!p.archived).map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
      <button type="button" className="text-button" onClick={reset} disabled={pending||loadingHistory||!lines.length}>{t("clear")}</button>
    </div>

    </details>
    {loadingHistory&&<p role="status">{t("loadingHistory")}</p>}
    {historyError&&<p role="alert" className="assistant-error">{t("historyError")}</p>}
    {!!lines.length&&<p className="assistant-totals">{t("conversationTotals",{...totals,cost:totals.cost.toFixed(6)})}</p>}
    <div className="message-list" role="log" aria-label={t("conversation")} aria-live="polite" aria-busy={pending}>
      {!lines.length&&<p className="message">{t("intro")}</p>}
      {lines.map((line,i)=><div key={i} className={`message ${line.role=== "user"?"user":""}`} role="group" aria-label={line.role==="user"?t("you"):eyebrow("talentAssistant")}><p className="assistant-reply">{line.content}</p>{line.failed&&<small className="assistant-error">{t("failed")}</small>}{line.mode==="local"&&<small className="message-mode">{t("localUsage")}</small>}{line.usage&&line.mode!=="local"&&<small className="message-mode">{t("usage",{input:line.usage.inputTokens,output:line.usage.outputTokens,total:line.usage.inputTokens+line.usage.outputTokens,reasoning:line.usage.reasoningTokens,cost:(line.cost??0).toFixed(6)})}</small>}</div>)}
      {pending&&<div className="message assistant-pending" role="status"><p>{t("working")}<span className="assistant-typing" aria-hidden="true"><span/><span/><span/></span></p></div>}<div ref={end}/>
    </div>
    {error&&<p role="alert" className="assistant-error">{errors(error as "unexpected")} <button type="button" className="text-button" disabled={pending} onClick={()=>{const last=lines.at(-1);if(last?.failed)void send(last.content);}}>{t("retry")}</button></p>}
    <div className="quick-prompts">{[t("prompt.today"),t("prompt.tomorrow"),t("prompt.unpaid"),t("prompt.payable")].map(p=><button type="button" key={p} disabled={pending||loadingHistory} onClick={()=>{void send(p,false);}}>{p}</button>)}</div>
    <form className="assistant-input" onSubmit={e=>{e.preventDefault();send();}}>
      <textarea ref={field} rows={2} value={query} maxLength={12000} readOnly={pending||loadingHistory} aria-label={t("input")} placeholder={t("placeholder")} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send();}}}/>
      <button aria-label={t("send")} disabled={pending||loadingHistory||!query.trim()}>↑</button>
    </form>
    {!compact&&archive&&<AssistantArchiveView archive={archive} disabled={pending||loadingHistory} onRestore={restore} onLoadOlder={loadOlder} loadingOlder={loadingOlder}/>}
    {compact?<div className="assistant-compact-note"><InfoHint label={t("privacyTitle")} above notes={[t("privacy"),t("history"),...(spent!==null?[t("budget",{spent:spent.toFixed(4)})]:[])]}/></div>:<small className="assistant-notice">{t("history")}{spent!==null&&` · ${t("budget",{spent:spent.toFixed(4)})}`}</small>}
  </section>;
}
