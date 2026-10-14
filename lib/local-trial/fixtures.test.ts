import {test} from "node:test";
import assert from "node:assert/strict";
import {trialFixtures,trialId} from "./fixtures";
import {isSigned} from "../domain/phases";
import {parseDateInput} from "../calendar/input";
import {assertLocalTemplateStore} from "../templates/local-store";
const talent="00000000-0000-4000-8000-000000000001",person="00000000-0000-4000-8000-000000000002";
test("trial identities are repeatable and isolated by workspace and period",()=>{
 assert.equal(trialId(talent,"2026-10","project"),trialId(talent,"2026-10","project"));
 assert.notEqual(trialId(talent,"2026-10","project"),trialId(person,"2026-10","project"));
 assert.notEqual(trialId(talent,"2026-10","project"),trialId(talent,"2026-11","project"));
 assert.throws(()=>trialFixtures(talent,person,"2026-13","Asia/Taipei"));
});
test("trial money and scheduled execution reference signed projects and keep currencies separate",()=>{
 const f=trialFixtures(talent,person,"2026-10","Asia/Taipei");
 const projects=new Map(f.projects.map(p=>[p.id,p]));
 for(const p of f.payments){const project=projects.get(p.projectId!);assert.ok(project&&isSigned(project.stage!));assert.equal(p.currency,project.quoteCurrency);assert.equal(p.status==="settled",!!p.settledOn);assert.equal(p.settledAmount!==null&&p.settledAmount!==undefined,p.status==="settled");}
 for(const event of f.events){if(event.projectId)assert.ok(isSigned(projects.get(event.projectId)!.stage!));assert.ok(parseDateInput(event.startDate));assert.ok(event.startDate>="2026-10-01"&&event.startDate<="2026-11-30");assert.equal(!!event.endDate,!!event.endTime);assert.equal(!!event.endDate,!!event.endTimeZone);}
 assert.deepEqual([...new Set(f.payments.map(p=>p.currency))].sort(),["EUR","GBP","HKD","JPY","TWD","USD"].sort());
 assert.ok(f.projects.every(p=>p.title.startsWith("範例｜")));
 assert.ok(f.contacts.every(c=>!c.email||c.email.endsWith("@example.invalid")));
});
test("trial analyses are labeled synthetic and cannot pretend to be Gmail connections or API usage",()=>{
 const f=trialFixtures(talent,person,"2026-12","Asia/Taipei");assert.equal(f.secondMonth,"2027-01");
 assert.ok(f.messages.every(m=>m.channel==="forwarded_email"&&m.status!=="pending"));
 assert.ok(f.analyses.every(a=>a.modelVersion==="synthetic-fixture:no-api-call"));
 assert.ok(f.contracts.some(c=>c.status==="changes_requested"));
 assert.throws(()=>assertLocalTemplateStore("postgres://local:local@remote.example/db","http://localhost:54321/storage/v1/s3"));
 assert.throws(()=>assertLocalTemplateStore("postgres://local:local@localhost:54322/postgres","https://remote.example/storage"));
});
