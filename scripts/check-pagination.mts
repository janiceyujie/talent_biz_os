import nextEnv from '@next/env';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
nextEnv.loadEnvConfig(process.cwd());
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL!).hostname));
const {default:postgres}=await import('postgres');
const q=postgres(process.env.DATABASE_URL!);
const {listFiles,fileListParams}=await import('../lib/data/files');
const {listGrantOpportunities,grantListParams}=await import('../lib/data/grant-pages');
const {listProjects}=await import('../lib/data/projects');
const {grantAvailability}=await import('../lib/grants/availability');
const {dateInZone}=await import('../lib/domain/dates');
const {PAGE_SIZE}=await import('../lib/domain/project-list');
const own=randomUUID(),other=randomUUID(),projectId=randomUUID(),tag=`pagination-${randomUUID()}`;
const grantIds:string[]=[];
let checks=0;const ok=(value:unknown)=>{assert.ok(value);checks++;};
try {
 await q`insert into talent(id,name,vertical,time_zone) values (${own},${tag},'music','Asia/Taipei'),(${other},${tag+'-other'},'music','Asia/Taipei')`;
 await q`insert into project(id,talent_id,title,counterparty,type,stage) values (${projectId},${own},${tag},'Trial','other','signed')`;
 for(let i=0;i<45;i++)await q`insert into file(talent_id,project_id,role,storage_key,content_type,filename,size_bytes,created_at) values (${own},${projectId},'upload',${tag+i},'text/plain',${`File ${String(i).padStart(2,'0')}.txt`},10,'2026-10-01T00:00:00.123456Z')`;
 await q`insert into file(talent_id,role,storage_key,content_type,filename,size_bytes) values (${other},'upload',${tag+'foreign'},'text/plain','Foreign file',10)`;
 await q`insert into file(talent_id,role,storage_key,content_type,filename,size_bytes,archived_at) values (${own},'upload',${tag+'archived'},'text/plain','Only 100%_literal.txt',10,now())`;
 let page=await listFiles(own,fileListParams.parse({}));ok(page.items.length===20&&page.total===45&&page.nextCursor);
 const firstCursor=page.nextCursor!;const ids=page.items.map(f=>f.id);
 page=await listFiles(own,fileListParams.parse({cursor:page.nextCursor}));ok(page.items.length===20&&page.total===45);ids.push(...page.items.map(f=>f.id));
 page=await listFiles(own,fileListParams.parse({cursor:page.nextCursor}));ids.push(...page.items.map(f=>f.id));ok(page.items.length===5&&!page.nextCursor&&new Set(ids).size===45);
 ok((await listFiles(other,fileListParams.parse({}))).total===1);
 ok((await listFiles(own,fileListParams.parse({project:randomUUID()}))).total===0);
 ok((await listFiles(own,fileListParams.parse({q:'File 44'}))).items.length===1);
 ok((await listFiles(own,fileListParams.parse({q:'%_',archived:'true'}))).items.length===1);
 await assert.rejects(()=>listFiles(other,fileListParams.parse({cursor:firstCursor})));checks++;
 await assert.rejects(()=>listFiles(own,fileListParams.parse({cursor:'broken'})));checks++;
 await assert.rejects(()=>listFiles(own,fileListParams.parse({cursor:firstCursor,q:'File 44'})));checks++;
 const [source]=await q`select id from grant_source order by id limit 1`;ok(source);
 for(let i=0;i<45;i++){
   const id=randomUUID();grantIds.push(id);
   await q`insert into grant_opportunity(id,source,external_id,region,title,agency,url,opens_on,closes_on,source_status,summary,content_hash,checked_at) values (${id},${source.id},${tag+i},${i%2?'US':'TW'},${tag+' '+i},'Trial Agency','https://example.invalid','2026-01-01','2099-01-01','posted','Trial summary',${tag},now())`;
   if(i<3)await q`insert into grant_application(talent_id,opportunity_id) values (${own},${id})`;
 }
 const params=grantListParams.parse({q:tag,availability:'all'});
 let grants=await listGrantOpportunities(own,'Asia/Taipei',params);ok(grants.items.length===20&&grants.total===45);const grantCursor=grants.nextCursor!;const found=grants.items.map(g=>g.id);
 grants=await listGrantOpportunities(own,'Asia/Taipei',{...params,cursor:grants.nextCursor!});ok(grants.items.length===20);found.push(...grants.items.map(g=>g.id));
 grants=await listGrantOpportunities(own,'Asia/Taipei',{...params,cursor:grants.nextCursor!});found.push(...grants.items.map(g=>g.id));ok(grants.items.length===5&&!grants.nextCursor&&new Set(found).size===45);
 ok((await listGrantOpportunities(own,'Asia/Taipei',{...params,scope:'mine'})).total===3);
 ok((await listGrantOpportunities(other,'Asia/Taipei',{...params,scope:'mine'})).total===0);
 ok((await listGrantOpportunities(own,'Asia/Taipei',{...params,region:'TW'})).total===23);
 await assert.rejects(()=>listGrantOpportunities(own,'Asia/Taipei',{...params,cursor:grantCursor,region:'TW'}));checks++;
 // Exercise the SQL implementation against the existing availability function.
 await q`update grant_opportunity set closes_on='2020-01-01' where id=${grantIds[0]}`;
 await q`update grant_opportunity set checked_at=now()-interval '2 days' where id=${grantIds[1]}`;
 await q`update grant_opportunity set opens_on='2098-01-01' where id=${grantIds[2]}`;
 for(const availability of ['open','upcoming','check','closed','active'] as const){
   const result=await listGrantOpportunities(own,'America/New_York',{...params,availability});
   ok(result.items.every(g=>availability==='active'?grantAvailability(g,dateInZone(g.region==='TW'?'Asia/Taipei':'America/New_York'))!=='closed':grantAvailability(g,dateInZone(g.region==='TW'?'Asia/Taipei':'America/New_York'))===availability));
 }
 ok(PAGE_SIZE===20);
 for(let i=0;i<44;i++)await q`insert into project(talent_id,title,counterparty,type,stage) values (${own},${tag+i},'Trial','other','signed')`;
 const projectParams={view:'all' as const,type:'all',contact:'',q:'',sort:'updated' as const,cursor:'',limit:PAGE_SIZE};
 const projects=await listProjects(own,'Trial',projectParams);ok(projects.items.length===20&&projects.total===45&&projects.nextCursor);
 // Every project sort must traverse timestamp/amount/title ties without gaps.
 for(const sort of ['due','updated','amount','title'] as const){
   const seen:string[]=[];let cursor='';
   do{const page=await listProjects(own,'Trial',{...projectParams,sort,cursor});seen.push(...page.items.map(p=>p.id));cursor=page.nextCursor||'';}while(cursor);
   ok(seen.length===45&&new Set(seen).size===45);
 }
 await assert.rejects(()=>listProjects(own,'Trial',{...projectParams,cursor:'broken'}));checks++;
 await assert.rejects(()=>listProjects(other,'Trial',{...projectParams,cursor:projects.nextCursor!}));checks++;
 await assert.rejects(()=>listProjects(own,'Trial',{...projectParams,cursor:projects.nextCursor!,q:'changed'}));checks++;
 await assert.rejects(()=>listProjects(own,'Trial',{...projectParams,cursor:projects.nextCursor!,sort:'amount'}));checks++;
 console.log(JSON.stringify({checks,files:'20 + 20 + 5; microsecond ties; filters; tenant isolation',grants:'20 + 20 + 5; scoped saved applications; availability parity',projects:'20 rows, full count 45'}));
}finally{
 await q`delete from talent where id in (${own},${other})`;
 if(grantIds.length)await q`delete from grant_opportunity where id in ${q(grantIds)}`;
 await q.end();
}
process.exit(0);
