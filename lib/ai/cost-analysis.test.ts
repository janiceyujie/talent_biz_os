import test from "node:test";
import assert from "node:assert/strict";
import {summarizeCosts,projectCosts,evaluationCSV,PROPOSED_LIMITS,type CostRow} from "./cost-analysis";
const usage={inputTokens:100,outputTokens:20,cachedInputTokens:0,cacheWriteTokens:0,reasoningTokens:10};
const rows:CostRow[]=[{id:"a",category:"test",query:"hello",status:"completed",mode:"ai",usage,estimatedCostUSD:.00002},{id:"b",category:"test",query:"local",status:"completed",mode:"local",usage:{...usage,inputTokens:0,outputTokens:0,reasoningTokens:0},estimatedCostUSD:0},{id:"c",category:"test",query:"failed",status:"error"}];
test("full AI allowance excludes free local replies and failed rows",()=>{
 assert.equal(summarizeCosts(rows).mean,.00001);assert.equal(summarizeCosts(rows,true).mean,.00002);
 assert.equal(summarizeCosts(rows).failed,1);assert.equal(summarizeCosts(rows).total,120);
 const p=projectCosts(rows,30);assert.equal(p.count,900);assert.equal(p.tokens,108000);assert.ok(Math.abs(p.mean-.018)<1e-12);
 assert.throws(()=>projectCosts(rows,-1));assert.equal(projectCosts([],30).mean,0);
});
test("nearest-rank p95 and observed range stay distinct",()=>{
 const many=Array.from({length:20},(_,i)=>({...rows[0],id:String(i),estimatedCostUSD:i/100}));
 assert.equal(summarizeCosts(many).p95,.18);assert.equal(summarizeCosts(many).max,.19);
 assert.equal(PROPOSED_LIMITS.worstCostUSD,.0015);
});
test("CSV retains quoted multiline answers and neutralizes formula cells",()=>{
 const csv=evaluationCSV([{...rows[0],query:'=HYPERLINK("bad")',text:'first\n"second"'}]);
 assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));assert.ok(csv.includes('"first\n""second"""'));assert.ok(csv.includes('Reasoning tokens (included in output)'));
});
