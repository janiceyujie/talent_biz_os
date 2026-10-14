import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { grantOpportunity, grantSource } from "@/lib/db/schema";
import { grantsLocalEnabled } from "./config";
import { listingHash, parseGrantsGov, parseMoc } from "./domain";
import { grantSources, type GrantListing, type GrantSource } from "./types";

async function request(url: string, body?: object) {
  const r = await fetch(url, {method:body ? "POST" : "GET", headers:body ? {"Content-Type":"application/json"} : {}, body:body ? JSON.stringify(body) : undefined, signal:AbortSignal.timeout(20000), redirect:"error", cache:"no-store"});
  if (!r.ok) throw new Error("source_unavailable");
  // Read a bounded stream; public pages cannot consume unbounded worker memory.
  const reader = r.body?.getReader();
  if (!reader) throw new Error("source_empty");
  const chunks: Uint8Array[] = []; let size=0;
  try { for (;;) { const {done,value}=await reader.read(); if (done) break; size+=value.length; if(size>2_000_000) throw new Error("source_too_large"); chunks.push(value); } }
  finally { await reader.cancel(); }
  return Buffer.concat(chunks).toString("utf8");
}
async function readSource(source: GrantSource): Promise<GrantListing[]> {
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
export async function refreshGrantSources(): Promise<{source:GrantSource;ok:boolean}[]> {
  if (!grantsLocalEnabled()) throw new Error("grants_local_only");
  const outcomes=[];
  for (const source of grantSources) {
    const outcome=await db.transaction(async tx => {
      // Serialize manual refresh, cron, and retries across processes.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`grant-source:${source}`}))`);
      await tx.insert(grantSource).values({id:source}).onConflictDoNothing();
      const [state]=await tx.select().from(grantSource).where(eq(grantSource.id,source));
      if (state.attemptedAt && Date.now()-state.attemptedAt.getTime()<15*60*1000) return {source,ok:!state.failure};
      const now=new Date();
      try {
        const listings=await readSource(source);
        for (const listing of listings) {
          const contentHash=listingHash(listing);
          await tx.insert(grantOpportunity).values({...listing,contentHash,checkedAt:now,changedAt:now})
            .onConflictDoUpdate({target:[grantOpportunity.source,grantOpportunity.externalId],set:{...listing,contentHash,checkedAt:now,changedAt:sql`case when ${grantOpportunity.contentHash} <> ${contentHash} then ${now.toISOString()}::timestamptz else ${grantOpportunity.changedAt} end`}});
        }
        // Absence from a bounded feed is not proof of withdrawal; keep old records and their own check time.
        await tx.update(grantSource).set({checkedAt:now,attemptedAt:now,failure:null}).where(eq(grantSource.id,source));
        return {source,ok:true};
      } catch {
        await tx.update(grantSource).set({attemptedAt:now,failure:"source_unavailable"}).where(eq(grantSource.id,source));
        return {source,ok:false};
      }
    });
    outcomes.push(outcome);
  }
  return outcomes;
}
