import "server-only";
import {and,asc,desc,eq,gt,isNull,lt,or,sql} from "drizzle-orm";
import {db} from "@/lib/db";
import {grantChange as c,grantOpportunity as g,grantApplication as a,grantWatch as w,notificationState as n} from "@/lib/db/schema";
import {grantsLocalEnabled} from "@/lib/grants/config";
import type {Notification} from "@/lib/domain/notifications";
type Query=Pick<typeof db,"select">;
export const changeNotificationId=(talentId:string)=>sql<string>`'opportunity:' || ${c.id}::text || ':' || ${talentId}::text`;
/** Subscription starts now; tracked changes are automatic, even with discovery alerts disabled. */
export function grantChangeAudience(talentId:string,personId:string){return sql`(
 exists(select 1 from ${a} where ${a.talentId}=${talentId}::uuid and ${a.opportunityId}=${c.opportunityId} and ${a.createdAt}<=${c.createdAt} and ${c.kind}='dates')
 or exists(select 1 from ${w} where ${w.talentId}=${talentId}::uuid and ${w.personId}=${personId}::uuid and ${w.enabled}=true and ${w.regions} ? ${g.region} and ${c.createdAt}>${w.seenAt} and (${g.closesOn} is null or ${g.closesOn}>=(now() at time zone 'Asia/Taipei')::date))
)`;}
export function recentGrantChanges(){return sql`${c.createdAt}>now()-interval '90 days'`;}
export async function getOpportunityNotifications(talentId:string,personId:string,after?:string[],connection:Query=db):Promise<Notification[]>{
 if(!grantsLocalEnabled())return [];
 const day=sql<string>`to_char(${c.createdAt} at time zone 'UTC','YYYY-MM-DD')`;
 const rows=await connection.select({change:c,title:g.title,day}).from(c).innerJoin(g,eq(g.id,c.opportunityId))
 .where(and(grantChangeAudience(talentId,personId),recentGrantChanges(),after?or(gt(day,after[0]),and(eq(day,after[0]),gt(c.id,after[1]))):undefined)).orderBy(asc(day),asc(c.id)).limit(21);
 return rows.map(({change,title,day})=>({id:`opportunity:${change.id}:${talentId}`,kind:"opportunity",title,date:day,time:"",timeZone:"UTC",urgency:"today",dueAt:null,href:`/grants?opportunity=${change.opportunityId}`,changeKind:change.kind,oldOpensOn:change.oldOpensOn,newOpensOn:change.newOpensOn,oldClosesOn:change.oldClosesOn,newClosesOn:change.newClosesOn}));
}
export async function unreadGrantChanges(talentId:string,personId:string,connection:Query=db){
 if(!grantsLocalEnabled())return null;
 const through=new Date().toISOString();
 const [row]=await connection.select({count:sql<number>`count(*)::int`}).from(c).innerJoin(g,eq(g.id,c.opportunityId))
 .leftJoin(n,and(eq(n.personId,personId),eq(n.notificationId,changeNotificationId(talentId))))
 .where(and(grantChangeAudience(talentId,personId),recentGrantChanges(),sql`${c.createdAt}<=${through}::timestamptz`,isNull(n.readAt),sql`(${n.snoozedUntil} is null or ${n.snoozedUntil}<=now())`));
 return {count:row.count,through};
}

export async function listOpportunityChanges(talentId:string,personId:string,opportunityId:string,cursor:string,connection:Query=db){
 const {z}=await import("zod");
 const {decodePageCursor,encodePageCursor,InvalidCursor}=await import("./page-cursor");
 const key=JSON.stringify([talentId,personId,opportunityId]);
 const after=decodePageCursor(cursor,z.tuple([z.iso.datetime(),z.uuid(),z.string()]));
 if(after&&after[2]!==key)throw new InvalidCursor("Changed opportunity");
 const rows=await connection.select({change:c,readAt:n.readAt}).from(c)
 .leftJoin(n,and(eq(n.personId,personId),eq(n.notificationId,changeNotificationId(talentId))))
 .where(and(eq(c.opportunityId,opportunityId),after?or(lt(c.createdAt,new Date(after[0])),and(eq(c.createdAt,new Date(after[0])),lt(c.id,after[1]))):undefined))
 .orderBy(desc(c.createdAt),desc(c.id)).limit(21);
 const items=rows.slice(0,20).map(({change,readAt})=>({...change,createdAt:change.createdAt.toISOString(),readAt:readAt?.toISOString()??null}));
 const last=items.at(-1);return {items,total:null,hasMore:rows.length>20,nextCursor:rows.length>20&&last?encodePageCursor([last.createdAt,last.id,key]):null};
}

export async function acknowledgeGrantChanges(talentId:string,personId:string,through:string,connection:Pick<typeof db,"execute">=db){
 await connection.execute(sql`insert into notification_state(person_id,notification_id,read_at)
 select ${personId}::uuid,${changeNotificationId(talentId)},now() from ${c}
 inner join ${g} on ${g.id}=${c.opportunityId}
 where ${grantChangeAudience(talentId,personId)} and ${recentGrantChanges()} and ${c.createdAt}<=${through}::timestamptz
 on conflict(person_id,notification_id) do update set read_at=excluded.read_at,snoozed_until=null`);
}
