/** Local-only synthetic acceptance checks; no mailbox, AI or production database. */
import env from "@next/env";
import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
import {managerFinance} from "../lib/manager/finance";
env.loadEnvConfig(process.cwd());
const base=process.env.WORKFLOW_TEST_URL||"http://localhost:3000";
const local=(value:string)=>["localhost","127.0.0.1","[::1]"].includes(new URL(value).hostname);
assert.ok(local(base)&&local(process.env.DATABASE_URL!),"Only local fixtures allowed");
assert.equal(process.env.APP_ENV,"development");
const {db}=await import("../lib/db");
const s=await import("../lib/db/schema");
const {default:postgres}=await import("postgres");
const {hashPassword}=await import("better-auth/crypto");
const q=postgres(process.env.DATABASE_URL!);
const run=randomBytes(5).toString("hex");
const people=Array.from({length:33},(_,i)=>({personId:randomUUID(),talentId:randomUUID(),projectId:randomUUID(),membershipId:randomUUID(),name:i?`Capacity Artist ${String(i).padStart(2,"0")}`:"Capacity QA Manager",email:`manager-capacity-${run}-${i}@example.invalid`,password:randomBytes(24).toString("base64url")}));
const [manager,...artists]=people;
const today=new Date().toISOString().slice(0,10),from=today.slice(0,7)+"-01",end=new Date(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7)),0)).toISOString().slice(0,10);
let checks=0;let passed=false;const cookies:string[]=[];
const ok=(v:unknown,m:string)=>{assert.ok(v,m);checks++;};
const get=(path:string,cookie="")=>fetch(base+path,{headers:{Cookie:cookie},redirect:"manual"});
const selection=(ids:string[])=>ids.length?ids.map(id=>`artist=${id}`).join("&"):"artist=none";
async function login(p:typeof manager){const res=await fetch(base+"/api/auth/sign-in/email",{method:"POST",headers:{"Content-Type":"application/json",Origin:base},body:JSON.stringify({email:p.email,password:p.password})});assert.equal(res.status,200);return res.headers.getSetCookie().map(v=>v.split(";")[0]).join(";");}
async function action(name:string,args:unknown[],cookie:string){
 // Resolve the local build's action IDs rather than hard-code framework hashes.
 const manifest=JSON.parse(await readFile(".next/dev/server/server-reference-manifest.json","utf8"));
 const entry=Object.entries(manifest.node).find(([,v])=>(v as {exportedName:string}).exportedName===name);
 assert.ok(entry,`Action not compiled: ${name}`);
 const r=await fetch(`${base}/manager`,{method:"POST",headers:{Cookie:cookie,Origin:base,"Content-Type":"text/plain;charset=UTF-8","Next-Action":entry[0]},body:JSON.stringify(args)});
 const body=await r.text();assert.equal(r.status,200,`Action ${name} status ${r.status}`);
 const root=body.split("\n").find(line=>line.startsWith("0:"));assert.ok(root,`Missing action root: ${name}`);
 const id=JSON.parse(root.slice(2)).a?.replace("$@","");
 const result=body.split("\n").findLast(line=>line.startsWith(`${id}:`) && /^(null|"|\[|\{)/.test(line.slice(String(id).length+1)));assert.ok(result,`Missing action result: ${name}`);
 return JSON.parse(result.slice(String(id).length+1));
}
try {
 await db.transaction(async tx=>{
  for(const [i,p] of people.entries()) {
   await tx.insert(s.person).values({id:p.personId,email:p.email,emailVerified:true,displayName:p.name,locale:"en",accountType:i?"individual":"manager"});
   if(i<2)await tx.insert(s.authAccount).values({personId:p.personId,accountId:p.personId,providerId:"credential",password:await hashPassword(p.password)});
   await tx.insert(s.talent).values({id:p.talentId,name:p.name,vertical:"music",timeZone:"UTC"});
   await tx.insert(s.membership).values({talentId:p.talentId,personId:p.personId,role:"owner",status:"active"});
   if(i) {
    await tx.insert(s.membership).values({id:p.membershipId,talentId:p.talentId,personId:manager.personId,role:"manager",status:"invited"});
    await tx.insert(s.project).values({id:p.projectId,talentId:p.talentId,title:p.name+" work",counterparty:"Fictional Studio",type:"other",stage:"signed"});
    await tx.insert(s.project).values({talentId:p.talentId,title:p.name+" unbilled",counterparty:"Fictional Studio",type:"other",stage:"signed",quoteCurrency:"USD",quotedAmount:200});
    await tx.insert(s.calendarEvent).values([{talentId:p.talentId,projectId:p.projectId,title:"Current rehearsal",kind:"meeting",startDate:today,timeZone:"UTC"},{talentId:p.talentId,title:"Old rehearsal",kind:"meeting",startDate:"2020-01-01",timeZone:"UTC"},{talentId:p.talentId,title:"Future rehearsal",kind:"meeting",startDate:"2030-01-01",timeZone:"UTC"}]);
    await tx.insert(s.todo).values({talentId:p.talentId,projectId:p.projectId,title:"Old unpaid task",dueDate:"2020-01-01",timeZone:"UTC"});
    const receipts=[{id:"original",date:today,cash:50,withheld:10},{id:"corrected",replaces:"original",date:today,cash:30,withheld:10}];
    await tx.insert(s.payment).values([
     {talentId:p.talentId,projectId:p.projectId,label:"Partial corrected",direction:"in",currency:"USD",amount:100,taxRate:5,recordedOn:today,dueOn:today,receipts},
     {talentId:p.talentId,projectId:p.projectId,label:"Legacy short",direction:"out",currency:"USD",amount:100,recordedOn:today,dueOn:today,status:"settled",settledOn:today,settledAmount:90},
     {talentId:p.talentId,projectId:p.projectId,label:"Yen inclusive",direction:"in",currency:"JPY",amount:55,taxRate:8.875,taxIncluded:true,recordedOn:today,dueOn:today},
     {talentId:p.talentId,projectId:p.projectId,label:"Withdrawn",direction:"in",currency:"USD",amount:10,recordedOn:today,dueOn:today,receipts:[{id:"old",date:today,cash:10,withheld:0},{id:"void",replaces:"old",date:today,cash:0,withheld:0,withdrawn:true}]},
    ]);
   }
  }
  await tx.insert(s.managerEntitlement).values({personId:manager.personId,plan:"manager",artistLimit:3,active:true,source:"local_trial"});
 });
 cookies.push(await login(manager),await login(artists[0]));const [mc,ac]=cookies;
 await (await get("/manager",mc)).text();await (await get("/manager/access",ac)).text();
 ok((await get("/api/manager/workspace")).status===401,"Anonymous blocked");
 ok((await get(`/api/manager/workspace?artist=${artists[0].talentId}`,mc)).status===403,"Pending has no access");
 for(const i of [0,1]) {
  ok(await action("respondManagerInvitation",[artists[i].membershipId,true],mc)===null,"Accept in capacity");
  const data=await (await get("/api/manager/workspace",mc)).json();ok(data.artists.length===i+1,"One and two artists work immediately");
 }
 const competing=await Promise.all([2,3].map(i=>action("respondManagerInvitation",[artists[i].membershipId,true],mc)));
 ok(competing.filter(v=>v===null).length===1,"Concurrent accept cannot exceed three");
 const linked=await q`select talent_id from membership where person_id=${manager.personId} and role='manager' and status='active'`;
 ok(linked.length===3,"Exactly three active");
 for(let bits=0;bits<8;bits++) {
  const ids=linked.filter((_,i)=>bits&(1<<i)).map(r=>r.talent_id);
  const response=await get(`/api/manager/workspace?view=calendar&start=${from}&end=${end}&${selection(ids)}`,mc);
  ok(response.status===200,"Every subset accepted");const body=await response.json();
  ok(body.calendar.length===ids.length&&body.calendar.every((r:{artistId:string})=>ids.includes(r.artistId)),"Calendar is date and artist scoped");
 }
 const artist=artists[0];
 const reminders=await (await get(`/api/manager/workspace?view=reminders&artist=${artist.talentId}`,mc)).json();
 ok(reminders.calendar.some((r:{title:string})=>r.title==="Old unpaid task"),"Old open tasks retained");
 ok(!reminders.calendar.some((r:{title:string})=>r.title==="Future rehearsal"),"Future unrelated data not loaded");
 const finance=await (await get(`/api/manager/workspace?view=finance&currency=USD&artist=${artist.talentId}`,mc)).json();
 ok(finance.calendar.length===0,"Finance skips calendar collections");
 ok(finance.projects.length===1&&finance.projects[0].title.endsWith("unbilled"),"Unbilled signed project retained for finance insights");
 ok(finance.payments.every((r:{currency:string})=>r.currency==="USD"),"Currency scoped");
 ok((await get(`/api/manager/workspace?view=calendar&start=${from}&end=invalid&artist=${artist.talentId}`,mc)).status===400,"Invalid date blocked");
 // Database fixtures increase capacity, never a client toggle or production plan mutation.
 await q`update manager_entitlement set artist_limit=30 where person_id=${manager.personId}`;
 await q`update membership set status='active' where person_id=${manager.personId} and role='manager' and talent_id in ${q(artists.slice(0,30).map(a=>a.talentId))}`;
 for(const n of [10,20,30]) {
  const res=await get(`/api/manager/workspace?view=calendar&start=${from}&end=${end}&${selection(artists.slice(0,n).map(a=>a.talentId))}`,mc);
  ok(res.status===200,`${n} artists allowed`);const body=await res.json();ok(body.calendar.length===n&&!body.limited,`${n} calendar complete`);
 }
 const ids=artists.slice(0,30).map(a=>a.talentId);
 const res=await get(`/api/manager/overview?view=finance&start=${from}&end=${end}&${selection(ids)}`,mc);ok(res.status===200,"SQL finance loads");const aggregate=await res.json();
 const {inArray}=await import("drizzle-orm");
 const raw=await db.select().from(s.payment).where(inArray(s.payment.talentId,ids));
 const expected=managerFinance(raw,from,end).sort((a,b)=>`${a.artistId}:${a.currency}`.localeCompare(`${b.artistId}:${b.currency}`));
 assert.deepEqual(aggregate.finance.sort((a:{artistId:string;currency:string},b:{artistId:string;currency:string})=>`${a.artistId}:${a.currency}`.localeCompare(`${b.artistId}:${b.currency}`)),expected);checks++;
 ok(!aggregate.calendar.length&&!aggregate.messages.length,"Finance overview fetches no other tab records");
 await db.insert(s.message).values(Array.from({length:45},(_,i)=>({talentId:artist.talentId,submittedBy:artist.personId,channel:"paste" as const,receivedAt:new Date(`${today}T12:00:00.000Z`),bodyText:`Synthetic message ${i}`,dedupKey:randomUUID(),status:"confirmed" as const})));
 await q`update message set received_at=${today}::date+interval '12 hours'+interval '1 microsecond' where talent_id=${artist.talentId}`;
 let after="";const seen=new Set<string>();const sizes:number[]=[];
 do {const data=await (await get(`/api/manager/overview?view=messages&start=${from}&end=${end}&artist=${artist.talentId}${after?`&after=${encodeURIComponent(after)}`:""}`,mc)).json();sizes.push(data.messages.length);for(const msg of data.messages){ok(!seen.has(msg.id),"Cursor no duplicates");seen.add(msg.id);}ok(data.finance.length===0&&data.calendar.length===0,"Message page excludes other data");after=data.nextCursor||"";}while(after);
 assert.deepEqual(sizes,[20,20,5]);checks++;
 ok((await get(`/api/manager/workspace?artist=${artist.talentId}`,ac)).status===403,"Artist cannot impersonate manager");
 ok(await action("revokeManager",[artist.membershipId],ac)===null,"Owner revokes access");
 ok((await get(`/api/manager/workspace?artist=${artist.talentId}`,mc)).status===403,"Revocation immediately denies next read");
 ok((await get(`/api/manager/overview?view=finance&start=${from}&end=${end}&artist=${artist.talentId}`,mc)).status===403,"Revoked finance denied");
 ok((await get(`/api/manager/workspace?view=finance&artist=${artists[1].talentId}`,mc)).status===200,"Other artist unaffected");
 ok(await action("inviteManager",[manager.email],ac)===null,"Owner can invite again after revocation");
 ok((await get(`/api/manager/workspace?artist=${artist.talentId}`,mc)).status===403,"Reinvitation does not restore access until accepted");
 ok(await action("respondManagerInvitation",[artist.membershipId,true],mc)===null,"Reaccept restores access");
 ok(await action("leaveManagerArtist",[artist.talentId],mc)===null,"Manager may release one artist");
 ok((await get(`/api/manager/workspace?artist=${artist.talentId}`,mc)).status===403,"Released access denied");
 ok(await action("respondManagerInvitation",[artists[30].membershipId,false],mc)===null,"Pending invitation can be declined");
 await q`update manager_entitlement set artist_limit=3 where person_id=${manager.personId}`;
 ok((await get(`/api/manager/workspace?artist=${artists[1].talentId}`,mc)).status===400,"Downgrade cannot bypass connection allowance with subset");
 await q`update manager_entitlement set artist_limit=30,active=false where person_id=${manager.personId}`;
 ok((await get(`/api/manager/workspace?artist=${artists[1].talentId}`,mc)).status===403,"Disabled plan blocked");
 if(process.env.MANAGER_QA_KEEP==='1'){
  await q`update manager_entitlement set active=true where person_id=${manager.personId}`;
  await q`update membership set status='active' where id=${artist.membershipId}`;
  await writeFile('/private/tmp/taloox-manager-capacity-fixtures.json',JSON.stringify({people,base,run}),{mode:0o600});
 }
 passed=true;console.log(JSON.stringify({checks,capacity:[1,2,3,10,20,30],messagePages:sizes,finance:"SQL matches domain including corrections, withholding, legacy and JPY",concurrency:"only one final seat accepted",uiFixtures:process.env.MANAGER_QA_KEEP==='1'}));
} finally {
 if(!passed||process.env.MANAGER_QA_KEEP!=='1') {
  for(const cookie of cookies)await fetch(base+'/api/auth/sign-out',{method:'POST',headers:{Cookie:cookie,Origin:base}}).catch(()=>{});
  for(const p of people)await q`delete from talent where id=${p.talentId}`;
  for(const p of people)await q`delete from person where id=${p.personId}`;
 }
 await q.end();
}
process.exit(0);
