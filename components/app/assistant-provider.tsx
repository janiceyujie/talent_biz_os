"use client";

import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useAppData } from "@/components/app/app-data";
import { askAssistant } from "@/lib/actions/assistant";
import { usageTotals, type AssistantRecord, type AssistantArchive } from "@/lib/ai/assistant-records";
import type { TokenUsage } from "@/lib/ai/local-budget";

type ChatLine = { role: "user" | "assistant"; content: string; usage?: TokenUsage; cost?: number; mode?: "local" | "ai"; failed?: boolean };

function useConversation() {
  const data = useAppData();
  const [active, setActive] = useState(false);
  const [query,setQuery]=useState(""); const [lines,setLines]=useState<ChatLine[]>([]);
  const [sample,setSample]=useState(!!data.preview); const [projectId,setProjectId]=useState("");
  const [error,setError]=useState(""); const [spent,setSpent]=useState<number|null>(null);
  const [pending,setPending]=useState(false); const sending=useRef(false);
  const [archive,setArchive]=useState<AssistantArchive|null>(null);
  const [loadingHistory,setLoadingHistory]=useState(true);
  const [historyError,setHistoryError]=useState(false);
  const [loadingOlder,setLoadingOlder]=useState(false);
  const loadingOlderRef=useRef(false);
  const [conversationId,setConversationId]=useState("");
  const restore=useCallback((records:AssistantRecord[])=>{
    const last=records.at(-1);if(!last||data.preview&&!last.sample)return;
    setConversationId(last.conversationId);setSample(!!data.preview||last.sample);setProjectId(last.projectId??"");
    setLines(records.flatMap(r=>[{role:"user" as const,content:r.query},{role:"assistant" as const,content:r.text,usage:r.usage,cost:r.estimatedCostUSD,mode:r.mode}]));
    setError("");setQuery("");
  },[data.preview]);
  useEffect(()=>{
    if(!active)return;
    const controller=new AbortController();
    fetch("/api/assistant/history",{cache:"no-store",signal:controller.signal})
      .then(async response=>{if(!response.ok)throw Error("History unavailable");return await response.json() as AssistantArchive;})
      .then(value=>{setArchive(value);const records=value.records.filter(r=>r.sample===!!data.preview);const last=records.at(-1);if(last)restore(records.filter(r=>r.conversationId===last.conversationId));else setConversationId(crypto.randomUUID());})
      .catch(()=>{if(!controller.signal.aborted){setHistoryError(true);setConversationId(crypto.randomUUID());}})
      .finally(()=>{if(!controller.signal.aborted)setLoadingHistory(false);});
    return ()=>controller.abort();
  },[active,data.preview,restore]);
  async function loadOlder() {
    if (!archive?.nextCursor || loadingOlderRef.current) return;
    loadingOlderRef.current=true;setLoadingOlder(true);setHistoryError(false);
    try {
      const response=await fetch(`/api/assistant/history?${new URLSearchParams({cursor:archive.nextCursor})}`,{cache:"no-store"});
      if(!response.ok)throw Error("History unavailable");
      const page=await response.json() as AssistantArchive;
      setArchive(old=>{
        const records=new Map((old?.records??[]).map(record=>[record.id,record]));
        for(const record of page.records)records.set(record.id,record);
        return {...page,records:[...records.values()].sort((a,b)=>a.at.localeCompare(b.at))};
      });
    } catch {setHistoryError(true);}
    finally {loadingOlderRef.current=false;setLoadingOlder(false);}
  }
  const totals=usageTotals(lines.map(l=>({usage:l.usage,estimatedCostUSD:l.cost})));
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
        if(result.record&&result.historySaved)setArchive(old=>({...old,records:[...(old?.records??[]),result.record],truncated:old?.truncated??false,nextCursor:old?.nextCursor??null}));
        if(!result.historySaved)setHistoryError(true);
        if(budget!==undefined)setSpent(budget);
      } else fail("unexpected");
    } catch {fail("unexpected");}
    finally {sending.current=false;setPending(false);}
  }

  return { query, setQuery, lines, sample, setSample, projectId, setProjectId, error, spent, pending,
    archive, loadingHistory, historyError, loadingOlder, loadOlder, totals, restore, reset, send, activate: setActive };
}

const ConversationContext = createContext<ReturnType<typeof useConversation> | null>(null);

/** One in-memory conversation across the floating panel and the full page. */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const conversation = useConversation();
  return <ConversationContext.Provider value={conversation}>{children}</ConversationContext.Provider>;
}

export function useAssistantConversation() {
  const conversation = useContext(ConversationContext);
  if (!conversation) throw new Error("AssistantProvider is required");
  return conversation;
}
