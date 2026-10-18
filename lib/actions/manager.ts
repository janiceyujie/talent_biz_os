"use server";
import {and,asc,eq,inArray} from "drizzle-orm";
import {refresh} from "next/cache";
import {getTranslations} from "next-intl/server";
import {z} from "zod";
import {requirePerson,requireTalent} from "@/lib/auth";
import {db} from "@/lib/db";
import {auditLog,calendarConnection,managerEntitlement,membership,person as personTable,talent} from "@/lib/db/schema";
import {managerLocalEnabled} from "@/lib/manager/config";
import {getManagerCapability} from "@/lib/data/manager-entitlement";
import {managerCapability} from "@/lib/manager/entitlement";
async function guard() {if(!managerLocalEnabled())throw new Error("manager_local_only");return getTranslations("manager");}
export async function getManagerInvitations() {
  await guard();const person=await requirePerson();
  if(!(await getManagerCapability(person.personId)).enabled)return [];
  return db.select({id:membership.id,name:talent.name}).from(membership).innerJoin(talent,eq(talent.id,membership.talentId))
    .where(and(eq(membership.personId,person.personId),eq(membership.role,"manager"),eq(membership.status,"invited"))).orderBy(asc(membership.createdAt)).limit(100);
}
export async function getWorkspaceManagers() {
  await guard();const {talent:current}=await requireTalent();if(current.role!=="owner")return [];
  return db.select({id:membership.id,name:personTable.displayName,email:personTable.email,status:membership.status}).from(membership)
    .innerJoin(personTable,eq(personTable.id,membership.personId)).where(and(eq(membership.talentId,current.id),eq(membership.role,"manager"),inArray(membership.status,["active","invited","revoked"]))).orderBy(asc(membership.createdAt));
}
/** The owner initiates access; no mail, credentials or data are sent externally. */
export async function inviteManager(email:unknown):Promise<string|null> {
  const t=await guard();const {person,talent:current}=await requireTalent();if(current.role!=="owner")return t("ownerOnly");
  const parsed=z.email().safeParse(typeof email==="string"?email.trim().toLowerCase():email);if(!parsed.success)return t("emailInvalid");
  const [target]=await db.select().from(personTable).where(eq(personTable.email,parsed.data));
  if(!target||!target.emailVerified)return t("registeredFirst");
  if(target.id===person.personId)return t("selfInvite");
  if(!(await getManagerCapability(target.id)).enabled)return t("recipientPlan");
  const failure=await db.transaction(async tx=>{
    // Serialize with acceptance/leave before reusing a membership row.
    await tx.select({id:personTable.id}).from(personTable).where(eq(personTable.id,target.id)).for("update");
    // Serializes invitation, acceptance and revocation for this owner-held workspace.
    await tx.select({id:talent.id}).from(talent).where(eq(talent.id,current.id)).for("update");
    const [existing]=await tx.select().from(membership).where(and(eq(membership.talentId,current.id),eq(membership.personId,target.id)));
    if(existing && existing.status!=="revoked")return t("alreadyInvited");
    if(existing?.role==="owner"||existing?.role==="agency_admin")return t("ownerOnly");
    if(existing)await tx.update(membership).set({status:"invited",role:"manager",calendarFeedTokenHash:null}).where(eq(membership.id,existing.id));
    else await tx.insert(membership).values({talentId:current.id,personId:target.id,role:"manager",status:"invited"});
    await tx.insert(auditLog).values({talentId:current.id,actorPersonId:person.personId,action:"manager.invited",targetType:"person",targetId:target.id});return null;
  });
  if(!failure)refresh();return failure;
}
/** An invitation is not access until its recipient accepts it. */
export async function respondManagerInvitation(id:unknown,accept:boolean):Promise<string|null> {
  const t=await guard();const person=await requirePerson();if(!z.uuid().safeParse(id).success||typeof accept!=="boolean")return t("invalid");
  const failure=await db.transaction(async tx=>{
    // Serialize acceptance against the plan limit and concurrent plan changes.
    await tx.select({id:personTable.id}).from(personTable).where(eq(personTable.id,person.personId)).for("update");
    const [invitation]=await tx.select().from(membership).where(and(eq(membership.id,id as string),eq(membership.personId,person.personId),eq(membership.role,"manager"),eq(membership.status,"invited"))).for("update");
    if(!invitation)return t("notFound");
    if(accept) {
      const [plan]=await tx.select().from(managerEntitlement).where(eq(managerEntitlement.personId,person.personId)).for("update");
      const capability=managerCapability(plan);
      if(!capability.enabled)return t("plan");
      const active=await tx.select({id:membership.id}).from(membership).where(and(eq(membership.personId,person.personId),inArray(membership.role,["manager","agency_admin"]),eq(membership.status,"active")));
      if(active.length>=capability.artistLimit)return t("limit");
    }
    await tx.update(membership).set({status:accept?"active":"revoked"}).where(eq(membership.id,invitation.id));
    await tx.insert(auditLog).values({talentId:invitation.talentId,actorPersonId:person.personId,action:accept?"manager.accepted":"manager.declined",targetType:"membership",targetId:invitation.id});return null;
  });
  if(!failure)refresh();return failure;
}
export async function revokeManager(id:unknown):Promise<string|null> {
  const t=await guard();const {person,talent:current}=await requireTalent();if(current.role!=="owner")return t("ownerOnly");
  if(!z.uuid().safeParse(id).success)return t("invalid");
  const failure=await db.transaction(async tx=>{
    const [member]=await tx.select().from(membership).where(and(eq(membership.id,id as string),eq(membership.talentId,current.id),eq(membership.role,"manager"))).for("update");
    if(!member)return t("notFound");
    await tx.update(membership).set({status:"revoked",calendarFeedTokenHash:null}).where(eq(membership.id,member.id));
    // Stop future workspace calendar export and remove personal import mappings in this workspace.
    await tx.delete(calendarConnection).where(and(eq(calendarConnection.talentId,current.id),eq(calendarConnection.personId,member.personId)));
    await tx.insert(auditLog).values({talentId:current.id,actorPersonId:person.personId,action:"manager.revoked",targetType:"membership",targetId:member.id});return null;
  });
  if(!failure)refresh();return failure;
}
/** A manager may release their own access without altering the artist's ownership. */
export async function leaveManagerArtist(id:unknown):Promise<string|null> {
  const t=await guard();const person=await requirePerson();if(!z.uuid().safeParse(id).success)return t("invalid");
  const failure=await db.transaction(async tx=>{
    await tx.select({id:personTable.id}).from(personTable).where(eq(personTable.id,person.personId)).for("update");
    const [member]=await tx.select().from(membership).where(and(eq(membership.talentId,id as string),eq(membership.personId,person.personId),eq(membership.role,"manager"),eq(membership.status,"active"))).for("update");
    if(!member)return t("notFound");
    await tx.update(membership).set({status:"revoked",calendarFeedTokenHash:null}).where(eq(membership.id,member.id));
    await tx.delete(calendarConnection).where(and(eq(calendarConnection.talentId,member.talentId),eq(calendarConnection.personId,person.personId)));
    await tx.insert(auditLog).values({talentId:member.talentId,actorPersonId:person.personId,action:"manager.left",targetType:"membership",targetId:member.id});return null;
  });
  if(!failure)refresh();return failure;
}
