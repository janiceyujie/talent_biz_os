import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { opportunity, opportunitySource } from "@/lib/db/schema";
import { dateInZone } from "@/lib/domain/dates";
import { GRANTS_GOV_DETAIL, GRANTS_GOV_SEARCH, parseDetail, parseSearch, searchBody } from "./sources/grants-gov";
import { listingHash, type Listing } from "./sources/listing";
import { MOC_URL, parseMoc } from "./sources/moc";
import { opportunitySources, type OpportunitySource } from "./types";

// Reading the sources into the shared catalogue (decision 0024), once a day
// from the worker (opportunities.refresh). The server reaches out to the
// internet here, so only these hosts, over HTTPS, with no redirects, a
// timeout, and a size cap. Nothing a person typed is ever fetched.

const HOSTS = new Set(["grants.moc.gov.tw", "api.grants.gov"]);
const MAX_BYTES = 2_000_000;
const MAX_PAGES = 10; // of 100 Grants.gov results
const MAX_DETAILS = 30; // Grants.gov details per run, 3 at a time
const CLOSED_KEPT_DAYS = 30; // a call closed this recently is still read in, so its date stays current

async function request(url: string, body?: object, signal?: AbortSignal): Promise<string> {
  const target = new URL(url);
  if (target.protocol !== "https:" || !HOSTS.has(target.hostname)) throw new Error("source_not_allowed");
  const timeout = AbortSignal.timeout(20_000);
  const r = await fetch(target, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    redirect: "error",
    cache: "no-store",
  });
  if (!r.ok || !r.body) throw new Error(`source_unavailable_${r.status}`);
  const reader = r.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) throw new Error("source_too_large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readMoc(): Promise<Listing[]> {
  return parseMoc(await request(MOC_URL), dateInZone("Asia/Taipei", -CLOSED_KEPT_DAYS));
}

async function readGrantsGov(): Promise<Listing[]> {
  const rows: Listing[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const parsed = parseSearch(JSON.parse(await request(GRANTS_GOV_SEARCH, searchBody(page))));
    rows.push(...parsed.rows);
    if (rows.length >= parsed.total || !parsed.rows.length) break;
  }
  // The rules come from each call's detail; one that fails stays unknown, and the listing is kept.
  const budget = AbortSignal.timeout(30_000);
  let next = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      for (let i = next++; i < Math.min(rows.length, MAX_DETAILS) && !budget.aborted; i = next++) {
        const id = rows[i].externalId;
        rows[i].rules = await request(GRANTS_GOV_DETAIL, { opportunityId: Number(id) }, budget)
          .then((text) => parseDetail(JSON.parse(text), id))
          .catch(() => null);
      }
    }),
  );
  return rows;
}

const readers: Record<OpportunitySource, () => Promise<Listing[]>> = { moc: readMoc, grants_gov: readGrantsGov };

/**
 * Every source in turn: read it, then write what it said in one transaction
 * under the source's lock (a retry and a second worker don't write it at
 * once). A call missing from a source's latest read is kept: a list that
 * leaves something out hasn't said it was withdrawn. A source that fails
 * keeps what it had, and records why.
 */
export async function refreshOpportunities(): Promise<{ source: OpportunitySource; ok: boolean; count: number }[]> {
  const outcomes = [];
  for (const source of opportunitySources) {
    await db.insert(opportunitySource).values({ id: source }).onConflictDoNothing();
    const now = new Date();
    try {
      const listings = await readers[source]();
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`opportunity-source:${source}`}))`);
        for (const { externalId, ...listing } of listings) {
          const contentHash = listingHash({ externalId, ...listing });
          await tx
            .insert(opportunity)
            .values({ ...listing, externalId, contentHash, checkedAt: now, changedAt: now })
            .onConflictDoUpdate({
              target: [opportunity.source, opportunity.externalId],
              set: {
                ...listing,
                contentHash,
                checkedAt: now,
                changedAt: sql`case when ${opportunity.contentHash} <> ${contentHash} then ${now.toISOString()}::timestamptz else ${opportunity.changedAt} end`,
              },
            });
        }
        await tx.update(opportunitySource).set({ checkedAt: now, attemptedAt: now, failure: null }).where(eq(opportunitySource.id, source));
      });
      outcomes.push({ source, ok: true, count: listings.length });
    } catch (e) {
      console.error("opportunities.refresh", source, e);
      await db
        .update(opportunitySource)
        .set({ attemptedAt: now, failure: e instanceof Error ? e.message.slice(0, 200) : "failed" })
        .where(eq(opportunitySource.id, source));
      outcomes.push({ source, ok: false, count: 0 });
    }
  }
  return outcomes;
}
