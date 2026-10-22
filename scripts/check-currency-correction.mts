/** Local-only acceptance checks. Uses disposable identities; never sends email. */
import env from "@next/env";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
env.loadEnvConfig(process.cwd());
assert.equal(process.env.APP_ENV,"development");
const url=new URL(process.env.DATABASE_URL!);
assert.equal(url.hostname,"127.0.0.1");assert.match(url.pathname,/^\/taloox_((integrated|refresh|merged)_\d{8}|int_20261022_(fresh|upgrade))$/);
assert.ok(["localhost","127.0.0.1"].includes(new URL(process.env.WORKFLOW_TEST_URL || "http://localhost:3000").hostname));
const {default:postgres}=await import("postgres");
const q=postgres(process.env.DATABASE_URL!);
const {hashPassword}=await import("better-auth/crypto");
const base=process.env.WORKFLOW_TEST_URL || "http://localhost:3000";
const actors=Array.from({length:2},()=>({personId:randomUUID(),talentId:randomUUID(),projectId:randomUUID(),email:`receipt-qa-${randomUUID()}@example.invalid`,password:randomBytes(20).toString("base64url")}));
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
const today="2026-10-17";
try {
 for(const a of actors){
  await q`insert into person(id,email,email_verified,display_name,locale) values(${a.personId},${a.email},true,'Receipt QA','zh-TW')`;
  await q`insert into auth_account(person_id,account_id,provider_id,password) values(${a.personId},${a.personId},'credential',${await hashPassword(a.password)})`;
  await q`insert into talent(id,name,vertical,time_zone) values(${a.talentId},'Receipt QA','music','America/New_York')`;
  await q`insert into membership(person_id,talent_id,role,status) values(${a.personId},${a.talentId},'owner','active')`;
  await q`insert into project(id,talent_id,title,counterparty,type,stage,quote_currency,quoted_amount,tax_included) values(${a.projectId},${a.talentId},'Receipt workflow QA','Test Client','other','collecting_payment','TWD',55500,true)`;
  const login=await fetch(`${base}/api/auth/sign-in/email`,{method:"POST",headers:{Origin:base,"Content-Type":"application/json"},body:JSON.stringify({email:a.email,password:a.password})});assert.equal(login.status,200);
  cookies.push(login.headers.getSetCookie().map(c=>c.split(";")[0]).join("; "));
 }
 await fetch(`${base}/finance`,{headers:{Cookie:cookies[0]}});
 await fetch(`${base}/projects`,{headers:{Cookie:cookies[0]}});
 const id=actors[0].projectId;
 const input={projectId:id,label:"Currency correction partial QA",direction:"in",installment:"regular",amount:1000,currency:"TWD",taxRate:0,taxIncluded:true,recordedDate:"2026-09-15",dueDate:today,status:"settled",settledDate:today,settledAmount:400,withheldAmount:100,shortfallReason:"withholding",receiptId:randomUUID(),receiptRevision:0,invoiceRef:"",notes:"Synthetic test"};
 const made=await action("savePaymentWithId",[input]);ok(made.id);
 const cost=await action("savePaymentWithId",[{...input,label:"Foreign cost",direction:"out",currency:"EUR",status:"expected",shortfallReason:"",withheldAmount:""}]);ok(cost.id);
async function receiptRows(id:string){return (await q`select * from payment_receipt where payment_id=${id} order by created_at,id`).map(r=>({id:r.id,date:r.received_on instanceof Date?r.received_on.toISOString().slice(0,10):r.received_on,cash:Number(r.cash),withheld:Number(r.withheld),replaces:r.replaces_id||undefined,withdrawn:r.withdrawn,note:r.note||"",recordedAt:r.created_at.toISOString(),recordedBy:r.recorded_by||undefined}));}
 const before=await q`select * from payment where id=${made.id}`;before[0].receipts=await receiptRows(made.id);
 const preview=()=>action("previewProjectCurrency",[{projectId:id,currency:"USD"}]);
 const first=await preview();ok(!first.blocked && first.payments.length===1 && first.costs===1);
 ok(first.payments[0].remaining===500 && first.payments[0].withheld===100);
 ok((await action("previewProjectCurrency",[{projectId:id,currency:"USD"}],cookies[1])).error);
 let correction={projectId:id,currency:"USD",token:first.token,requestId:randomUUID(),reason:"Original currency entered incorrectly",confirmed:true};
 ok(await action("correctProjectCurrency",[correction],cookies[1]));
 ok(await action("correctProjectCurrency",[{...correction,confirmed:false}]));
 ok(await action("correctProjectCurrency",[{...correction,reason:""}]));
 await q`update payment set notes='Concurrent change' where id=${made.id}`;
 ok(await action("correctProjectCurrency",[correction]));
 ok((await q`select quote_currency from project where id=${id}`)[0].quote_currency==="TWD");
 correction={...correction,token:(await preview()).token};
 ok((await action("correctProjectCurrency",[correction]))===null);
 ok((await action("correctProjectCurrency",[correction]))===null);
 const after=(await q`select * from payment where id=${made.id}`)[0];after.receipts=await receiptRows(made.id);const replaced=new Set(after.receipts.map((r:{replaces?:string})=>r.replaces));after.settled_amount=after.receipts.filter((r:{id:string;withdrawn:boolean})=>!r.withdrawn&&!replaced.has(r.id)).reduce((n:number,r:{cash:number})=>n+r.cash,0);
 ok(after.currency==="USD" && Number(after.amount)===1000 && Number(after.settled_amount)===400 && after.status==="expected");
 assert.deepEqual(after.receipts,before[0].receipts);checks++;
 ok((await q`select currency from payment where id=${cost.id}`)[0].currency==="EUR");
 const audits=await q`select * from audit_log where target_id=${id} and action='project.currency_corrected'`;
 ok(audits.length===1 && audits[0].actor_person_id===actors[0].personId && audits[0].details.from==="TWD" && audits[0].details.to==="USD");
 ok(audits[0].details.payments[0].balance.remaining===500 && audits[0].details.payments[0].receipts[0].withheld===100);
 const next=await action("previewProjectCurrency",[{projectId:id,currency:"EUR"}]);ok(next.history.length===1);
 ok((await action("savePaymentWithId",[{...input,id:made.id,status:"expected"}])).error);
 ok((await action("setProjectStage",[id,"closed"]))!==null);
 const {notifications}=await import("../lib/domain/notifications");
 const data={payments:[{id:after.id,projectId:id,direction:"in",label:after.label,amount:Number(after.amount),taxRate:Number(after.tax_rate),taxIncluded:after.tax_included,currency:after.currency,status:after.status,settledAmount:Number(after.settled_amount),receipts:after.receipts,dueDate:today,recordedDate:"2026-09-15",voided:false}],projects:[{id,stage:"collecting_payment",archived:false,currency:"USD"}],calendar:[],talent:{timeZone:"UTC"}} as unknown as import("../lib/types").AppData;
 ok(notifications(data,new Date(`${today}T12:00Z`)).some(n=>n.kind==="receivable" && n.amount===500 && n.currency==="USD"));

 const doc=randomUUID();
 await q`insert into invoice(id,talent_id,payment_id,project_id,number,issue_on,due_on,snapshot,status) values(${doc},${actors[0].talentId},${made.id},${id},'INV-QA','2026-10-18','2026-10-19','{}','draft')`;
 let blocked=await action("previewProjectCurrency",[{projectId:id,currency:"EUR"}]);ok(blocked.blocked==="documents" && blocked.documents[0].id===doc);
 ok(await action("correctProjectCurrency",[{...correction,currency:"EUR",token:blocked.token,requestId:randomUUID()}]));
 for(const state of ["gmail_draft","sent","draft_unknown"]){
  await q`update invoice set status=${state} where id=${doc}`;
  ok((await action("previewProjectCurrency",[{projectId:id,currency:"EUR"}])).blocked==="documents");
 }
 await q`update invoice set status='cancelled' where id=${doc}`;
 await q`update payment set invoice_ref='INV-QA' where id=${made.id}`;
 blocked=await action("previewProjectCurrency",[{projectId:id,currency:"EUR"}]);ok(blocked.blocked===null);
 await q`update payment set invoice_ref='EXTERNAL-QA' where id=${made.id}`;
 blocked=await action("previewProjectCurrency",[{projectId:id,currency:"EUR"}]);ok(blocked.blocked==="documents" && blocked.external.length===1);
 await q`update payment set invoice_ref=null where id=${made.id}`;
 await q`update project set quoted_amount=100.5 where id=${id}`;
 blocked=await action("previewProjectCurrency",[{projectId:id,currency:"JPY"}]);ok(blocked.blocked==="precision");
 await q`update project set quoted_amount=1000 where id=${id}`;
 // An insert racing the correction either invalidates the review or uses the new currency.
 const concurrent=await action("previewProjectCurrency",[{projectId:id,currency:"EUR"}]);
 const results=await Promise.all([
   action("correctProjectCurrency",[{...correction,currency:"EUR",token:concurrent.token,requestId:randomUUID()}]),
   action("savePaymentWithId",[{...input,currency:"USD",status:"expected",label:"Concurrent insert"}])
 ]);
 ok(results.some(r=>r===null || r.id));
 const stored=(await q`select quote_currency from project where id=${id}`)[0].quote_currency;
 ok((await q`select currency from payment where project_id=${id} and direction='in'`).every(p=>p.currency===stored));
 if(process.argv.includes("--keep-ui")){
   await writeFile("/private/tmp/taloox-currency-correction-ui.json",JSON.stringify({actors,projectId:id,paymentId:made.id}),{mode:0o600});keepFixture=true;
 }
 console.log(`PASS: ${checks} currency correction acceptance checks; no email sent.`);
} finally {
 if(!keepFixture)for(const a of actors){await q`delete from invoice where talent_id=${a.talentId}`;await q`delete from talent where id=${a.talentId}`;await q`delete from person where id=${a.personId}`;}
 await q.end();
}
