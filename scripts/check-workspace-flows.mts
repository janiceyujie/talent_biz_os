/** Local HTTP acceptance checks. Requires the existing dev server; never calls AI or remote services. */
import env from "@next/env";
import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
env.loadEnvConfig(process.cwd());
const base=process.env.WORKFLOW_TEST_URL||"http://localhost:3000";
const loopback=(url:string)=>["localhost","127.0.0.1","[::1]"].includes(new URL(url).hostname);
assert.ok(loopback(base)&&loopback(process.env.DATABASE_URL!),"Local server and database only");
assert.equal(process.env.APP_ENV,"development");
const {db}=await import("../lib/db");
const s=await import("../lib/db/schema");
const {default:postgres}=await import("postgres");
const {hashPassword}=await import("better-auth/crypto");
const q=postgres(process.env.DATABASE_URL!);
const suffix=randomBytes(6).toString("hex");
const people=Array.from({length:5},(_,i)=>({personId:randomUUID(),talentId:randomUUID(),projectId:randomUUID(),eventId:randomUUID(),name:i?`Flow Artist ${i}`:"Flow Manager",email:`workflow-${suffix}-${i}@example.invalid`,password:randomBytes(24).toString("base64url")}));
const [manager,...artists]=people;
const grantId=randomUUID();
let checks=0, createdGrantSource=false;
const cookies:string[]=[];
const ok=(value:unknown,message:string)=>{assert.ok(value,message);checks++;};
async function login(p:typeof manager){
 const r=await fetch(`${base}/api/auth/sign-in/email`,{method:"POST",headers:{"Content-Type":"application/json",Origin:base},body:JSON.stringify({email:p.email,password:p.password})});
 assert.equal(r.status,200);return r.headers.getSetCookie().map(v=>v.split(";")[0]).join(";");
}
const get=(path:string,cookie="")=>fetch(`${base}${path}`,{headers:{Cookie:cookie},redirect:"manual"});
const selection=(ids:string[])=>ids.length?ids.map(id=>`artist=${id}`).join("&"):"artist=none";
async function action(name:string,args:unknown[],cookie:string){
 // Resolve the local build's action IDs rather than hard-code framework hashes.
 const manifest=JSON.parse(await readFile(".next/dev/server/server-reference-manifest.json","utf8"));
 const entry=Object.entries(manifest.node).find(([,v])=>(v as {exportedName:string}).exportedName===name);
 assert.ok(entry,`Action not compiled: ${name}`);
 const r=await fetch(`${base}/grants`,{method:"POST",headers:{Cookie:cookie,Origin:base,"Content-Type":"text/plain;charset=UTF-8","Next-Action":entry[0]},body:JSON.stringify(args)});
 const body=await r.text();assert.equal(r.status,200,`Action ${name} status ${r.status}`);
 const root=body.split("\n").find(line=>line.startsWith("0:"));assert.ok(root,`Missing action root: ${name}`);
 const id=JSON.parse(root.slice(2)).a?.replace("$@","");
 const result=body.split("\n").findLast(line=>line.startsWith(`${id}:`) && /^(null|"|\[|\{)/.test(line.slice(String(id).length+1)));assert.ok(result,`Missing action result: ${name}`);
 return JSON.parse(result.slice(String(id).length+1));
}
try{
 await db.transaction(async tx=>{
  for(const p of people){
   await tx.insert(s.person).values({id:p.personId,email:p.email,emailVerified:true,displayName:p.name,accountType:p===manager?"manager":"individual",locale:"en"});
   await tx.insert(s.authAccount).values({personId:p.personId,accountId:p.personId,providerId:"credential",password:await hashPassword(p.password)});
   await tx.insert(s.talent).values({id:p.talentId,name:p.name,vertical:"music",timeZone:"Asia/Taipei"});
   await tx.insert(s.membership).values({talentId:p.talentId,personId:p.personId,role:"owner",status:"active"});
   await tx.insert(s.project).values({id:p.projectId,talentId:p.talentId,title:`${p.name} signed work`,counterparty:"Fixture",type:"other",stage:"signed"});
   await tx.insert(s.calendarEvent).values({id:p.eventId,talentId:p.talentId,kind:"meeting",title:`${p.name} rehearsal`,startDate:"2026-10-21",startTime:"10:00",timeZone:"Asia/Taipei"});
   await tx.insert(s.payment).values({talentId:p.talentId,label:`${p.name} fee`,direction:"in",currency:"TWD",amount:1000,recordedOn:"2026-10-12",status:"settled",settledOn:"2026-10-12",settledAmount:900});
  }
  await tx.insert(s.managerEntitlement).values({personId:manager.personId,plan:"manager",artistLimit:3,active:true,source:"local_trial"});
  for(const [i,p] of artists.entries())await tx.insert(s.membership).values({talentId:p.talentId,personId:manager.personId,role:"manager",status:i<3?"active":"invited"});
 });
 for(const p of people)cookies.push(await login(p));
 const [mc,ac,bc]=cookies;
 // Warm routes so the dev action manifest contains the real entry points.
 for(const page of ["/grants","/calendar","/settings"]){const r=await get(page,ac);ok(r.status===200,`${page} loads`);await r.text();}
 for(const path of ["/api/manager/workspace","/api/manager/projects","/api/files","/api/grants","/api/projects"])ok((await get(path)).status===401,`${path} anonymous denied`);
 for(let mask=0;mask<8;mask++){
  const ids:string[]=artists.slice(0,3).filter((_,i)=>mask&(1<<i)).map(a=>a.talentId);
  const r=await get(`/api/manager/workspace?${selection(ids)}`,mc);ok(r.status===200,"Selection accepted");ok(r.headers.get("cache-control")==="private, no-store","Private response");
  const data=await r.json();ok(JSON.stringify([...data.selectedIds].sort())===JSON.stringify([...ids].sort()),"Selected IDs exact");
  for(const key of ["calendar","payments"])ok(data[key].length===ids.length&&data[key].every((x:{artistId:string})=>ids.includes(x.artistId)),`${key} isolated`);
  ok(data.projects.length===ids.length,"Project summaries scoped");
  const page=await (await get(`/api/manager/projects?view=all&${selection(ids)}`,mc)).json();ok(page.items.length===ids.length&&page.items.every((x:{artistId:string})=>ids.includes(x.artistId)),"Projects selection exact");
 }
 const artist=artists[0];
 for(const path of ["workspace","projects"]){
  ok((await get(`/api/manager/${path}?artist=${artists[3].talentId}`,mc)).status===403,"Pending invitation cannot read");
  ok((await get(`/api/manager/${path}?artist=${artist.talentId}`,bc)).status===403,"Artist cannot read another artist");
 }
 ok((await get(`/api/manager/projects/${artist.projectId}?artist=${artist.talentId}`,mc)).status===200,"Authorized project detail");
 ok((await get(`/api/manager/projects/${artist.projectId}?artist=${artists[1].talentId}`,mc)).status===404,"Mismatched project denied");
 ok((await get(`/api/projects/${artist.projectId}`,bc)).status===404,"Personal detail isolation");
 // Fill one artist with enough projects to exercise scrolling through all pages.
 for(let i=0;i<44;i++)await q`insert into project(talent_id,title,counterparty,type,stage) values (${artist.talentId},${`Flow pagination ${String(i).padStart(2,"0")}`},'Fixture','other','signed')`;
 for(const [path,cookie] of [[`/api/projects?view=all&sort=title`,ac],[`/api/manager/projects?view=all&sort=title&artist=${artist.talentId}`,mc]]){
  const ids:string[]=[];let cursor="";let first="";const sizes:number[]=[];
  do{const r=await get(`${path}&cursor=${encodeURIComponent(cursor)}`,cookie);ok(r.status===200,"Project page succeeds");const data=await r.json();sizes.push(data.items.length);ids.push(...data.items.map((p:{id:string})=>p.id));cursor=data.nextCursor||"";first ||= cursor;}while(cursor);
  ok(JSON.stringify(sizes)==="[20,20,5]"&&new Set(ids).size===45,"Project pages 20/20/5 without duplicates");
  ok((await get(`${path}&cursor=broken`,cookie)).status===400,"Malformed project cursor rejected");
  ok((await get(`${path}&q=changed&cursor=${encodeURIComponent(first)}`,cookie)).status===400,"Changed filter cursor rejected");
  ok((await (await get(`${path}&q=Flow%20pagination%2043`,cookie)).json()).items.length===1,"Search outside first page");
 }
 // Revocation and plan checks must apply to already-established sessions.
 await q`update membership set status='revoked' where talent_id=${artist.talentId} and person_id=${manager.personId}`;
 for(const path of [`workspace?artist=${artist.talentId}`,`projects?artist=${artist.talentId}`,`projects/${artist.projectId}?artist=${artist.talentId}`])ok((await get(`/api/manager/${path}`,mc)).status===403,"Revoked access denied immediately");
 ok((await get(`/api/manager/workspace?artist=${artists[1].talentId}`,mc)).status===200,"Other artist unaffected");
 await q`update membership set status='active' where talent_id=${artist.talentId} and person_id=${manager.personId}`;
 await q`update manager_entitlement set active=false where person_id=${manager.personId}`;
 ok((await get(`/api/manager/workspace?artist=${artist.talentId}`,mc)).status===403,"Disabled plan denied");
 await q`update manager_entitlement set active=true where person_id=${manager.personId}`;
 // Real server actions, followed by PostgreSQL readback of shared records.
 const added=await q`insert into grant_source(id) values ('moc') on conflict do nothing returning id`;createdGrantSource=added.length>0;
 const source={id:"moc"};
 await q`insert into grant_opportunity(id,source,external_id,region,title,agency,url,opens_on,closes_on,source_status,content_hash) values (${grantId},${source.id},${suffix},'TW',${`Workflow acceptance ${suffix}`},'Fixture','https://example.invalid','2026-01-01','2026-11-30','posted',${suffix})`;
 ok(await action("saveGrant",[grantId,{date:"2026-10-21",time:"15:30",timeZone:"Asia/Taipei"}],ac)===null,"Grant saved with schedule");
 const [application]=await q`select id from grant_application where talent_id=${artist.talentId} and opportunity_id=${grantId}`;
 const tasks=()=>q`select t.*,t.due_date::text as due_date,gt.kind from todo t join grant_task gt on gt.todo_id=t.id where gt.application_id=${application.id}`;
 const [task]=await tasks();ok(task.due_date==="2026-10-21"&&task.due_time==="15:30:00"&&task.project_id===null,"Independent grant has one shared todo");
 await action("saveGrant",[grantId,{date:"2026-10-22",time:"16:00",timeZone:"Asia/Taipei"}],ac);
 ok((await tasks()).length===1&&(await tasks())[0].due_date==="2026-10-21","Repeated save preserves plan");
 const input={applicationId:application.id,taskId:task.id,kind:"submission",title:"Workflow submission",date:"2026-10-22",time:"16:45",timeZone:"Asia/Taipei"};
 ok(await action("updateGrantTask",[input],ac)===null,"Edit from grant succeeds");
 ok((await tasks())[0].due_time==="16:45:00","Shared todo changed");
 const calendar={id:task.id,source:"todo",kind:"todo",title:input.title,date:"2026-10-23",time:"17:00",timeZone:"Asia/Taipei",projectId:"",done:false};
 ok(await action("saveCalendarItem",[calendar],ac)===null,"Edit from Calendar succeeds");
 ok((await tasks())[0].due_date==="2026-10-23"&&(await tasks())[0].due_time==="17:00:00","Grant reads same Calendar edit");
 ok(await action("setTodoDone",[task.id,true],ac)===null,"Complete shared todo");ok((await tasks())[0].status==="done","Grant completion synchronized");
 ok(await action("setTodoDone",[task.id,false],ac)===null,"Reopen shared todo");
 for(const cookie of [bc,mc]){
  ok(await action("updateGrantTask",[{...input,date:"2026-11-01"}],cookie)!==null,"Foreign task update denied");
  ok(await action("setTodoDone",[task.id,true],cookie)!==null,"Foreign completion denied");
  ok(await action("saveCalendarItem",[{...calendar,date:"2026-11-01"}],cookie)!==null,"Foreign calendar update denied");
 }
 ok((await tasks())[0].due_date==="2026-10-23"&&(await tasks())[0].status==="open","Rejected writes leave data intact");
 ok(await action("updateGrant",[{id:application.id,stage:"preparing",projectId:artist.projectId,notes:"Fixture"}],ac)===null,"Link signed project");
 ok((await tasks())[0].project_id===artist.projectId,"Project link propagates to shared todo");
 ok(await action("updateGrant",[{id:application.id,stage:"preparing",projectId:artists[1].projectId,notes:"Fixture"}],ac)!==null,"Cross-artist project link denied");
 const request={requestId:randomUUID(),applicationId:application.id,kind:"report",title:"Workflow report",date:"2026-11-15",time:"",timeZone:"Asia/Taipei"};
 ok(await action("addGrantTask",[request],ac)===null,"Add grant deadline");await action("addGrantTask",[request],ac);ok((await tasks()).length===2,"Repeated deadline request is idempotent");
 console.log(JSON.stringify({checks,manager:"8 selections, read-only isolation, revocation, plan gate",projects:"HTTP 20/20/5 and server-side search",grants:"real save/edit/complete/link actions and unauthorized write denial"}));
}finally{
 for(const cookie of cookies)await fetch(`${base}/api/auth/sign-out`,{method:"POST",headers:{Cookie:cookie,Origin:base}}).catch(()=>{});
 for(const p of people)await q`delete from talent where id=${p.talentId}`;
 for(const p of people)await q`delete from person where id=${p.personId}`;
 await q`delete from grant_opportunity where id=${grantId}`;
 if(createdGrantSource)await q`delete from grant_source where id='moc' and not exists(select 1 from grant_opportunity where source='moc')`;
 await q.end();
}
process.exit(0);
