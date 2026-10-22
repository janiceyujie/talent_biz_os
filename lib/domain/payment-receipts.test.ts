import assert from "node:assert/strict";
import { test } from "node:test";
import { receiptAudit, amendReceipt, activeReceipts, appendReceipt, paymentBalance, receiptHistory, cashInRange, ReceiptError } from "./payment-receipts";
import { canReviewProjectClosure, summarize, projectSettlement } from "./workflow";
import { notifications } from "./notifications";
import { outstandingMoney } from "@/lib/overview/money";
import { financeInsights } from "./insights";
import { managerFinance } from "@/lib/manager/finance";
import { cashScenario } from "./cash-scenario";
import type { AppData, Payment, ProjectSummary } from "@/lib/types";
const base: Payment = {id:"10000000-0000-4000-8000-000000000001", projectId:"project", projectType:"other", direction:"in", installment:"regular", label:"Synthetic receipt", amount:55500, currency:"TWD", taxRate:5, taxIncluded:true, recordedDate:"2026-09-15", dueDate:"2026-10-17", status:"expected", settledAmount:null, settledDate:null, invoiceRef:"", notes:"", voided:false,receipts:[]};
const project = {id:"project",stage:"in_progress",currency:"TWD",quotedAmount:55500,taxRate:5,taxIncluded:true,archived:false} as ProjectSummary;
const data = (p:Payment) => ({payments:[p],projects:[project],calendar:[],talent:{timeZone:"UTC"},notificationState:{}} as unknown as AppData);
const receive = (p:Payment, cash:number, reason="unpaid", date="2026-09-30", id="first", withheld?:number) => ({...p,...appendReceipt(p,{id,date,cash,reason,withheld,revision:receiptHistory(p).length})});
test("partial cash remains due in totals, reminders, aging, scenario and manager views", () => {
 const p=receive(base,55000), d=data(p);
 assert.equal(p.status,"expected");
 assert.deepEqual(paymentBalance(p),{cash:55000,withheld:0,remaining:500});
 assert.equal(summarize(d).received,55000);assert.equal(summarize(d).receivable,500);
 assert.equal(projectSettlement(d,project).pending,500);
 assert.equal(notifications(d,new Date("2026-10-17T12:00Z"))[0].kind,"receivable");
 assert.equal((notifications(d,new Date("2026-10-17T12:00Z"))[0] as {amount:number}).amount,500);
 assert.equal(outstandingMoney([p],"2026-10-17").toReceive[0].amount,500);
 assert.equal(financeInsights(d,new Date("2026-10-17T12:00Z")).aging.reduce((n,r)=>n+r.amount,0),500);
 const manager=managerFinance([{...p,talentId:"A",voidedAt:null,recordedOn:p.recordedDate,dueOn:p.dueDate}]);
 assert.equal(manager[0].received,55000);assert.equal(manager[0].receivable,500);
 assert.equal(cashScenario([p],"2026-10-17",{opening:0,delayDays:0,collectionPercent:100,extraPer30Days:0}).points[0].incoming,500);
});
test("confirmed withholding clears debt but never inflates cash",()=>{
 const p=receive(base,55000,"withholding","2026-09-30","first",500);
 assert.equal(p.status,"settled");assert.deepEqual(paymentBalance(p),{cash:55000,withheld:500,remaining:0});
 assert.equal(summarize(data(p)).received,55000);assert.equal(summarize(data(p)).receivable,0);
 assert.equal(notifications(data(p),new Date("2026-10-17T12:00Z")).length,0);
 assert.equal(projectSettlement(data(p),project).withheld,500);
});
test("later receipt clears only the remaining balance and preserves cash dates",()=>{
 const partial=receive(base,55000), p=receive(partial,500,"unpaid","2026-10-17","second");
 assert.equal(paymentBalance(p).remaining,0);assert.equal(receiptHistory(p).length,2);
 assert.equal(cashInRange(p,"2026-09-01","2026-09-30"),55000);
 assert.equal(summarize(data(p),"2026-10-01","2026-10-31").received,500);
 assert.equal(notifications(data(p),new Date("2026-10-17T12:00Z")).length,0);
 const monthly=financeInsights(data(p),new Date("2026-10-17T12:00Z")).monthly;
 assert.equal(monthly.find(r=>r.month==="2026-09")?.received,55000);assert.equal(monthly.find(r=>r.month==="2026-10")?.received,500);
});
test("retries are idempotent; stale editors and missing reasons are rejected",()=>{
 const input={id:"request",date:"2026-10-17",cash:55000,reason:"unpaid",revision:0};
 const first=appendReceipt(base,input), p={...base,...first};
 assert.deepEqual(appendReceipt(p,input),first);
 assert.throws(()=>appendReceipt(p,{...input,id:"other"}),ReceiptError);
 assert.throws(()=>appendReceipt(base,{...input,reason:""}),ReceiptError);
 assert.throws(()=>appendReceipt(base,{...input,cash:-1}),ReceiptError);
});
test("legacy unexplained shortfalls are not silently written off as tax",()=>{
 const old={...base,status:"settled" as const,settledAmount:55000,settledDate:"2026-09-30"};
 assert.equal(paymentBalance(old).remaining,500);
 const fixed=receive(old,0,"withholding","2026-10-17","confirmation",500);
 assert.deepEqual(paymentBalance(fixed),{cash:55000,withheld:500,remaining:0});assert.equal(cashInRange(fixed,"2026-09-01","2026-09-30"),55000);
});
test("rounding, outgoing partial payments, overpayments and voids",()=>{
 const yen={...base,amount:1001,currency:"JPY" as const,taxRate:0};
 assert.equal(paymentBalance(receive(yen,1000)).remaining,1);
 assert.throws(()=>receive(yen,1000.5),ReceiptError);
 const out=receive({...base,direction:"out"},55000);assert.equal(summarize(data(out)).payable,500);assert.equal(summarize(data(out)).paid,55000);
 assert.equal(paymentBalance(receive(base,56000)).remaining,0);
 assert.equal(summarize(data({...out,voided:true})).paid,0);
 assert.equal(paymentBalance({...out,status:"cancelled"}).remaining,0);
});

test("mixed withholding and unpaid cash remains collectible across reports and reminders",()=>{
 const p=receive(base,50000,"withholding","2026-09-30","mixed",500), d=data(p);
 assert.equal(p.status,"expected");
 assert.deepEqual(paymentBalance(p),{cash:50000,withheld:500,remaining:5000});
 assert.equal(summarize(d).received,50000);assert.equal(summarize(d).receivable,5000);
 assert.equal(projectSettlement(d,project).pending,5000);assert.equal(projectSettlement(d,project).withheld,500);
 assert.equal((notifications(d,new Date("2026-10-17T12:00Z"))[0] as {amount:number}).amount,5000);
 assert.equal(outstandingMoney([p],"2026-10-17").toReceive[0].amount,5000);
 assert.equal(financeInsights(d,new Date("2026-10-17T12:00Z")).aging.reduce((n,r)=>n+r.amount,0),5000);
 const manager=managerFinance([{...p,talentId:"A",voidedAt:null,recordedOn:p.recordedDate,dueOn:p.dueDate}]);
 assert.equal(manager[0].received,50000);assert.equal(manager[0].receivable,5000);
 assert.equal(cashScenario([p],"2026-10-17",{opening:0,delayDays:0,collectionPercent:100,extraPer30Days:0}).points[0].incoming,5000);
 const second=receive(p,2000,"unpaid","2026-10-10","second");
 assert.deepEqual(paymentBalance(second),{cash:52000,withheld:500,remaining:3000});
 const final=receive(second,3000,"unpaid","2026-10-17","final");
 assert.equal(final.status,"settled");assert.deepEqual(paymentBalance(final),{cash:55000,withheld:500,remaining:0});
 assert.equal(summarize(data(final),"2026-10-01","2026-10-31").received,5000);
 assert.equal(notifications(data(final),new Date("2026-10-17T12:00Z")).length,0);
 // Retrying the first receipt after later receipts must not duplicate or recompute withholding.
 assert.deepEqual(appendReceipt(final,{id:"mixed",date:"2026-09-30",cash:50000,withheld:500,reason:"withholding",revision:0}).receipts,final.receipts);
 assert.throws(()=>appendReceipt(final,{id:"mixed",date:"2026-09-30",cash:50000,withheld:5500,reason:"withholding",revision:0}),ReceiptError);
});
test("withholding must be explicit, positive, precise, and no larger than the cash shortfall",()=>{
 for(const withheld of [undefined,0,-1,5500.01,500.001,NaN,Infinity]){
  assert.throws(()=>appendReceipt(base,{id:"invalid",date:"2026-10-17",cash:50000,reason:"withholding",withheld}),ReceiptError);
 }
 assert.throws(()=>appendReceipt(base,{id:"invalid",date:"2026-10-17",cash:50000,reason:"unpaid",withheld:500}),ReceiptError);
 assert.throws(()=>appendReceipt(base,{id:"invalid",date:"2026-10-17",cash:56000,reason:"withholding",withheld:500}),ReceiptError);
 const yen={...base,amount:1001,currency:"JPY" as const,taxRate:0};
 assert.throws(()=>receive(yen,900,"withholding","2026-10-17","yen",0.5),ReceiptError);
 assert.deepEqual(paymentBalance(receive(yen,900,"withholding","2026-10-17","yen",1)),{cash:900,withheld:1,remaining:100});
 assert.deepEqual(paymentBalance(receive(base,0,"withholding","2026-10-17","tax-only",500)),{cash:0,withheld:500,remaining:55000});
});

const amendment = (p:Payment, targetId:string, cash:number, withheld:number, operation:"correct"|"withdraw"="correct", id="amend") => ({id,targetId,revision:receiptHistory(p).length,operation,date:"2026-10-17",cash,withheld,note:"Correct synthetic entry",recordedAt:"2026-10-17T12:00:00Z",recordedBy:"tester"});
test("correction reopens a settled receipt without erasing its original cash or withholding",()=>{
 const paid=receive(base,55000,"withholding","2026-09-30","original",500);
 const corrected={...paid,...amendReceipt(paid,amendment(paid,"original",50000,500))};
 assert.deepEqual(paymentBalance(corrected),{cash:50000,withheld:500,remaining:5000});assert.equal(corrected.status,"expected");assert.equal(corrected.settledOn,null);
 assert.equal(receiptHistory(corrected)[0].cash,55000);assert.equal(receiptHistory(corrected).length,2);
 assert.equal(cashInRange(corrected,"2026-09-01","2026-09-30"),0);assert.equal(cashInRange(corrected,"2026-10-01","2026-10-31"),50000);
 assert.equal((notifications(data(corrected),new Date("2026-10-17T12:00Z"))[0] as {amount:number}).amount,5000);
 assert.equal(projectSettlement(data(corrected),project).pending,5000);
 const fixed={...corrected,...amendReceipt(corrected,amendment(corrected,"amend",55000,500,"correct","fix"))};
 assert.equal(paymentBalance(fixed).remaining,0);assert.equal(notifications(data(fixed),new Date("2026-10-17T12:00Z")).length,0);
 assert.equal(activeReceipts(fixed).length,1);assert.equal(receiptHistory(fixed).length,3);
});
test("withdrawal removes only the selected receipt and keeps other installments effective",()=>{
 const first=receive(base,50000,"withholding","2026-09-30","first",500),paid=receive(first,5000,"unpaid","2026-10-17","second");
 const input=amendment(paid,"first",0,0,"withdraw");
 const result=amendReceipt(paid,input), withdrawn={...paid,...result};
 assert.deepEqual(paymentBalance(withdrawn),{cash:5000,withheld:0,remaining:50500});
 assert.equal(receiptHistory(withdrawn)[0].withheld,500);assert.equal(receiptHistory(withdrawn)[2].withdrawn,true);
 assert.deepEqual(amendReceipt(withdrawn,input),result);
 const empty={...withdrawn,...amendReceipt(withdrawn,amendment(withdrawn,"second",0,0,"withdraw","remove-second"))};
 assert.equal(activeReceipts(empty).length,0);assert.deepEqual(paymentBalance(empty),{cash:0,withheld:0,remaining:55500});
 const reentered=receive(empty,55500,"unpaid","2026-10-17","new");assert.equal(paymentBalance(reentered).remaining,0);
});
test("amendments reject stale, superseded, mismatched retry and invalid monetary changes",()=>{
 const paid=receive(base,55500), input=amendment(paid,"first",55000,0);
 const corrected={...paid,...amendReceipt(paid,input)};
 for(const invalid of [{...input,revision:0},{...input,targetId:"missing"},{...input,cash:-1},{...input,cash:NaN},{...input,cash:55000.001},{...input,cash:55500,withheld:500},{...input,note:""}])assert.throws(()=>amendReceipt(paid,invalid),ReceiptError);
 assert.throws(()=>amendReceipt(corrected,{...input,cash:54000}),ReceiptError);
 assert.throws(()=>amendReceipt(corrected,{...input,id:"other",revision:2}),ReceiptError);
 assert.throws(()=>appendReceipt(corrected,{id:input.id,date:input.date,cash:input.cash,withheld:0,reason:"unpaid"}),ReceiptError);
});
test("legacy and outgoing receipt corrections retain history and update payables",()=>{
 const old={...base,status:"settled" as const,settledAmount:55000,settledDate:"2026-09-30"};
 const corrected={...old,...amendReceipt(old,amendment(old,"legacy",50000,500))};assert.deepEqual(paymentBalance(corrected),{cash:50000,withheld:500,remaining:5000});
 assert.equal(receiptHistory(corrected)[0].id,"legacy");
 const out=receive({...base,direction:"out"},55500);
 const correctedOut={...out,...amendReceipt(out,amendment(out,"first",55000,0))};
 assert.equal(summarize(data(correctedOut)).paid,55000);assert.equal(summarize(data(correctedOut)).payable,500);
});

test("payoff removes the reminder and offers closure review without completing the project", () => {
 const collecting = {...project, stage:"collecting_payment" as const};
 const original = receive(base,55000,"withholding","2026-09-30","first",500);
 const corrected = {...original,...amendReceipt(original,amendment(original,"first",50000,500,"correct","correction"))};
 assert.equal(canReviewProjectClosure(data(corrected),collecting),false);
 const paid = receive(corrected,5000,"unpaid","2026-10-17","payoff");
 const d = {...data(paid),projects:[collecting]};
 assert.deepEqual(paymentBalance(paid),{cash:55000,withheld:500,remaining:0});
 assert.equal(notifications(d,new Date("2026-10-17T12:00Z")).length,0);
 assert.equal(canReviewProjectClosure(d,collecting),true);
 assert.equal(collecting.stage,"collecting_payment");
 for (const changed of [{archived:true},{stage:"closed" as const},{quotedAmount:60000},{quotedAmount:null},{quotedAmount:50000}])
  assert.equal(canReviewProjectClosure(d,{...collecting,...changed}),false);
 assert.equal(canReviewProjectClosure({...d,payments:[]},collecting),false);
 const cost = {...base,id:"cost",direction:"out" as const,currency:"USD" as const};
 assert.equal(canReviewProjectClosure({...d,payments:[paid,cost]},collecting),false);
 assert.equal(canReviewProjectClosure({...d,payments:[paid,{...cost,voided:true}]},collecting),true);
 assert.equal(canReviewProjectClosure({...d,payments:[paid,{...cost,status:"cancelled" as const}]},collecting),true);
});

test("closure waits for every installment and every cost, independent of payment order", () => {
 const collecting = {...project,stage:"collecting_payment" as const};
 const rows: Payment[] = [
  {...base,id:"deposit",installment:"deposit",amount:10000},
  {...base,id:"milestone",amount:20000},
  {...base,id:"balance",installment:"balance",amount:25500},
  {...base,id:"local-cost",direction:"out",amount:3000},
  {...base,id:"foreign-cost",direction:"out",currency:"USD",taxRate:0,amount:50},
 ];
 const snapshot = () => ({...data(rows[0]),projects:[collecting],payments:[...rows]});
 const check = (ready:boolean, remainingIds:string[]) => {
  const d=snapshot();
  assert.equal(canReviewProjectClosure(d,collecting),ready);
  assert.deepEqual(notifications(d,new Date("2026-10-17T12:00Z")).map(n=>n.id.split(":")[1]).sort(),remainingIds.sort());
 };
 check(false,["deposit","milestone","balance","local-cost","foreign-cost"]);
 rows[0]=receive(rows[0],10000);
 check(false,["milestone","balance","local-cost","foreign-cost"]);
 rows[2]=receive(rows[2],25500);
 check(false,["milestone","local-cost","foreign-cost"]);
 rows[1]=receive(rows[1],10000,"withholding","2026-10-17","first",200);
 check(false,["milestone","local-cost","foreign-cost"]);
 rows[1]=receive(rows[1],9800,"unpaid","2026-10-17","second");
 check(false,["local-cost","foreign-cost"]);
 rows[3]=receive(rows[3],3000);
 check(false,["foreign-cost"]);
 rows[4]=receive(rows[4],49.99);
 check(false,["foreign-cost"]);
 rows[4]=receive(rows[4],0.01,"unpaid","2026-10-17","second");
 check(true,[]);
 // Debts belonging to another project do not block this one.
 assert.equal(canReviewProjectClosure({...snapshot(),payments:[...rows,{...base,projectId:"other"}]},collecting),true);
 // Even a future-due cost outside the reminder window must block closure.
 rows.push({...base,id:"future-cost",direction:"out",dueDate:"2027-01-01"});
 check(false,[]);
});

test("one installment's overpayment cannot cover another installment's unpaid balance", () => {
 const collecting={...project,stage:"collecting_payment" as const};
 const deposit=receive({...base,id:"deposit",amount:10000},11000);
 const balance=receive({...base,id:"balance",amount:45500},44500);
 const d={...data(deposit),payments:[deposit,balance],projects:[collecting]};
 assert.equal(projectSettlement(d,collecting).received,55500);
 assert.equal(projectSettlement(d,collecting).pending,1000);
 assert.equal(canReviewProjectClosure(d,collecting),false);
});

test("audit compares immediate predecessors and keeps cash and withholding changes separate", () => {
 const paid=receive(base,55000,"withholding","2026-10-17","original",500);
 const corrected={...paid,...amendReceipt(paid,amendment(paid,"original",54000,600,"correct","correct-one"))};
 const again={...corrected,...amendReceipt(corrected,amendment(corrected,"correct-one",53999.99,600,"correct","correct-two"))};
 const withdrawn={...again,...amendReceipt(again,amendment(again,"correct-two",0,0,"withdraw","withdraw-final"))};
 const audit=receiptAudit(withdrawn);
 assert.deepEqual(audit.map(a=>a.row.id),["withdraw-final","correct-two","correct-one","original"]);
 assert.equal(audit[0].cashDelta,-53999.99);assert.equal(audit[0].withheldDelta,-600);
 assert.equal(audit[1].cashDelta,-0.01);assert.equal(audit[1].withheldDelta,0);
 assert.equal(audit[2].cashDelta,-1000);assert.equal(audit[2].withheldDelta,100);
 assert.equal(audit[3].cashDelta,null);assert.equal(audit[3].previous,undefined);
 assert.equal(audit[1].successor?.withdrawn,true);assert.ok(audit.every(a=>!a.active));
 const legacy=receiptAudit({...base,status:"settled",settledAmount:55500,receipts:[]});
 assert.equal(legacy[0].row.recordedBy,undefined);assert.equal(legacy[0].row.recordedAt,undefined);
});
test("new receipt metadata is kept intact on an idempotent retry", () => {
 const input={id:"audited",date:"2026-10-17",cash:55500,recordedAt:"2026-10-17T12:00:00Z",recordedBy:"operator"};
 const first=appendReceipt(base,input);
 const retry=appendReceipt({...base,...first},{...input,recordedAt:"2026-10-17T13:00:00Z"});
 assert.equal(retry.receipts[0].recordedAt,input.recordedAt);
 assert.equal(retry.receipts[0].recordedBy,"operator");assert.equal(retry.receipts.length,1);
});
