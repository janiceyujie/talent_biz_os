import test from "node:test";
import assert from "node:assert/strict";
import { costUSD, assertLocalExperiment } from "./local-budget";
import { assistantContext } from "./assistant-context";
import { assistantSamples } from "./assistant-samples";
const usage={inputTokens:1000,outputTokens:100,cachedInputTokens:200,cacheWriteTokens:100,reasoningTokens:50};
test("Luna cost separates cache reads, writes and billed reasoning",()=>{
 assert.ok(Math.abs(costUSD(usage)-0.0001345)<1e-12);
 assert.equal(costUSD({...usage,reasoningTokens:0}),costUSD(usage));
});
test("invalid accounting is rejected instead of silently reporting zero",()=>{
 assert.throws(()=>costUSD({...usage,inputTokens:-1}));
 assert.throws(()=>costUSD({...usage,cachedInputTokens:1001}));
});
test("sample money totals include tax and do not add project quotes",()=>{
 const c=assistantContext(assistantSamples(),undefined,true,"2026-10-07");
 assert.deepEqual(c.money,{received:176400,receivable:186900,paid:12600,payable:18900});
 assert.equal(c.project,null); assert.deepEqual(c.calendar,[]);
});
test("project context contains only its own figures and schedule",()=>{
 const c=assistantContext(assistantSamples(),"brand",true,"2026-10-07");
 assert.deepEqual(c.money,{received:50400,receivable:50400,paid:0,payable:0});
 assert.equal(c.calendar.length,1); assert.ok(!JSON.stringify(c).includes("City Brand Film"));
 assert.throws(()=>assistantContext(assistantSamples(),"another-account-project",false,"2026-10-07"));
});
test("closed or voided payments cannot inflate the assistant totals",()=>{
 const d=assistantSamples();d.payments[0].voided=true;d.payments[1].status="cancelled";
 assert.equal(assistantContext(d,"brand",true,"2026-10-07").money.received,0);
 assert.equal(assistantContext(d,"brand",true,"2026-10-07").money.receivable,0);
});
test("paid experiment fails closed without opt-in or with a remote database",()=>{
 const prev={...process.env};
 try {
 Object.assign(process.env,{NODE_ENV:"development"});process.env.AI_LOCAL_EXPERIMENT="1";process.env.DATABASE_URL="postgresql://x:x@db.example.com/test";
 assert.throws(()=>assertLocalExperiment());
 process.env.DATABASE_URL="postgresql://x:x@127.0.0.1/test";assert.doesNotThrow(()=>assertLocalExperiment());
 Object.assign(process.env,{NODE_ENV:"production"});assert.throws(()=>assertLocalExperiment());
 }finally{process.env=prev;}
});

test("budget reserves before calls, serializes processes and retains uncertain charges",async()=>{
 const {mkdtemp,readFile,rm}=await import("node:fs/promises");
 const {tmpdir}=await import("node:os");const {join}=await import("node:path");
 const {withLocalBudget}=await import("./local-budget");
 const cwd=process.cwd(), previous={...process.env};const dir=await mkdtemp(join(tmpdir(),"taloox-budget-test-"));
 process.chdir(dir);Object.assign(process.env,{NODE_ENV:"development"});process.env.AI_LOCAL_EXPERIMENT="1";process.env.DATABASE_URL="postgresql://x:x@127.0.0.1/test";
 try {
 process.env.AI_LOCAL_BUDGET_USD="0.000001";let called=false;
 await assert.rejects(withLocalBudget(100,100,async()=>{called=true;return {usage,model:"gpt-6-luna",latencyMs:1,status:"completed"};}));assert.equal(called,false);
 process.env.AI_LOCAL_BUDGET_USD="5";
 await assert.rejects(withLocalBudget(100,100,async()=>{
   const entries=JSON.parse(await readFile(".ai-local/budget.json","utf8"));assert.equal(entries[0].status,"reserved");
   await assert.rejects(withLocalBudget(100,100,async()=>({usage,model:"gpt-6-luna",latencyMs:1,status:"completed"})));
   throw Error("Unknown network outcome");
 }));
 const entries=JSON.parse(await readFile(".ai-local/budget.json","utf8"));assert.ok(entries[0].chargedUSD>0);assert.equal(entries[0].status,"reserved");
 const result=await withLocalBudget(100,100,async()=>({usage,model:"gpt-6-luna",latencyMs:1,status:"completed"}));assert.equal(result.estimatedCostUSD,costUSD(usage));
 }finally{process.chdir(cwd);process.env=previous;await rm(dir,{recursive:true,force:true});}
});

test("actual settled cash is never taxed twice",()=>{
 const d=assistantSamples();d.payments[0].settledAmount=49000;
 assert.equal(assistantContext(d,"brand",true,"2026-10-07").money.received,49000);
});
