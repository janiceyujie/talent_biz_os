/** Isolated local fixtures; every provider and queue is injected. No real Gmail or AI calls. */
import env from "@next/env";
import assert from "node:assert/strict";
import { randomUUID,randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
env.loadEnvConfig(process.cwd());
assert.equal(process.env.APP_ENV,"development");
assert.ok(["localhost","127.0.0.1","[::1]"].includes(new URL(process.env.DATABASE_URL!).hostname));
process.env.MAIL_PIPELINE_LOCAL_ENABLED="1";
const {db}=await import("../lib/db");
const s=await import("../lib/db/schema");
const {eq,and}=await import("drizzle-orm");
const {default:postgres}=await import("postgres");
const {hashPassword}=await import("better-auth/crypto");
const {listInbox,inboxListParams,inboxDetail,inboxOverview}=await import("../lib/data/inbox");
const {listMailDecisions}=await import("../lib/data/mail");
const {reviewMail}=await import("../lib/mail/review");
const {processMailReview}=await import("../lib/mail/jobs/review");
const {workspaceSamples}=await import("../lib/ai/workspace-samples");
const q=postgres(process.env.DATABASE_URL!);
const own=randomUUID(),other=randomUUID(),owner=randomUUID(),stranger=randomUUID(),connection=randomUUID(),project=randomUUID();
const email=`mail-check-${randomUUID()}@example.invalid`,password=randomBytes(24).toString("base64url");
const ids=Array.from({length:205},()=>randomUUID());
let checks=0;
const ok=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
const emitted:{name:string;payload:unknown}[]=[];
const jobs:import("../lib/queue").Queue={async enqueue(name,payload){emitted.push({name,payload});}};
const meta=(id:string,subject="Brand collaboration")=>({id,threadId:`thread-${id}`,receivedAt:new Date("2026-10-13T12:00:00Z"),subject,from:{address:"brand@example.invalid",name:""},labels:[],snippet:"",headers:{From:"",Subject:"","List-Unsubscribe":"","List-Id":"",Precedence:"","Auto-Submitted":""}});
let bodyReads=0;
const provider:import("../lib/mail/content").MailContentProvider={async metadata(id){return meta(id);},async content(id){bodyReads++;return {metadata:meta(id),text:"Please review this synthetic offer. Nothing is agreed."};}};
const decision=async(id:string,outcome:"review"|"skipped"|"payment"="review")=>{
 const [row]=await db.insert(s.mailDecision).values({talentId:own,connectionId:connection,providerMessageId:id,providerThreadId:`thread-${id}`,receivedAt:new Date(),outcome:outcome==="skipped"?"skipped":"work",kind:outcome==="payment"?"payment":"offer",classifierVersion:"fixture"}).returning();return row;
};
const getDecision=async(id:string)=>(await db.select().from(s.mailDecision).where(eq(s.mailDecision.id,id)))[0];
try{
 await db.insert(s.person).values([{id:owner,email,emailVerified:true,displayName:"Inbox acceptance",accountType:"individual",locale:"en"},{id:stranger,email:`foreign-${email}`,emailVerified:true,displayName:"Other owner",accountType:"individual",locale:"en"}]);
 await db.insert(s.authAccount).values({personId:owner,accountId:owner,providerId:"credential",password:await hashPassword(password)});
 await db.insert(s.talent).values([{id:own,name:"Inbox acceptance",vertical:"music",timeZone:"Asia/Taipei"},{id:other,name:"Other workspace",vertical:"music",timeZone:"Asia/Taipei"}]);
 await db.insert(s.membership).values([{talentId:own,personId:owner,role:"owner",status:"active"},{talentId:other,personId:stranger,role:"owner",status:"active"},{talentId:own,personId:stranger,role:"manager",status:"active"}]);
 await db.insert(s.project).values({id:project,talentId:own,title:"Synthetic project",counterparty:"Example",type:"other",stage:"negotiating"});
 await db.insert(s.message).values(ids.map((id,i)=>({id,talentId:own,submittedBy:owner,channel:"paste" as const,bodyText:`Message ${String(i+1).padStart(3,"0")} [Sample]\n${"Body only. ".repeat(5000)}`,dedupKey:id,status:"error" as const,receivedAt:new Date("2026-10-12T12:00:00Z")})));
 await q`update message set received_at='2026-10-12T12:00:00.123456Z' where talent_id=${own}`;
 const analysis=workspaceSamples({talent:{id:own},person:{},preferences:{}} as never).inbox[0].analysis!;
 await db.update(s.message).set({status:"analyzed"}).where(eq(s.message.id,ids[0]));
 await db.insert(s.messageAnalysis).values({messageId:ids[0],talentId:own,intent:analysis.intent,analysis,confidence:analysis.confidence,modelVersion:"fixture",promptVersion:"fixture"});
 await db.update(s.message).set({status:"confirmed",projectId:project}).where(eq(s.message.id,ids[1]));
 await db.insert(s.messageAnalysis).values({messageId:ids[1],talentId:own,intent:analysis.intent,analysis,confidence:analysis.confidence,modelVersion:"fixture",promptVersion:"fixture"});
 const [foreign]=await db.insert(s.message).values({talentId:other,submittedBy:stranger,channel:"paste",bodyText:"Foreign secret",dedupKey:"foreign",status:"error",receivedAt:new Date()}).returning();
 let page=await listInbox(own,inboxListParams.parse({}));
 ok(page.items.length===20&&page.total===205,"First page is 20 with full count");
 ok(JSON.stringify(page).length<15000&&!JSON.stringify(page).includes("Body only. Body only. Body only. Body only. Body only. Body only. Body only. Body only. Body only. Body only. Body only. Body only."),"List contains bounded summaries only");
 const cursor=page.nextCursor!,seen=page.items.map(m=>m.id);
 while(page.nextCursor){page=await listInbox(own,inboxListParams.parse({cursor:page.nextCursor}));seen.push(...page.items.map(m=>m.id));}
 ok(seen.length===205&&new Set(seen).size===205,"All messages beyond 200 reachable across microsecond ties");
 ok((await inboxDetail(own,seen[204]))?.body.includes("Body only."),"Old message full body available");
 ok(await inboxDetail(own,foreign.id)===null,"Foreign detail inaccessible");
 ok((await inboxDetail(own,ids[0]))?.filed?.length===1,"Existing project matching context preserved");
 const stats=await inboxOverview(own);ok(stats.counts.error===203&&stats.counts.analyzed===1&&stats.counts.confirmed===1,"Exact status counts");ok(!!stats.latestActivity[project],"Project activity includes all messages");
 // History stays separately paged and cannot reuse an active-list cursor.
 const historyIds=ids.slice(3,28);
 await q`update message set status='history' where id=any(${historyIds}::uuid[])`;
 const historyPage=await listInbox(own,inboxListParams.parse({history:"true"}));
 ok(historyPage.items.length===20&&historyPage.total===25&&!!historyPage.nextCursor,"History first page is bounded");
 const historyNext=await listInbox(own,inboxListParams.parse({history:"true",cursor:historyPage.nextCursor}));
 ok(historyNext.items.length===5&&!historyNext.nextCursor,"History continuation contains the remaining rows");
 ok(new Set([...historyPage.items,...historyNext.items].map(m=>m.id)).size===25,"History pagination has no duplicates");
 ok((await listInbox(own,inboxListParams.parse({}))).total===180,"History is excluded from the active list");
 ok((await inboxOverview(own)).counts.history===25,"History counter matches the separate list");
 ok((await listInbox(other,inboxListParams.parse({history:"true"}))).total===0,"History is workspace scoped");
 await assert.rejects(()=>listInbox(own,inboxListParams.parse({history:"true",cursor})));checks++;
 await q`update message set status='error' where id=any(${historyIds}::uuid[])`;
 for(const params of [{cursor:"broken"},{cursor,dismissed:"true"}]){await assert.rejects(()=>listInbox(own,inboxListParams.parse(params)));checks++;}
 await assert.rejects(()=>listInbox(other,inboxListParams.parse({cursor})));checks++;
 await db.update(s.message).set({status:"dismissed"}).where(eq(s.message.id,ids[2]));
 ok((await listInbox(own,inboxListParams.parse({}))).total===204,"Dismissed excluded server-side");ok((await listInbox(own,inboxListParams.parse({dismissed:"true"}))).total===205,"Dismissed inclusion exact");
 await db.insert(s.mailConnection).values({id:connection,talentId:own,connectedBy:owner,accountEmail:"synthetic@example.invalid",accountSubject:"synthetic",scopes:"synthetic",refreshTokenCiphertext:"synthetic",refreshTokenNonce:"synthetic",refreshTokenTag:"synthetic",dataKeyWrapped:"synthetic",keyId:"synthetic",historyMode:"new_only"});
 const d=await decision("offer");
 ok(await reviewMail(own,stranger,d.id,"import",jobs)==="unavailable","Manager cannot approve owner mail");
 ok(await reviewMail(other,stranger,d.id,"import",jobs)==="unavailable","Cross-workspace approval rejected");
 ok(await reviewMail(own,owner,d.id,"import",jobs)===null,"Owner can request import");
 await processMailReview(d.id,"import",provider,jobs);await processMailReview(d.id,"import",provider,jobs);
 const imported=await getDecision(d.id);ok(imported.importStatus==="imported"&&imported.messageId,"Import linked atomically");
 ok(bodyReads===1&&emitted.filter(e=>e.name==="message.analyze").length===1,"Retry does not read body or analyze twice");
 ok((await inboxDetail(own,imported.messageId!))?.channel==="gmail","Existing inbox receives imported mail");
 const recover=await decision("recover","skipped");
 ok(await reviewMail(own,owner,recover.id,"import",jobs)==="review_required","Skipped mail requires restore first");
 await reviewMail(own,owner,recover.id,"restore",jobs);
 ok((await getDecision(recover.id)).outcome==="unsure"&&bodyReads===1,"Restore keeps reference only and never reads body");
 await reviewMail(own,owner,recover.id,"skip",jobs);ok((await getDecision(recover.id)).outcome==="skipped","Not work stores only the decision");
 const pay=await decision("payment","payment");ok(await reviewMail(own,owner,pay.id,"import",jobs)==="review_required","Payment cannot import");
 const changed=await decision("changed");await reviewMail(own,owner,changed.id,"import",jobs);
 await processMailReview(changed.id,"import",{...provider,async metadata(id){return meta(id,"Invoice for October");}},jobs);
 ok((await getDecision(changed.id)).importFailure==="review_required"&&bodyReads===1,"Fresh payment metadata blocks body fetch");
 const cancelled=await decision("cancelled");await reviewMail(own,owner,cancelled.id,"import",jobs);
 await processMailReview(cancelled.id,"import",{...provider,async content(id){await reviewMail(own,owner,cancelled.id,"skip",jobs);return {metadata:meta(id),text:"Must not persist after cancellation"};}},jobs);
 ok((await getDecision(cancelled.id)).outcome==="skipped"&&!(await getDecision(cancelled.id)).messageId,"In-flight cancellation prevents import");
 const failed=await decision("failed");await reviewMail(own,owner,failed.id,"import",jobs);
 await assert.rejects(()=>processMailReview(failed.id,"import",{...provider,async content(){throw new Error("Private provider body must not be stored");}},jobs));checks++;
 ok((await getDecision(failed.id)).importFailure==="import_failed","Failure persists code only");
 await reviewMail(own,owner,failed.id,"import",jobs);await processMailReview(failed.id,"import",provider,jobs);ok((await getDecision(failed.id)).importStatus==="imported","Manual retry recovers");
 for(let i=0;i<40;i++)await decision(`page-${i}`);
 const reviews=await listMailDecisions(own,"waiting",0);ok(reviews.items.length===30&&reviews.more,"Canonical Gmail pagination bounded at 30");
 ok((await listMailDecisions(other,"waiting",0)).items.length===0,"Foreign workspace cannot read decisions");
 const revoked=await decision("revoked");await reviewMail(own,owner,revoked.id,"import",jobs);
 await db.update(s.membership).set({status:"revoked"}).where(and(eq(s.membership.talentId,own),eq(s.membership.personId,owner)));
 const before=bodyReads;await processMailReview(revoked.id,"import",provider,jobs);ok(bodyReads===before&&!(await getDecision(revoked.id)).messageId,"Revoked owner stops work");
 await db.update(s.membership).set({status:"active"}).where(and(eq(s.membership.talentId,own),eq(s.membership.personId,owner)));
 // Verify HTTP authentication, full-list access, old deep links and private cache headers.
 const base=process.env.TEST_BASE_URL || "http://localhost:3000";
 const login=await fetch(`${base}/api/auth/sign-in/email`,{method:"POST",headers:{"Content-Type":"application/json",Origin:base},body:JSON.stringify({email,password})});
 ok(login.status===200,"Fixture sign-in");const cookie=login.headers.getSetCookie().map(v=>v.split(";")[0]).join(";");
 const get=(path:string,authenticated=true)=>fetch(`${base}${path}`,{headers:authenticated?{Cookie:cookie}:{},redirect:"manual"});
 const signedInRedirect=await get("/sign-in");
 ok(signedInRedirect.status===307&&signedInRedirect.headers.get("location")==="/","Verified session redirects to home");
 ok((await get("/api/inbox",false)).status===401,"Anonymous list denied");
 const response=await get("/api/inbox?dismissed=false");ok(response.status===200&&response.headers.get("cache-control")?.includes("no-store"),"Private HTTP list");ok((await response.json()).items.length===20,"HTTP page bounded");
 ok((await get(`/api/inbox/${seen[204]}`)).status===200,"HTTP old detail");ok((await get(`/api/inbox/${foreign.id}`)).status===404,"HTTP foreign detail denied");ok((await get("/api/inbox?cursor=broken")).status===400,"HTTP invalid cursor");
 ok((await get("/inbox")).status===200,"Inbox page renders");
 // Janice's thread metadata must survive our paged inbox (layout inbox is empty).
 const threadIds=[randomUUID(),randomUUID(),randomUUID()];
 for(let i=0;i<3;i++){
  await db.insert(s.message).values({id:threadIds[i],talentId:own,submittedBy:owner,channel:"gmail",connectionId:connection,externalRef:`thread-${i}`,providerThreadId:"qa-thread",sender:"Brand <brand@example.invalid>",direction:i===2?"sent":"received",bodyText:"Synthetic logistics only",dedupKey:threadIds[i],status:i===0?"confirmed":"analyzed",projectId:i===0?project:null,receivedAt:new Date(`2026-10-14T1${i}:00:00Z`)});
  const a={...analysis,intent:"logistics" as const,projectType:"other" as const,money:{amount:null,currency:"",taxIncluded:null,asStated:""},counterparty:{name:"",company:"",email:"",phone:""}};
  await db.insert(s.messageAnalysis).values({messageId:threadIds[i],talentId:own,intent:a.intent,analysis:a,confidence:a.confidence,modelVersion:"fixture",promptVersion:"fixture"});
 }
 const thread=await inboxDetail(own,threadIds[1]);
 ok(thread?.threadContext?.projectId===project&&thread.threadContext.replied,"Paged detail finds earlier filed project and later own reply");
 ok(thread?.threadContext?.waitingIds.includes(threadIds[2]),"Thread batch includes waiting reply outside page");
 const ownReply=await inboxDetail(own,threadIds[2]);ok(ownReply?.gmail?.sent,"Own sent reply remains distinct");
 const [doneReply]=await db.insert(s.todo).values({talentId:own,projectId:project,title:"Thread reply task",type:"reply",timeZone:"UTC",status:"done",completedAt:new Date(),completedByMessageId:threadIds[2]}).returning();
 ok((await inboxDetail(own,threadIds[2]))?.completedTodos?.some(t=>t.id===doneReply.id),"Completed reply task visible on its message");
 async function threadAction(name:string,args:unknown[]){
  const {readFile}=await import("node:fs/promises");const manifest=JSON.parse(await readFile(".next/dev/server/server-reference-manifest.json","utf8"));
  const entry=Object.entries(manifest.node).find(([,v])=>(v as {exportedName:string}).exportedName===name);assert.ok(entry);
  const r=await fetch(`${base}/inbox`,{method:"POST",headers:{Cookie:cookie,Origin:base,"Content-Type":"text/plain;charset=UTF-8","Next-Action":entry[0]},body:JSON.stringify(args)});assert.equal(r.status,200);const lines=(await r.text()).split("\n"),root=lines.find(l=>l.startsWith("0:"))!;const id=JSON.parse(root.slice(2)).a?.replace("$@","");const result=lines.findLast(l=>l.startsWith(`${id}:`)&&/^(null|"|\[|\{)/.test(l.slice(String(id).length+1)));assert.ok(result);return JSON.parse(result.slice(String(id).length+1));
 }
 ok(await threadAction("reopenReplies",[threadIds[2]])===null,"Undo opens only the reply's completed tasks");
 ok(!(await inboxDetail(own,threadIds[2]))?.completedTodos?.length,"Completed list refreshes after undo");
 const batch=await threadAction("fileThread",[{messageIds:threadIds.slice(1),projectId:project}]);
 ok(batch.left===0,"Batch files waiting thread with fresh paged context");
 const filedThread=await q`select id,status,project_id from message where id in (${threadIds[1]},${threadIds[2]})`;
 ok(filedThread.every(m=>m.status==="confirmed"&&m.project_id===project),"Both thread messages filed on intended project");
 const paymentNotice=randomUUID();await db.insert(s.message).values({id:paymentNotice,talentId:own,submittedBy:owner,channel:"gmail",connectionId:connection,externalRef:"bank-qa",dedupKey:paymentNotice,status:"analyzed",kind:"payment_notice",notice:{amount:400,currency:"TWD",date:null,payer:null,last4:null},receivedAt:new Date()});
 const noticeList=await listInbox(own,inboxListParams.parse({}));ok(noticeList.items.some(m=>m.id===paymentNotice&&m.notice?.amount===400),"Paged summaries expose notice fields without a body");
 ok((await inboxDetail(own,paymentNotice))?.body==="","Restricted notice has no stored body");

 console.log(JSON.stringify({checks,paidCalls:0,realGmailCalls:0,messages:205,queue:emitted.map(e=>e.name)}));
 if(process.argv.includes("--keep-for-browser")){
   await writeFile("/private/tmp/taloox-inbox-identity.json",JSON.stringify({email,password,own,other,owner,stranger,connection,oldMessage:seen[204]}),{mode:0o600});
 }else{
   await q`delete from talent where id in (${own},${other})`;await q`delete from person where id in (${owner},${stranger})`;
 }
}catch(error){
 await q`delete from talent where id in (${own},${other})`;await q`delete from person where id in (${owner},${stranger})`;throw error;
}finally{await q.end();await (globalThis as typeof globalThis & {pgClient?:ReturnType<typeof postgres>}).pgClient?.end();}
