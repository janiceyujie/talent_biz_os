import { z } from "zod";
import "server-only";
import { and, count, desc, eq, ilike, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { file } from "@/lib/db/schema";
import { PAGE_SIZE, PAGE_MAX, type ListPage } from "@/lib/domain/list-page";
import type { StoredFile } from "@/lib/types";
import { likeText } from "./projects";

// Files, a page at a time (decision 0011), as Files and a project's screen list them: newest first.

const encodeCursor = (createdAt: string, id: string) => Buffer.from(JSON.stringify([createdAt, id])).toString("base64url");
function decodeCursor(cursor: string): [string, string] | null {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString());
    return Array.isArray(value) && value.length === 2 && value.every((v) => typeof v === "string") && !Number.isNaN(Date.parse(value[0]))
      ? [value[0], value[1]]
      : null;
  } catch {
    return null;
  }
}

/** One page of the talent's files: on one project or all, archived or not, a search of the file name. */
export async function listFiles(
  talentId: string,
  params: { project: string; q: string; archived: boolean; cursor: string; limit: number },
): Promise<ListPage<StoredFile>> {
  const after = params.cursor ? decodeCursor(params.cursor) : null;
  const q = params.q.trim();
  const filtered = and(
    eq(file.talentId, talentId),
    params.archived ? isNotNull(file.archivedAt) : isNull(file.archivedAt),
    params.project ? eq(file.projectId, params.project) : undefined,
    q ? ilike(sql`coalesce(${file.filename}, '')`, likeText(q)) : undefined,
  );
  const limit = Math.min(Math.max(params.limit, 1), PAGE_MAX);
  const [rows, [total]] = await Promise.all([
    db
      .select({ id: file.id, projectId: file.projectId, filename: file.filename, sizeBytes: file.sizeBytes, createdAt: file.createdAt, archivedAt: file.archivedAt })
      .from(file)
      .where(and(filtered, after ? sql`(${file.createdAt}, ${file.id}) < (${after[0]}::timestamptz, ${after[1]}::uuid)` : undefined))
      .orderBy(desc(file.createdAt), desc(file.id))
      .limit(limit + 1), // one more than shown says whether there's a next page
    db.select({ n: count() }).from(file).where(filtered),
  ]);
  const shown = rows.slice(0, limit);
  const last = shown.at(-1);
  return {
    items: shown.map((r) => ({ id: r.id, projectId: r.projectId, filename: r.filename ?? "", sizeBytes: r.sizeBytes, createdAt: r.createdAt.toISOString(), archived: r.archivedAt !== null })),
    nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt.toISOString(), last.id) : null,
    total: total.n,
  };
}

export const fileListParams = z.object({
  project: z.union([z.uuid(), z.literal("")]).catch(""),
  q: z.string().max(200).catch(""),
  archived: z.enum(["true", "false"]).transform((v) => v === "true").catch(false),
  cursor: z.string().max(1000).catch(""),
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).catch(PAGE_SIZE),
});
