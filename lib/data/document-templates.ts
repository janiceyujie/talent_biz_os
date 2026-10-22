import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentTemplate } from "@/lib/db/schema";
import type { Locale } from "@/lib/i18n/config";
import { templateFilename, type CatalogTemplate } from "@/lib/templates/catalog";
import { templateText, type TemplateKind } from "@/lib/templates/content";

// The contract and quote library (decision 0020): one shared catalog, the same for every workspace.
// A person's own contracts are their workspace's files and contracts, not these.

/** The published templates in one language and kind, by scenario. */
export async function listDocumentTemplates(locale: Locale, kind: TemplateKind): Promise<CatalogTemplate[]> {
  const rows = await db
    .select({ id: documentTemplate.id, scenario: documentTemplate.scenario, role: documentTemplate.role, kind: documentTemplate.kind, locale: documentTemplate.locale, version: documentTemplate.version, title: documentTemplate.title, content: documentTemplate.content })
    .from(documentTemplate)
    .where(and(eq(documentTemplate.locale, locale), eq(documentTemplate.kind, kind), eq(documentTemplate.published, true)))
    .orderBy(asc(documentTemplate.scenario));
  return rows.map(({ content, ...r }) => ({ ...r, text: templateText(content) }));
}

/** A published template's file, by its id: the browser never names a Storage key. */
export async function findTemplateFile(id: string) {
  const [row] = await db
    .select({ storageKey: documentTemplate.storageKey, scenario: documentTemplate.scenario, kind: documentTemplate.kind, locale: documentTemplate.locale })
    .from(documentTemplate)
    .where(and(eq(documentTemplate.id, id), eq(documentTemplate.published, true)));
  return row ? { storageKey: row.storageKey, filename: templateFilename(row) } : null;
}
