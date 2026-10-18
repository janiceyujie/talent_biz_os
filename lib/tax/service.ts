import "server-only";
import { and, eq, ilike, asc, lte, gte, or, isNull, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { taxRate, taxRateBatch, taxServiceRule, taxSource, taxReference, taxReferenceRelease } from "@/lib/db/schema";
import { resolveTax, type TaxContext, type RuleEvidence, type RateEvidence } from "./domain";

type Reader = Pick<typeof db, "select">;
export async function taxCoverage(state: string) {
  const [source] = await db.select().from(taxSource).where(eq(taxSource.state, state));
  return source ?? null;
}
export async function findTaxLocalities(state: string, query: string, saleOn: string, offset = 0) {
  const rows = await db.select({ id: taxRate.id, name: taxRate.name, county: taxRate.county, rate: taxRate.rate, notes: taxRate.notes })
    .from(taxRate).innerJoin(taxRateBatch, eq(taxRate.batchId, taxRateBatch.id))
    .where(and(eq(taxRate.state, state), eq(taxRate.kind, "combined"), eq(taxRateBatch.active, true),
      ilike(taxRate.name, `%${query.replace(/[\\%_]/g, "\\$&")}%`), lte(taxRate.validFrom, saleOn), or(isNull(taxRate.validThrough), gte(taxRate.validThrough, saleOn))))
    .orderBy(asc(taxRate.name), asc(taxRate.id)).limit(21).offset(offset);
  return { items: rows.slice(0, 20), nextOffset: rows.length > 20 ? offset + 20 : null };
}
export async function resolveCatalogueTax(context: TaxContext, reader: Reader = db) {
  const rules = await reader.select().from(taxServiceRule).where(and(eq(taxServiceRule.state, context.state), eq(taxServiceRule.category, context.category), eq(taxServiceRule.status, "reviewed")));
  let rate: RateEvidence | undefined;
  if (context.jurisdictionId) {
    const [record] = await reader.select({ r: taxRate, b: taxRateBatch }).from(taxRate)
      .innerJoin(taxRateBatch, eq(taxRate.batchId, taxRateBatch.id))
      .where(and(eq(taxRate.id, context.jurisdictionId), eq(taxRateBatch.active, true)));
    if (record) rate = { ...record.r, sourceUrl: record.b.sourceUrl, batchHash: record.b.contentHash, checkedAt: record.b.retrievedAt.toISOString(), name: record.r.name };
  }
  return resolveTax(context, rules.filter(r => r.validFrom && r.validThrough && r.sourceUrl) as RuleEvidence[], rate, new Date().toISOString().slice(0, 10));
}

/** Evidence-only references never enter resolveCatalogueTax or invoice arithmetic. */
export async function findTaxReferences(state: string, query: string, saleOn: string, offset = 0) {
  const base = and(eq(taxReference.state, state), eq(taxReferenceRelease.active, true));
  const selection = { id: taxReference.id, name: taxReference.name, level: taxReference.level, scope: taxReference.scope,
    rate: taxReference.rate, sourceUrl: taxReference.sourceUrl, sourceStatus: taxReference.sourceStatus,
    checkedAt: taxReference.checkedAt, validFrom: taxReference.validFrom, validThrough: taxReference.validThrough,
    dateBasis: taxReference.dateBasis, reasons: taxReference.reasons, notes: taxReference.notes };
  const [summary, rows] = await Promise.all([
    db.select(selection).from(taxReference).innerJoin(taxReferenceRelease, eq(taxReference.releaseId, taxReferenceRelease.id))
      .where(and(base, inArray(taxReference.level, ["state", "localSummary"]))).orderBy(asc(taxReference.level)).limit(2),
    db.select(selection).from(taxReference).innerJoin(taxReferenceRelease, eq(taxReference.releaseId, taxReferenceRelease.id))
      .where(and(base, inArray(taxReference.level, ["local", "combined"]),
        or(ilike(taxReference.name, `%${query.replace(/[\\%_]/g, "\\$&")}%`), ilike(taxReference.scope, `%${query.replace(/[\\%_]/g, "\\$&")}%`)),
        or(isNull(taxReference.validFrom), lte(taxReference.validFrom, saleOn)),
        or(isNull(taxReference.validThrough), gte(taxReference.validThrough, saleOn))))
      .orderBy(asc(taxReference.name), asc(taxReference.code), asc(taxReference.id)).limit(21).offset(offset),
  ]);
  return { summary, items: rows.slice(0, 20), nextOffset: rows.length > 20 ? offset + 20 : null };
}
