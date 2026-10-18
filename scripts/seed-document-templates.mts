// Explicit local-only import. Upload immutable Word objects first, then publish
// all catalog changes in one transaction. A retry safely reuses identical bytes.
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import nextEnv from "@next/env";
import { and, eq, max, sql } from "drizzle-orm";
import { documentContent, documentFilename, documentScenarios } from "../lib/templates/documents";
import { assertLocalTemplateStore } from "../lib/templates/local-store";
import { WORD_CONTENT_TYPE } from "../lib/templates/catalog";

nextEnv.loadEnvConfig(process.cwd());
assertLocalTemplateStore(process.env.DATABASE_URL, process.env.STORAGE_S3_ENDPOINT);
const { db } = await import("../lib/db");
const { documentTemplate: table } = await import("../lib/db/schema");
const { stat, writeBytes } = await import("../lib/storage");
const candidates: (typeof table.$inferInsert)[] = [];
try {
  for (const scenario of documentScenarios) {
    for (const kind of ["contract", "quote"] as const) {
      for (const locale of ["en", "zh-TW"] as const) {
        const content = documentContent(scenario.id, kind, locale);
        const filename = documentFilename(scenario.id, kind, locale);
        const bytes = await readFile(new URL(`../assets/document-templates/${filename}`, import.meta.url));
        if (bytes.subarray(0, 2).toString() !== "PK") throw new Error(`Invalid Word asset: ${filename}`);
        const contentHash = createHash("sha256").update(JSON.stringify({ role: scenario.role, ...content })).update(bytes).digest("hex");
        const storageKey = `document-templates/${scenario.id}/${kind}/${locale}/${contentHash}.docx`;
        const stored = await stat(storageKey);
        if (!stored || stored.size !== bytes.length) await writeBytes(storageKey, bytes, WORD_CONTENT_TYPE);
        candidates.push({ scenario: scenario.id, role: scenario.role, kind, locale, version: 1,
          title: content.title, intro: content.intro, sections: content.sections, body: content.text,
          storageKey, filename, sizeBytes: bytes.length, contentHash, published: true });
      }
    }
  }
  const changed = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('taloox.document-template-import'))`);
    let count = 0;
    for (const candidate of candidates) {
      const scope = and(eq(table.scenario, candidate.scenario), eq(table.kind, candidate.kind), eq(table.locale, candidate.locale));
      const [same] = await tx.select().from(table).where(and(scope, eq(table.contentHash, candidate.contentHash)));
      if (same?.published) continue;
      await tx.update(table).set({ published: false }).where(and(scope, eq(table.published, true)));
      if (same) await tx.update(table).set({ published: true }).where(eq(table.id, same.id));
      else {
        const [latest] = await tx.select({ version: max(table.version) }).from(table).where(scope);
        await tx.insert(table).values({ ...candidate, version: (latest?.version ?? 0) + 1 });
      }
      count++;
    }
    return count;
  });
  console.log(`Local catalog ready: ${candidates.length} documents, ${changed} published revisions changed.`);
} finally {
  await (globalThis as unknown as { pgClient?: { end(): Promise<void> } }).pgClient?.end();
}
