import "server-only";
import { and, count, desc, eq, ilike, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { file } from "@/lib/db/schema";
import type { StoredFile } from "@/lib/types";
import { LIST_PAGE_SIZE, type CursorPage } from "@/lib/domain/cursor-page";
import { decodePageCursor, encodePageCursor, InvalidCursor, literalSearch } from "./page-cursor";

export const fileListParams = z.object({
  q: z.string().trim().max(200).default(""), project: z.union([z.uuid(), z.literal("")]).default(""),
  archived: z.enum(["true", "false"]).default("false"), cursor: z.string().max(2000).default(""),
});
export async function listFiles(talentId: string, params: z.infer<typeof fileListParams>): Promise<CursorPage<StoredFile>> {
  const key = JSON.stringify([talentId, params.q, params.project, params.archived]);
  const cursor = decodePageCursor(params.cursor, z.tuple([z.string().max(80).regex(/^\d{4}-\d{2}-\d{2} [0-9:.+\- ]+$/).refine(value => Number.isFinite(Date.parse(value))), z.uuid(), z.string()]));
  if (cursor && cursor[2] !== key) throw new InvalidCursor("Cursor filters changed");
  const filters = and(eq(file.talentId, talentId), params.archived === "true" ? isNotNull(file.archivedAt) : isNull(file.archivedAt),
    params.project ? eq(file.projectId, params.project) : undefined,
    params.q ? ilike(sql`coalesce(${file.filename}, 'file')`, literalSearch(params.q)) : undefined);
  const [rows, [total]] = await Promise.all([
    db.select({ id: file.id, projectId: file.projectId, filename: file.filename, sizeBytes: file.sizeBytes,
      createdAt: file.createdAt, archivedAt: file.archivedAt, position: sql<string>`${file.createdAt}::text` })
      .from(file).where(and(filters, cursor ? sql`(${file.createdAt}, ${file.id}) < (${cursor[0]}::timestamptz, ${cursor[1]}::uuid)` : undefined))
      .orderBy(desc(file.createdAt), desc(file.id)).limit(LIST_PAGE_SIZE + 1),
    db.select({ value: count() }).from(file).where(filters),
  ]);
  const visible = rows.slice(0, LIST_PAGE_SIZE), last = visible.at(-1);
  return { items: visible.map(row => ({ id: row.id, projectId: row.projectId, filename: row.filename ?? "file", sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(), archived: row.archivedAt !== null })), total: total.value,
    nextCursor: rows.length > LIST_PAGE_SIZE && last ? encodePageCursor([last.position, last.id, key]) : null };
}
