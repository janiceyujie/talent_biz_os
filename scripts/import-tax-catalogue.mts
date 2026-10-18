/** Explicit local-only operator import. No automatic rule publication from scraped text. */
import env from "@next/env";
import { assertLocalTemplateStore } from "../lib/templates/local-store";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { usStates, taxRateInput } from "../lib/invoices/tax";
import { serviceCategories } from "../lib/tax/domain";
env.loadEnvConfig(process.cwd());
const target = new URL(process.env.DATABASE_URL || "invalid:");
if (process.env.APP_ENV !== "development" || !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) throw new Error("Tax import requires a local development database");
assertLocalTemplateStore(process.env.DATABASE_URL, process.env.STORAGE_S3_ENDPOINT);
const { stat, writeBytes } = await import("../lib/storage");
const sourceKeys = new Map<string, string>();
const path = process.argv[2];
if (!path) throw new Error("Usage: tsx --conditions=react-server scripts/import-tax-catalogue.mts <catalogue.json>");
const rate = z.object({code:z.string().min(1),name:z.string().min(1),county:z.string(),kind:z.enum(["component","combined"]),rate:z.coerce.number().pipe(taxRateInput),interstateRate:z.coerce.number().pipe(taxRateInput).nullable(),foodRate:z.coerce.number().pipe(taxRateInput).nullable(),foodInterstateRate:z.coerce.number().pipe(taxRateInput).nullable(),validFrom:z.iso.date(),validThrough:z.iso.date().nullable(),notes:z.string().default("")}).refine(r=>!r.validThrough || r.validThrough>=r.validFrom);
const input = z.object({version:z.literal(1),batches:z.array(z.object({state:z.enum(usStates),provider:z.enum(["sst","cdtfa"]),url:z.url(),sha256:z.string().regex(/^[a-f0-9]{64}$/),retrievedAt:z.iso.datetime({offset:true}),rates:z.array(rate).min(1).max(100000)})).min(1).max(51)}).parse(JSON.parse(await readFile(path,"utf8")));
const stateSet=new Set<string>();
for(const b of input.batches){
  if(stateSet.has(b.state))throw new Error("Duplicate state batch");stateSet.add(b.state);
  const u=new URL(b.url);
  if(u.protocol!=="https:" || (b.provider==="sst" ? u.hostname!=="www.streamlinedsalestax.org" || !u.pathname.startsWith("/ratesandboundry/Rates/") || b.rates.some(r=>r.kind!=="component") : u.hostname!=="cdtfa.ca.gov" || b.state!=="CA" || !u.pathname.startsWith("/taxes-and-fees/SalesTaxRates") || b.rates.some(r=>r.kind!=="combined")))throw new Error("Unexpected official source");
  const raw=await readFile(new URL(`./${b.sha256}.source`,new URL(`file://${path}`)));
  if(createHash("sha256").update(raw).digest("hex")!==b.sha256)throw new Error("Source checksum mismatch");
  const storageKey=`tax-catalogue/${b.provider}/${b.state}/${b.sha256}.source`;
  const stored=await stat(storageKey);
  if(!stored || stored.size!==raw.length)await writeBytes(storageKey,raw,"application/octet-stream");
  sourceKeys.set(b.sha256,storageKey);
  if(Date.parse(b.retrievedAt)>Date.now()+60000 || Date.parse(b.retrievedAt)<Date.now()-86400000)throw new Error("Import requires a fresh retrieval");
}
const {db}=await import("../lib/db");
const {taxSource:source,taxRateBatch:batch,taxRate:rates,taxServiceRule:rules}=await import("../lib/db/schema");
const hash=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
try{
 await db.transaction(async tx=>{
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('taloox.tax-catalogue-import'))`);
  for(const state of usStates){
   await tx.insert(source).values({state,directoryUrl:"https://taxadmin.org/tax-agencies/"}).onConflictDoNothing();
   for(const category of serviceCategories){
    const row={state,category,delivery:"any",status:"pending",treatment:"unknown",conditions:["State-specific taxability, sourcing, local exceptions and collection obligations require review."]};
    await tx.insert(rules).values({...row,contentHash:hash(row)}).onConflictDoNothing();
   }
  }
  for(const b of input.batches){
   const retrievedAt=new Date(b.retrievedAt);
   await tx.update(source).set({coverage:b.provider==="cdtfa"?"localityReference":"componentsOnly",rateIndexUrl:b.provider==="sst"?"https://www.streamlinedsalestax.org/ratesandboundry/Rates/":"https://cdtfa.ca.gov/taxes-and-fees/sales-use-tax-rates.htm",boundaryIndexUrl:b.provider==="sst"?"https://www.streamlinedsalestax.org/ratesandboundry/Boundary/":"https://maps.cdtfa.ca.gov/",checkedAt:retrievedAt}).where(eq(source.state,b.state));
   const [existing]=await tx.select().from(batch).where(and(eq(batch.state,b.state),eq(batch.contentHash,b.sha256)));
   await tx.update(batch).set({active:false}).where(eq(batch.state,b.state));
   if(existing){
    if(existing.rowCount!==b.rates.length)throw new Error("Same source hash with different parser output; review parser version");
    await tx.update(batch).set({active:true,retrievedAt,sourceStorageKey:sourceKeys.get(b.sha256)}).where(eq(batch.id,existing.id));continue;
   }
   const [record]=await tx.insert(batch).values({state:b.state,provider:b.provider,sourceUrl:b.url,contentHash:b.sha256,sourceStorageKey:sourceKeys.get(b.sha256),retrievedAt,active:true,rowCount:b.rates.length}).returning();
   for(let i=0;i<b.rates.length;i+=500){
    await tx.insert(rates).values(b.rates.slice(i,i+500).map(r=>({...r,batchId:record.id,state:b.state})));
   }
  }
  // Narrow, reviewed rule release. Re-importing rates never extends its review window.
  for(const delivery of ["electronic","physical"]){
   const row={state:"CA",category:"photography",delivery,status:"reviewed",treatment:delivery==="electronic"?"nonTaxable":"taxable",sourceUrl:"https://cdtfa.ca.gov/industry/photography/industry-topics.htm",validFrom:"2026-10-17",validThrough:"2026-11-16",reviewedAt:new Date("2026-10-17T00:00:00Z"),conditions:["California seller and California sourced transaction; user confirms jurisdiction.","Seller confirms registration and collection obligation; no exemption claimed.","Single ordinary photography sale; no technology transfer agreement or special exemption.",delivery==="electronic"?"Only electronic photographs, unrestricted personal reproduction; no physical goods, storage media or planned later physical delivery.":"Ordinary photography session with physical prints; entire package taxable; no separate licensed-rights valuation."]};
   await tx.insert(rules).values({...row,contentHash:hash(row)}).onConflictDoNothing();
  }
 });
 console.log(JSON.stringify({database:target.pathname.slice(1),sources:usStates.length,rateStates:input.batches.length,rateRows:input.batches.reduce((n,b)=>n+b.rates.length,0),pendingCategoryReviews:usStates.length*serviceCategories.length,reviewedRules:2}));
}finally{await (globalThis as unknown as {pgClient?:{end():Promise<void>}}).pgClient?.end();}
