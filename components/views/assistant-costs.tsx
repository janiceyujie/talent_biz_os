"use client";
import type messages from "@/messages/en.json";
import {useState} from "react";
import Link from "next/link";
import {useTranslations,useLocale} from "next-intl";
import type {EvaluationRun} from "@/lib/ai/assistant-records";
import {summarizeCosts,projectCosts,PROPOSED_LIMITS,evaluationCSV,type CostRow} from "@/lib/ai/cost-analysis";

export function AssistantCostsView({runs}:{runs:EvaluationRun[]}) {
  const t=useTranslations("assistantCosts"),locale=useLocale();
  const [id,setId]=useState("luna-followup-100-v3"),[daily,setDaily]=useState(30);
  const run=runs.find(r=>r.id===id)??runs.at(-1), rows=(run?.rows??[]) as CostRow[];
  const s=summarizeCosts(rows),ai=summarizeCosts(rows,true),projection=projectCosts(rows,daily);
  const usd=(v:number,digits=4)=>new Intl.NumberFormat(locale,{style:"currency",currency:"USD",minimumFractionDigits:digits,maximumFractionDigits:digits}).format(v);
  const num=(v:number)=>new Intl.NumberFormat(locale,{maximumFractionDigits:0}).format(v);
  const name=(id:string)=>t(id.includes("daily")?"dailyRun":id.includes("followup")?"followupRun":id.endsWith("v2")?"old2":"old1");
  const categories=[...new Set(rows.map(r=>r.category))];
  function download(){const url=URL.createObjectURL(new Blob([evaluationCSV(rows)],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=`${run?.id??"evaluation"}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <div className="cost-analysis" data-preview-safe="true">
    <header className="page-title"><h1>{t("title")}</h1><Link href="/assistant">{t("back")}</Link></header>
    <p>{t("intro")}</p>
    <section className="surface"><div className="toolbar wrap"><label>{t("run")}<select value={run?.id??""} onChange={e=>setId(e.target.value)}>{runs.map(r=><option key={r.id} value={r.id}>{name(r.id)}</option>)}</select></label><button className="secondary" onClick={download} disabled={!rows.length}>{t("csv")}</button></div>
      {!rows.length?<p>{t("empty")}</p>:<><p className="muted">{run?.id} · {run?.model} · {run?.updatedAt.slice(0,10)}</p>
      <div className="cost-metrics"><div><small>{t("exchanges")}</small><strong>{s.count}</strong><span>{t("routeCounts",{ai:ai.count,local:s.local,failed:s.failed})}</span></div><div><small>{t("tokens")}</small><strong>{num(s.total)}</strong><span>{t("io",{input:num(s.input),output:num(s.output)})}</span></div><div><small>{t("cost")}</small><strong>{usd(s.cost,6)}</strong><span>{t("perExchange",{cost:usd(s.mean,6)})}</span></div></div>
      <p>{t("aiMean",{cost:usd(ai.mean,6),tokens:num(ai.meanTokens)})}</p></>}
    </section>
    <section className="surface"><h2>{t("plans")}</h2><p>{t("planNotice")}</p><div className="cost-table" tabIndex={0} role="region" aria-label={t("plans")}><table><thead><tr>{(["plan","price","quota","monthly","monthlyAverage","range","guard"] as const).map(k=><th key={k}>{t(k)}</th>)}</tr></thead><tbody>{[{label:"Basic",price:20,quota:30},{label:"Pro",price:40,quota:100}].map(p=>{const x=projectCosts(rows,p.quota);return <tr key={p.label}><th>{p.label}</th><td>{usd(p.price,2)}</td><td>{p.quota}</td><td>{num(x.count)}</td><td>{ai.count?usd(x.mean):"—"}</td><td>{ai.count?`${usd(x.min)} – ${usd(x.max)}`:"—"}</td><td>{usd(PROPOSED_LIMITS.worstCostUSD*x.count,2)}</td></tr>;})}</tbody></table></div><p className="muted">{t("rangeNote")}</p><details><summary>{t("guardTitle")}</summary><p>{t("guardNote")}</p><p>{t("currentGuard")}</p><p>{t("scopeNote")}</p></details></section>
    <section className="surface"><h2>{t("calculator")}</h2><label>{t("dailyAI")}<input type="number" min="1" max="500" value={daily} onChange={e=>setDaily(Math.max(1,Math.min(500,Number(e.target.value)||1)))}/></label><p aria-live="polite">{t("projection",{daily,dayCost:usd(ai.mean*daily),dayTokens:num(ai.meanTokens*daily),monthly:num(projection.count),tokens:num(projection.tokens),cost:usd(projection.mean),p95:usd(projection.p95)})}</p></section>
    <section className="surface"><h2>{t("categories")}</h2><div className="cost-table" tabIndex={0} role="region" aria-label={t("categories")}><table><thead><tr>{(["category","exchanges","avgInput","avgOutput","avgTokens","average","minimum","maximum"] as const).map(k=><th key={k}>{t(k)}</th>)}</tr></thead><tbody>{categories.map(c=>{const x=summarizeCosts(rows.filter(r=>r.category===c));return <tr key={c}><th>{t.has(`categoryNames.${c as keyof typeof messages.assistantCosts.categoryNames}`)?t(`categoryNames.${c as keyof typeof messages.assistantCosts.categoryNames}`):c}</th><td>{x.count}</td><td>{num(x.input/(x.count||1))}</td><td>{num(x.output/(x.count||1))}</td><td>{num(x.meanTokens)}</td><td>{usd(x.mean,6)}</td><td>{usd(x.min,6)}</td><td>{usd(x.max,6)}</td></tr>;})}</tbody></table></div></section>
    <section className="surface"><details><summary>{t("records",{count:rows.length})}</summary><div className="cost-table" tabIndex={0} role="region" aria-label={t("records",{count:rows.length})}><table><thead><tr>{(["question","input","output","tokens","cost"] as const).map(k=><th key={k}>{t(k)}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><details><summary>{r.id} · {r.query.slice(0,90)}</summary><p className="prewrap">{r.query}</p><p className="prewrap">{r.text??t("failed")}</p></details></td><td>{r.usage?.inputTokens??"—"}</td><td>{r.usage?.outputTokens??"—"}</td><td>{r.usage?r.usage.inputTokens+r.usage.outputTokens:"—"}</td><td>{r.estimatedCostUSD!==undefined?usd(r.estimatedCostUSD,6):"—"}</td></tr>)}</tbody></table></div></details></section>
    <section className="surface"><details><summary>{t("methodTitle")}</summary><p>{t("method")}</p><p>{t("accounting")}</p><p>{t("comparison")}</p><p>{t("rates")}</p><a href="https://developers.openai.com/api/docs/models/gpt-6-luna" target="_blank" rel="noreferrer">{t("source")}</a></details></section>
  </div>;
}
