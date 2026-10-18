/** Local-only acceptance checks. Uses disposable identities; never sends email. */
import env from "@next/env";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
env.loadEnvConfig(process.cwd());
assert.equal(process.env.APP_ENV,"development");
const url=new URL(process.env.DATABASE_URL!);
assert.equal(url.hostname,"127.0.0.1");assert.match(url.pathname,/^\/taloox_(integrated|refresh)_\d{8}$/);
assert.ok(["localhost","127.0.0.1"].includes(new URL(process.env.WORKFLOW_TEST_URL || "http://localhost:3000").hostname));
const {default:postgres}=await import("postgres");
const q=postgres(process.env.DATABASE_URL!);
const {hashPassword}=await import("better-auth/crypto");
const {paymentBalance}=await import("../lib/domain/payment-receipts");
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
 const input={projectId:actors[0].projectId,label:"Unpaid balance QA",direction:"in",installment:"regular",amount:55500,currency:"TWD",taxRate:5,taxIncluded:true,recordedDate:"2026-09-15",dueDate:today,status:"expected",settledDate:"",settledAmount:"",invoiceRef:"",notes:"Synthetic acceptance test"};
 const created=await action("savePaymentWithId",[input]);ok(created.id);
 const receipt={...input,id:created.id,status:"settled",settledDate:"2026-09-30",settledAmount:55000,receiptId:randomUUID(),receiptRevision:0,shortfallReason:"unpaid"};
 ok((await action("savePaymentWithId",[{...receipt,shortfallReason:""}])).error);
 ok((await action("savePaymentWithId",[receipt],cookies[1])).error);
 ok((await action("savePaymentWithId",[receipt])).id===created.id);
 const load=async(id:string)=>{const [p]=await q`select * from payment where id=${id}`;return p;};
 let p=await load(created.id);ok(p.status==="expected" && Number(p.settled_amount)===55000 && p.receipts.length===1);
 ok((await action("setProjectStage",[actors[0].projectId,"closed"]))!==null);
 ok((await action("savePaymentWithId",[receipt])).id===created.id);
 p=await load(created.id);ok(p.receipts.length===1);
 ok((await action("savePaymentWithId",[{...receipt,receiptId:randomUUID(),settledAmount:500}])).error);
 ok((await action("savePaymentWithId",[{...input,id:created.id,label:"Metadata edit preserves receipts"}])).id);
 p=await load(created.id);ok(p.receipts.length===1 && Number(p.settled_amount)===55000);
 ok((await action("savePaymentWithId",[{...input,id:created.id,amount:56000}])).error);
 ok((await action("savePaymentWithId",[{...receipt,receiptId:randomUUID(),receiptRevision:1,settledDate:today,settledAmount:500}])).id);
 p=await load(created.id);ok(p.status==="settled" && p.receipts.length===2 && Number(p.settled_amount)===55500 && p.receipts[0].date==="2026-09-30");
 ok((await action("setProjectStage",[actors[0].projectId,"closed"]))===null);
 await action("setProjectStage",[actors[0].projectId,"collecting_payment"]);
 const withheld=await action("savePaymentWithId",[{...input,label:"Withholding QA",status:"settled",settledDate:today,settledAmount:55000,shortfallReason:"withholding",withheldAmount:500,receiptId:randomUUID(),receiptRevision:0}]);ok(withheld.id);
 p=await load(withheld.id);ok(p.status==="settled" && Number(p.settled_amount)===55000 && p.receipts[0].withheld===500);
 assert.deepEqual(paymentBalance({amount:Number(p.amount),taxRate:Number(p.tax_rate),taxIncluded:p.tax_included,currency:p.currency,status:p.status,settledAmount:Number(p.settled_amount),receipts:p.receipts}),{cash:55000,withheld:500,remaining:0});checks++;
 const mixedInput={...input,label:"Mixed withholding QA",status:"settled",settledDate:today,settledAmount:50000,shortfallReason:"withholding",withheldAmount:500,receiptId:randomUUID(),receiptRevision:0};
 for(const withheldAmount of ["",0,-1,5501,500.001])ok((await action("savePaymentWithId",[{...mixedInput,withheldAmount}])).error);
 ok((await action("savePaymentWithId",[{...mixedInput,direction:"out"}])).error);
 ok((await action("savePaymentWithId",[{...mixedInput,shortfallReason:"unpaid"}])).error);
 const mixed=await action("savePaymentWithId",[mixedInput]);ok(mixed.id);
 p=await load(mixed.id);ok(p.status==="expected" && Number(p.settled_amount)===50000 && p.receipts[0].withheld===500);
 ok((await action("setProjectStage",[actors[0].projectId,"closed"]))!==null);
 ok((await action("savePaymentWithId",[{...mixedInput,id:mixed.id}])).id);
 ok((await action("savePaymentWithId",[{...mixedInput,id:mixed.id,withheldAmount:5500}])).error);
 p=await load(mixed.id);ok(p.receipts.length===1 && p.receipts[0].withheld===500);
 const finalReceipt={...mixedInput,id:mixed.id,receiptId:randomUUID(),receiptRevision:1,settledAmount:5000,shortfallReason:"unpaid",withheldAmount:""};
 ok((await action("savePaymentWithId",[finalReceipt])).id);
 p=await load(mixed.id);ok(p.status==="settled" && Number(p.settled_amount)===55000 && p.receipts.length===2 && p.receipts[1].withheld===0 && p.receipts[0].withheld===500);
 ok((await action("savePaymentWithId",[{...mixedInput,id:mixed.id}])).id);
 p=await load(mixed.id);ok(p.receipts.length===2 && Number(p.settled_amount)===55000);
 // Simulate an already issued invoice in the local database; no draft or send operation is invoked.
 const usd={...input,projectId:"",currency:"USD",taxRate:0,amount:100,label:"Invoice receipt QA"};
 for(const reason of ["unpaid","withholding","mixed"]){
  const pay=await action("savePaymentWithId",[usd]);ok(pay.id);
  const invoiceId=randomUUID();
  const snapshot={documentLanguage:"en",sellerName:"Synthetic Seller",sellerAddress:"Test",sellerEmail:actors[0].email,buyerName:"Synthetic Buyer",buyerAddress:"Test",recipient:"nobody@example.invalid",description:"Test",paymentInstructions:"Test",taxNote:"Test",subject:"Test",body:"Test",currency:"USD",subtotal:100,tax:0,total:100};
  await q`insert into invoice(id,talent_id,payment_id,number,issue_on,due_on,snapshot,status) values(${invoiceId},${actors[0].talentId},${pay.id},${`QA-${invoiceId}`},'2026-09-01',${today},${q.json(snapshot)},'sent')`;
  const partial=await action("savePaymentWithId",[{...usd,id:pay.id,status:"settled",settledDate:"2026-09-30",settledAmount:90,shortfallReason:reason==="mixed"?"withholding":reason,withheldAmount:reason==="withholding"?10:reason==="mixed"?2:"",receiptId:randomUUID(),receiptRevision:0}]);ok(partial.id);
  const readInvoice=async()=>{const res=await fetch(`${base}/api/invoices/${invoiceId}`,{headers:{Cookie:cookies[0]}});assert.equal(res.status,200);return res.json();};
  const detail=await readInvoice();ok(detail.received===90 && detail.remaining===(reason==="unpaid"?10:reason==="mixed"?8:0) && detail.withheld===(reason==="withholding"?10:reason==="mixed"?2:0) && detail.paid===(reason==="withholding"));
  if(reason!=="withholding"){
   const res=await fetch(`${base}/api/invoices/${invoiceId}`,{method:"POST",headers:{Origin:base,Cookie:cookies[0],"Content-Type":"application/json"},body:JSON.stringify({op:"settle",revision:1,confirmed:true,settledOn:today})});ok(res.status===200);
   const paid=await readInvoice();ok(paid.received===(reason==="mixed"?98:100) && paid.remaining===0 && paid.paid);
   const stored=await load(pay.id);ok(stored.receipts.length===2 && stored.receipts[0].cash===90 && stored.receipts[1].cash===(reason==="mixed"?8:10) && stored.receipts[1].withheld===0);
  }
 }
 // Actor names are restricted to receipts in the authenticated workspace.
 const storedAudit=await load(mixed.id);
 ok(storedAudit.receipts[0].recordedBy===actors[0].personId && !!storedAudit.receipts[0].recordedAt);
 const receiptActors=await action("getPaymentReceiptActors",[mixed.id]);
 ok(receiptActors[actors[0].personId]==="Receipt QA" && Object.keys(receiptActors).length===1);
 ok((await action("getPaymentReceiptActors",[mixed.id],cookies[1]))===null);
 // Correct and withdraw persisted receipts, preserving all original entries.
 const projectState=async()=>{const [row]=await q`select stage,archived_at from project where id=${actors[0].projectId}`;return row;};
 const reopenCount=async()=>{const [row]=await q`select count(*)::int as count from audit_log where target_id=${actors[0].projectId} and action='project.stage_changed' and details->>'reason'='receipt_amended'`;return row.count;};
 ok((await action("setProjectStage",[actors[0].projectId,"closed"]))===null);
 // A cash/withholding reallocation with no debt must leave the project completed.
 const wh=await load(withheld.id);
 const reallocate={paymentId:wh.id,targetId:wh.receipts[0].id,requestId:randomUUID(),revision:1,operation:"correct",date:today,cash:54900,withheld:600,note:"Correct split without changing settled total"};
 ok((await action("amendPaymentReceipt",[reallocate]))===null);
 ok((await projectState()).stage==="closed" && await reopenCount()===0);
 await action("archiveProject",[actors[0].projectId,true]);

 const amendedInput={paymentId:mixed.id,targetId:mixedInput.receiptId,requestId:randomUUID(),revision:2,operation:"correct",date:today,cash:45000,withheld:500,note:"Correct overstated cash"};
 ok((await action("amendPaymentReceipt",[amendedInput],cookies[1]))!==null);
 ok((await action("amendPaymentReceipt",[{...amendedInput,revision:1}]))!==null);
 ok((await action("amendPaymentReceipt",[{...amendedInput,withheld:6000}]))!==null);
 const reminderId=`payment:${mixed.id}:${today}`;
 await q`insert into notification_state(person_id,notification_id,snoozed_until) values(${actors[0].personId},${reminderId},now()+interval '2 hours')`;
 ok((await action("amendPaymentReceipt",[amendedInput]))===null);
 ok((await projectState()).stage==="collecting_payment" && (await projectState()).archived_at===null && await reopenCount()===1);
 ok((await action("setProjectStage",[actors[0].projectId,"closed"]))!==null);
 p=await load(mixed.id);ok(p.status==="expected" && Number(p.settled_amount)===50000 && p.receipts.length===3 && p.receipts[0].cash===50000 && p.receipts[2].recordedBy===actors[0].personId);
 ok((await q`select * from notification_state where person_id=${actors[0].personId} and notification_id=${reminderId}`).length===0);
 ok((await action("amendPaymentReceipt",[amendedInput]))===null);
 ok(await reopenCount()===1);
 ok((await action("amendPaymentReceipt",[{...amendedInput,cash:44000}]))!==null);
 ok((await action("amendPaymentReceipt",[{...amendedInput,requestId:randomUUID(),revision:3}]))!==null);
 const withdrawnInput={...amendedInput,targetId:amendedInput.requestId,requestId:randomUUID(),revision:3,operation:"withdraw",cash:0,withheld:0,note:"Duplicate receipt entered by mistake"};
 ok((await action("amendPaymentReceipt",[withdrawnInput]))===null);
 p=await load(mixed.id);ok(p.status==="expected" && Number(p.settled_amount)===5000 && p.receipts.length===4 && p.receipts[3].withdrawn);
 // Restore the outstanding amount for the interactive fixture to have only one reminder.
 ok((await action("savePaymentWithId",[{...input,id:mixed.id,status:"settled",settledDate:today,settledAmount:50500,shortfallReason:"unpaid",receiptId:randomUUID(),receiptRevision:4}])).id);
 ok((await projectState()).stage==="collecting_payment");
 ok((await action("setProjectStage",[actors[0].projectId,"closed"]))===null);
 // Withdrawal from a completed project also reopens settlement, even under a concurrent close request.
 const withdrawClosed={...reallocate,targetId:reallocate.requestId,requestId:randomUUID(),revision:2,operation:"withdraw",cash:0,withheld:0,note:"Withdraw receipt after completion"};
 const concurrent=await Promise.all([action("setProjectStage",[actors[0].projectId,"closed"]),action("amendPaymentReceipt",[withdrawClosed])]);
 ok(concurrent[1]===null);
 ok((await projectState()).stage==="collecting_payment" && await reopenCount()===2);
 ok((await action("setProjectStage",[actors[0].projectId,"closed"]))!==null);
 // Do not overwrite an intentional execution stage when correcting an active project's receipt.
 await action("setProjectStage",[actors[0].projectId,"in_progress"]);
 const mixedCurrent=await load(mixed.id);
 const latest=mixedCurrent.receipts.at(-1);
 ok((await action("amendPaymentReceipt",[{...reallocate,paymentId:mixed.id,targetId:latest.id,requestId:randomUUID(),revision:mixedCurrent.receipts.length,cash:50000,withheld:0}]))===null);
 ok((await projectState()).stage==="in_progress" && await reopenCount()===2);
 // Prepare an independently completed, single-receipt project for interactive QA.
 const uiProjectId=randomUUID();
 await q`insert into project(id,talent_id,title,counterparty,type,stage,quote_currency,quoted_amount,tax_included) values(${uiProjectId},${actors[0].talentId},'Reopen settlement QA','Test Client','other','collecting_payment','TWD',55500,true)`;
 const uiSettled=await action("savePaymentWithId",[{...input,projectId:uiProjectId,label:"Closed project receipt QA",status:"settled",settledDate:today,settledAmount:55000,shortfallReason:"withholding",withheldAmount:500,receiptId:randomUUID(),receiptRevision:0}]);ok(uiSettled.id);
 ok((await action("setProjectStage",[uiProjectId,"closed"]))===null);
 // Exercise repayment after reopening: persisted balances drive both reminders and the handoff.
 const {canReviewProjectClosure}=await import("../lib/domain/workflow");
 const {notifications}=await import("../lib/domain/notifications");
 const payoffState=async()=>{
  const payment=await load(uiSettled.id);
  const [project]=await q`select stage, archived_at from project where id=${uiProjectId}`;
  const summary={id:uiProjectId,stage:project.stage,archived:!!project.archived_at,currency:"TWD",quotedAmount:55500,taxRate:5,taxIncluded:true};
  const record={id:payment.id,projectId:uiProjectId,direction:"in",label:payment.label,amount:Number(payment.amount),taxRate:Number(payment.tax_rate),taxIncluded:payment.tax_included,currency:payment.currency,status:payment.status,settledAmount:Number(payment.settled_amount),receipts:payment.receipts,dueDate:today,recordedDate:"2026-09-15",voided:false};
  const data={payments:[record],projects:[summary],calendar:[],talent:{timeZone:"UTC"}} as unknown as import("../lib/types").AppData;
  return {payment,summary,data};
 };
 let payoff=await payoffState();
 ok((await action("amendPaymentReceipt",[{paymentId:uiSettled.id,targetId:payoff.payment.receipts[0].id,requestId:randomUUID(),revision:1,operation:"correct",date:today,cash:50000,withheld:500,note:"Reopen for payoff test"}]))===null);
 payoff=await payoffState();
 ok(payoff.summary.stage==="collecting_payment" && !canReviewProjectClosure(payoff.data,payoff.data.projects[0]));
 ok(notifications(payoff.data,new Date(`${today}T12:00Z`)).some(n=>n.kind==="receivable" && n.amount===5000));
 ok((await action("savePaymentWithId",[{...input,id:uiSettled.id,projectId:uiProjectId,status:"settled",settledDate:today,settledAmount:5000,shortfallReason:"unpaid",receiptId:randomUUID(),receiptRevision:2}])).id);
 payoff=await payoffState();
 ok(payoff.summary.stage==="collecting_payment" && canReviewProjectClosure(payoff.data,payoff.data.projects[0]));
 ok(notifications(payoff.data,new Date(`${today}T12:00Z`)).length===0);
 ok((await action("setProjectStage",[uiProjectId,"closed"],cookies[1]))!==null);
 ok((await action("setProjectStage",[uiProjectId,"closed"]))===null);
 payoff=await payoffState();
 ok(payoff.summary.stage==="closed" && !canReviewProjectClosure(payoff.data,payoff.data.projects[0]));
 // A later correction must bring the reminder back and suppress the closure prompt again.
 ok((await action("amendPaymentReceipt",[{paymentId:uiSettled.id,targetId:payoff.payment.receipts.at(-1).id,requestId:randomUUID(),revision:3,operation:"withdraw",date:today,cash:0,withheld:0,note:"Prepare outstanding payoff for UI review"}]))===null);
 payoff=await payoffState();
 ok(payoff.summary.stage==="collecting_payment" && !canReviewProjectClosure(payoff.data,payoff.data.projects[0]));
 ok(notifications(payoff.data,new Date(`${today}T12:00Z`)).some(n=>n.kind==="receivable" && n.amount===5000));
 // Multiple installments and costs: paying any single row cannot settle the whole project.
 const multiProjectId=randomUUID();
 await q`insert into project(id,talent_id,title,counterparty,type,stage,quote_currency,quoted_amount,tax_included) values(${multiProjectId},${actors[0].talentId},'Multi-payment closure QA','Test Client','other','collecting_payment','TWD',55500,true)`;
 const multiInputs=[
  {...input,projectId:multiProjectId,label:"Deposit QA",installment:"deposit",amount:10000},
  {...input,projectId:multiProjectId,label:"Milestone QA",amount:20000},
  {...input,projectId:multiProjectId,label:"Final balance QA",installment:"balance",amount:25500},
  {...input,projectId:multiProjectId,label:"Local cost QA",direction:"out",amount:3000},
  {...input,projectId:multiProjectId,label:"Second cost QA",direction:"out",taxRate:0,amount:50},
 ];
 const multiIds:string[]=[];
 for(const entry of multiInputs){const saved=await action("savePaymentWithId",[entry]);assert.ok(saved.id,`${entry.label}: ${saved.error ?? "missing id"}`);checks++;multiIds.push(saved.id);}
 const multiState=async()=>{
  const rows=await q`select * from payment where project_id=${multiProjectId} and talent_id=${actors[0].talentId}`;
  const [project]=await q`select stage from project where id=${multiProjectId} and talent_id=${actors[0].talentId}`;
  const summary={...payoff.summary,id:multiProjectId,stage:project.stage};
  const payments=rows.map(p=>({id:p.id,projectId:multiProjectId,direction:p.direction,label:p.label,amount:Number(p.amount),taxRate:Number(p.tax_rate),taxIncluded:p.tax_included,currency:p.currency,status:p.status,settledAmount:Number(p.settled_amount),receipts:p.receipts,dueDate:today,recordedDate:"2026-09-15",voided:!!p.voided_at}));
  return {payments,projects:[summary],calendar:[],talent:{timeZone:"UTC"}} as unknown as import("../lib/types").AppData;
 };
 const checkMulti=async(ready:boolean,remaining:number[])=>{
  const d=await multiState();
  ok(canReviewProjectClosure(d,d.projects[0])===ready);
  assert.deepEqual(notifications(d,new Date(`${today}T12:00Z`)).map(n=>n.id.split(":")[1]).sort(),remaining.map(i=>multiIds[i]).sort());checks++;
  if(!ready){ok((await action("setProjectStage",[multiProjectId,"closed"]))!==null);ok((await multiState()).projects[0].stage==="collecting_payment");}
 };
 const payMulti=async(index:number,cash:number,withheld=0)=>{
  const stored=await load(multiIds[index]);
  ok((await action("savePaymentWithId",[{...multiInputs[index],id:stored.id,status:"settled",settledDate:today,settledAmount:cash,shortfallReason:withheld?"withholding":"unpaid",withheldAmount:withheld||"",receiptId:randomUUID(),receiptRevision:stored.receipts.length}])).id);
 };
 await checkMulti(false,[0,1,2,3,4]);
 await payMulti(0,10000);await checkMulti(false,[1,2,3,4]);
 await payMulti(2,25500);await checkMulti(false,[1,3,4]);
 await payMulti(1,10000,200);await checkMulti(false,[1,3,4]);
 await payMulti(1,9800);await checkMulti(false,[3,4]);
 await payMulti(3,3000);await checkMulti(false,[4]);
 await payMulti(4,49.99);await checkMulti(false,[4]);
 await payMulti(4,0.01);await checkMulti(true,[]);
 ok((await multiState()).projects[0].stage==="collecting_payment");
 ok((await action("setProjectStage",[multiProjectId,"closed"]))===null);
 ok((await multiState()).projects[0].stage==="closed");
 // Real database pagination follows completion, archive, restore, and reopened settlement.
 const projectPage=async(view:string)=>{const response=await fetch(`${base}/api/projects?view=${view}&sort=title`,{headers:{Cookie:cookies[0]}});ok(response.status===200);return response.json();};
 ok((await projectPage("ended")).items.some((p:{id:string})=>p.id===multiProjectId));
 ok(!(await projectPage("settlement")).items.some((p:{id:string})=>p.id===multiProjectId));
 ok((await action("archiveProject",[multiProjectId,true]))===null);
 ok((await projectPage("archived")).items.some((p:{id:string})=>p.id===multiProjectId));
 ok(!(await projectPage("ended")).items.some((p:{id:string})=>p.id===multiProjectId));
 ok((await action("archiveProject",[multiProjectId,false]))===null);
 ok((await projectPage("ended")).items.some((p:{id:string})=>p.id===multiProjectId));
 ok((await projectPage("settlement")).items.some((p:{id:string})=>p.id===uiProjectId));
 console.log("PASS: three installments and two costs; partial cash, withholding, and final cent balance; reminders and closure gates agree.");
 // A linked invoice reads corrected totals without changing or sending its document.
 const [invoicePayment]=await q`select payment_id from invoice where talent_id=${actors[0].talentId} limit 1`;
 const ip=await load(invoicePayment.payment_id);
 const ix={paymentId:ip.id,targetId:ip.receipts[0].id,requestId:randomUUID(),revision:ip.receipts.length,operation:"correct",date:today,cash:80,withheld:0,note:"Invoice receipt correction"};
 ok((await action("amendPaymentReceipt",[ix]))===null);
 const [ir]=await q`select id from invoice where payment_id=${ip.id}`;
 const detail=await (await fetch(`${base}/api/invoices/${ir.id}`,{headers:{Cookie:cookies[0]}})).json();
 ok(detail.remaining>0 && !detail.paid && detail.received<100);
 // Janice's notice confirmation must append to the audited ledger, not overwrite it.
 await fetch(`${base}/inbox`,{headers:{Cookie:cookies[0]}});
 const bankPayment=await action("savePaymentWithId",[{...input,label:"Bank notice integration QA",amount:1000,taxRate:0}]);ok(bankPayment.id);
 const makeNotice=async(amount:number,currency="TWD")=>{
  const id=randomUUID();const notice={amount,currency,date:today,payer:"Synthetic payer",last4:"1234"};
  await q`insert into message(id,talent_id,submitted_by,channel,dedup_key,status,kind,notice,received_at) values(${id},${actors[0].talentId},${actors[0].personId},'paste',${id},'analyzed','payment_notice',${q.json(notice)},now())`;
  return id;
 };
 const bankOne=await makeNotice(600);
 ok((await action("recordNoticePayment",[bankOne,{paymentId:bankPayment.id,withheld:100,revision:0}],cookies[1]))!==null);
 ok((await action("recordNoticePayment",[bankOne,{paymentId:bankPayment.id,withheld:500,revision:0}]))!==null);
 ok((await action("recordNoticePayment",[bankOne,{paymentId:bankPayment.id,withheld:100,revision:0}]))===null);
 let bank=await load(bankPayment.id);ok(bank.status==="expected"&&bank.receipts.length===1&&Number(bank.settled_amount)===600&&bank.receipts[0].withheld===100&&bank.receipts[0].recorded_by===undefined&&bank.receipts[0].recordedBy===actors[0].personId);
 ok((await action("recordNoticePayment",[bankOne,{paymentId:bankPayment.id}]))!==null);ok((await load(bankPayment.id)).receipts.length===1);
 const wrongCurrency=await makeNotice(300,"USD");ok((await action("recordNoticePayment",[wrongCurrency,{paymentId:bankPayment.id}]))!==null);
 const bankTwo=await makeNotice(300);
 ok((await action("recordNoticePayment",[bankTwo,{paymentId:bankPayment.id,revision:0}]))!==null);
 ok((await action("recordNoticePayment",[bankTwo,{paymentId:bankPayment.id,revision:1}]))===null);
 bank=await load(bankPayment.id);ok(bank.status==="settled"&&bank.receipts.length===2&&Number(bank.settled_amount)===900&&bank.receipts[0].withheld===100);
 ok((await action("amendPaymentReceipt",[{paymentId:bankPayment.id,targetId:bankTwo,requestId:randomUUID(),revision:2,operation:"withdraw",date:today,cash:0,withheld:0,note:"Bank notice receipt withdrawal QA"}]))===null);
 bank=await load(bankPayment.id);ok(bank.status==="expected"&&Number(bank.settled_amount)===600&&bank.receipts.length===3&&bank.receipts[0].withheld===100);
 const bankThree=await makeNotice(300);ok((await action("recordNoticePayment",[bankThree,{paymentId:bankPayment.id,revision:3}]))===null);
 bank=await load(bankPayment.id);ok(bank.status==="settled"&&bank.receipts.length===4);
 const bankNew=await makeNotice(200);ok((await action("recordNoticePayment",[bankNew,{projectId:actors[0].projectId}]))===null);
 const [newNotice]=await q`select notice from message where id=${bankNew}`;const newBank=await load(newNotice.notice.paymentId);ok(newBank.currency==="TWD"&&newBank.receipts.length===1&&newBank.receipts[0].recordedBy===actors[0].personId);

 // Leave a fresh unpaid example only when explicitly running interactive QA.
 if(process.argv.includes("--keep-ui")){
  const ui=await action("savePaymentWithId",[{...input,label:"UI Partial Receipt QA"}]);ok(ui.id);
  const multiUiProjectId=randomUUID();
  await q`insert into project(id,talent_id,title,counterparty,type,stage,quote_currency,quoted_amount,tax_included) values(${multiUiProjectId},${actors[0].talentId},'Installment and cost UI QA','Test Client','other','collecting_payment','TWD',55500,true)`;
  const multiUiPaymentIds:string[]=[];
  for(const entry of multiInputs){
   const saved=await action("savePaymentWithId",[{...entry,projectId:multiUiProjectId}]);ok(saved.id);multiUiPaymentIds.push(saved.id);
  }
  ok((await action("savePaymentWithId",[{...multiInputs[0],projectId:multiUiProjectId,id:multiUiPaymentIds[0],status:"settled",settledDate:today,settledAmount:1000,shortfallReason:"unpaid",receiptId:randomUUID(),receiptRevision:0}])).id);
  await writeFile("/private/tmp/taloox-receipt-ui-fixture.json",JSON.stringify({actors,paymentId:ui.id,withheldId:withheld.id,uiProjectId,uiSettledId:uiSettled.id,multiUiProjectId,multiUiPaymentIds,multiProjectId,multiIds}),{mode:0o600});
  keepFixture=true;
 }
 console.log(`PASS: ${checks} local acceptance checks; no email sent.`);
} finally {
 if(!keepFixture)for(const a of actors){await q`delete from invoice where talent_id=${a.talentId}`;await q`delete from talent where id=${a.talentId}`;await q`delete from person where id=${a.personId}`;}
 await q.end();
}
