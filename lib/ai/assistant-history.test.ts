import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { saveAssistantRecord, readAssistantArchive } from "./assistant-history";
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
