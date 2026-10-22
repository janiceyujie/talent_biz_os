/** Local-only checks with disposable identities, no real mail, application or payment. */
import env from '@next/env';
import type { CursorPage } from '../lib/domain/cursor-page';
import type { GrantOpportunity } from '../lib/grants/types';
import type { EligibilityProfile } from '../lib/grants/eligibility';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile,writeFile,unlink} from 'node:fs/promises';
env.loadEnvConfig(process.cwd());
const url=new URL(process.env.DATABASE_URL!);
assert.equal(url.hostname,'127.0.0.1');assert.match(url.pathname,/^\/taloox_((integrated|refresh|merged)_\d{8}|int_20261022_(fresh|upgrade))$/);assert.equal(process.env.APP_ENV,'development');
const {default:postgres}=await import('postgres'),q=postgres(process.env.DATABASE_URL!);
const base=process.env.WORKFLOW_TEST_URL||'http://localhost:3000';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const fixture='/tmp/taloox-opportunities-qa.json';
async function cleanup(state:{actors:{personId:string;talentId:string}[];source:string}){
 for(const a of state.actors){await q`delete from talent where id=${a.talentId}`;await q`delete from person where id=${a.personId}`;}
 await q`delete from grant_opportunity where source=${state.source}`;await q`delete from grant_source where id=${state.source}`;
}
if(process.argv.includes('--cleanup')){await cleanup(JSON.parse(await readFile(fixture,'utf8')));await unlink(fixture);console.log('Disposable opportunity QA data removed.');await q.end();process.exit(0);}
const {hashPassword}=await import('better-auth/crypto');
const {assessEligibility}=await import('../lib/grants/eligibility');
const actors=Array.from({length:2},()=>({personId:randomUUID(),talentId:randomUUID(),email:`opportunity-qa-${randomUUID()}@example.invalid`,password:randomBytes(18).toString('hex')}));
const source='qa-opportunities-'+randomUUID(),cookies:string[]=[];
let checks=0,keep=false;
const ok=(condition:unknown)=>{assert.ok(condition);checks++;};
async function action(name:string,args:unknown[],cookie=cookies[0]){
 const manifest=JSON.parse(await readFile('.next/dev/server/server-reference-manifest.json','utf8'));
 const entry=Object.entries(manifest.node).find(([,v])=>(v as {exportedName:string}).exportedName===name);assert.ok(entry,`Action missing: ${name}`);
 const response=await fetch(`${base}/grants`,{method:'POST',headers:{Cookie:cookie,Origin:base,'Content-Type':'text/plain;charset=UTF-8','Next-Action':entry[0]},body:JSON.stringify(args)});
 const body=await response.text();assert.equal(response.status,200);
 const root=body.split('\n').find(line=>line.startsWith('0:'));assert.ok(root);const id=JSON.parse(root.slice(2)).a?.replace('$@','');
 const result=body.split('\n').findLast(line=>line.startsWith(`${id}:`)&&/^(null|"|\[|\{)/.test(line.slice(String(id).length+1)));
 assert.ok(result,`Action result missing: ${name}`);return JSON.parse(result.slice(String(id).length+1));
}
const today=new Date().toISOString().slice(0,10),tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10),later=new Date(Date.now()+86400000*3).toISOString().slice(0,10);
try {
 for(const a of actors){
  await q`insert into person(id,email,email_verified,display_name,locale) values(${a.personId},${a.email},true,'Opportunity QA','zh-TW')`;
  await q`insert into auth_account(person_id,account_id,provider_id,password) values(${a.personId},${a.personId},'credential',${await hashPassword(a.password)})`;
  await q`insert into talent(id,name,vertical,time_zone) values(${a.talentId},'Opportunity QA','music','Asia/Taipei')`;
  await q`insert into membership(person_id,talent_id,role,status) values(${a.personId},${a.talentId},'owner','active')`;
  const res=await fetch(`${base}/api/auth/sign-in/email`,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({email:a.email,password:a.password})});ok(res.status===200);
  cookies.push(res.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '));
 }
 ok((await fetch(`${base}/grants`,{headers:{Cookie:cookies[0]}})).status===200);
 const profile={version:1,applicantType:'individual',country:'TW'};
 ok(await action('savePreference',['opportunities.profile',profile])===null);
 ok(await action('savePreference',['opportunities.profile',{...profile,applicantType:'invented'}])!==null);
 const rule={version:1,applicantTypes:['nonprofit'],countries:['US'],evidenceUrl:'https://example.invalid/qa-rules',verifiedOn:today,validThrough:later,notes:{en:'Synthetic criteria, not a real opportunity.','zh-TW':'測試用資格，非真實機會。'}};
 await q`insert into grant_source(id) values(${source})`;
 const ids:string[]=[];
 for(let i=0;i<28;i++){
  const id=randomUUID();ids.push(id);
  const eligibility=i===25?{...rule,applicantTypes:['individual'],countries:['TW']}:i===26?null:i===27?{...rule,validThrough:'2000-01-01'}:rule;
  await q`insert into grant_opportunity(id,source,external_id,region,title,agency,url,opens_on,closes_on,source_status,summary,content_hash,kind,eligibility) values(${id},${source},${String(i)},'TW',${`Opportunity QA ${source} ${String(i).padStart(2,'0')}`},'QA','https://example.invalid/qa',${today},${later},'posted','Synthetic fixture','qa','grant',${eligibility===null?null:q.json(eligibility)})`;
 }
 const get=async(params:Record<string,string>,cookie=cookies[0])=>{const res=await fetch(`${base}/api/grants?${new URLSearchParams(params)}`,{headers:{Cookie:cookie}});ok(res.status===200);return await res.json() as CursorPage<GrantOpportunity>;};
 const filters={q:source,kind:'grant',availability:'all'};
 const first=await get(filters);ok(first.items.length===20&&first.total===28&&first.nextCursor);
 assert.ok(first.nextCursor);
 const second=await get({...filters,cursor:first.nextCursor});ok(second.items.length===8&&second.nextCursor===null);ok(new Set([...first.items,...second.items].map(r=>r.id)).size===28);
 const match=await get({...filters,eligibility:'match'});ok(match.total===1&&match.items[0].id===ids[25]);
 const possible=await get({...filters,eligibility:'possible'});ok(possible.total===3);ok(possible.items.some(r=>r.id===ids[26])&&possible.items.some(r=>r.id===ids[27]));
 const mismatch=await get({...filters,eligibility:'mismatch'});ok(mismatch.total===25);
 for(const status of ['match','check','mismatch']){const page=await get({...filters,eligibility:status});for(const row of page.items){ok(assessEligibility(row.eligibility,profile as EligibilityProfile,today).status===status);}}
 const other=await get({...filters,eligibility:'mismatch'},cookies[1]);ok(other.total===0);
 ok((await fetch(`${base}/api/grants?${new URLSearchParams({...filters,cursor:first.nextCursor,eligibility:'match'})}`,{headers:{Cookie:cookies[0]}})).status===400);
 ok((await fetch(`${base}/api/grants?kind=invalid`,{headers:{Cookie:cookies[0]}})).status===400);
 ok((await fetch(`${base}/api/grants`)).status===401);
 const opportunityIds:string[]=[];
 for(const kind of ['competition','exhibition','showcase']){const id=randomUUID();opportunityIds.push(id);await q`insert into grant_opportunity(id,source,external_id,region,title,agency,url,opens_on,closes_on,source_status,summary,content_hash,kind) values(${id},${source},${kind},'TW',${source+' '+kind},'QA','https://example.invalid/qa',${today},${later},'posted','Synthetic fixture','qa',${kind})`;}
 const catalogue=await get({kind:'opportunities',region:'all',q:source});ok(catalogue.items.some(r=>r.kind==='competition')&&catalogue.items.some(r=>r.kind==='exhibition')&&catalogue.items.some(r=>r.kind==='showcase'));
 const target={id:opportunityIds[2]};
 const schedule={date:tomorrow,time:'14:00',timeZone:'Asia/Taipei'};
 ok(await action('saveGrant',[target.id,schedule])===null);ok(await action('saveGrant',[target.id,schedule])===null);
 const [app]=await q`select * from grant_application where talent_id=${actors[0].talentId} and opportunity_id=${target.id}`;
 const linked=await q`select t.*, t.due_date::text as due_date from todo t join grant_task gt on gt.todo_id=t.id where gt.application_id=${app.id}`;ok(linked.length===1);ok(linked[0].due_date===tomorrow&&linked[0].time_zone==='Asia/Taipei');ok(app.project_id===null);
 const mine=await get({scope:'mine'});ok(mine.total===1&&mine.items[0].id===target.id);ok((await get({scope:'mine'},cookies[1])).total===0);
 ok(await action('updateGrant',[{id:app.id,stage:'submitted',projectId:'',notes:'QA only'}],cookies[1])!==null);
 const task={applicationId:app.id,taskId:linked[0].id,kind:'submission',title:'QA showcase submission',date:later,time:'10:30',timeZone:'America/New_York'};
 ok(await action('updateGrantTask',[task],cookies[1])!==null);ok(await action('updateGrantTask',[task])===null);
 const [updated]=await q`select *, due_date::text as due_date from todo where id=${linked[0].id}`;ok(updated.due_date===later&&updated.due_time==='10:30:00'&&updated.time_zone==='America/New_York');
 ok(await action('setTodoDone',[linked[0].id,true])===null);ok((await q`select status from todo where id=${linked[0].id}`)[0].status==='done');
 ok(await action('setTodoDone',[linked[0].id,false])===null);ok((await q`select status from todo where id=${linked[0].id}`)[0].status==='open');
 const extra={requestId:randomUUID(),applicationId:app.id,kind:'eligibility',title:'QA review official criteria',date:tomorrow,time:'',timeZone:'Asia/Taipei'};
 ok(await action('addGrantTask',[extra])===null);ok(await action('addGrantTask',[extra])===null);
 ok((await q`select id from grant_task where application_id=${app.id}`).length===2);
 ok((await q`select id from project where talent_id=${actors[0].talentId}`).length===0);
 ok(await action('updateGrant',[{id:app.id,stage:'submitted',projectId:'',notes:'QA only'}])===null);
 const calendar=await fetch(`${base}/calendar?date=${later}`,{headers:{Cookie:cookies[0]}});ok(calendar.status===200);ok((await calendar.text()).includes('QA showcase submission'));
 if(process.argv.includes('--keep')){await writeFile(fixture,JSON.stringify({actors,source,applicationId:app.id}),{mode:0o600});keep=true;}
 console.log(`${checks} opportunity acceptance checks passed: database pagination, profile isolation, eligibility, save/schedule, idempotency, ownership and calendar. No mail or external application submitted.`);
} finally {if(!keep)await cleanup({actors,source});await q.end();}
