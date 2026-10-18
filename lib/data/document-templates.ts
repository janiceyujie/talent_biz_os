import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentTemplate } from "@/lib/db/schema";
import type { Locale } from "@/lib/i18n/config";
import type { DocumentKind } from "@/lib/templates/documents";
import type { CatalogDocument } from "@/lib/templates/catalog";

// Global curated catalog only. Customer contracts belong to the scoped file/contract tables.
export async function listDocumentTemplates(locale: Locale, kind: DocumentKind): Promise<CatalogDocument[]> {
  return db.select({ id: documentTemplate.id, scenario: documentTemplate.scenario, role: documentTemplate.role,
    kind: documentTemplate.kind, locale: documentTemplate.locale, version: documentTemplate.version,
    title: documentTemplate.title, text: documentTemplate.body }).from(documentTemplate)
    .where(and(eq(documentTemplate.locale, locale), eq(documentTemplate.kind, kind), eq(documentTemplate.published, true)))
    .orderBy(asc(documentTemplate.scenario)).limit(100);
}

export async function findDocumentTemplate(id: string) {
  const [row] = await db.select({ storageKey: documentTemplate.storageKey, filename: documentTemplate.filename })
    .from(documentTemplate).where(and(eq(documentTemplate.id, id), eq(documentTemplate.published, true))).limit(1);
  return row ?? null;
}
