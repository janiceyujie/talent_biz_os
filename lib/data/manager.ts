import "server-only";
import {getManagerCapability,requireManagerCapability,managerPlanAccess} from "./manager-entitlement";
import {and,asc,desc,eq,inArray,isNull,sql} from "drizzle-orm";
import {db} from "@/lib/db";
import {calendarEvent,membership,message,payment,talent,todo} from "@/lib/db/schema";
import {managerLocalEnabled} from "@/lib/manager/config";
import {managerDateRange,ManagerScopeError,selectManagedArtists} from "@/lib/manager/scope";
import {managerFinance} from "@/lib/manager/finance";
import type {ManagerOverview} from "@/lib/manager/types";
import {wallTimeToUtc} from "@/lib/domain/dates";

export async function getManagerRoster(personId:string) {
  if(!(await getManagerCapability(personId)).enabled)return [];
  return db.select({id:talent.id,name:talent.name,timeZone:talent.timeZone,role:membership.role,status:membership.status}).from(membership)
    .innerJoin(talent,eq(talent.id,membership.talentId))
    .where(and(eq(membership.personId,personId),inArray(membership.role,["manager","agency_admin"]),eq(membership.status,"active"))).orderBy(asc(talent.name));
}
export async function hasManagerWorkspace(personId:string) {
  if(!(await getManagerCapability(personId)).enabled)return false;
  const [row]=await db.select({id:membership.id}).from(membership).where(and(eq(membership.personId,personId),inArray(membership.role,["manager","agency_admin"]),inArray(membership.status,["active","invited"]))).limit(1);
  return Boolean(row);
}
/** Called only with the authenticated server session, never a client-supplied person id. */
export async function getManagerOverview(personId:string,requested:string[]|undefined,start:string,end:string):Promise<ManagerOverview> {
  if(!managerLocalEnabled())throw new ManagerScopeError("forbidden");
  const capability=await requireManagerCapability(personId);
  managerDateRange(start,end);
  const artists=await getManagerRoster(personId);
  const selected=selectManagedArtists(artists,requested,capability.artistLimit),ids=selected.map(row=>row.id);
  const base={artists,selectedIds:ids,start,end,artistLimit:capability.artistLimit};
  if(!ids.length)return {...base,calendar:[],messages:[],finance:[]};
  // Recheck active membership in every query, including after roster selection.
  const access=and(managerPlanAccess(personId),eq(membership.personId,personId),eq(membership.status,"active"),inArray(membership.role,["manager","agency_admin"]));
  const [events,tasks,messages,payments]=await Promise.all([
    db.select({id:calendarEvent.id,artistId:calendarEvent.talentId,title:calendarEvent.title,date:calendarEvent.startDate,endDate:calendarEvent.endDate,time:calendarEvent.startTime,timeZone:calendarEvent.timeZone}).from(calendarEvent)
      .innerJoin(membership,and(eq(membership.talentId,calendarEvent.talentId),access))
      .where(and(inArray(calendarEvent.talentId,ids),isNull(calendarEvent.archivedAt),eq(calendarEvent.status,"confirmed"),isNull(calendarEvent.deletedInGoogleAt),sql`${calendarEvent.startDate}<=${end} and coalesce(${calendarEvent.endDate},${calendarEvent.startDate})>=${start}`)).orderBy(asc(calendarEvent.startDate)).limit(301),
    db.select({id:todo.id,artistId:todo.talentId,title:todo.title,date:todo.dueDate,time:todo.dueTime,timeZone:todo.timeZone}).from(todo)
      .innerJoin(membership,and(eq(membership.talentId,todo.talentId),access))
      .where(and(inArray(todo.talentId,ids),eq(todo.status,"open"),sql`${todo.dueDate} between ${start} and ${end}`)).orderBy(asc(todo.dueDate)).limit(301),
    db.select({id:message.id,artistId:message.talentId,receivedAt:message.receivedAt,status:message.status,body:message.bodyText}).from(message)
      .innerJoin(membership,and(eq(membership.talentId,message.talentId),access))
      .where(and(inArray(message.talentId,ids),sql`${message.receivedAt}>=${start}::date and ${message.receivedAt}<(${end}::date + interval '1 day')`,sql`${message.status}<>'dismissed'`)).orderBy(desc(message.receivedAt)).limit(151),
    db.select({talentId:payment.talentId,currency:payment.currency,amount:payment.amount,settledAmount:payment.settledAmount,direction:payment.direction,status:payment.status,taxRate:payment.taxRate,taxIncluded:payment.taxIncluded,voidedAt:payment.voidedAt}).from(payment)
      .innerJoin(membership,and(eq(membership.talentId,payment.talentId),access))
      .where(and(inArray(payment.talentId,ids),sql`(${payment.status} <> 'expected' or ${payment.projectId} is null or exists(select 1 from project p where p.id=${payment.projectId} and p.talent_id=${payment.talentId} and p.stage in ('signed','in_progress','collecting_payment','closed')))`,isNull(payment.voidedAt),sql`(case when ${payment.status}='settled' then ${payment.settledOn} else coalesce(${payment.dueOn},${payment.recordedOn}) end) between ${start} and ${end}`)),
  ]);
  const currentCapability=await requireManagerCapability(personId);
  selectManagedArtists(await getManagerRoster(personId),ids,currentCapability.artistLimit);
  const calendar=[...events.map(row=>({...row,date:row.date,time:row.time?.slice(0,5)||"",source:"event" as const})),...tasks.filter(row=>row.date).map(row=>({...row,date:row.date!,time:row.time?.slice(0,5)||"",source:"todo" as const}))]
    .sort((a,b)=>wallTimeToUtc(a.date,a.time||"00:00",a.timeZone).getTime()-wallTimeToUtc(b.date,b.time||"00:00",b.timeZone).getTime());
  return {...base,limitReached:calendar.length>300||messages.length>150,calendar:calendar.slice(0,300),messages:messages.slice(0,150).map(row=>({...row,receivedAt:row.receivedAt.toISOString(),body:(row.body||"").slice(0,10000)})),finance:managerFinance(payments)};
}
