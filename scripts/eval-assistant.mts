import nextEnv from "@next/env";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import cases from "../evals/assistant/cases.json";
import { assistantContext, assistantRequestContext, ASSISTANT_INSTRUCTIONS, ASSISTANT_PROMPT_VERSION } from "../lib/ai/assistant-context";
import { assistantSamples } from "../lib/ai/assistant-samples";
import type { Turn } from "../lib/ai/openai";
nextEnv.loadEnvConfig(process.cwd());
const {openAIResponse}=await import("../lib/ai/openai");
const dir="evals/results/assistant"; mkdirSync(dir,{recursive:true});
const fingerprint=createHash("sha256").update(JSON.stringify({cases,system:ASSISTANT_INSTRUCTIONS,version:ASSISTANT_PROMPT_VERSION,contexts:cases.map(c=>assistantContext(assistantSamples(),c.projectId??undefined,true,"2026-10-07"))})).digest("hex");
const output=`${dir}/luna-100-context-v3.json`;
type Row={id:string;category:string;query:string;status:string;text?:string;usage?:{inputTokens:number;outputTokens:number;cachedInputTokens:number;cacheWriteTokens:number;reasoningTokens:number};estimatedCostUSD?:number;latencyMs?:number;error?:string};
const previous=existsSync(output)?JSON.parse(readFileSync(output,"utf8")):null;
if(previous&&previous.fingerprint!==fingerprint) throw Error("Evaluation changed: use a new output path before rerunning");
const rows:Row[]=previous?.rows??[];
let errors=0;
for(const c of cases){
 if(rows.some(r=>r.id===c.id)) continue;
 const context=assistantContext(assistantSamples(),c.projectId??undefined,true,"2026-10-07");
 try{
  const result=await openAIResponse({instructions:ASSISTANT_INSTRUCTIONS,input:[...c.history as Turn[],{role:"user",content:JSON.stringify({language:c.locale,context:assistantRequestContext(context,c.query,c.history as Turn[]),query:c.query})}]});
  rows.push({id:c.id,category:c.category,query:c.query,status:"completed",text:result.text,usage:result.usage,estimatedCostUSD:result.estimatedCostUSD,latencyMs:result.latencyMs});
  errors=0;
  console.log(`${rows.length}/100 ${c.id}: input=${result.usage.inputTokens} output=${result.usage.outputTokens} USD=${result.estimatedCostUSD.toFixed(6)}`);
 }catch(e){
  rows.push({id:c.id,category:c.category,query:c.query,status:"error",error:e instanceof Error?e.message:"Unknown failure"});errors++;
 }
 writeFileSync(output,JSON.stringify({model:"gpt-6-luna",reasoning:"low",outputCap:1500,fixtureDate:"2026-10-07",promptVersion:ASSISTANT_PROMPT_VERSION,fingerprint,updatedAt:new Date().toISOString(),rows},null,2));
 if(errors>=3) {console.log("Stopped after three consecutive errors; inspect results.");break;}
 await new Promise(resolve=>setTimeout(resolve,300));
}
