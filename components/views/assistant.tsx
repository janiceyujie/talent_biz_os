"use client";
import Link from "next/link";

import { InfoHint } from "@/components/app/info-hint";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useAppData } from "@/components/app/app-data";
import { RoleAvatar } from "@/components/role/role-portrait";
import { askAssistant } from "@/lib/actions/assistant";
import { assistantSamples } from "@/lib/ai/assistant-samples";
import { usageTotals, type AssistantRecord, type AssistantArchive } from "@/lib/ai/assistant-records";
import { AssistantArchiveView } from "@/components/views/assistant-archive";
import type { TokenUsage } from "@/lib/ai/local-budget";
type ChatLine={role:"user"|"assistant";content:string;usage?:TokenUsage;cost?:number;mode?:"local"|"ai";failed?:boolean};
export function AssistantView({ compact = false }: { compact?: boolean }) {
  const t=useTranslations("assistant"), errors=useTranslations("assistant.error"), eyebrow=useTranslations("eyebrow");
  const data=useAppData();
  const [query,setQuery]=useState(""); const [lines,setLines]=useState<ChatLine[]>([]);
  const [sample,setSample]=useState(!!data.preview); const [projectId,setProjectId]=useState("");
  const [error,setError]=useState(""); const [spent,setSpent]=useState<number|null>(null);
  const [pending,setPending]=useState(false); const sending=useRef(false); const end=useRef<HTMLDivElement>(null); const field=useRef<HTMLTextAreaElement>(null);
  const [archive,setArchive]=useState<AssistantArchive|null>(null);
  const [loadingHistory,setLoadingHistory]=useState(true);
  const [historyError,setHistoryError]=useState(false);
  const [conversationId,setConversationId]=useState("");
  const restore=useCallback((records:AssistantRecord[])=>{
    const last=records.at(-1);if(!last||data.preview&&!last.sample)return;
    setConversationId(last.conversationId);setSample(!!data.preview||last.sample);setProjectId(last.projectId??"");
    setLines(records.flatMap(r=>[{role:"user" as const,content:r.query},{role:"assistant" as const,content:r.text,usage:r.usage,cost:r.estimatedCostUSD,mode:r.mode}]));
    setError("");setQuery("");
  },[data.preview]);
  useEffect(()=>{
    const controller=new AbortController();
    fetch("/api/assistant/history",{cache:"no-store",signal:controller.signal})
      .then(async response=>{if(!response.ok)throw Error("History unavailable");return await response.json() as AssistantArchive;})
      .then(value=>{setArchive(value);setSpent(value.budgetUsedUSD);const last=value.records.at(-1);if(last&&(!data.preview||last.sample))restore(value.records.filter(r=>r.conversationId===last.conversationId));else setConversationId(crypto.randomUUID());})
      .catch(()=>{if(!controller.signal.aborted){setHistoryError(true);setConversationId(crypto.randomUUID());}})
      .finally(()=>{if(!controller.signal.aborted)setLoadingHistory(false);});
    return ()=>controller.abort();
  },[data.preview,restore]);
  const totals=usageTotals(lines.map(l=>({usage:l.usage,estimatedCostUSD:l.cost})));
  const source=sample?assistantSamples():data;
  useEffect(()=>{end.current?.scrollIntoView({block:"nearest"});},[lines,pending]);
  const reset=()=>{setLines([]);setError("");setQuery("");setConversationId(crypto.randomUUID());};
  async function send(value = query, fromComposer = true) {
    const text=value.trim(); if(!text||sending.current||loadingHistory) return;
    sending.current=true;
    const history=lines.filter(line=>!line.failed).slice(-8).map(({role,content})=>({role,content:content.slice(0,6000)}));
    const previous=lines.at(-1);
    const retry=previous?.failed && previous.content===text;
    setLines(old=>[...(retry?old.slice(0,-1):old),{role:"user",content:text}]);
    if(fromComposer)setQuery("");
    setError("");setPending(true);
    const fail=(code:string)=>{
      setError(code);
      setLines(old=>old.map((line,index)=>index===old.length-1?{...line,failed:true}:line));
      if(fromComposer)setQuery(current=>current||text);
    };
    try {
      const result=await askAssistant({conversationId,query:text,projectId:projectId||undefined,sample,history});
      if("error" in result && result.error) {fail(result.error);return;}
      if("text" in result && result.text) {
        setLines(old=>[...old,{role:"assistant",content:result.text!,usage:result.usage,cost:result.estimatedCostUSD,mode:result.record?.mode}]);
        const budget="budgetUsedUSD" in result?result.budgetUsedUSD:undefined;
        if(result.record&&result.historySaved)setArchive(old=>({...old,records:[...(old?.records??[]),result.record],runs:old?.runs??[],budgetUsedUSD:budget??old?.budgetUsedUSD??0,truncated:old?.truncated??false}));
        if(!result.historySaved)setHistoryError(true);
        if(budget!==undefined)setSpent(budget);
      } else fail("unexpected");
    } catch {fail("unexpected");}
    finally {sending.current=false;setPending(false);field.current?.focus();}
  }
  return <section data-preview-safe="true" className={`assistant-panel ${compact?"":"assistant-expanded"}`}>
    <header><RoleAvatar role={data.person.role} appearance={data.person.appearance}/><div><span>{eyebrow("talentAssistant")}</span><small>{t("status")} <InfoHint label={t("privacyTitle")} notes={[t("privacy")]} /></small></div></header>
    <div className="assistant-controls">
      <label><input type="checkbox" checked={sample} disabled={!!data.preview||pending||loadingHistory} onChange={e=>{setSample(e.target.checked);setProjectId("");reset();}}/>{t("sample")}</label>
      <label>{t("scope")}<select value={projectId} disabled={pending||loadingHistory} onChange={e=>{setProjectId(e.target.value);reset();}}><option value="">{t("overview")}</option>{source.projects.filter(p=>!p.archived).map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
      <button type="button" className="text-button" onClick={reset} disabled={pending||loadingHistory||!lines.length}>{t("clear")}</button>
    </div>
    {sample&&<p className="assistant-notice">{t("sampleNotice")}</p>}

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
    {archive&&<p><Link href="/assistant/costs">{t("costAnalysis")}</Link></p>}
    {archive&&<AssistantArchiveView archive={archive} disabled={pending||loadingHistory} onRestore={restore}/>}
    <small className="assistant-notice">{t("history")}{spent!==null&&` · ${t("budget",{spent:spent.toFixed(4)})}`}</small>
  </section>;
}
