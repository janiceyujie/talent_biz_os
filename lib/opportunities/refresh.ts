import "server-only";
import { and, eq, inArray, notExists, notInArray, sql } from "drizzle-orm";
import { aiPaused } from "@/lib/ai/pause";
import { generateObject, ModelError } from "@/lib/ai/model";
import { db } from "@/lib/db";
import { opportunity, opportunityApplication, opportunityPage, opportunitySource } from "@/lib/db/schema";
import { dateInZone } from "@/lib/domain/dates";
import { GRANTS_GOV_DETAIL, GRANTS_GOV_SEARCH, parseDetail, parseSearch, searchBody } from "./sources/grants-gov";
import { listingHash, type Listing } from "./sources/listing";
import { MOC_URL, parseMoc } from "./sources/moc";
import {
  announcementText,
  checkedCalls,
  EXTRACTION_PROMPT_VERSION,
  EXTRACTION_SYSTEM,
  extractionPrompt,
  extractionSchema,
  linksOn,
} from "./sources/pages";
import { trackedHosts, trackedPages } from "./tracked";
import { opportunitySources, type OpportunitySource } from "./types";

// Reading the sources into the shared catalogue (decision 0024), once a day
// from the worker (opportunities.refresh). The server reaches out to the
// internet here, so only these hosts, over HTTPS, with no redirects, a
// timeout, and a size cap. Nothing a person typed is ever fetched: a tracked
// page's announcements are links on that page, on its own host.

const HOSTS = new Set(["grants.moc.gov.tw", "api.grants.gov", ...trackedHosts()]);
const MAX_BYTES = 2_000_000;
const MAX_PAGES = 10; // of 100 Grants.gov results
const MAX_DETAILS = 30; // Grants.gov details per run, 3 at a time
const CLOSED_KEPT_DAYS = 30; // a call closed this recently is still read in, so its date stays current
const MAX_EXTRACTIONS = 40; // model reads of changed announcements per run, across every tracked page

async function request(url: string, body?: object, signal?: AbortSignal): Promise<string> {
  const target = new URL(url);
  if (target.protocol !== "https:" || !HOSTS.has(target.hostname)) throw new Error("source_not_allowed");
  const timeout = AbortSignal.timeout(20_000);
  const r = await fetch(target, {
    method: body ? "POST" : "GET",
    headers: { "User-Agent": "Taloox opportunities reader", ...(body ? { "Content-Type": "application/json" } : {}) },
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

/**
 * What one read of a source gives: its calls, and for the tracked pages, the
 * announcements read unchanged (their calls are as current as before) and
 * what to remember of each page, written with the calls. `problems` are what
 * went wrong without failing the source, for the team (lib/opportunities/alert.ts).
 */
type Read = { listings: Listing[]; unchanged?: string[]; reread?: string[]; pages?: (typeof opportunityPage.$inferInsert)[]; problems?: string[]; failure?: string };

async function readMoc(): Promise<Read> {
  return { listings: parseMoc(await request(MOC_URL), dateInZone("Asia/Taipei", -CLOSED_KEPT_DAYS)) };
}

async function readGrantsGov(): Promise<Read> {
  const rows: Listing[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const parsed = parseSearch(JSON.parse(await request(GRANTS_GOV_SEARCH, searchBody(page))));
    rows.push(...parsed.rows);
    if (rows.length >= parsed.total || !parsed.rows.length) break;
  }
  // The rules come from each call's detail, new calls first. A detail not read this run (a failed
  // request, or past the cap) keeps the rules last read, so one bad request doesn't flip a call's screening.
  const stored = new Map(
    (await db.select({ id: opportunity.externalId, rules: opportunity.rules }).from(opportunity).where(eq(opportunity.source, "grants_gov"))).map((r) => [r.id, r.rules]),
  );
  for (const row of rows) row.rules = stored.get(row.externalId) ?? null;
  const queue = rows.toSorted((a, b) => Number(stored.has(a.externalId)) - Number(stored.has(b.externalId))).slice(0, MAX_DETAILS);
  const budget = AbortSignal.timeout(30_000);
  let next = 0;
  let failed = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      for (let row = queue[next++]; row && !budget.aborted; row = queue[next++]) {
        const id = row.externalId;
        await request(GRANTS_GOV_DETAIL, { opportunityId: Number(id) }, budget)
          .then((text) => (row.rules = parseDetail(JSON.parse(text), id)))
          .catch((e) => {
            failed++;
            console.error("opportunities.refresh grants_gov detail", id, e);
          });
      }
    }),
  );
  return { listings: rows, problems: failed ? [`${failed} of ${queue.length} details couldn't be read; their rules are as last read`] : [] };
}

/**
 * The tracked pages: each list, then each announcement on it. An
 * announcement whose text is what the model last read, with the same prompt,
 * is left as it was; a new or changed one is read by the model and checked
 * (lib/opportunities/sources/pages.ts). While AI is paused, or a read fails,
 * the announcement isn't remembered, so the next run reads it. A page that fails is recorded
 * on its own; the source fails only when every page does.
 */
async function readPages(): Promise<Read> {
  const now = new Date();
  const read: Required<Omit<Read, "failure">> = { listings: [], unchanged: [], reread: [], pages: [], problems: [] };
  let extractions = 0;
  let failed = 0;
  for (const page of trackedPages) {
    const today = dateInZone(page.timeZone);
    let links;
    try {
      const on = linksOn(await request(page.url), page);
      if (!on.total) throw new Error("page_no_announcements"); // its markup changed, most likely
      links = on.links;
      read.pages.push({ url: page.url, trackedId: page.id, role: "list", checkedAt: now, attemptedAt: now, failure: null });
    } catch (e) {
      console.error("opportunities.refresh page", page.id, e);
      failed++;
      read.problems.push(`${page.id}: ${page.url}: ${failureOf(e)}`);
      read.pages.push({ url: page.url, trackedId: page.id, role: "list", attemptedAt: now, failure: failureOf(e) });
      continue;
    }
    const known = await db
      .select({ url: opportunityPage.url, textHash: opportunityPage.textHash, promptVersion: opportunityPage.promptVersion })
      .from(opportunityPage)
      .where(inArray(opportunityPage.url, links.map((l) => l.url)));
    for (const link of links) {
      try {
        const { text, hash, instructions } = announcementText(await request(link.url), link, page);
        const last = known.find((k) => k.url === link.url);
        if (last?.textHash === hash && last.promptVersion === EXTRACTION_PROMPT_VERSION) {
          read.unchanged.push(link.url);
          read.pages.push({ url: link.url, trackedId: page.id, role: "announcement", textHash: hash, checkedAt: now, attemptedAt: now, failure: null });
          continue;
        }
        // Words aimed at an AI on an official page: not read, and left for a person to look at.
        if (instructions) throw new Error("page_instructions_to_ai");
        if (extractions >= MAX_EXTRACTIONS || (await aiPaused())) continue;
        extractions++;
        const { object, modelVersion } = await generateObject({
          system: EXTRACTION_SYSTEM,
          prompt: extractionPrompt(text, page, today),
          schema: extractionSchema,
          trace: { task: "opportunity", promptVersion: EXTRACTION_PROMPT_VERSION },
        });
        const calls = checkedCalls(object, text, link, page, today);
        read.listings.push(...calls);
        read.reread.push(link.url);
        read.pages.push({
          url: link.url,
          trackedId: page.id,
          role: "announcement",
          textHash: hash,
          calls: calls.length,
          modelVersion,
          promptVersion: EXTRACTION_PROMPT_VERSION,
          checkedAt: now,
          attemptedAt: now,
          failure: null,
        });
      } catch (e) {
        if (e instanceof ModelError && e.code === "paused") continue;
        console.error("opportunities.refresh announcement", link.url, e);
        read.problems.push(`${page.id}: ${link.url}: ${failureOf(e)}`);
        read.pages.push({ url: link.url, trackedId: page.id, role: "announcement", attemptedAt: now, failure: failureOf(e) });
      }
    }
  }
  return failed && failed === trackedPages.length ? { ...read, failure: "pages_unavailable" } : read;
}

const failureOf = (e: unknown) => (e instanceof Error ? e.message.slice(0, 200) : "failed");

const readers: Record<OpportunitySource, () => Promise<Read>> = { moc: readMoc, grants_gov: readGrantsGov, pages: readPages };

/**
 * Every source in turn: read it, then write what it said in one transaction
 * under the source's lock (a retry and a second worker don't write it at
 * once). A call missing from a source's latest read is kept: a list that
 * leaves something out hasn't said it was withdrawn. A source that fails
 * keeps what it had, and records why.
 */
export type RefreshOutcome = { source: OpportunitySource; ok: boolean; count: number; failure?: string; lastRead: Date | null; problems: string[] };

export async function refreshOpportunities(): Promise<RefreshOutcome[]> {
  const outcomes: RefreshOutcome[] = [];
  for (const source of opportunitySources) {
    await db.insert(opportunitySource).values({ id: source }).onConflictDoNothing();
    const now = new Date();
    const [{ lastRead = null } = {}] = await db.select({ lastRead: opportunitySource.checkedAt }).from(opportunitySource).where(eq(opportunitySource.id, source));
    try {
      const { listings, unchanged = [], reread = [], pages = [], problems = [], failure } = await readers[source]();
      if (failure) throw new Error(failure);
      // A structured source that suddenly gives far fewer calls has most likely changed its format, not its calls.
      if (source !== "pages") {
        const [{ before }] = await db
          .select({ before: sql<number>`count(*)::int` })
          .from(opportunity)
          .where(and(eq(opportunity.source, source), sql`${opportunity.checkedAt} > ${new Date(now.getTime() - 36 * 3600_000).toISOString()}::timestamptz`));
        if (before >= 10 && listings.length < before / 2) problems.push(`${listings.length} calls read, ${before} the last time`);
      }
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
        // An announcement read again says what it holds now: a call it no longer gives goes, unless someone follows it.
        for (const url of reread) {
          const kept = listings.filter((l) => l.url === url).map((l) => l.externalId);
          await tx
            .delete(opportunity)
            .where(
              and(
                eq(opportunity.source, source),
                eq(opportunity.url, url),
                kept.length ? notInArray(opportunity.externalId, kept) : undefined,
                notExists(tx.select({ id: opportunityApplication.id }).from(opportunityApplication).where(eq(opportunityApplication.opportunityId, opportunity.id))),
              ),
            );
        }
        if (unchanged.length) await tx.update(opportunity).set({ checkedAt: now }).where(and(eq(opportunity.source, source), inArray(opportunity.url, unchanged)));
        for (const page of pages) {
          // A failed read keeps what was last read: the hash stays, so an unchanged page isn't read by the model again.
          await tx.insert(opportunityPage).values(page).onConflictDoUpdate({ target: opportunityPage.url, set: page });
        }
        await tx.update(opportunitySource).set({ checkedAt: now, attemptedAt: now, failure: null }).where(eq(opportunitySource.id, source));
      });
      outcomes.push({ source, ok: true, count: listings.length, lastRead, problems });
    } catch (e) {
      console.error("opportunities.refresh", source, e);
      await db
        .update(opportunitySource)
        .set({ attemptedAt: now, failure: failureOf(e) })
        .where(eq(opportunitySource.id, source));
      outcomes.push({ source, ok: false, count: 0, failure: failureOf(e), lastRead, problems: [] });
    }
  }
  return outcomes;
}
