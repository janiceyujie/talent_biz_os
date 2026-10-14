import "server-only";
import {requireManagerCapability,managerPlanAccess} from "./manager-entitlement";
import {and,asc,desc,eq,getTableColumns,inArray} from "drizzle-orm";
import {db} from "@/lib/db";
import {calendarEvent,membership,payment,project,todo} from "@/lib/db/schema";
import {getManagerRoster} from "./manager";
import {summaryOf} from "./projects";
import {managerLocalEnabled} from "@/lib/manager/config";
import {ManagerScopeError,selectManagedArtists} from "@/lib/manager/scope";
import type {PortfolioWorkspace} from "@/lib/manager/workspace-types";
import {calendarKinds,type CalendarKind,type Payment,type TravelDetails} from "@/lib/types";
import {isProjectType} from "@/lib/project-types";
const hhmm=(value:string|null)=>value?.slice(0,5)||"";
/** Read-only data for the existing pages; identity always comes from the authenticated session. */
export async function getManagerWorkspace(personId:string,requested?:string[],projectId?:string):Promise<PortfolioWorkspace> {
  if(!managerLocalEnabled())throw new ManagerScopeError("forbidden");
  const capability=await requireManagerCapability(personId);
  const artists=await getManagerRoster(personId),selected=selectManagedArtists(artists,requested,capability.artistLimit),ids=selected.map(row=>row.id);
  const base={artists,selectedIds:ids,limited:false};
  if(!ids.length)return {...base,calendar:[],payments:[],projects:[]};
  const access=and(managerPlanAccess(personId),eq(membership.personId,personId),eq(membership.status,"active"),inArray(membership.role,["manager","agency_admin"]));
  const [events,tasks,payments,projects]=await Promise.all([
    db.select(getTableColumns(calendarEvent)).from(calendarEvent).innerJoin(membership,and(eq(membership.talentId,calendarEvent.talentId),access)).where(and(inArray(calendarEvent.talentId,ids),eq(calendarEvent.status,"confirmed"),projectId?eq(calendarEvent.projectId,projectId):undefined)).orderBy(asc(calendarEvent.startDate),asc(calendarEvent.id)).limit(1001),
    db.select(getTableColumns(todo)).from(todo).innerJoin(membership,and(eq(membership.talentId,todo.talentId),access)).where(and(inArray(todo.talentId,ids),projectId?eq(todo.projectId,projectId):undefined)).orderBy(asc(todo.dueDate),asc(todo.id)).limit(1001),
    db.select({...getTableColumns(payment),projectType:project.type}).from(payment).innerJoin(membership,and(eq(membership.talentId,payment.talentId),access)).leftJoin(project,and(eq(project.id,payment.projectId),eq(project.talentId,payment.talentId))).where(and(inArray(payment.talentId,ids),projectId?eq(payment.projectId,projectId):undefined)).orderBy(desc(payment.recordedOn),asc(payment.id)).limit(2001),
    db.select(getTableColumns(project)).from(project).innerJoin(membership,and(eq(membership.talentId,project.talentId),access)).where(and(inArray(project.talentId,ids),projectId?eq(project.id,projectId):undefined)).orderBy(desc(project.updatedAt),asc(project.id)).limit(1001),
  ]);
  const currentCapability=await requireManagerCapability(personId);
  selectManagedArtists(await getManagerRoster(personId),ids,currentCapability.artistLimit);
  // Never present partial collections as complete financial totals.
  if(events.length>1000||tasks.length>1000||payments.length>2000||projects.length>1000)return {...base,limited:true,calendar:[],payments:[],projects:[]};
  const artistOf=(id:string)=>({artistId:id,artistName:selected.find(row=>row.id===id)!.name});
  const kind=(value:string):CalendarKind=>calendarKinds.includes(value as CalendarKind)?value as CalendarKind:"meeting";
  return {...base,
    calendar:[...events.map(row=>({...artistOf(row.talentId),id:row.id,source:"event" as const,kind:kind(row.kind),title:row.title,date:row.startDate,time:hhmm(row.startTime),timeZone:row.timeZone,location:row.location||"",projectId:row.projectId,notes:row.notes||"",done:false,archived:!!row.archivedAt,
      travel:row.kind==="travel"||row.kind==="accommodation"?{endDate:row.endDate||"",endTime:hhmm(row.endTime),endTimeZone:row.endTimeZone||"",transportMode:(row.transportMode||"") as TravelDetails["transportMode"],operator:row.operator||"",serviceNumber:row.serviceNumber||"",destination:row.destination||"",seat:row.seat||"",hotelName:row.hotelName||""}:null,
      endDate:row.endDate||"",endTime:hhmm(row.endTime)})),
      ...tasks.filter(row=>row.dueDate).map(row=>({...artistOf(row.talentId),id:row.id,source:"todo" as const,kind:({deliverable:"deliverable",payment_due:"payment"} as Record<string,CalendarKind>)[row.type]||"todo",title:row.title,date:row.dueDate!,time:hhmm(row.dueTime),timeZone:row.timeZone,location:"",projectId:row.projectId,notes:row.notes||"",done:row.status==="done",archived:row.status==="dismissed",travel:null,endDate:"",endTime:""}))],
    payments:payments.map(row=>({...artistOf(row.talentId),id:row.id,projectId:row.projectId,projectType:isProjectType(row.projectType)?row.projectType:"other",direction:row.direction,installment:row.installment,label:row.label,amount:row.amount,currency:row.currency.trim() as Payment["currency"],taxRate:row.taxRate,taxIncluded:row.taxIncluded,recordedDate:row.recordedOn,dueDate:row.dueOn,status:row.status,settledAmount:row.settledAmount,settledDate:row.settledOn,invoiceRef:row.invoiceRef||"",notes:row.notes||"",voided:!!row.voidedAt})),
    projects:projects.map(row=>summaryOf(row,null,artistOf(row.talentId).artistName,null)),
  };
}
