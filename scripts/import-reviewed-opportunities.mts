/** Import reviewed public facts into the local database; never touch an applicant's tracking records. */
import env from "@next/env";
import { createHash } from "node:crypto";
env.loadEnvConfig(process.cwd());
const url=new URL(process.env.DATABASE_URL??"");
if(process.env.APP_ENV!=="development" || !["localhost","127.0.0.1","[::1]"].includes(url.hostname) || !/^\/taloox_(merged|integrated|refresh)_\d+$/.test(url.pathname)) throw new Error("local_database_required");
const {db}=await import("../lib/db/index");
const {grantOpportunity,grantSource}=await import("../lib/db/schema");
const {reviewedCatalogue}=await import("../lib/grants/reviewed-catalogue");
await db.transaction(async tx=>{
  await tx.insert(grantSource).values({id:"reviewed"}).onConflictDoNothing();
  for(const entry of reviewedCatalogue){
    const {reviewedOn,...fields}=entry;
    const checkedAt=new Date(reviewedOn+"T00:00:00Z"),contentHash=createHash("sha256").update(JSON.stringify(entry)).digest("hex");
    await tx.insert(grantOpportunity).values({...fields,source:"reviewed",checkedAt,changedAt:checkedAt,contentHash})
      .onConflictDoUpdate({target:[grantOpportunity.source,grantOpportunity.externalId],set:{...fields,checkedAt,changedAt:checkedAt,contentHash}});
  }
});
console.log(`Imported ${reviewedCatalogue.length} reviewed opportunities into the verified local database. No applications changed.`);
process.exit(0);
