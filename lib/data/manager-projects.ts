import "server-only";
import {and,desc,eq,inArray} from "drizzle-orm";
import {db} from "@/lib/db";
import {contract,membership} from "@/lib/db/schema";
import {getManagerRoster} from "./manager";
import {requireManagerCapability,managerPlanAccess} from "./manager-entitlement";
import {getManagerWorkspace} from "./manager-workspace";
import {getProject,listProjects} from "./projects";
import {getProjectDetail} from "./project-detail";
import {selectManagedArtists,ManagerScopeError} from "@/lib/manager/scope";
import type {ManagerProjectData} from "@/lib/manager/project-types";
export async function getManagerProjectPage(personId:string,requested:string[]|undefined,params:Parameters<typeof listProjects>[2]) {
  const capability=await requireManagerCapability(personId),artists=await getManagerRoster(personId);
  const selected=selectManagedArtists(artists,requested,capability.artistLimit),ids=selected.map(row=>row.id);
  const page=await listProjects("","",params,{personId,ids,artists:Object.fromEntries(selected.map(row=>[row.id,row.name]))});
  const current=await requireManagerCapability(personId);selectManagedArtists(await getManagerRoster(personId),ids,current.artistLimit);
  return page;
}
export async function getManagerProject(personId:string,artistId:string,projectId:string):Promise<ManagerProjectData|null> {
  const capability=await requireManagerCapability(personId),artists=await getManagerRoster(personId);
  const [artist]=selectManagedArtists(artists,[artistId],capability.artistLimit);
  const project=await getProject(artist.id,projectId,artist.name);if(!project)return null;
  const [detail,records,contracts]=await Promise.all([
    getProjectDetail(artist.id,projectId),getManagerWorkspace(personId,[artist.id],projectId),
    db.select({row:contract}).from(contract).innerJoin(membership,and(eq(membership.talentId,contract.talentId),eq(membership.personId,personId),eq(membership.status,"active"),inArray(membership.role,["manager","agency_admin"])) ).where(and(eq(contract.talentId,artistId),eq(contract.projectId,projectId),managerPlanAccess(personId))).orderBy(desc(contract.versionNumber)),
  ]);
  // Reuse the individual project reader, then recheck access before returning any detail.
  const current=await requireManagerCapability(personId);selectManagedArtists(await getManagerRoster(personId),[artistId],current.artistLimit);
  if(!detail)return null;if(records.limited)throw new ManagerScopeError("limit");
  return {project:{...project,artistId},detail,calendar:records.calendar,payments:records.payments,contracts:contracts.map(({row})=>({id:row.id,projectId:row.projectId,messageId:row.messageId,version:row.versionNumber,status:row.status,terms:row.terms,diff:row.diff||[],against:row.supersedesId?"version":"project",createdAt:row.createdAt.toISOString()}))};
}
