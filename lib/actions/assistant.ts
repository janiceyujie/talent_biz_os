"use server";
import { randomUUID } from "node:crypto";
import { saveAssistantRecord } from "@/lib/ai/assistant-history";
import type { AssistantRecord } from "@/lib/ai/assistant-records";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { localAssistantReply, LOCAL_USAGE } from "@/lib/ai/assistant-local";
import { getLocale, getTranslations } from "next-intl/server";
import { requireTalent } from "@/lib/auth";
import { getProjectDetail } from "@/lib/data/project-detail";
import { getAppData } from "@/lib/data";
import { db } from "@/lib/db";
import { aiCall, person as personTable } from "@/lib/db/schema";
import { dailyUsage } from "@/lib/ai/usage";
import { dateInZone } from "@/lib/domain/dates";
import { openAIResponse } from "@/lib/ai/openai";
import { LocalAIError, assertLocalExperiment } from "@/lib/ai/local-budget";
import { assistantContext, ASSISTANT_INSTRUCTIONS, ASSISTANT_PROMPT_VERSION } from "@/lib/ai/assistant-context";
import { assistantSamples } from "@/lib/ai/assistant-samples";
const input = z.object({ conversationId:z.string().uuid(), query:z.string().trim().min(1).max(12000), projectId:z.string().max(100).optional(), sample:z.boolean(), history:z.array(z.object({role:z.enum(["user","assistant"]),content:z.string().max(6000)})).max(8) });
const active = new Set<string>();
const recent = new Map<string,number[]>();
export async function askAssistant(value: unknown) {
  const parsed = input.safeParse(value);
  if (!parsed.success) return {error:"too_long" as const};
  const {person,talent} = await requireTalent();
  const [verified] = await db.select({ok:personTable.emailVerified}).from(personTable).where(eq(personTable.id,person.personId));
  if (!verified?.ok) return {error:"blocked" as const};
  const times=(recent.get(person.personId)??[]).filter(t=>Date.now()-t<60000);
  if(active.has(person.personId)||times.length>=10) return {error:"busy" as const};
  active.add(person.personId); recent.set(person.personId,[...times,Date.now()]);
  const started=Date.now();
  try {
    assertLocalExperiment();
    const {query,projectId,sample,history}=parsed.data;
    const data=sample?assistantSamples():await getAppData();
    if (!sample && projectId && data.projects.some(p => p.id === projectId)) {
      const detail = await getProjectDetail(talent.id, projectId);
      if (detail) Object.assign(data, { projectDetails: { [projectId]: detail } });
    }
    const context=assistantContext(data,projectId,sample,sample?"2026-10-07":dateInZone(data.talent.timeZone));
    const t = await getTranslations("assistant.local");
    const localText = localAssistantReply(data, query, projectId, sample, context.today, t);
    if (localText !== null) {
      const record: AssistantRecord = { id: randomUUID(), conversationId: parsed.data.conversationId,
        at: new Date().toISOString(), sample, projectId, query, text: localText,
        usage: LOCAL_USAGE, estimatedCostUSD: 0, model: "local", mode: "local" };
      let historySaved = true;
      try { await saveAssistantRecord(person.personId, talent.id, record); } catch { historySaved = false; }
      return { text: localText, usage: LOCAL_USAGE, estimatedCostUSD: 0, record, historySaved };
    }
    if((await dailyUsage(talent.id)).remaining<=0) return {error:"usage_limit" as const};
    const request=JSON.stringify({language:await getLocale(),context,query});
    if(history.reduce((n,t)=>n+t.content.length,0)+request.length>32000) return {error:"too_long" as const};
    const result=await openAIResponse({instructions:ASSISTANT_INSTRUCTIONS,input:[...history,{role:"user",content:request}]});
    await db.insert(aiCall).values({talentId:talent.id,personId:person.personId,task:"assistant",provider:"openai",model:result.model,promptVersion:ASSISTANT_PROMPT_VERSION,status:"ok",inputTokens:result.usage.inputTokens,outputTokens:result.usage.outputTokens,latencyMs:result.latencyMs}).catch(()=>{});
    const record: AssistantRecord = { id: randomUUID(), conversationId: parsed.data.conversationId,
      at: new Date().toISOString(), sample, projectId, query, text: result.text,
      usage: result.usage, estimatedCostUSD: result.estimatedCostUSD, model: result.model, mode: "ai" };
    let historySaved = true;
    try { await saveAssistantRecord(person.personId, talent.id, record); }
    catch { historySaved = false; }
    return {text:result.text,usage:result.usage,estimatedCostUSD:result.estimatedCostUSD,budgetUsedUSD:result.budgetUsedUSD,record,historySaved};
  } catch(e) {
    const code=e instanceof LocalAIError?e.code:"unexpected";
    await db.insert(aiCall).values({talentId:talent.id,personId:person.personId,task:"assistant",provider:"openai",model:"gpt-6-luna",promptVersion:ASSISTANT_PROMPT_VERSION,status:"error",failureCode:code,latencyMs:Date.now()-started}).catch(()=>{});
    return {error:code};
  } finally {active.delete(person.personId);}
}
