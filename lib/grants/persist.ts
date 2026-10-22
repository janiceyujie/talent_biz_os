import "server-only";
import {eq} from "drizzle-orm";
import {db} from "@/lib/db";
import {grantOpportunity,grantChange} from "@/lib/db/schema";
import {opportunityChange} from "./changes";
import {listingHash} from "./domain";
import type {GrantListing} from "./types";
type Transaction=Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Caller holds the source advisory lock. Catalogue update and versioned event commit atomically. */
export async function persistGrantListing(tx:Transaction,listing:GrantListing,before:typeof grantOpportunity.$inferSelect|undefined,now:Date){
 const change=opportunityChange(before,listing),contentHash=listingHash(listing);
 const values={...listing,contentHash,checkedAt:now,changedAt:before?.contentHash===contentHash?before.changedAt:now,noticeRevision:(before?.noticeRevision??0)+(change?1:0)};
 const [saved]=before?await tx.update(grantOpportunity).set(values).where(eq(grantOpportunity.id,before.id)).returning():await tx.insert(grantOpportunity).values(values).returning();
 if(change)await tx.insert(grantChange).values({...change,opportunityId:saved.id,revision:saved.noticeRevision,createdAt:now});
 return saved;
}
