/** Local-only additive tag backfill. Never modifies applicant tracking or review timestamps. */
import env from "@next/env";
import { eq } from "drizzle-orm";
import { classifyDisciplines } from "../lib/grants/disciplines";
import { officialIdentity } from "../lib/grants/official-sources";
import { reviewedCatalogue } from "../lib/grants/reviewed-catalogue";
env.loadEnvConfig(process.cwd());
const url=new URL(process.env.DATABASE_URL??"");
if(process.env.APP_ENV!=="development" || !["localhost","127.0.0.1","[::1]"].includes(url.hostname) || !/^\/taloox_(merged|integrated|refresh)_\d+$/.test(url.pathname))throw new Error("local_database_required");
const {db}=await import("../lib/db/index");
const {grantOpportunity}=await import("../lib/db/schema");
let updated=0;
await db.transaction(async tx=>{
 const rows=await tx.select().from(grantOpportunity);
 for(const row of rows){
  const curated=reviewedCatalogue.find(c=>row.source==="reviewed"?c.externalId===row.externalId:officialIdentity(row.url)!==null&&officialIdentity(c.url)===officialIdentity(row.url));
  const disciplines=classifyDisciplines({title:row.title,disciplines:curated?.disciplines??(row.disciplines.length?row.disciplines:undefined)});
  if(JSON.stringify(disciplines)===JSON.stringify(row.disciplines))continue;
  await tx.update(grantOpportunity).set({disciplines}).where(eq(grantOpportunity.id,row.id));updated++;
 }
});
console.log({updated});process.exit(0);
