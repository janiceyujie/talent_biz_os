import "server-only";
import {and,eq,inArray} from "drizzle-orm";
import {db} from "@/lib/db";
import {mailConnection,membership} from "@/lib/db/schema";
type Transaction=Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Hold connection/owner locks while committing work read from a mailbox. */
export async function lockMailboxOwner(tx:Transaction,id:string) {
  const [c]=await tx.select().from(mailConnection).where(and(eq(mailConnection.id,id),inArray(mailConnection.status,["connected","error"]))).for("update");
  if(!c?.connectedBy)return null;
  const owner=await tx.select({id:membership.id}).from(membership).where(and(eq(membership.talentId,c.talentId),eq(membership.personId,c.connectedBy),eq(membership.role,"owner"),eq(membership.status,"active"))).for("share");
  return owner.length?c:null;
}
export async function mailboxOwnerActive(id:string){return db.transaction(async tx=>!!await lockMailboxOwner(tx,id));}
