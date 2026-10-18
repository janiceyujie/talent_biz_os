/** Repair source encoding only; preserve IDs, application links and source check timestamps. */
import env from "@next/env";
import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {and,eq,inArray,sql} from "drizzle-orm";
import {grantPlainText,listingHash} from "../lib/grants/domain";
import type {GrantListing} from "../lib/grants/types";
env.loadEnvConfig(process.cwd());
assert.equal(process.env.APP_ENV,"development");
assert.ok(["127.0.0.1","localhost","[::1]"].includes(new URL(process.env.DATABASE_URL!).hostname));
const {db}=await import("../lib/db");
const {grantOpportunity,grantApplication,grantTask,todo}=await import("../lib/db/schema");
const apply=process.env.APPLY_GRANT_TEXT_REPAIR==="1";
const result=await db.transaction(async tx=>{
 for(const source of ["moc","grants_gov"])await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`grant-source:${source}`}))`);
 const rows=await tx.select().from(grantOpportunity);
 const changes=rows.flatMap(row=>{
  const title=grantPlainText(row.title),summary=grantPlainText(row.summary),agency=grantPlainText(row.agency);
  if(title===row.title&&summary===row.summary&&agency===row.agency)return [];
  const listing:GrantListing={source:row.source as GrantListing["source"],externalId:row.externalId,region:row.region,title,summary,agency,url:row.url,opensOn:row.opensOn,closesOn:row.closesOn,sourceStatus:row.sourceStatus};
  return [{before:row,after:{title,summary,agency,contentHash:listingHash(listing)}}];
 });
 const tasks=changes.length?await tx.select({task:todo,opportunityId:grantApplication.opportunityId}).from(todo).innerJoin(grantTask,eq(grantTask.todoId,todo.id)).innerJoin(grantApplication,and(eq(grantApplication.id,grantTask.applicationId),eq(grantApplication.talentId,todo.talentId))).where(inArray(grantApplication.opportunityId,changes.map(c=>c.before.id))):[];
 const taskChanges=tasks.flatMap(({task,opportunityId})=>{
  const c=changes.find(c=>c.before.id===opportunityId)!;
  const title=task.title.endsWith(c.before.title)?task.title.replace(c.before.title,c.after.title):task.title;
  const notes=task.notes?.includes(c.before.title)?task.notes.replace(c.before.title,c.after.title):task.notes;
  return title!==task.title||notes!==task.notes?[{before:task,after:{title,notes}}]:[];
 });
 let backup:string|null=null;
 if(apply&&changes.length){
  backup=`/private/tmp/taloox-grant-text-backup-${Date.now()}.json`;
  await writeFile(backup,JSON.stringify({changes,taskChanges},null,2),{mode:0o600});
  for(const c of changes)await tx.update(grantOpportunity).set(c.after).where(eq(grantOpportunity.id,c.before.id));
  for(const c of taskChanges)await tx.update(todo).set(c.after).where(eq(todo.id,c.before.id));
 }
 return {apply,opportunities:changes.length,linkedTasks:taskChanges.length,backup};
});
console.log(JSON.stringify(result));process.exit(0);
