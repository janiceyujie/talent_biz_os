/** Disposable, local-only reminder persistence and ownership checks. */
import env from "@next/env";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { readFile, writeFile, unlink } from "node:fs/promises";
env.loadEnvConfig(process.cwd());
const base=process.env.WORKFLOW_TEST_URL || "http://localhost:3000";
assert.ok(["127.0.0.1","localhost"].includes(new URL(process.env.DATABASE_URL!).hostname));
assert.equal(process.env.APP_ENV,"development");
const {db}=await import("../lib/db"); const s=await import("../lib/db/schema");
const {default:postgres}=await import("postgres"); const q=postgres(process.env.DATABASE_URL!);
const {hashPassword}=await import("better-auth/crypto");
const suffix=randomBytes(5).toString("hex"), today=new Date().toISOString().slice(0,10);
const people=Array.from({length:2},(_,i)=>({personId:randomUUID(),talentId:randomUUID(),email:`briefing-qa-${suffix}-${i}@example.invalid`,password:randomBytes(18).toString("base64url")}));
const managedTalents:string[]=[];
const cookies:string[]=[];let checks=0;const ok=(v:unknown,m:string)=>{assert.ok(v,m);checks++;};
const request=(path:string,cookie="",body?:unknown)=>fetch(base+path,{method:body?"POST":"GET",headers:{Cookie:cookie,Origin:base,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined,redirect:"manual"});
async function action(name: string, args: unknown[], cookie = cookies[0]) {
  const manifest = JSON.parse(
    await readFile(".next/dev/server/server-reference-manifest.json", "utf8"),
  );
  const entry = Object.entries(manifest.node).find(
    ([, v]) => (v as { exportedName: string }).exportedName === name,
  );
  assert.ok(entry, `Missing action ${name}`);
  const r = await fetch(base + "/finance", {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: base,
      "Content-Type": "text/plain;charset=UTF-8",
      "Next-Action": entry[0],
    },
    body: JSON.stringify(args),
  });
  const body = await r.text();
  assert.equal(r.status, 200);
  const root = body.split("\n").find((line) => line.startsWith("0:"));
  assert.ok(root);
  const id = JSON.parse(root.slice(2)).a?.replace("$@", "");
  const result = body
    .split("\n")
    .findLast(
      (line) =>
        line.startsWith(`${id}:`) &&
        /^(null|"|\[|\{)/.test(line.slice(String(id).length + 1)),
    );
  assert.ok(result);
  return JSON.parse(result.slice(String(id).length + 1));
}

try {
 for(const p of people){
  await db.insert(s.person).values({id:p.personId,email:p.email,emailVerified:true,displayName:"Daily Briefing QA",locale:"zh-TW"});
  await db.insert(s.authAccount).values({personId:p.personId,accountId:p.personId,providerId:"credential",password:await hashPassword(p.password)});
  await db.insert(s.talent).values({id:p.talentId,name:"Reminder QA workspace",vertical:"music",timeZone:"UTC"});
  await db.insert(s.membership).values({personId:p.personId,talentId:p.talentId,role:"owner",status:"active"});
  const login=await request("/api/auth/sign-in/email","",{email:p.email,password:p.password});ok(login.ok,"Synthetic login");cookies.push(login.headers.getSetCookie().map(v=>v.split(";")[0]).join(";"));
 }
 const owner=people[0];
 const [todo]=await db.insert(s.todo).values({talentId:owner.talentId,title:"Submit stage plan",type:"deliverable",dueDate:today,timeZone:"UTC"}).returning();
 const events=await db.insert(s.calendarEvent).values([{talentId:owner.talentId,title:"Rehearsal and sound check",kind:"meeting",startDate:today,startTime:"23:30",timeZone:"UTC"},{talentId:owner.talentId,title:"Review sponsorship proposal",kind:"meeting",startDate:today,startTime:"22:00",timeZone:"UTC"}]).returning();
 const payments=await db.insert(s.payment).values(Array.from({length:22},(_,i)=>({talentId:owner.talentId,label:`October performance ${i+1}`,direction:"in" as const,amount:1000,currency:"USD",taxRate:0,taxIncluded:false,recordedOn:today,dueOn:"2099-10-31"}))).returning();
 let invoiceId="";
 for(let i=0;i<22;i++){
  const response=await request("/api/invoices",cookies[0],{paymentId:payments[i].id,issueOn:today,dueOn:"2099-10-31",documentLanguage:"en",sellerName:"QA Studio",sellerAddress:"100 Test Street",sellerEmail:"studio@example.invalid",buyerName:i===0?"October Events":"Example Client "+i,buyerAddress:"200 Test Street",recipient:"buyer@example.invalid",description:"Performance",paymentInstructions:"Synthetic test only.",taxNote:"Test fixture",subject:"Invoice review",body:"Synthetic test only",taxConfirmed:true});
  ok(response.ok,"Draft prepared");const result=await response.json();if(!i)invoiceId=result.id;
 }
 const load=async(cookie=cookies[0])=>(await request("/api/reminders",cookie)).json();
 let feed=await load();ok(feed.items.length===20&&feed.hasMore,"Bounded 20-item invoice feed");
 const second=await (await request(`/api/reminders?after=${encodeURIComponent(feed.nextCursor)}`,cookies[0])).json();
 ok(second.items.length===2&&!second.hasMore,"Cursor returns remaining reminders");
 ok(!second.items.some((n:{id:string})=>feed.items.some((x:{id:string})=>x.id===n.id)),"No cursor duplicates");
 ok((await request("/api/reminders?after=bad",cookies[0])).status===400,"Invalid cursor rejected");
 ok((await load(cookies[1])).items.length===0,"Other owner sees no invoices");
 ok((await request("/api/reminders")).status===401,"Anonymous feed denied");
 await (await request("/",cookies[0])).text();
 const id=feed.items[0].id;
 ok(await action("markNotificationsRead",[[id]])===null,"Mark viewed");
 ok(await action("snoozeNotification",[id,120])===null,"Two-hour snooze saved");
 feed=await load();ok(feed.state[id].readAt===null,"Snooze resets read state");
 const delta=Date.parse(feed.state[id].snoozedUntil)-Date.now();ok(delta>7100000&&delta<=7200000,"Snooze uses server clock");
 ok(!(await load(cookies[1])).state[id],"Snooze state is person-scoped");
 ok(await action("snoozeNotification",[id,"2020-01-01T00:00:00Z"])!==null,"Past custom time rejected");
 ok(await action("snoozeNotification",[id,"2099-01-01T00:00:00Z"])!==null,"Unbounded custom time rejected");
 ok(await action("snoozeNotification",[id,"not-a-date"])!==null,"Malformed custom time rejected");
 const custom=new Date(Date.now()+3*3600_000).toISOString();
 ok(await action("snoozeNotification",[id,custom])===null,"Custom reminder saved");
 ok((await load()).state[id].snoozedUntil===custom,"Custom time round-trips through PostgreSQL");
 ok(await action("snoozeNotification",[id,false])===null,"Resume reminder");
 await (await request("/finance",cookies[0])).text();
 const [newPayment]=await db.insert(s.payment).values({talentId:owner.talentId,label:"New festival fee — billing details pending",direction:"in",amount:1500,currency:"USD",taxRate:0,taxIncluded:false,recordedOn:today,dueOn:"2099-10-31"}).returning();
 const edit={id:newPayment.id,projectId:"",label:newPayment.label,direction:"in",installment:"regular",amount:1500,currency:"USD",taxRate:0,taxIncluded:false,recordedDate:today,dueDate:"2099-10-31",status:"expected",settledDate:"",settledAmount:"",invoiceRef:"",notes:"Synthetic reminder test"};
 ok(await action("savePayment",[{...edit,invoiceOn:today}])===null,"Preparation date saved before billing details exist");
 ok((await q`select invoice_on::text as invoice_on from payment where id=${newPayment.id}`)[0].invoice_on===today,"Preparation date persisted");
 ok(await action("savePayment",[edit])===null,"Older payment edits preserve optional preparation date");
 ok((await q`select invoice_on::text as invoice_on from payment where id=${newPayment.id}`)[0].invoice_on===today,"Omitted date is not erased");
 // Keep the browser fixture concise; all pagination assertions above used 22 invoices.
 await q`update invoice set status='cancelled' where talent_id=${owner.talentId} and id<>${invoiceId}`;
 feed=await load();ok(feed.items.some((n:{status:string})=>n.status==="unprepared"),"Unprepared invoice appears without billing snapshot");
 const [restrictedProject]=await db.insert(s.project).values({talentId:owner.talentId,title:"Reminder eligibility QA",counterparty:"Synthetic",type:"performance",stage:"offer"}).returning();
 await q`update payment set project_id=${restrictedProject.id} where id=${newPayment.id}`;
 ok(!(await load()).items.some((n:{id:string})=>n.id.startsWith(`billing:${newPayment.id}:`)),"Unsigned project cannot offer invoice preparation");
 await q`update project set stage='signed', archived_at=now() where id=${restrictedProject.id}`;
 ok(!(await load()).items.some((n:{id:string})=>n.id.startsWith(`billing:${newPayment.id}:`)),"Archived project cannot offer invoice preparation");
 await q`update project set archived_at=null where id=${restrictedProject.id}`;
 ok((await load()).items.some((n:{id:string})=>n.id.startsWith(`billing:${newPayment.id}:`)),"Active signed project can prepare invoice");
 await q`update payment set project_id=null where id=${newPayment.id}`;
 ok(Number((await q`select count(*)::int as n from invoice where talent_id=${owner.talentId}`)[0].n)===22,"Reminder never creates an invoice or email automatically");
 // Completed preparation must not reappear, even with an expired snooze.
 const invoiceKey=`invoice:${invoiceId}:1:${today}`;
 await q`insert into notification_state (person_id,notification_id,snoozed_until) values (${owner.personId},${invoiceKey},now()-interval '1 hour') on conflict (person_id,notification_id) do update set read_at=null,snoozed_until=excluded.snoozed_until`;
 for(const status of ["gmail_draft","sent","draft_queued","draft_creating"]) {
  await q`update invoice set status=${status} where id=${invoiceId}`;
  ok(!(await load()).items.some((n:{id:string})=>n.id.startsWith(`invoice:${invoiceId}:`)),`Resolved or processing preparation excluded: ${status}`);
 }
 for(const status of ["draft","draft_missing","draft_unknown","delivery_unknown"]) {
  await q`update invoice set status=${status} where id=${invoiceId}`;
  ok((await load()).items.some((n:{id:string})=>n.id.startsWith(`invoice:${invoiceId}:`)),`Unfinished or uncertain preparation stays actionable: ${status}`);
 }
 await q`update invoice set status='draft' where id=${invoiceId}`;
 await q`delete from notification_state where person_id=${owner.personId} and notification_id=${invoiceKey}`;
 await (await request("/calendar",cookies[0])).text();
 ok(await action("setTodoDone",[todo.id,true])===null,"Complete todo through authenticated action");
 ok((await q`select status from todo where id=${todo.id}`)[0].status==="done","Todo completion persisted");
 ok(await action("setTodoDone",[todo.id,false])===null,"Reopen todo for browser acceptance check");
 // Exercise manager selection using synthetic artists, never the builder's memberships.
 await db.insert(s.managerEntitlement).values({personId:owner.personId,plan:"manager",artistLimit:3,active:true,source:"local_trial"});
 for (const name of ["Alpha", "Beta", "Gamma"]) {
  const id=randomUUID();managedTalents.push(id);
  await db.insert(s.talent).values({id,name:`QA Artist ${name}`,vertical:"music",timeZone:"UTC"});
  await db.insert(s.membership).values([{personId:people[1].personId,talentId:id,role:"owner",status:"active"},{personId:owner.personId,talentId:id,role:"manager",status:"active"}]);
  await db.insert(s.calendarEvent).values({talentId:id,title:`${name} rehearsal`,kind:"meeting",startDate:today,startTime:"23:00",timeZone:"UTC"});
 }
 const manager=await request("/api/manager/workspace?"+managedTalents.map(id=>`artist=${id}`).join("&"),cookies[0]);
 ok(manager.ok,"Authorized manager selection loads");
 const managerData=await manager.json();ok(managerData.calendar.length===3,"All three selected artist events load");
 const one=await (await request(`/api/manager/workspace?artist=${managedTalents[1]}`,cookies[0])).json();
 ok(one.calendar.length===1&&one.calendar[0].artistName==="QA Artist Beta","Single artist selection excludes others");
 const foreign=await request("/api/manager/workspace?"+managedTalents.map(id=>`artist=${id}`).join("&"),cookies[1]);
 ok(foreign.status===403,"An account without manager entitlement cannot use this feed");
 await writeFile("/private/tmp/briefing-ui.json",JSON.stringify({people,managedTalents,invoiceId,todoId:todo.id,paymentId:newPayment.id,events:events.map(e=>e.id),base}),{mode:0o600});
 console.log(JSON.stringify({checks,invoiceId,ui:process.env.BRIEFING_QA_HOLD==="1"}));
 if(process.env.BRIEFING_QA_HOLD==="1")await new Promise<void>(resolve=>{process.once("SIGTERM",resolve);process.once("SIGINT",resolve);});
} finally {
 for(const cookie of cookies)await request("/api/auth/sign-out",cookie,{}).catch(()=>{});
 for(const id of managedTalents)await q`delete from talent where id=${id}`;
 for(const p of people){await q`delete from invoice where talent_id=${p.talentId}`;await q`delete from talent where id=${p.talentId}`;await q`delete from person where id=${p.personId}`;}
 await unlink("/private/tmp/briefing-ui.json").catch(()=>{});await q.end();
}
process.exit(0);
