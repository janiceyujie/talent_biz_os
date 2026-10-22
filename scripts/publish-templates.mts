// Publishes the contract and quote templates (decision 0020): run by `npm run db:migrate`, after the
// migrations, on every deploy and locally. For each content file in assets/document-templates/content,
// the published version is kept if its hash matches; otherwise the Word file is generated, uploaded,
// and published as a new version, the previous one kept. A template whose file is gone is unpublished.
// Running it twice changes nothing.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd()); // the same .env files the app reads, before the database connects

const { and, eq, max, sql } = await import("drizzle-orm");
const { db } = await import("@/lib/db");
const { documentTemplate } = await import("@/lib/db/schema");
const { translator } = await import("@/lib/i18n/translator");
const { writeBytes } = await import("@/lib/storage");
const { contentHash, templateContent } = await import("@/lib/templates/content");
const { generateDocx } = await import("@/lib/templates/docx");
const { WORD_CONTENT_TYPE, templateStorageKey } = await import("@/lib/templates/catalog");

const dir = join(process.cwd(), "assets/document-templates/content");
const contents = await Promise.all(
  (await readdir(dir))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map(async (f) => templateContent.parse(JSON.parse(await readFile(join(dir, f), "utf8")))),
);
const notices = new Map<string, string>();
for (const c of contents) if (!notices.has(c.locale)) notices.set(c.locale, (await translator(c.locale, "documentLibrary"))("fileNotice"));

let published = 0;
for (const content of contents) {
  const hash = contentHash(content, notices.get(content.locale)!);
  const same = and(eq(documentTemplate.scenario, content.scenario), eq(documentTemplate.kind, content.kind), eq(documentTemplate.locale, content.locale));
  const [existing] = await db.select({ id: documentTemplate.id, published: documentTemplate.published }).from(documentTemplate).where(and(same, eq(documentTemplate.contentHash, hash)));
  if (existing?.published) continue;
  // The file first, under a key with the hash: an upload that's never published is harmless, and a retry rewrites it.
  let file: { key: string; size: number } | null = null;
  if (!existing) {
    const bytes = await generateDocx(content, notices.get(content.locale)!);
    file = { key: templateStorageKey(content, hash), size: bytes.length };
    await writeBytes(file.key, bytes, WORD_CONTENT_TYPE);
  }
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('document_template.publish'))`); // two deploys at once take turns
    await tx.update(documentTemplate).set({ published: false }).where(and(same, eq(documentTemplate.published, true)));
    if (existing) {
      // This exact content was published before (a change was undone): that version again, not a copy.
      await tx.update(documentTemplate).set({ published: true }).where(eq(documentTemplate.id, existing.id));
      return;
    }
    const [{ last }] = await tx.select({ last: max(documentTemplate.version) }).from(documentTemplate).where(same);
    await tx.insert(documentTemplate).values({
      scenario: content.scenario,
      role: content.role,
      kind: content.kind,
      locale: content.locale,
      version: (last ?? 0) + 1,
      title: content.title,
      content,
      contentHash: hash,
      storageKey: file!.key,
      sizeBytes: file!.size,
      source: "repository",
      published: true,
    });
  });
  published++;
}

// A template whose content file was removed leaves the library; its versions are kept.
const present = new Set(contents.map((c) => `${c.scenario}|${c.kind}|${c.locale}`));
const live = await db.select({ id: documentTemplate.id, scenario: documentTemplate.scenario, kind: documentTemplate.kind, locale: documentTemplate.locale }).from(documentTemplate).where(and(eq(documentTemplate.published, true), eq(documentTemplate.source, "repository")));
const gone = live.filter((r) => !present.has(`${r.scenario}|${r.kind}|${r.locale}`));
for (const r of gone) await db.update(documentTemplate).set({ published: false }).where(eq(documentTemplate.id, r.id));

console.log(`templates: ${contents.length} in the repository, ${published} published, ${gone.length} withdrawn`);
process.exit(0);
