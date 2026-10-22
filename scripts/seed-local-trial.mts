// Explicit, additive, idempotent local trial import. Never overwrite a user's edits.
import nextEnv from "@next/env";
import { and, eq, sql } from "drizzle-orm";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { z } from "zod";
import { assertLocalTemplateStore } from "../lib/templates/local-store";
import { addDateDays } from "../lib/calendar/input";
import { trialFixtures, TRIAL_VERSION } from "../lib/local-trial/fixtures";
nextEnv.loadEnvConfig(process.cwd());
assertLocalTemplateStore(process.env.DATABASE_URL,process.env.STORAGE_S3_ENDPOINT);
if(process.env.APP_ENV!=="development" || process.env.NODE_ENV==="production") throw new Error("Development environment required");
const args=process.argv.slice(2),arg=(key:string)=>args[args.indexOf(key)+1];
const talentId=z.uuid().parse(arg("--talent")),startMonth=z.string().regex(/^\d{4}-\d{2}$/).parse(arg("--month"));
const {db}=await import("../lib/db"),s=await import("../lib/db/schema"),storage=await import("../lib/storage");
try {
 const owners=await db.select({personId:s.person.id,name:s.person.displayName,timeZone:s.talent.timeZone}).from(s.membership).innerJoin(s.person,eq(s.person.id,s.membership.personId)).innerJoin(s.talent,eq(s.talent.id,s.membership.talentId)).where(and(eq(s.membership.talentId,talentId),eq(s.membership.status,"active"),eq(s.membership.role,"owner")));
 if(owners.length!==1) throw new Error("Select a local workspace with exactly one active owner");
 const fixture=trialFixtures(talentId,owners[0].personId,startMonth,owners[0].timeZone);
 const files:(typeof s.file.$inferInsert)[]=[];
 const fileCandidates=[
  {key:"performance-word",project:"festival",asset:"taloox-booking-contract-zh-TW.docx",name:"範例｜演出合約可編輯範本.docx",category:"contract" as const},
  {key:"brand-word",project:"brand",asset:"taloox-brand-contract-zh-TW.docx",name:"範例｜品牌合作合約可編輯範本.docx",category:"contract" as const},
  {key:"video-word",project:"video",asset:"taloox-video-contract-zh-TW.docx",name:"範例｜影片製作合約可編輯範本.docx",category:"contract" as const},
  {key:"quote-word",project:"model",asset:"taloox-model-quote-zh-TW.docx",name:"範例｜形象拍攝報價範本.docx",category:"other" as const},
 ];
 const addFile=async(key:string,project:string|null,name:string,bytes:Buffer,type:string,category:typeof s.file.$inferInsert.category,messageId?:string)=>{
  const fileId=fixture.id(`file-${key}`),hash=createHash("sha256").update(bytes).digest("hex");
  const storageKey=`files/${talentId}/${fileId}/${hash}`;
  const head=await storage.stat(storageKey);if(!head||head.size!==bytes.length)await storage.writeBytes(storageKey,bytes,type);
  const stored=await storage.readBytes(storageKey);if(!stored.equals(bytes))throw new Error("Storage read-back mismatch");
  files.push({id:fileId,talentId,projectId:project?fixture.id(`project-${project}`):null,messageId,position:messageId?0:null,role:messageId?"attachment":"upload",category,storageKey,contentType:type,filename:name,sizeBytes:bytes.length,createdAt:new Date(`${startMonth}-10T04:00:00Z`)});
 };
 for(const candidate of fileCandidates)await addFile(candidate.key,candidate.project,candidate.name,await readFile(new URL(`../assets/document-templates/${candidate.asset}`,import.meta.url)),"application/vnd.openxmlformats-officedocument.wordprocessingml.document",candidate.category);
 await addFile("budget-csv","workshop","範例｜工作坊經費明細.csv",Buffer.from('\uFEFFItem,Currency,Amount,Status\nWorkshop fee,TWD,75000,Expected\nMaterials,TWD,9000,Expected\nVenue,TWD,6000,Expected\nSynthetic local trial only,,,\n'),"text/csv","invoice");
 await addFile("rider","festival","範例｜演出技術需求.txt",Buffer.from("LOCAL TRIAL ONLY\nSet length: 45 minutes\nSoundcheck: 16:00\nInputs: 2 vocal microphones, stereo playback\nBackline and transport: confirm with organiser\n"),"text/plain","asset");
 await addFile("storyboard","video","範例｜分鏡與交件清單.txt",Buffer.from("LOCAL TRIAL ONLY\n60-second main film and 3 vertical edits\nDraft script, storyboard, first cut, final delivery\nTwo revision rounds; paid-ad use quoted separately\n"),"text/plain","asset");
 await addFile("mail-attachment","brand","範例｜品牌合作條件.txt",Buffer.from("LOCAL TRIAL ONLY\nOne Reel and three Stories\nFee: TWD 96,000 before tax\n90 days organic use; paid ads require a separate agreement\n"),"text/plain","other",fixture.id("message-brand"));
 const inserted:Record<string,number>={};
 const manifest=await db.transaction(async tx=>{
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${TRIAL_VERSION}:${talentId}:${startMonth}`}))`);
  const insert=async<T extends Parameters<typeof tx.insert>[0]>(name:string,table:T,rows:unknown[])=>{
   if(!rows.length)return;const result=await tx.insert(table).values(rows as never).onConflictDoNothing().returning();inserted[name]=result.length;
  };
  await insert("organizations",s.organization,fixture.organizations);await insert("contacts",s.contact,fixture.contacts);await insert("projects",s.project,fixture.projects);await insert("projectOrganizations",s.projectOrganization,fixture.projectOrganizations);await insert("projectContacts",s.projectContact,fixture.projectContacts);await insert("payments",s.payment,fixture.payments);await insert("receipts",s.paymentReceipt,fixture.receipts);await insert("events",s.calendarEvent,fixture.events);await insert("todos",s.todo,fixture.todos);await insert("contracts",s.contract,fixture.contracts);await insert("messages",s.message,fixture.messages);await insert("analyses",s.messageAnalysis,fixture.analyses);await insert("templates",s.replyTemplate,fixture.templates);await insert("files",s.file,files);
  // Official listings stay official. Only the tenant's preparation records are fixtures.
  const [previous]=await tx.select({details:s.auditLog.details}).from(s.auditLog).where(and(eq(s.auditLog.id,fixture.id("audit-seed")),eq(s.auditLog.talentId,talentId)));
  const prior=previous?.details?.ids as Record<string,string[]>|undefined;
  const baseTodoIds=new Set(fixture.todos.map(t=>t.id));
  const opportunities=previous?[]:await tx.select().from(s.grantOpportunity).where(eq(s.grantOpportunity.region,"TW")).limit(2);
  const grantApplicationIds:string[]=[...(prior?.grantApplications||[])],grantTaskIds:string[]=[...(prior?.grantTasks||[])],grantTodoIds:string[]=(prior?.todos||[]).filter(id=>!baseTodoIds.has(id));
  for(const [index,o]of opportunities.entries()){
   const appId=fixture.id(`grant-application-${index}`);await tx.insert(s.grantApplication).values({id:appId,talentId,opportunityId:o.id,stage:"preparing",notes:fixture.note}).onConflictDoNothing();
   const [app]=await tx.select().from(s.grantApplication).where(and(eq(s.grantApplication.talentId,talentId),eq(s.grantApplication.opportunityId,o.id)));
   // An existing application belongs to the user, so don't change it or add synthetic tasks to it.
   if(app.id!==appId)continue;grantApplicationIds.push(appId);
   for(const [step,kind]of (["eligibility","proposal","budget","submission"] as const).entries()){
    const todoId=fixture.id(`grant-todo-${index}-${kind}`),taskId=fixture.id(`grant-task-${index}-${kind}`);
    const due=o.closesOn?addDateDays(o.closesOn,-(3-step)*3):fixture.date(index as 0|1,15+step*3);
    await tx.insert(s.todo).values({id:todoId,talentId,type:"custom",title:`範例｜${["確認補助資格與文件","準備補助計畫書","整理預算及憑證","補助送件提醒"][step]} · ${o.title}`,dueDate:due,dueTime:"10:30",timeZone:"Asia/Taipei",status:"open",notes:`${fixture.note}\n${o.url}\nThese dates are trial reminders; verify the official cutoff.`}).onConflictDoNothing();
    await tx.insert(s.grantTask).values({id:taskId,applicationId:appId,todoId,kind}).onConflictDoNothing();grantTaskIds.push(taskId);grantTodoIds.push(todoId);
   }
  }
  const ids={organizations:fixture.organizations.map(r=>r.id!),contacts:fixture.contacts.map(r=>r.id!),projects:fixture.projects.map(r=>r.id!),payments:fixture.payments.map(r=>r.id!),events:fixture.events.map(r=>r.id!),todos:[...fixture.todos.map(r=>r.id!),...grantTodoIds],contracts:fixture.contracts.map(r=>r.id!),messages:fixture.messages.map(r=>r.id!),analyses:fixture.analyses.map(r=>r.id!),templates:fixture.templates.map(r=>r.id!),files:files.map(r=>r.id!),grantApplications:grantApplicationIds,grantTasks:grantTaskIds};
  await tx.insert(s.auditLog).values({id:fixture.id("audit-seed"),talentId,actorPersonId:owners[0].personId,action:"local_trial.seeded",targetType:"talent",targetId:talentId,details:{version:TRIAL_VERSION,startMonth,secondMonth:fixture.secondMonth,ids}}).onConflictDoNothing();
  return {version:TRIAL_VERSION,talentId,startMonth,secondMonth:fixture.secondMonth,ids,storageKeys:files.map(f=>f.storageKey)};
 });
 await mkdir(new URL("../.local-trial/",import.meta.url),{recursive:true});await writeFile(new URL(`../.local-trial/${talentId}-${startMonth}.json`,import.meta.url),JSON.stringify(manifest,null,2),{mode:0o600});
 console.log(JSON.stringify({localTrialReady:true,startMonth,secondMonth:fixture.secondMonth,inserted,totals:Object.fromEntries(Object.entries(manifest.ids).map(([key,ids])=>[key,ids.length]))}));
}finally {await (globalThis as unknown as {pgClient?:{end():Promise<void>}}).pgClient?.end();}
