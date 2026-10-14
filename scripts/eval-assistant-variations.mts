import nextEnv from "@next/env";
import {createTranslator} from "use-intl/core";
import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync} from "node:fs";
import {createHash} from "node:crypto";
import {assistantContext,assistantRequestContext,ASSISTANT_INSTRUCTIONS,ASSISTANT_PROMPT_VERSION} from "../lib/ai/assistant-context";
import {assistantSamples} from "../lib/ai/assistant-samples";
import {localAssistantReply,LOCAL_USAGE} from "../lib/ai/assistant-local";
import type {Turn} from "../lib/ai/openai";
import type {EvaluationRow} from "../lib/ai/assistant-records";
import en from "../messages/en.json";
import zh from "../messages/zh-TW.json";
nextEnv.loadEnvConfig(process.cwd());
if(process.env.TALENT_LIVE_EVAL!=="1") throw Error("Set TALENT_LIVE_EVAL=1 for the authorized synthetic evaluation");
const {openAIResponse}=await import("../lib/ai/openai");
const {assertLocalExperiment}=await import("../lib/ai/local-budget");
assertLocalExperiment();
type Case={id:string;category:string;query:string;projectId?:string;locale:"en"|"zh-TW";conversationId:string;turn:number};
type Row=EvaluationRow & {mode:"local"|"ai";conversationId:string;turn:number;historyTurns:number;requestBytes?:number;latencyMs?:number;model?:string};
const suite=process.argv[2];
if(!["daily","followup"].includes(suite))throw Error("Choose daily or followup");
const cases:Case[]=JSON.parse(readFileSync(`evals/assistant/${suite}-100.json`,"utf8"));
if(cases.length!==100||new Set(cases.map(c=>c.id)).size!==100)throw Error("Expected 100 unique cases");
const fixture=assistantSamples();const date="2026-10-07";
const fingerprint=createHash("sha256").update(JSON.stringify({cases,fixture,date,instructions:ASSISTANT_INSTRUCTIONS,contextCode:readFileSync("lib/ai/assistant-context.ts","utf8"),local:readFileSync("lib/ai/assistant-local.ts","utf8"),en:en.assistant.local,zh:zh.assistant.local})).digest("hex");
const id=`luna-${suite}-100-context-v3`;const dir="evals/results/assistant";mkdirSync(dir,{recursive:true});const output=`${dir}/${id}.json`;
const previous=existsSync(output)?JSON.parse(readFileSync(output,"utf8")):null;
if(previous&&previous.fingerprint!==fingerprint)throw Error("Changed inputs; choose a new output ID");
const rows:Row[]=previous?.rows??[];
const histories=new Map<string,Turn[]>();
const persist=()=>{writeFileSync(output+".tmp",JSON.stringify({id,model:"gpt-6-luna",reasoning:"low",outputCap:1500,fixtureDate:date,promptVersion:ASSISTANT_PROMPT_VERSION,fingerprint,updatedAt:new Date().toISOString(),method:suite==="daily"?"100 independent mixed local/AI exchanges":"20 conversations of 5 exchanges with actual prior answers and the UI's latest-8-turn limit",rows},null,2));renameSync(output+".tmp",output);};
let errors=0;
for(const c of cases){
 const old=rows.find(r=>r.id===c.id);
 const prior=histories.get(c.conversationId)??[];
 const history=prior.slice(-8).map(t=>({...t,content:t.content.slice(0,6000)}));
 if(old){if(old.status!=="completed")throw Error("Prior failed case requires review before resuming");histories.set(c.conversationId,[...prior,{role:"user",content:c.query},{role:"assistant",content:old.text!}]);continue;}
 const start=Date.now();
 const t=createTranslator({locale:c.locale,messages:c.locale==="en"?en:zh,namespace:"assistant.local"});
 const local=localAssistantReply(fixture,c.query,c.projectId??undefined,true,date,t);
 const mode=local===null?"ai":"local";
 try{
  const request=JSON.stringify({language:c.locale,context:assistantRequestContext(assistantContext(fixture,c.projectId??undefined,true,date),c.query,history),query:c.query});
  if(c.query.length>12000||history.reduce((n,t)=>n+t.content.length,0)+request.length>32000)throw Error("Exceeded app input limits");
  const result=local!==null?{text:local,usage:LOCAL_USAGE,estimatedCostUSD:0,model:"local",latencyMs:Date.now()-start}:await openAIResponse({instructions:ASSISTANT_INSTRUCTIONS,input:[...history,{role:"user",content:request}]});
  rows.push({...c,...result,status:"completed",mode,historyTurns:history.length,requestBytes:Buffer.byteLength(JSON.stringify({instructions:ASSISTANT_INSTRUCTIONS,input:[...history,{role:"user",content:request}]}))});
  histories.set(c.conversationId,[...prior,{role:"user",content:c.query},{role:"assistant",content:result.text}]);errors=0;
  console.log(`${id} ${rows.length}/100 ${mode} input=${result.usage.inputTokens} output=${result.usage.outputTokens} USD=${result.estimatedCostUSD.toFixed(6)}`);
 }catch(e){rows.push({...c,status:"error",mode,historyTurns:history.length,error:e instanceof Error?e.message:"Unknown failure"});errors++;}
 persist();
 if(errors)throw Error("Stopped on an error; inspect accounted usage before any retry");
}
