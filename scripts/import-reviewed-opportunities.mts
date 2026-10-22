/** Import reviewed public facts into the local database; never touch an applicant's tracking records. */
import env from "@next/env";
import { classifyDisciplines } from "../lib/grants/disciplines";
import { reviewedCallIdentity } from "../lib/grants/taiwan-call-sources";
import { officialIdentity } from "../lib/grants/official-sources";
import { sql } from "drizzle-orm";
import { createHash } from "node:crypto";
env.loadEnvConfig(process.cwd());
const url=new URL(process.env.DATABASE_URL??"");
if(process.env.APP_ENV!=="development" || !["localhost","127.0.0.1","[::1]"].includes(url.hostname) || !/^\/taloox_(merged|integrated|refresh)_\d+$/.test(url.pathname)) throw new Error("local_database_required");
const {db}=await import("../lib/db/index");
const {grantOpportunity,grantSource}=await import("../lib/db/schema");
const {reviewedCatalogue}=await import("../lib/grants/reviewed-catalogue");
await db.transaction(async tx=>{
  await tx.insert(grantSource).values({id:"reviewed"}).onConflictDoNothing();
  const automated=await tx.select({url:grantOpportunity.url,source:grantOpportunity.source,externalId:grantOpportunity.externalId}).from(grantOpportunity).where(sql`${grantOpportunity.source} <> 'reviewed'`);
  for(const entry of reviewedCatalogue){
    const adopted=reviewedCallIdentity("reviewed",entry.externalId,entry.url);
    if(adopted && automated.some(row=>reviewedCallIdentity(row.source,row.externalId,row.url)===adopted))continue;
    const identity=officialIdentity(entry.url);
    if(identity && automated.some(row=>officialIdentity(row.url)===identity))continue;
    const {reviewedOn,...raw}=entry;
    const fields={...raw,disciplines:classifyDisciplines(raw)};
    const checkedAt=new Date(reviewedOn+"T00:00:00Z"),contentHash=createHash("sha256").update(JSON.stringify(entry)).digest("hex");
    await tx.insert(grantOpportunity).values({...fields,source:"reviewed",checkedAt,changedAt:checkedAt,contentHash})
      .onConflictDoUpdate({target:[grantOpportunity.source,grantOpportunity.externalId],set:{...fields,checkedAt,changedAt:checkedAt,contentHash}});
  }
});
console.log(`Imported ${reviewedCatalogue.length} reviewed opportunities into the verified local database. No applications changed.`);
process.exit(0);
