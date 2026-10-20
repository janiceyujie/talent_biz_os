/** Local-only acceptance checks. Uses disposable identities; never sends email. */
import env from "@next/env";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
env.loadEnvConfig(process.cwd());
assert.equal(process.env.APP_ENV,"development");
const url=new URL(process.env.DATABASE_URL!);
assert.equal(url.hostname,"127.0.0.1");assert.match(url.pathname,/^\/taloox_(integrated|refresh|merged)_\d{8}$/);
assert.ok(["localhost","127.0.0.1"].includes(new URL(process.env.WORKFLOW_TEST_URL || "http://localhost:3000").hostname));
const {default:postgres}=await import("postgres");
const q=postgres(process.env.DATABASE_URL!);
const {hashPassword}=await import("better-auth/crypto");
const {paymentBalance}=await import("../lib/domain/payment-receipts");
const base=process.env.WORKFLOW_TEST_URL || "http://localhost:3000";
const actors=Array.from({length:2},()=>({personId:randomUUID(),talentId:randomUUID(),projectId:randomUUID(),email:`integration-qa-${randomUUID()}@example.invalid`,password:randomBytes(20).toString("base64url")}));
const cookies:string[]=[];
let checks=0, keepFixture=false;
const ok=(value:unknown)=>{assert.ok(value);checks++;};
async function action(name:string,args:unknown[],cookie=cookies[0]) {
 const manifest=JSON.parse(await readFile(".next/dev/server/server-reference-manifest.json","utf8"));
 const entry=Object.entries(manifest.node).find(([,v])=>(v as {exportedName:string}).exportedName===name);assert.ok(entry,`Action missing: ${name}`);
 const response=await fetch(`${base}/finance`,{method:"POST",headers:{Cookie:cookie,Origin:base,"Content-Type":"text/plain;charset=UTF-8","Next-Action":entry[0]},body:JSON.stringify(args)});
 const body=await response.text();assert.equal(response.status,200);
 const root=body.split("\n").find(line=>line.startsWith("0:"));assert.ok(root);
 const id=JSON.parse(root.slice(2)).a?.replace("$@","");
 const result=body.split("\n").findLast(line=>line.startsWith(`${id}:`) && /^(null|"|\[|\{)/.test(line.slice(String(id).length+1)));
 assert.ok(result,`Action result missing: ${name}`);return JSON.parse(result.slice(String(id).length+1));
}
const today=new Date().toISOString().slice(0,10);
try {
 for(const a of actors){
  await q`insert into person(id,email,email_verified,display_name,locale) values(${a.personId},${a.email},true,'Integration QA','zh-TW')`;
  await q`insert into auth_account(person_id,account_id,provider_id,password) values(${a.personId},${a.personId},'credential',${await hashPassword(a.password)})`;
  await q`insert into talent(id,name,vertical,time_zone) values(${a.talentId},'Integration QA','music','America/New_York')`;
  await q`insert into membership(person_id,talent_id,role,status) values(${a.personId},${a.talentId},'owner','active')`;
  await q`insert into project(id,talent_id,title,counterparty,type,stage,quote_currency,quoted_amount,tax_included) values(${a.projectId},${a.talentId},'Integration workflow QA','Test Client','other','collecting_payment','TWD',55500,true)`;
  const login=await fetch(`${base}/api/auth/sign-in/email`,{method:"POST",headers:{Origin:base,"Content-Type":"application/json"},body:JSON.stringify({email:a.email,password:a.password})});assert.equal(login.status,200);
  cookies.push(login.headers.getSetCookie().map(c=>c.split(";")[0]).join("; "));
 }
 await fetch(`${base}/finance`,{headers:{Cookie:cookies[0]}});
 await fetch(`${base}/projects`,{headers:{Cookie:cookies[0]}});

 const [a]=actors;
 const mark=async(cookie=cookies[0])=>{const response=await fetch(`${base}/api/changes`,{headers:{Cookie:cookie}});ok(response.status===200);return (await response.json()).mark;};
 ok((await fetch(`${base}/api/changes`)).status===401);
 const first=await mark(), other=await mark(cookies[1]);
 await q`update project set stage='negotiating',updated_at=now() where id=${a.projectId}`;
 ok(await mark()!==first);ok(await mark(cookies[1])===other);
 const input={projectId:a.projectId,label:"Unsigned plan",direction:"in",installment:"regular",amount:1000,currency:"TWD",taxRate:0,taxIncluded:true,recordedDate:today,dueDate:today,status:"expected",settledDate:"",settledAmount:"",invoiceRef:"",notes:"Synthetic integration test"};
 const planned=await action("savePaymentWithId",[input]);ok(planned.id);
 const partial=await action("savePaymentWithId",[{...input,label:"Partial receipt",status:"settled",settledDate:today,settledAmount:400,withheldAmount:100,shortfallReason:"withholding",receiptId:randomUUID(),receiptRevision:0}]);ok(partial.id);
 const cal=randomUUID(),deleted=randomUUID(),task=randomUUID();
 await q`insert into calendar_event(id,talent_id,project_id,title,kind,start_date,start_time,time_zone) values(${cal},${a.talentId},${a.projectId},'Integration future rehearsal','meeting','2099-01-01','15:00','America/New_York')`;
 await q`insert into calendar_event(id,talent_id,title,kind,start_date,time_zone,deleted_in_google_at) values(${deleted},${a.talentId},'Hidden Google deletion fixture','meeting',${today},'UTC',now())`;
 await q`insert into todo(id,talent_id,project_id,title,type,status,due_date,time_zone) values(${task},${a.talentId},${a.projectId},'Integration deliverable','deliverable','open','2099-01-01','UTC')`;
 const items=await action("openDealItems",[a.projectId]);ok(items.payments.length===1&&items.payments[0].amount===1000);ok(items.todos.length===1&&items.events.length===1);
 ok((await action("openDealItems",[a.projectId],cookies[1]))===null);
 ok((await action("setProjectStage",[a.projectId,"cancelled",{cancelOpen:true}],cookies[1]))!==null);
 ok((await action("setProjectStage",[a.projectId,"cancelled",{cancelOpen:true}]))===null);
 const [p]=await q`select status,receipts,settled_amount from payment where id=${partial.id}`;
 ok(p.status==='expected'&&p.receipts.length===1&&p.receipts[0].withheld===100&&Number(p.settled_amount)===400);
 ok((await q`select status from payment where id=${planned.id}`)[0].status==='cancelled');
 ok((await q`select status from todo where id=${task}`)[0].status==='dismissed');
 ok((await q`select status from calendar_event where id=${cal}`)[0].status==='cancelled');
 ok((await action("savePaymentWithId",[{...input,label:"Rejected after cancellation"}])).error);
 const calendar=await fetch(`${base}/calendar`,{headers:{Cookie:cookies[0]}});const html=await calendar.text();ok(calendar.status===200);ok(!html.includes('Hidden Google deletion fixture'));
 await q`update project set stage='collecting_payment' where id=${a.projectId}`;
 ok((await action("setProjectStage",[a.projectId,"closed"]))!==null);
 const [saved]=await q`select * from payment where id=${partial.id}`;
 ok(paymentBalance({amount:Number(saved.amount),currency:saved.currency,taxRate:Number(saved.tax_rate),taxIncluded:saved.tax_included,status:saved.status,settledAmount:Number(saved.settled_amount),receipts:saved.receipts}).remaining===500);
 // Future UI checks use synthetic records only and never connect Google.
 if(process.argv.includes('--keep-ui')){
   await q`update calendar_event set status='confirmed',start_date=${today} where id=${cal}`;
   await writeFile('/tmp/taloox-integration-qa.json',JSON.stringify({actors}),{mode:0o600});keepFixture=true;
 }
 console.log(`PASS: ${checks} integration checks; cancellation retains partial receipts and withholding; no Google or mail API called.`);
} finally {
 if(!keepFixture)for(const a of actors){await q`delete from invoice where talent_id=${a.talentId}`;await q`delete from talent where id=${a.talentId}`;await q`delete from person where id=${a.personId}`;}
 await q.end();
}
