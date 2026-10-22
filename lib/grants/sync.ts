import "server-only";
import { persistGrantListing } from "./persist";
import { readTaipeiSource } from "./taipeiff-source";
import { readSkmSource, readKmfaSource, reviewedCallIdentity } from "./taiwan-call-sources";
import { classifyDisciplines } from "./disciplines";
import { awardSources, readAwardSource, type AwardSource } from "./award-sources";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { grantOpportunity, grantSource } from "@/lib/db/schema";
import { grantsLocalEnabled } from "./config";
import { grantPlainText, parseGrantsGov, parseMoc } from "./domain";
import { enrichGrantsGovEligibility } from "./grants-gov-eligibility";
import { officialIdentity, officialSources, readOfficialSource, type OfficialSource } from "./official-sources";
import { reuseGrantRefresh } from "./refresh-policy";
import { grantSources, type GrantListing, type GrantSource } from "./types";

async function request(url: string, body?: object, budget?:AbortSignal) {
  const r = await fetch(url, {method:body ? "POST" : "GET", headers:body ? {"Content-Type":"application/json"} : {}, body:body ? JSON.stringify(body) : undefined, signal:budget?AbortSignal.any([budget,AbortSignal.timeout(10000)]):AbortSignal.timeout(20000), redirect:"error", cache:"no-store"});
  if (!r.ok) throw new Error("source_unavailable");
  // Read a bounded stream; public pages cannot consume unbounded worker memory.
  const reader = r.body?.getReader();
  if (!reader) throw new Error("source_empty");
  const chunks: Uint8Array[] = []; let size=0;
  try { for (;;) { const {done,value}=await reader.read(); if (done) break; size+=value.length; if(size>2_000_000) throw new Error("source_too_large"); chunks.push(value); } }
  finally { await reader.cancel(); }
  return Buffer.concat(chunks).toString("utf8");
}
async function readSource(source: (typeof grantSources)[number], knownUrls:string[]): Promise<GrantListing[]> {
  if(source==="taipeiff")return readTaipeiSource((url,signal,body)=>request(url,body,signal),knownUrls);
  if(source==="skm")return readSkmSource((url,signal)=>request(url,undefined,signal));
  if(source==="kmfa_award")return readKmfaSource((url,signal)=>request(url,undefined,signal),knownUrls);
  if (awardSources.includes(source as AwardSource)) return readAwardSource(source as AwardSource,(url,signal)=>request(url,undefined,signal));
  if (officialSources.includes(source as OfficialSource)) return readOfficialSource(source as OfficialSource,(url,signal)=>request(url,undefined,signal),knownUrls);
  if (source === "moc") return parseMoc(await request("https://grants.moc.gov.tw/Web/"));
  const rows: GrantListing[]=[];
  for (let page=0;page<10;page++) {
    const parsed=parseGrantsGov(JSON.parse(await request("https://api.grants.gov/v1/api/search2", {rows:100,startRecordNum:page*100,fundingCategories:"AR",oppStatuses:"forecasted|posted",keyword:""})));
    rows.push(...parsed.rows);
    if (rows.length >= parsed.total) return rows;
    if (!parsed.rows.length) throw new Error("source_incomplete");
  }
  throw new Error("source_result_limit");
}
/** Cached once for all accounts. No AI, credentials, mail, or paid lookup service. */
export async function refreshGrantSources(options: {manual?:boolean} = {}): Promise<{source:GrantSource;ok:boolean}[]> {
  if (!grantsLocalEnabled()) throw new Error("grants_local_only");
  const requestedAt = new Date();
  const outcomes=[];
  for (const source of grantSources) {
    let outcome: {source:GrantSource;ok:boolean};
    try { outcome=await db.transaction(async tx => {
      // Serialize manual refresh, cron, and retries across processes.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`grant-source:${source}`}))`);
      await tx.insert(grantSource).values({id:source}).onConflictDoNothing();
      const [state]=await tx.select().from(grantSource).where(eq(grantSource.id,source));
      if (!state.failure && reuseGrantRefresh(state.attemptedAt, requestedAt, !!options.manual)) return {source,ok:!state.failure};
      const now=new Date();
        const existing=await tx.select().from(grantOpportunity).where(sql`${grantOpportunity.source} in (${source}, 'reviewed')`);
        const knownUrls=existing.filter(row=>row.closesOn===null || row.closesOn>=now.toISOString().slice(0,10)).map(row=>row.url);
        let listings=await readSource(source,knownUrls);
        if(source==="grants_gov") listings=await enrichGrantsGovEligibility(listings,async(id,signal)=>JSON.parse(await request("https://api.grants.gov/v1/api/fetchOpportunity",{opportunityId:Number(id)},signal)),now);
        const previous=source==="moc"?await tx.select({externalId:grantOpportunity.externalId,title:grantOpportunity.title}).from(grantOpportunity).where(eq(grantOpportunity.source,source)):[];
        for (const raw of listings) {
          const incoming={...raw,disciplines:classifyDisciplines(raw)};
          const matches=previous.filter(row=>grantPlainText(row.title)===incoming.title);
          const legacy=matches.find(row=>row.externalId===incoming.externalId) ?? (matches.length===1?matches[0]:undefined);
          const cached=existing.find(row=>row.source===source&&row.externalId===incoming.externalId);
          const listing=legacy?{...incoming,externalId:legacy.externalId}:cached?{...incoming,disciplines:cached.disciplines.length?cached.disciplines:incoming.disciplines,eligibility:cached.eligibility}:incoming;
          const reviewed=existing.filter(row=>row.source==="reviewed" && ((officialIdentity(row.url)!==null && officialIdentity(row.url)===officialIdentity(listing.url)) || (reviewedCallIdentity(source,listing.externalId,listing.url)!==null && reviewedCallIdentity(row.source,row.externalId,row.url)===reviewedCallIdentity(source,listing.externalId,listing.url))));
          if(reviewed.length>1)throw new Error("ambiguous_reviewed_identity");
          // Adoption retains applications and does not create a fake new-opportunity event.
          const prior=cached??(legacy?existing.find(row=>row.source===source&&row.externalId===legacy.externalId):undefined)??reviewed[0];
          const finalListing=prior?{...listing,disciplines:prior.disciplines.length?prior.disciplines:listing.disciplines,eligibility:prior.eligibility}:listing;
          const saved=await persistGrantListing(tx,finalListing,prior,now);
          const index=existing.findIndex(row=>row.id===saved.id);if(index<0)existing.push(saved);else existing[index]=saved;

        }
        // Absence from a bounded feed is not proof of withdrawal; keep old records and their own check time.
        await tx.update(grantSource).set({checkedAt:now,attemptedAt:new Date(),failure:null}).where(eq(grantSource.id,source));
        return {source,ok:true};
    }); } catch {
      // Record failures outside the rolled-back transaction, including database/write failures.
      await db.insert(grantSource).values({id:source,attemptedAt:new Date(),failure:"source_unavailable"})
        .onConflictDoUpdate({target:grantSource.id,set:{attemptedAt:new Date(),failure:"source_unavailable"}});
      outcome={source,ok:false};
    }
    outcomes.push(outcome);
  }
  return outcomes;
}
