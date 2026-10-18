import "server-only";
import {getManagerCapability,requireManagerCapability,managerPlanAccess} from "./manager-entitlement";
import {and,asc,desc,eq,inArray,isNull,sql} from "drizzle-orm";
import {db} from "@/lib/db";
import {calendarEvent,membership,message,talent,todo} from "@/lib/db/schema";
import {managerLocalEnabled} from "@/lib/manager/config";
import {managerDateRange,ManagerScopeError,selectManagedArtists} from "@/lib/manager/scope";
import {managerFinanceQuery} from "@/lib/manager/finance-query";
import {managerMessageCursor} from "@/lib/manager/message-page";
import {MANAGER_MESSAGE_PAGE_SIZE} from "@/lib/manager/limits";
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
export async function getManagerOverview(personId:string,requested:string[]|undefined,start:string,end:string,view:"calendar"|"messages"|"finance"|"all"="all",after?:string):Promise<ManagerOverview> {
  if(!managerLocalEnabled())throw new ManagerScopeError("forbidden");
  const capability=await requireManagerCapability(personId);
  managerDateRange(start,end);
  if(!["all","calendar","messages","finance"].includes(view))throw new ManagerScopeError("invalid");
  const cursor=managerMessageCursor(after);
  const artists=await getManagerRoster(personId);
  const selected=selectManagedArtists(artists,requested,capability.artistLimit),ids=selected.map(row=>row.id);
  const base={artists,selectedIds:ids,start,end,artistLimit:capability.artistLimit};
  if(!ids.length)return {...base,calendar:[],messages:[],finance:[]};
  // Recheck active membership in every query, including after roster selection.
  const access=and(managerPlanAccess(personId),eq(membership.personId,personId),eq(membership.status,"active"),inArray(membership.role,["manager","agency_admin"]));
  const [events,tasks,messages,finance]=await Promise.all([
    view!=="all"&&view!=="calendar"?Promise.resolve([]):db.select({id:calendarEvent.id,artistId:calendarEvent.talentId,title:calendarEvent.title,date:calendarEvent.startDate,endDate:calendarEvent.endDate,time:calendarEvent.startTime,timeZone:calendarEvent.timeZone}).from(calendarEvent)
      .innerJoin(membership,and(eq(membership.talentId,calendarEvent.talentId),access))
      .where(and(inArray(calendarEvent.talentId,ids),isNull(calendarEvent.archivedAt),eq(calendarEvent.status,"confirmed"),sql`${calendarEvent.startDate}<=${end} and coalesce(${calendarEvent.endDate},${calendarEvent.startDate})>=${start}`)).orderBy(asc(calendarEvent.startDate)).limit(301),
    view!=="all"&&view!=="calendar"?Promise.resolve([]):db.select({id:todo.id,artistId:todo.talentId,title:todo.title,date:todo.dueDate,time:todo.dueTime,timeZone:todo.timeZone}).from(todo)
      .innerJoin(membership,and(eq(membership.talentId,todo.talentId),access))
      .where(and(inArray(todo.talentId,ids),eq(todo.status,"open"),sql`${todo.dueDate} between ${start} and ${end}`)).orderBy(asc(todo.dueDate)).limit(301),
    view!=="all"&&view!=="messages"?Promise.resolve([]):db.select({id:message.id,artistId:message.talentId,receivedAt:message.receivedAt,cursorAt:sql<string>`to_char(${message.receivedAt} at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,status:message.status,body:sql<string>`left(${message.bodyText},10000)`}).from(message)
      .innerJoin(membership,and(eq(membership.talentId,message.talentId),access))
      .where(and(inArray(message.talentId,ids),sql`${message.receivedAt}>=${start}::date and ${message.receivedAt}<(${end}::date + interval '1 day')`,sql`${message.status}<>'dismissed'`,cursor?sql`(${message.receivedAt},${message.id})<(${cursor.at}::timestamptz,${cursor.id}::uuid)`:undefined)).orderBy(desc(message.receivedAt),desc(message.id)).limit(MANAGER_MESSAGE_PAGE_SIZE+1),
    view!=="all"&&view!=="finance"?Promise.resolve([]):db.execute(managerFinanceQuery(personId,ids,start,end)),
  ]);
  const currentCapability=await requireManagerCapability(personId);
  selectManagedArtists(await getManagerRoster(personId),ids,currentCapability.artistLimit);
  const calendar=[...events.map(row=>({...row,date:row.date,time:row.time?.slice(0,5)||"",source:"event" as const})),...tasks.filter(row=>row.date).map(row=>({...row,date:row.date!,time:row.time?.slice(0,5)||"",source:"todo" as const}))]
    .sort((a,b)=>wallTimeToUtc(a.date,a.time||"00:00",a.timeZone).getTime()-wallTimeToUtc(b.date,b.time||"00:00",b.timeZone).getTime());
  return {...base,limitReached:calendar.length>300,nextCursor:messages.length>MANAGER_MESSAGE_PAGE_SIZE?`${messages[MANAGER_MESSAGE_PAGE_SIZE-1].cursorAt}|${messages[MANAGER_MESSAGE_PAGE_SIZE-1].id}`:undefined,calendar:calendar.slice(0,300),messages:messages.slice(0,MANAGER_MESSAGE_PAGE_SIZE).map(row=>({...row,receivedAt:row.receivedAt.toISOString(),body:(row.body||"").slice(0,10000)})),finance:finance as ManagerOverview["finance"]};
}
