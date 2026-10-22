import "server-only";
import {paymentsOf} from "./rows";
import {requireManagerCapability,managerPlanAccess} from "./manager-entitlement";
import {and,asc,desc,eq,getTableColumns,inArray,isNull,sql} from "drizzle-orm";
import {db} from "@/lib/db";
import {paymentReceipt,calendarEvent,membership,payment,project,todo} from "@/lib/db/schema";
import {getManagerRoster} from "./manager";
import {summaryOf} from "./projects";
import {managerLocalEnabled} from "@/lib/manager/config";
import {ManagerScopeError,selectManagedArtists} from "@/lib/manager/scope";
import type {PortfolioWorkspace} from "@/lib/manager/workspace-types";
import {calendarKinds,type CalendarKind,type TravelDetails} from "@/lib/types";
import {type WorkspaceQuery} from "@/lib/manager/workspace-query";
import {dateInZone} from "@/lib/domain/dates";
const hhmm=(value:string|null)=>value?.slice(0,5)||"";
/** Read-only data for the existing pages; identity always comes from the authenticated session. */
export async function getManagerWorkspace(personId:string,requested?:string[],projectId?:string,query:WorkspaceQuery={view:"all"}):Promise<PortfolioWorkspace> {
  if(!managerLocalEnabled())throw new ManagerScopeError("forbidden");
  const capability=await requireManagerCapability(personId);
  const artists=await getManagerRoster(personId),selected=selectManagedArtists(artists,requested,capability.artistLimit),ids=selected.map(row=>row.id);
  const base={artists,selectedIds:ids,limited:false};
  if(!ids.length)return {...base,calendar:[],payments:[],projects:[]};
  const access=and(managerPlanAccess(personId),eq(membership.personId,personId),eq(membership.status,"active"),inArray(membership.role,["manager","agency_admin"]));
  const calendarOnly=query.view==="calendar",financeOnly=query.view==="finance";
  const reminders=query.view==="reminders",today=query.view==="today";
  const end=query.end??dateInZone("UTC",today?32:9);
  // Open old tasks and unpaid balances remain eligible; finished historical rows do not.
  const eventRange=calendarOnly?sql`${calendarEvent.startDate}<=${end} and coalesce(${calendarEvent.endDate},${calendarEvent.startDate})>=${query.start}`:(reminders||today)?and(isNull(calendarEvent.archivedAt),sql`${calendarEvent.startDate}<=${end}`):undefined;
  const taskRange=calendarOnly?sql`${todo.dueDate} between ${query.start} and ${end}`:(reminders||today)?and(eq(todo.status,"open"),sql`${todo.dueDate}<=${end}`):undefined;
  const paymentRange=calendarOnly?sql`${payment.dueOn} between ${query.start} and ${end}`:reminders?sql`${payment.dueOn}<=${end}`:financeOnly&&query.start&&query.end?sql`(${payment.recordedOn} between ${query.start} and ${query.end} or exists(select 1 from payment_receipt r where r.payment_id=${payment.id} and r.talent_id=${payment.talentId} and r.received_on between ${query.start}::date and ${query.end}::date and not r.withdrawn and not exists(select 1 from payment_receipt x where x.replaces_id=r.id)))`:undefined;
  const [events,tasks,payments]=await Promise.all([
    financeOnly?Promise.resolve([]):db.select(getTableColumns(calendarEvent)).from(calendarEvent).innerJoin(membership,and(eq(membership.talentId,calendarEvent.talentId),access)).where(and(inArray(calendarEvent.talentId,ids),eq(calendarEvent.status,"confirmed"),isNull(calendarEvent.deletedInGoogleAt),eventRange,projectId?eq(calendarEvent.projectId,projectId):undefined)).orderBy(asc(calendarEvent.startDate),asc(calendarEvent.id)).limit(1001),
    financeOnly?Promise.resolve([]):db.select(getTableColumns(todo)).from(todo).innerJoin(membership,and(eq(membership.talentId,todo.talentId),access)).where(and(inArray(todo.talentId,ids),taskRange,projectId?eq(todo.projectId,projectId):undefined)).orderBy(asc(todo.dueDate),asc(todo.id)).limit(1001),
    db.select({...getTableColumns(payment),projectType:project.type}).from(payment).innerJoin(membership,and(eq(membership.talentId,payment.talentId),access)).leftJoin(project,and(eq(project.id,payment.projectId),eq(project.talentId,payment.talentId))).where(and(inArray(payment.talentId,ids),paymentRange,query.currency?eq(payment.currency,query.currency):undefined,(reminders||today)?and(isNull(payment.voidedAt),sql`${payment.status}<>'cancelled'`):undefined,projectId?eq(payment.projectId,projectId):undefined)).orderBy(desc(payment.recordedOn),asc(payment.id)).limit(2001),
  ]);
  // Finance also needs signed projects without a receivable yet; other views only need referenced metadata.
  const projectIds=[...new Set([...events,...tasks,...payments].flatMap(row=>row.projectId?[row.projectId]:[]))];
  const projects=query.view==="all"||financeOnly||projectIds.length?await db.select(getTableColumns(project)).from(project).innerJoin(membership,and(eq(membership.talentId,project.talentId),access)).where(and(inArray(project.talentId,ids),query.view==="all"||financeOnly?(projectId?eq(project.id,projectId):undefined):inArray(project.id,projectIds),financeOnly&&query.currency?eq(project.quoteCurrency,query.currency):undefined)).limit(1001):[];
  const currentCapability=await requireManagerCapability(personId);
  selectManagedArtists(await getManagerRoster(personId),ids,currentCapability.artistLimit);
  // Never present partial collections as complete financial totals.
  if(events.length>1000||tasks.length>1000||payments.length>2000||projects.length>1000)return {...base,limited:true,calendar:[],payments:[],projects:[]};
  const receiptRows=payments.length?await db.select(getTableColumns(paymentReceipt)).from(paymentReceipt).innerJoin(membership,and(eq(membership.talentId,paymentReceipt.talentId),access)).where(and(inArray(paymentReceipt.paymentId,payments.map(p=>p.id)),inArray(paymentReceipt.talentId,ids))):[];
  const artistOf=(id:string)=>({artistId:id,artistName:selected.find(row=>row.id===id)!.name});
  const kind=(value:string):CalendarKind=>calendarKinds.includes(value as CalendarKind)?value as CalendarKind:"meeting";
  return {...base,
    calendar:[...events.map(row=>({...artistOf(row.talentId),id:row.id,source:"event" as const,kind:kind(row.kind),title:row.title,date:row.startDate,time:hhmm(row.startTime),timeZone:row.timeZone,location:row.location||"",suggestedProjectId:null,projectId:row.projectId,notes:row.notes||"",done:false,archived:!!row.archivedAt,
      travel:row.kind==="travel"||row.kind==="accommodation"?{endDate:row.endDate||"",endTime:hhmm(row.endTime),endTimeZone:row.endTimeZone||"",transportMode:(row.transportMode||"") as TravelDetails["transportMode"],operator:row.operator||"",serviceNumber:row.serviceNumber||"",destination:row.destination||"",seat:row.seat||"",hotelName:row.hotelName||""}:null,
      endDate:row.endDate||"",endTime:hhmm(row.endTime)})),
      ...tasks.filter(row=>row.dueDate).map(row=>({...artistOf(row.talentId),id:row.id,source:"todo" as const,kind:({deliverable:"deliverable",payment_due:"payment"} as Record<string,CalendarKind>)[row.type]||"todo",title:row.title,date:row.dueDate!,time:hhmm(row.dueTime),timeZone:row.timeZone,location:"",projectId:row.projectId,suggestedProjectId:null,notes:row.notes||"",done:row.status==="done",archived:row.status==="dismissed",travel:null,endDate:"",endTime:""}))],
    payments:paymentsOf(payments,receiptRows).map((row,index)=>({...row,...artistOf(payments[index].talentId)})),
    projects:projects.map(row=>summaryOf(row,null,artistOf(row.talentId).artistName,null)),
  };
}
