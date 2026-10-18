import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { grantApplication, grantOpportunity, grantSource, grantTask, grantWatch, todo, talent } from "@/lib/db/schema";
import { grantsLocalEnabled } from "@/lib/grants/config";
import { grantSources, type GrantSource, type GrantWorkspace } from "@/lib/grants/types";

export async function getGrantWorkspace(): Promise<GrantWorkspace> {
  const {talent,person}=await requireTalent();
  if (!grantsLocalEnabled()) throw new Error("grants_local_only");
  const [opportunities,applications,sources,[watch]]=await Promise.all([
    // Only saved records are needed for application details and calendar deep links.
    // Public discovery is paginated separately; never preload the entire national feed.
    db.select().from(grantOpportunity).where(sql`exists (select 1 from ${grantApplication} a where a.opportunity_id = ${grantOpportunity.id} and a.talent_id = ${talent.id}::uuid)`).orderBy(desc(grantOpportunity.changedAt)),
    db.select().from(grantApplication).where(eq(grantApplication.talentId,talent.id)).orderBy(desc(grantApplication.updatedAt)),
    db.select().from(grantSource),
    db.select().from(grantWatch).where(and(eq(grantWatch.talentId,talent.id),eq(grantWatch.personId,person.personId))),
  ]);
  const tasks=applications.length ? await db.select({applicationId:grantTask.applicationId,kind:grantTask.kind,id:todo.id,title:todo.title,date:todo.dueDate,time:todo.dueTime,timeZone:todo.timeZone,status:todo.status}).from(grantTask)
    .innerJoin(todo,and(eq(todo.id,grantTask.todoId),eq(todo.talentId,talent.id)))
    .where(inArray(grantTask.applicationId,applications.map(a=>a.id))).orderBy(asc(todo.dueDate)) : [];
  return {
    opportunities:opportunities.map(o=>({...o,source:o.source as GrantSource,checkedAt:o.checkedAt.toISOString(),changedAt:o.changedAt.toISOString()})),
    applications:applications.map(a=>({...a,tasks:tasks.filter(t=>t.applicationId===a.id).map(t=>({...t,time:t.time?.slice(0,5)||""}))})),
    sources:grantSources.map(id=>{const s=sources.find(s=>s.id===id);return {id,checkedAt:s?.checkedAt?.toISOString()||null,failed:!!s?.failure};}),
    watch:{enabled:watch?.enabled||false,regions:watch?.regions||["TW","US"]},
  };
}
export async function getGrantNotice(talentId:string, personId:string) {
  if (!grantsLocalEnabled()) return null;
  const [watch]=await db.select().from(grantWatch).where(and(eq(grantWatch.talentId,talentId),eq(grantWatch.personId,personId)));
  if (!watch?.enabled || !watch.regions.length) return null;
  const [workspace]=await db.select({timeZone:talent.timeZone}).from(talent).where(eq(talent.id,talentId));
  if (!workspace) return null;
  const openedAt=sql`(${grantOpportunity.opensOn}::timestamp at time zone (case when ${grantOpportunity.region}='TW' then 'Asia/Taipei' else ${workspace.timeZone} end))`;
  const [row]=await db.select({count:sql<number>`count(*)::int`}).from(grantOpportunity).where(and(inArray(grantOpportunity.region,watch.regions),sql`(
    ${grantOpportunity.changedAt}>${watch.seenAt.toISOString()}::timestamptz
    or (${grantOpportunity.sourceStatus}='posted' and ${grantOpportunity.checkedAt}>now()-interval '24 hours'
        and ${openedAt}>${watch.seenAt.toISOString()}::timestamptz and ${openedAt}<=now())
  )`));
  return {count:row.count};
}
