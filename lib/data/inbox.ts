import "server-only";
import { createHash } from "node:crypto";
import { and, asc, count, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { message, messageAnalysis, file } from "@/lib/db/schema";
import { upgradeAnalysis } from "@/lib/ai/analysis";
import { filedMessages } from "@/lib/domain/intake";
import type { InboxMessage, InboxSummary } from "@/lib/types";
import { LIST_PAGE_SIZE, type CursorPage } from "@/lib/domain/cursor-page";
import { decodePageCursor, encodePageCursor, InvalidCursor } from "./page-cursor";

export const inboxListParams = z.object({
  dismissed: z.enum(["true", "false"]).default("false"), cursor: z.string().max(2000).default(""),
});
const latest = (field: string) => sql<string>`(select a.analysis ->> ${field} from message_analysis a
  where a.message_id = ${message.id} and a.talent_id = ${message.talentId}
  order by a.created_at desc, a.id desc limit 1)`;
const summaryFields = {
  id: message.id, channel: message.channel, status: message.status, projectId: message.projectId,
  receivedAt: message.receivedAt,
  title: sql<string>`left(coalesce(nullif(${latest("title")}, ''), nullif(split_part(${message.bodyText}, E'\n', 1), ''), ''), 100)`,
  snippet: sql<string>`left(coalesce(nullif(${latest("summary")}, ''), ${message.bodyText}, ''), 110)`,
  flagged: sql<boolean>`coalesce((select jsonb_array_length(coalesce(a.analysis -> 'flags', '[]'::jsonb)) > 0 from message_analysis a
    where a.message_id = ${message.id} and a.talent_id = ${message.talentId} order by a.created_at desc, a.id desc limit 1), false)`,
  fileCount: sql<number>`(select count(*)::int from file f where f.message_id = ${message.id} and f.talent_id = ${message.talentId})`,
};
export async function listInbox(talentId: string, params: z.infer<typeof inboxListParams>): Promise<CursorPage<InboxSummary>> {
  const key = createHash("sha256").update(JSON.stringify([talentId, params.dismissed])).digest("hex");
  const cursor = decodePageCursor(params.cursor, z.tuple([z.string().max(80).regex(/^\d{4}-\d{2}-\d{2} [0-9:.+\- ]+$/).refine(v => Number.isFinite(Date.parse(v))), z.uuid(), z.string()]));
  if (cursor && cursor[2] !== key) throw new InvalidCursor("Cursor filters changed");
  const filters = and(eq(message.talentId, talentId), params.dismissed === "true" ? undefined : ne(message.status, "dismissed"));
  const [rows, [total]] = await Promise.all([
    db.select({ ...summaryFields, position: sql<string>`${message.receivedAt}::text` }).from(message)
      .where(and(filters, cursor ? sql`(${message.receivedAt}, ${message.id}) < (${cursor[0]}::timestamptz, ${cursor[1]}::uuid)` : undefined))
      .orderBy(desc(message.receivedAt), desc(message.id)).limit(LIST_PAGE_SIZE + 1),
    db.select({ value: count() }).from(message).where(filters),
  ]);
  const visible = rows.slice(0, LIST_PAGE_SIZE), last = visible.at(-1);
  return { items: visible.map(row => ({ id:row.id,channel:row.channel,status:row.status,projectId:row.projectId,title:row.title,snippet:row.snippet,flagged:row.flagged,fileCount:row.fileCount,receivedAt:row.receivedAt.toISOString() })), total: total.value,
    nextCursor: rows.length > LIST_PAGE_SIZE && last ? encodePageCursor([last.position, last.id, key]) : null };
}

/** Only dashboard counters and a bounded review preview cross the shared layout boundary. */
export async function inboxOverview(talentId: string) {
  const [counts, review, activity, [revision]] = await Promise.all([
    db.select({ status: message.status, count: count() }).from(message).where(eq(message.talentId, talentId)).groupBy(message.status),
    db.select(summaryFields).from(message).where(and(eq(message.talentId, talentId), eq(message.status, "analyzed")))
      .orderBy(asc(message.receivedAt), asc(message.id)).limit(8),
    db.select({ projectId: message.projectId, last: sql<string>`max(${message.receivedAt})::text` }).from(message)
      .where(and(eq(message.talentId, talentId), sql`${message.projectId} is not null`)).groupBy(message.projectId),
    db.select({ value: sql<string>`coalesce(max(${message.updatedAt})::text, '') || ':' || count(*)::text` }).from(message).where(eq(message.talentId, talentId)),
  ]);
  const statusCounts = { pending: 0, analyzed: 0, error: 0, confirmed: 0, dismissed: 0 };
  for (const row of counts) statusCounts[row.status] = row.count;
  return { counts: statusCounts, review: review.map(row => ({ ...row, receivedAt: row.receivedAt.toISOString() })),
    latestActivity: Object.fromEntries(activity.map(row => [row.projectId!, row.last])), revision: revision.value };
}

export async function inboxDetail(talentId: string, id: string): Promise<InboxMessage | null> {
  const [m] = await db.select().from(message).where(and(eq(message.talentId, talentId), eq(message.id, id)));
  if (!m) return null;
  const [[a], files] = await Promise.all([
    db.select().from(messageAnalysis).where(and(eq(messageAnalysis.talentId, talentId), eq(messageAnalysis.messageId, id)))
      .orderBy(desc(messageAnalysis.createdAt), desc(messageAnalysis.id)).limit(1),
    db.select({ id: file.id, contentType: file.contentType, filename: file.filename, sizeBytes: file.sizeBytes }).from(file)
      .where(and(eq(file.talentId, talentId), eq(file.messageId, id))).orderBy(asc(file.position)),
  ]);
  // Matching needs earlier sender/date facts, not earlier bodies or every analysis version.
  const filed = m.status === "analyzed" ? await db.selectDistinctOn([message.id], {
    id: message.id, projectId: message.projectId, status: message.status,
    analysis: sql<Pick<import("@/lib/ai/analysis").MessageAnalysis, "counterparty" | "dates">>`jsonb_build_object('counterparty', ${messageAnalysis.analysis}->'counterparty', 'dates', coalesce(${messageAnalysis.analysis}->'dates', '[]'::jsonb))`,
  }).from(message).innerJoin(messageAnalysis, and(eq(messageAnalysis.messageId, message.id), eq(messageAnalysis.talentId, talentId)))
    .where(and(eq(message.talentId, talentId), eq(message.status, "confirmed"), ne(message.id, id), sql`${message.projectId} is not null`))
    .orderBy(message.id, desc(messageAnalysis.createdAt), desc(messageAnalysis.id)) : [];
  return { id: m.id, channel: m.channel, body: m.bodyText ?? "", receivedAt: m.receivedAt.toISOString(), status: m.status,
    failure: m.failure, projectId: m.projectId,
    analysis: a ? { ...upgradeAnalysis(a.analysis), modelVersion: a.modelVersion, promptVersion: a.promptVersion } : null,
    files: files.map(f => ({ ...f, filename: f.filename ?? "" })), filed: filedMessages(filed) };
}
