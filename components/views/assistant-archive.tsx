"use client";
import { useTranslations } from "next-intl";
import { usageTotals, type AssistantArchive, type AssistantRecord } from "@/lib/ai/assistant-records";
export function AssistantArchiveView({archive,disabled,onRestore,onLoadOlder,loadingOlder}:{archive:AssistantArchive;disabled:boolean;onRestore:(records:AssistantRecord[])=>void;onLoadOlder:()=>void;loadingOlder:boolean}) {
  const t=useTranslations("assistant");
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
    {archive.nextCursor&&<button type="button" className="secondary" disabled={disabled||loadingOlder} onClick={onLoadOlder}>{t(loadingOlder?"loadingOlder":"loadOlder")}</button>}
  </div>;
}
