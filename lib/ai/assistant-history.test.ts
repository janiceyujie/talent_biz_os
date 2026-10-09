import { createHash } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { saveAssistantRecord, readAssistantArchive, readAssistantEvaluations } from "./assistant-history";
import { usageTotals, type AssistantRecord } from "./assistant-records";

test("usage totals include reasoning once and preserve fractional USD", () => {
  const usage = { inputTokens: 100, outputTokens: 20, reasoningTokens: 10, cachedInputTokens: 0, cacheWriteTokens: 0 };
  assert.deepEqual(usageTotals([{usage,estimatedCostUSD:0.00002},{usage,estimatedCostUSD:0.00002}]), { input:200, output:40, total:240, cost:0.00004 });
});
test("saved exchanges survive a fresh read and are isolated by person and workspace", async () => {
  const cwd=process.cwd(), previous={...process.env};
  const dir=await mkdtemp(path.join(tmpdir(),"taloox-history-"));
  try {
    process.chdir(dir);
    Object.assign(process.env,{NODE_ENV:"development",AI_LOCAL_EXPERIMENT:"1",DATABASE_URL:"postgresql://local:local@127.0.0.1/test"});
    const record:AssistantRecord={id:randomUUID(),conversationId:randomUUID(),at:new Date().toISOString(),sample:true,query:"Sample question",text:"Sample answer",model:"gpt-6-luna",usage:{inputTokens:100,outputTokens:20,reasoningTokens:0,cachedInputTokens:0,cacheWriteTokens:0},estimatedCostUSD:0.00002};
    await saveAssistantRecord("person-a","workspace-a",record);
    assert.deepEqual((await readAssistantArchive("person-a","workspace-a")).records,[record]);
    assert.equal((await readAssistantArchive("person-b","workspace-a")).records.length,0);
    assert.equal((await readAssistantArchive("person-a","workspace-b")).records.length,0);
    await assert.rejects(saveAssistantRecord("person-a","workspace-a",{...record,id:"../../escape"}));
    process.env.DATABASE_URL="postgresql://x:x@remote.example/test";
    await assert.rejects(readAssistantArchive("person-a","workspace-a"));
  } finally {
    process.chdir(cwd);for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);
    await rm(dir,{recursive:true,force:true});
  }
});

test("history pages never read internal reports and cursor remains scoped", async () => {
 const cwd=process.cwd(), previous={...process.env};
 const dir=await mkdtemp(path.join(tmpdir(),"taloox-pages-"));
 try {
  process.chdir(dir);
  Object.assign(process.env,{NODE_ENV:"development",AI_LOCAL_EXPERIMENT:"1",DATABASE_URL:"postgresql://local:local@127.0.0.1/test"});
  const owner=createHash("sha256").update(JSON.stringify(["person-a","workspace-a"])).digest("hex");
  const recordDir=path.resolve(".ai-local","conversations",owner);
  const ids:string[]=[];
  for(let i=0;i<125;i++) {
   const id=randomUUID();ids.push(id);
   await saveAssistantRecord("person-a","workspace-a",{id,conversationId:randomUUID(),at:new Date(1700000000000+i*1000).toISOString(),sample:true,query:`Question ${i}`,text:"Answer",model:"local",usage:{inputTokens:0,outputTokens:0,reasoningTokens:0,cachedInputTokens:0,cacheWriteTokens:0},estimatedCostUSD:0});
   await utimes(path.join(recordDir,`${id}.json`),1700000000+i,1700000000+i);
  }
  await mkdir("evals/results/assistant",{recursive:true});
  await writeFile("evals/results/assistant/luna-100.json","invalid report data must never be read by chat");
  await mkdir(".ai-local",{recursive:true});
  await writeFile(".ai-local/budget.json","invalid internal ledger must not affect chat history");
  const first=await readAssistantArchive("person-a","workspace-a");
  assert.equal(first.records.length,50);assert.equal(first.truncated,true);
  assert.equal(first.records.at(-1)!.query,"Question 124");
  assert.equal("runs" in first,false);assert.equal("budgetUsedUSD" in first,false);
  // An older damaged transcript is not opened by the first page.
  await writeFile(path.join(recordDir,`${ids[0]}.json`),"broken older transcript");
  await utimes(path.join(recordDir,`${ids[0]}.json`),1700000000,1700000000);
  assert.equal((await readAssistantArchive("person-a","workspace-a")).records.length,50);
  const second=await readAssistantArchive("person-a","workspace-a",first.nextCursor!);
  assert.equal(second.records.length,50);
  assert.equal(second.records.at(-1)!.query,"Question 74");
  assert.equal(new Set([...first.records,...second.records].map(r=>r.id)).size,100);
  await writeFile(path.join(recordDir,`${ids[0]}.json`),JSON.stringify({...first.records[0],id:ids[0],at:new Date(1700000000000).toISOString(),query:"Question 0"}));
  await utimes(path.join(recordDir,`${ids[0]}.json`),1700000000,1700000000);
  const last=await readAssistantArchive("person-a","workspace-a",second.nextCursor!);
  assert.equal(last.records.length,25);assert.equal(last.truncated,false);assert.equal(last.nextCursor,null);
  assert.equal(new Set([...first.records,...second.records,...last.records].map(r=>r.id)).size,125);
  await assert.rejects(readAssistantArchive("person-b","workspace-a",first.nextCursor!));
  await assert.rejects(readAssistantArchive("person-a","workspace-a","../../escape"));
  delete process.env.AI_INTERNAL_REPORTS;
  await assert.rejects(readAssistantEvaluations());
  process.env.AI_INTERNAL_REPORTS="1";
  await writeFile("evals/results/assistant/luna-100.json",JSON.stringify({model:"test",updatedAt:"2026-10-09",rows:[]}));
  assert.equal((await readAssistantEvaluations()).length,1);
  Object.assign(process.env,{NODE_ENV:"production"});
  await assert.rejects(readAssistantEvaluations());
 } finally {
  process.chdir(cwd);for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);
  await rm(dir,{recursive:true,force:true});
 }
});
