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
 console.log(JSON.stringify({checks,paidCalls:0,realGmailCalls:0,messages:205,queue:emitted.map(e=>e.name)}));
 if(process.argv.includes("--keep-for-browser")){
   await writeFile("/private/tmp/taloox-inbox-identity.json",JSON.stringify({email,password,own,other,owner,stranger,connection,oldMessage:seen[204]}),{mode:0o600});
 }else{
   await q`delete from talent where id in (${own},${other})`;await q`delete from person where id in (${owner},${stranger})`;
 }
}catch(error){
 await q`delete from talent where id in (${own},${other})`;await q`delete from person where id in (${owner},${stranger})`;throw error;
}finally{await q.end();await (globalThis as typeof globalThis & {pgClient?:ReturnType<typeof postgres>}).pgClient?.end();}
