import "server-only";
import { and, asc, count, eq, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { preference, grantApplication, grantOpportunity as grant } from "@/lib/db/schema";
import { dateInZone } from "@/lib/domain/dates";
import { LIST_PAGE_SIZE, type CursorPage } from "@/lib/domain/cursor-page";
import type { GrantOpportunity } from "@/lib/grants/types";
import { decodePageCursor, encodePageCursor, InvalidCursor, literalSearch } from "./page-cursor";

import { opportunityDisciplines } from "@/lib/grants/disciplines";
import { eligibilityProfileSchema } from "@/lib/grants/eligibility";

export const grantListParams = z.object({
  region: z.enum(["all", "TW", "US"]).default("all"), scope: z.enum(["discover", "mine"]).default("discover"),
  availability: z.enum(["active", "all", "open", "upcoming", "check", "closed"]).default("active"),
  kind:z.enum(["all","grant","opportunities","competition","exhibition","showcase"]).default("all"),
  discipline:z.enum(["all","unclassified",...opportunityDisciplines]).default("all"),
  eligibility:z.enum(["all","possible","match","check","mismatch"]).default("all"),
  q: z.string().max(200).default(""), cursor: z.string().max(3000).default(""),
});
/** Filter and sort in PostgreSQL before LIMIT. Freeze the clock for each cursor chain. */
export async function listGrantOpportunities(talentId: string, timeZone: string, params: z.infer<typeof grantListParams>, personId?: string): Promise<CursorPage<GrantOpportunity>> {
  const query = params.q.normalize("NFKC").trim();
  const [savedProfile] = personId ? await db.select({value:preference.value}).from(preference).where(and(eq(preference.personId,personId),eq(preference.talentId,talentId),eq(preference.key,"opportunities.profile"))) : [];
  const profileResult=eligibilityProfileSchema.safeParse(savedProfile?.value);
  const profile=profileResult.success?profileResult.data:null;
  const key = JSON.stringify([talentId, personId, timeZone, params.region, params.scope, params.availability, params.kind, params.discipline, params.eligibility, profile, query]);
  const cursor = decodePageCursor(params.cursor, z.tuple([z.number().int().min(0).max(3), z.iso.date(), z.uuid(), z.iso.datetime(), z.string()]));
  if (cursor && cursor[4] !== key) throw new InvalidCursor("Cursor filters changed");
  const asOf = cursor?.[3] ?? new Date().toISOString();
  const instant = new Date(asOf);
  const today = sql`case when ${grant.region} = 'TW' then ${dateInZone("Asia/Taipei", 0, instant)}::date else ${dateInZone(timeZone, 0, instant)}::date end`;
  // Keep this priority equivalent to grantAvailability; the database checks the full collection.
  const priority = sql<number>`case
    when ${grant.closesOn} < (${today}) then 3
    when ${grant.checkedAt} < ${asOf}::timestamptz - interval '24 hours' then 2
    when ${grant.sourceStatus} = 'forecasted' or ${grant.opensOn} > (${today}) then 1
    when ${grant.sourceStatus} = 'posted' and ${grant.opensOn} <= (${today}) then 0
    else 2 end`;
  // Shared reviewed JSON has validated imports. Unknown/missing/stale evidence must never exclude a candidate.
  const rule=grant.eligibility;
  const eligibility=sql<string>`case
    when ${rule} is null or ${rule}->>'version' <> '1'
      or ${rule}->>'verifiedOn' > ${asOf.slice(0,10)} or ${rule}->>'validThrough' < ${asOf.slice(0,10)} then 'check'
    when (jsonb_typeof(${rule}->'applicantTypes')='array' and ${profile?.applicantType??null}::text is not null and not (${rule}->'applicantTypes' ? ${profile?.applicantType??""}))
      or (jsonb_typeof(${rule}->'countries')='array' and ${profile?.country??null}::text is not null and not (${rule}->'countries' ? ${profile?.country??""})) then 'mismatch'
    when (jsonb_typeof(${rule}->'applicantTypes')='array' and ${profile?.applicantType??null}::text is null)
      or (jsonb_typeof(${rule}->'countries')='array' and ${profile?.country??null}::text is null) then 'check'
    when jsonb_typeof(${rule}->'applicantTypes')='array' or jsonb_typeof(${rule}->'countries')='array' then 'match'
    else 'check' end`;
  const deadline = sql<string>`coalesce(${grant.closesOn}::text, '9999-12-31')`;
  const states = { open: 0, upcoming: 1, check: 2, closed: 3 };
  const availability = params.scope === "mine" ? "all" : params.availability;
  const filters = and(
    params.discipline === "all" ? undefined : params.discipline === "unclassified" ? sql`cardinality(${grant.disciplines}) = 0` : sql`${grant.disciplines} @> ARRAY[${params.discipline}]::text[]`,
    params.kind === "all" ? undefined : params.kind === "opportunities" ? sql`${grant.kind} <> 'grant'` : eq(grant.kind,params.kind),
    params.eligibility === "all" ? undefined : params.eligibility === "possible" ? sql`(${eligibility}) <> 'mismatch'` : sql`(${eligibility}) = ${params.eligibility}`,
    params.region === "all" ? undefined : eq(grant.region, params.region),
    query ? ilike(sql`normalize(${grant.title} || ' ' || ${grant.agency}, NFKC)`, literalSearch(query)) : undefined,
    params.scope === "mine" ? sql`exists (select 1 from ${grantApplication} a where a.opportunity_id = ${grant.id} and a.talent_id = ${talentId}::uuid)` : undefined,
    availability === "all" ? undefined : availability === "active" ? sql`(${priority}) <> 3` : sql`(${priority}) = ${states[availability]}`);
  const [rows, [total]] = await Promise.all([
    db.select({ grant, priority, deadline }).from(grant).where(and(filters,
      cursor ? sql`((${priority}), ${deadline}, ${grant.id}) > (${cursor[0]}::int, ${cursor[1]}, ${cursor[2]}::uuid)` : undefined))
      .orderBy(asc(priority), asc(deadline), asc(grant.id)).limit(LIST_PAGE_SIZE + 1),
    db.select({ value: count() }).from(grant).where(filters),
  ]);
  const visible = rows.slice(0, LIST_PAGE_SIZE), last = visible.at(-1);
  return { items: visible.map(({ grant: row }) => ({ ...row, source: row.source as GrantOpportunity["source"], checkedAt: row.checkedAt.toISOString(), changedAt: row.changedAt.toISOString() })),
    total: total.value, nextCursor: rows.length > LIST_PAGE_SIZE && last ? encodePageCursor([last.priority, last.deadline, last.grant.id, asOf, key]) : null };
}
