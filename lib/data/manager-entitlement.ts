import "server-only";
import {eq,sql} from "drizzle-orm";
import {db} from "@/lib/db";
import {managerEntitlement} from "@/lib/db/schema";
import {managerCapability,type ManagerCapability} from "@/lib/manager/entitlement";
import {managerLocalEnabled} from "@/lib/manager/config";
import {SUPPORTED_MANAGED_ARTISTS} from "@/lib/manager/limits";
import {ManagerScopeError} from "@/lib/manager/scope";
export async function getManagerCapability(personId:string):Promise<ManagerCapability> {
  if(!managerLocalEnabled())return {enabled:false,artistLimit:0};
  const [row]=await db.select().from(managerEntitlement).where(eq(managerEntitlement.personId,personId));
  return managerCapability(row);
}
export async function requireManagerCapability(personId:string) {
  const capability=await getManagerCapability(personId);
  if(!capability.enabled)throw new ManagerScopeError("plan");
  return capability;
}
/** Use this in the read query as well as checking the request's entitlement. */
export const managerPlanAccess=(personId:string)=>sql`exists (select 1 from ${managerEntitlement} me where me.person_id=${personId} and me.plan='manager' and me.active=true and me.artist_limit between 1 and ${SUPPORTED_MANAGED_ARTISTS} and (me.expires_at is null or me.expires_at>now()))`;
