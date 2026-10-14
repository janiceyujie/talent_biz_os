import test from "node:test";
import assert from "node:assert/strict";
import type { AppData } from "@/lib/types";
import { workspaceSamples } from "./workspace-samples";
import { assistantContext } from "./assistant-context";
import { assistantSamples } from "./assistant-samples";

test("preview replaces business collections without changing the real workspace",()=>{
 const real={talent:{id:"real",name:"Real",timeZone:"UTC"},person:{email:"test@example.com"},projects:[{id:"real-project"}],inbox:[{id:"real-mail"}],organizations:[{id:"real-organization"}],distinctOrganizations:["real-pair"],projectPeople:[{projectId:"real-project",contactId:"real-contact"}],payments:[],preferences:{"overview.layout":null}} as unknown as AppData;
 const before=JSON.stringify(real);const sample=workspaceSamples(real);
 assert.equal(JSON.stringify(real),before);
 assert.equal(sample.projects.length,5);assert.equal(sample.payments.length,8);assert.equal(sample.calendar.length,2);assert.equal(sample.inbox.length,6);
 assert.ok(!JSON.stringify(sample).includes("real-project"));assert.ok(!JSON.stringify(sample).includes("real-mail"));
 assert.deepEqual(sample.person,real.person);
 assert.deepEqual(sample.organizations,[]);assert.deepEqual(sample.distinctOrganizations,[]);assert.deepEqual(sample.projectPeople,[]);
 assert.equal(Object.keys(sample.previewProjectDetails ?? {}).length,5);
 const ids=new Set(sample.projects.map(p=>p.id));
 for(const m of sample.inbox)assert.ok(!m.projectId||ids.has(m.projectId));
 for(const p of sample.payments)assert.ok(!p.projectId||ids.has(p.projectId));
 assert.deepEqual(assistantContext(sample,undefined,true,"2026-10-07").money,assistantContext(assistantSamples(),undefined,true,"2026-10-07").money);
 assert.ok(sample.inbox.every(m=>m.analysis?.modelVersion==="synthetic-fixture"&&m.status!=="pending"));
 assert.ok(sample.inbox.some(m=>m.analysis?.intent==="other"));
});
