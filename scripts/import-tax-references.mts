/** Local-only, idempotent evidence import. Never publishes calculation rules. */
import env from "@next/env";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { assertLocalTemplateStore } from "../lib/templates/local-store";
import { referenceManifestInput } from "../lib/tax/reference-input";
env.loadEnvConfig(process.cwd());
const target = new URL(process.env.DATABASE_URL || "invalid:");
if (process.env.APP_ENV !== "development") throw new Error("Development only");
assertLocalTemplateStore(process.env.DATABASE_URL, process.env.STORAGE_S3_ENDPOINT);
const path = process.argv[2];
if (!path) throw new Error("Usage: tsx --conditions=react-server scripts/import-tax-references.mts <references.json>");
const bytes = await readFile(path), input = referenceManifestInput.parse(JSON.parse(bytes.toString()));
const checksum = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const contentHash = checksum(bytes), docs = new Map(input.documents.map(d => [d.url, d]));
// Validate every byte and timestamp before writing any database or object.
for (const d of input.documents) {
  if (Date.parse(d.retrievedAt) > Date.now() + 60000 || Date.parse(d.retrievedAt) < Date.now() - 7 * 86400000) throw new Error("Source retrieval must be within seven days");
  if (d.status === "retained") {
    const raw = await readFile(join(dirname(path), `${d.sha256}.source`));
    if (checksum(raw) !== d.sha256 || raw.length !== d.size) throw new Error("Source checksum mismatch");
  }
}
const { writeBytes, stat } = await import("../lib/storage");
const sourceKey = (hash: string) => `tax-references/sources/${hash}.source`;
for (const d of input.documents) if (d.status === "retained") {
  const key = sourceKey(d.sha256);
  if (!await stat(key)) await writeBytes(key, await readFile(join(dirname(path), `${d.sha256}.source`)), d.contentType);
}
const manifestStorageKey = `tax-references/releases/${contentHash}.json`;
if (!await stat(manifestStorageKey)) await writeBytes(manifestStorageKey, bytes, "application/json");
const { db } = await import("../lib/db");
const { taxReferenceRelease: release, taxReference: reference, taxSource: source } = await import("../lib/db/schema");
try {
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('taloox.tax-reference-import'))`);
    for (const s of input.states) await tx.insert(source).values({ state: s.state, directoryUrl: s.url }).onConflictDoNothing();
    const [existing] = await tx.select().from(release).where(eq(release.contentHash, contentHash));
    await tx.update(release).set({ active: false }).where(eq(release.active, true));
    if (existing) {
      if (existing.rowCount !== input.rows.length) throw new Error("Revision count mismatch");
      await tx.update(release).set({ active: true }).where(eq(release.id, existing.id));
    } else {
      const [batch] = await tx.insert(release).values({ contentHash, parserVersion: input.parserVersion, manifestStorageKey, active: true, rowCount: input.rows.length }).returning();
      for (let i = 0; i < input.rows.length; i += 400) {
        await tx.insert(reference).values(input.rows.slice(i, i + 400).map(r => {
          const d = docs.get(r.sourceUrl)!;
          return { ...r, releaseId: batch.id, sourceStatus: d.status, checkedAt: new Date(d.retrievedAt),
            sourceHash: d.status === "retained" ? d.sha256 : null, sourceStorageKey: d.status === "retained" ? sourceKey(d.sha256) : null };
        }));
      }
    }
    for (const s of input.states) {
      await tx.update(source).set({ coverage: "officialReference", rateIndexUrl: s.url, boundaryIndexUrl: s.localUrl, checkedAt: new Date(docs.get(s.url)!.retrievedAt) }).where(eq(source.state, s.state));
    }
  });
  console.log(JSON.stringify({ database: target.pathname.slice(1), states: input.states.length, rows: input.rows.length, sourceSnapshots: input.documents.filter(d => d.status === "retained").length, pendingSources: input.documents.filter(d => d.status === "pending").length, calculationRulesAdded: 0 }));
} finally { await (globalThis as unknown as { pgClient?: { end(): Promise<void> } }).pgClient?.end(); }
