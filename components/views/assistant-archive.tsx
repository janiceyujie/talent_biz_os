"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { usageTotals, type AssistantArchive, type AssistantRecord } from "@/lib/ai/assistant-records";
export function AssistantArchiveView({archive,disabled,onRestore}:{archive:AssistantArchive;disabled:boolean;onRestore:(records:AssistantRecord[])=>void}) {
  const t=useTranslations("assistant");
  const [runId,setRunId]=useState("luna-followup-100-v3");
  const run=archive.runs.find(r=>r.id===runId)??archive.runs.at(-1);
  const groups=new Map<string,AssistantRecord[]>();
  for(const record of archive.records)groups.set(record.conversationId,[...(groups.get(record.conversationId)??[]),record]);
  const summary=(rows:Parameters<typeof usageTotals>[0])=>{const total=usageTotals(rows);return t("archiveTotals",{...total,count:rows.length,cost:total.cost.toFixed(6)});};
  return <div className="assistant-archive">
    <details><summary>{t("savedConversations",{count:groups.size})}</summary>
      <p>{t("storageNotice")}</p>
      {archive.truncated&&<p role="status">{t("truncatedHistory")}</p>}
      <p>{summary(archive.records)}</p>
      {!groups.size&&<p>{t("emptyHistory")}</p>}
      {[...groups.entries()].reverse().map(([id,records])=><div className="assistant-archive-item" key={id}>
        <button type="button" className="text-button" disabled={disabled} onClick={()=>onRestore(records)}>{records[0].query.slice(0,100)}</button>
        <small>{records[0].sample?t("sample"):t("workspaceData")} · {t("recordTime",{time:records.at(-1)?.at.replace("T"," ").slice(0,19)??""})} · {summary(records)}</small>
      </div>)}
    </details>
    <details><summary>{t("evaluationHistory",{count:archive.runs.reduce((n,r)=>n+r.rows.length,0)})}</summary>
      <p>{t("evaluationNotice")}</p>
      {!run&&<p>{t("emptyEvaluation")}</p>}
      {run&&<><label>{t("evaluationRun")} <select value={run.id} onChange={e=>setRunId(e.target.value)}>{archive.runs.map(r=><option key={r.id} value={r.id}>{r.id} · {r.rows.length}</option>)}</select></label>
        <p>{run.model} · {summary(run.rows)}</p>
        <div className="assistant-evaluation-list">{run.rows.map(row=><details key={row.id} className="assistant-archive-item">
          <summary>{row.id} · {row.query.slice(0,100)}</summary>
          <p className="assistant-reply"><strong>{t("you")}</strong>
{row.query}</p>
          <p className="assistant-reply"><strong>{t("recordedAnswer")}</strong>
{row.text??t("evaluationFailed")}</p>
          {row.usage&&<p>{t("usage",{input:row.usage.inputTokens,output:row.usage.outputTokens,total:row.usage.inputTokens+row.usage.outputTokens,reasoning:row.usage.reasoningTokens,cost:(row.estimatedCostUSD??0).toFixed(6)})}</p>}
        </details>)}</div>
      </>}
    </details>
  </div>;
}
