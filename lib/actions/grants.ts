"use server";
import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog, grantApplication, grantOpportunity, grantTask, grantWatch, todo } from "@/lib/db/schema";
import { grantsLocalEnabled } from "@/lib/grants/config";
import { refreshGrantSources } from "@/lib/grants/sync";
import { grantRegions, grantStages, grantTaskKinds } from "@/lib/grants/types";
import { canonicalZone, isTimeZone } from "@/lib/time-zones";
import { checkProjectLink } from "./project-link";
import { errorText } from "./validation";

async function context() {
  const identity=await requireTalent();
  if (!grantsLocalEnabled()) throw new Error("grants_local_only");
  return {...identity,t:await getTranslations("grants")};
}
export async function refreshGrants(): Promise<string|null> {
  const {t}=await context();
  const result=await refreshGrantSources(); refresh();
  return result.some(s=>!s.ok) ? t("refreshFailed") : null;
}
export async function saveGrant(id:string, plan?:unknown): Promise<string|null> {
  const {talent,person,t}=await context();
  if(!z.uuid().safeParse(id).success) return t("invalid");
  const schedule=plan===undefined?null:z.object({date:z.iso.date(),time:z.union([z.literal(""),z.iso.time({precision:-1})]),timeZone:z.string().refine(isTimeZone)}).safeParse(plan);
  if(schedule&&!schedule.success)return t("invalid");
  const [opportunity]=await db.select().from(grantOpportunity).where(eq(grantOpportunity.id,id));
  if(!opportunity) return t("notFound");
  await db.transaction(async tx=>{
    const [created]=await tx.insert(grantApplication).values({talentId:talent.id,opportunityId:id}).onConflictDoNothing().returning();
    if(created&&schedule?.success){
      const [task]=await tx.insert(todo).values({talentId:talent.id,type:"custom",title:`${t("tasks.submission")} · ${opportunity.title}`.slice(0,200),dueDate:schedule.data.date,dueTime:schedule.data.time||null,timeZone:canonicalZone(schedule.data.timeZone)!,notes:opportunity.url}).returning({id:todo.id});
      await tx.insert(grantTask).values({applicationId:created.id,todoId:task.id,kind:"submission"});
    }
    if(created) await tx.insert(auditLog).values({talentId:talent.id,actorPersonId:person.personId,action:"grant.saved",targetType:"grant_application",targetId:created.id});
  });
  refresh(); return null;
}
export async function updateGrant(data:unknown): Promise<string|null> {
  const {talent,person,t}=await context();
  const parsed=z.object({id:z.uuid(),stage:z.enum(grantStages),projectId:z.union([z.uuid(),z.literal("")]).transform(v=>v||null),notes:z.string().trim().max(10000)}).safeParse(data);
  if(!parsed.success) return t("invalid");
  const input=parsed.data;
  const fail=await errorText();
  const failure=await db.transaction(async tx=>{
    const [existing]=await tx.select().from(grantApplication).where(and(eq(grantApplication.id,input.id),eq(grantApplication.talentId,talent.id))).for("update");
    if(!existing) return t("notFound");
    // A project link is execution work. Preserve the existing signed-project rule.
    const linkError=await checkProjectLink(talent.id,input.projectId,existing.projectId);
    if(linkError) return fail(linkError);
    await tx.update(grantApplication).set({stage:input.stage,projectId:input.projectId,notes:input.notes}).where(and(eq(grantApplication.id,input.id),eq(grantApplication.talentId,talent.id)));
    const links=await tx.select({id:grantTask.todoId}).from(grantTask).where(eq(grantTask.applicationId,input.id));
    for(const link of links) await tx.update(todo).set({projectId:input.projectId}).where(and(eq(todo.id,link.id),eq(todo.talentId,talent.id)));
    await tx.insert(auditLog).values({talentId:talent.id,actorPersonId:person.personId,action:"grant.updated",targetType:"grant_application",targetId:input.id,details:{from:existing.stage,to:input.stage,projectId:input.projectId}});
    return null;
  });
  if(!failure) refresh(); return failure;
}
export async function addGrantTask(data:unknown): Promise<string|null> {
  const {talent,t}=await context();
  const parsed=z.object({requestId:z.uuid(),applicationId:z.uuid(),kind:z.enum(grantTaskKinds),title:z.string().trim().min(1).max(200),date:z.iso.date(),time:z.union([z.literal(""),z.iso.time({precision:-1})]),timeZone:z.string().refine(isTimeZone)}).safeParse(data);
  if(!parsed.success) return t("invalid");
  const input=parsed.data;
  const failure=await db.transaction(async tx=>{
    const [app]=await tx.select().from(grantApplication).where(and(eq(grantApplication.id,input.applicationId),eq(grantApplication.talentId,talent.id))).for("update");
    if(!app) return t("notFound");
    const [repeated]=await tx.select({id:grantTask.id}).from(grantTask).where(and(eq(grantTask.id,input.requestId),eq(grantTask.applicationId,app.id)));
    if(repeated) return null;
    const fail=await errorText();
    const linkError=await checkProjectLink(talent.id,app.projectId);
    if(linkError) return fail(linkError);
    const [opportunity]=await tx.select({title:grantOpportunity.title,url:grantOpportunity.url}).from(grantOpportunity).where(eq(grantOpportunity.id,app.opportunityId));
    const [created]=await tx.insert(todo).values({talentId:talent.id,projectId:app.projectId,type:"custom",title:input.title,dueDate:input.date,dueTime:input.time||null,timeZone:canonicalZone(input.timeZone)!,notes:`${t("taskContext")}\n${opportunity.title}\n${opportunity.url}`}).returning({id:todo.id});
    await tx.insert(grantTask).values({id:input.requestId,applicationId:app.id,todoId:created.id,kind:input.kind});
    return null;
  });
  if(!failure) refresh(); return failure;
}
/** Edit the existing to-do, so Grants, Today and Calendar keep one date. */
export async function updateGrantTask(data:unknown): Promise<string|null> {
  const {talent,t}=await context();
  const parsed=z.object({applicationId:z.uuid(),taskId:z.uuid(),kind:z.enum(grantTaskKinds),title:z.string().trim().min(1).max(200),date:z.iso.date(),time:z.union([z.literal(""),z.iso.time({precision:-1})]),timeZone:z.string().refine(isTimeZone)}).safeParse(data);
  if(!parsed.success) return t("invalid");
  const input=parsed.data;
  const failure=await db.transaction(async tx=>{
    const [app]=await tx.select().from(grantApplication).where(and(eq(grantApplication.id,input.applicationId),eq(grantApplication.talentId,talent.id))).for("update");
    if(!app) return t("notFound");
    const [link]=await tx.select().from(grantTask).where(and(eq(grantTask.todoId,input.taskId),eq(grantTask.applicationId,app.id)));
    if(!link) return t("notFound");
    const rows=await tx.update(todo).set({title:input.title,dueDate:input.date,dueTime:input.time||null,timeZone:canonicalZone(input.timeZone)!,projectId:app.projectId}).where(and(eq(todo.id,link.todoId),eq(todo.talentId,talent.id))).returning({id:todo.id});
    if(!rows.length) return t("notFound");
    await tx.update(grantTask).set({kind:input.kind}).where(eq(grantTask.id,link.id));
    return null;
  });
  if(!failure) refresh(); return failure;
}
export async function setGrantWatch(enabled:boolean, regions:unknown): Promise<string|null> {
  const {talent,person,t}=await context();
  const parsed=z.array(z.enum(grantRegions)).min(1).max(2).safeParse(regions);
  if(typeof enabled!=="boolean"||!parsed.success) return t("invalid");
  await db.insert(grantWatch).values({talentId:talent.id,personId:person.personId,enabled,regions:[...new Set(parsed.data)]})
    .onConflictDoUpdate({target:[grantWatch.personId,grantWatch.talentId],set:{enabled,regions:[...new Set(parsed.data)]}});
  refresh(); return null;
}
export async function markGrantsSeen(): Promise<string|null> {
  const {talent,person}=await context();
  await db.update(grantWatch).set({seenAt:new Date()}).where(and(eq(grantWatch.talentId,talent.id),eq(grantWatch.personId,person.personId)));
  refresh(); return null;
}
