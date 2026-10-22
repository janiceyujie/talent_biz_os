import { z } from "zod";
import "server-only";
import { and, asc, count, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { upgradeAnalysis } from "@/lib/ai/analysis";
import { db } from "@/lib/db";
import { file, message, messageAnalysis, todo } from "@/lib/db/schema";
import { PAGE_SIZE, PAGE_MAX } from "@/lib/domain/list-page";
import type { InboxMessage, InboxOverview, InboxPage, InboxSummary } from "@/lib/types";

// Intake's messages, served the way decision 0011 serves projects: the layout
// carries counts and what Today shows, the list comes a page at a time, and a
// message's full analysis, files, and thread come when it's opened.

/** Messages waiting for review that Today lists; it says how many more there are. */
export const REVIEW_SHOWN = 10;

// The newest analysis's title, summary, and whether it raised a flag, in one lookup per row.
// Written out in full: in a one-table query Drizzle leaves columns unqualified.
const latestAnalysis = sql<{ title: string; summary: string; flagged: boolean } | null>`(
  select jsonb_build_object(
    'title', coalesce(a.analysis ->> 'title', ''),
    'summary', coalesce(a.analysis ->> 'summary', ''),
    'flagged', coalesce(jsonb_array_length(a.analysis -> 'flags'), 0) > 0)
  from ${messageAnalysis} a where a.message_id = "message"."id" order by a.created_at desc limit 1)`;

const summaryFields = {
  id: message.id,
  channel: message.channel,
  status: message.status,
  projectId: message.projectId,
  receivedAt: message.receivedAt,
  kind: message.kind,
  notice: message.notice,
  sent: sql<boolean>`${message.direction} = 'sent'`,
  sender: message.sender,
  subject: message.subject,
  firstLine: sql<string>`left(split_part(coalesce(${message.bodyText}, ''), E'\n', 1), 200)`,
  bodyStart: sql<string>`left(coalesce(${message.bodyText}, ''), 110)`,
  analysis: latestAnalysis,
  files: sql<number>`(select count(*)::int from ${file} f where f.message_id = "message"."id")`,
};

const summaries = () => db.select(summaryFields).from(message);
type SummaryRow = Awaited<ReturnType<typeof summaries>>[number];

const toSummary = (r: SummaryRow): InboxSummary => ({
  id: r.id,
  channel: r.channel,
  status: r.status,
  projectId: r.projectId,
  receivedAt: r.receivedAt.toISOString(),
  notice: r.kind === "payment_notice" ? r.notice : null,
  sent: r.sent,
  sender: r.sender ?? "",
  subject: r.subject ?? "",
  firstLine: r.firstLine.trim(),
  title: r.analysis?.title ?? "",
  snippet: (r.analysis?.summary || r.bodyStart).slice(0, 110),
  flagged: r.analysis?.flagged ?? false,
  fileCount: r.files,
});

const encodeCursor = (receivedAt: string, id: string) => Buffer.from(JSON.stringify([receivedAt, id])).toString("base64url");
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

/**
 * One page of Intake's list, newest first: the messages to review and filed
 * (dismissed ones only when asked), or those kept from the mailbox's history.
 */
export async function listInbox(
  talentId: string,
  params: { history: boolean; dismissed: boolean; cursor: string; limit: number },
): Promise<InboxPage> {
  const after = params.cursor ? decodeCursor(params.cursor) : null;
  const filtered = and(
    eq(message.talentId, talentId),
    params.history ? eq(message.status, "history") : ne(message.status, "history"),
    params.history || params.dismissed ? undefined : ne(message.status, "dismissed"),
  );
  const limit = Math.min(Math.max(params.limit, 1), PAGE_MAX);
  const [rows, [total]] = await Promise.all([
    summaries()
      .where(and(filtered, after ? sql`(${message.receivedAt}, ${message.id}) < (${after[0]}::timestamptz, ${after[1]}::uuid)` : undefined))
      .orderBy(desc(message.receivedAt), desc(message.id))
      .limit(limit + 1), // one more than shown says whether there's a next page
    db.select({ n: count() }).from(message).where(filtered),
  ]);
  const shown = rows.slice(0, limit);
  const last = shown.at(-1);
  return {
    items: shown.map(toSummary),
    nextCursor: rows.length > limit && last ? encodeCursor(last.receivedAt.toISOString(), last.id) : null,
    total: total.n,
  };
}

/** What the layout carries for every page: counts by status, Today's review list, and each project's latest message. */
export async function inboxOverview(talentId: string): Promise<InboxOverview> {
  const [statusRows, review, activity] = await Promise.all([
    db.select({ status: message.status, n: count() }).from(message).where(eq(message.talentId, talentId)).groupBy(message.status),
    // Waiting longest first: a message waiting for review is today's business, whenever it arrived.
    summaries()
      .where(and(eq(message.talentId, talentId), eq(message.status, "analyzed")))
      .orderBy(asc(message.receivedAt), asc(message.id))
      .limit(REVIEW_SHOWN),
    db
      .select({ projectId: message.projectId, last: sql<string>`max(${message.receivedAt})` })
      .from(message)
      .where(and(eq(message.talentId, talentId), isNotNull(message.projectId)))
      .groupBy(message.projectId),
  ]);
  const counts: InboxOverview["counts"] = { pending: 0, analyzed: 0, confirmed: 0, dismissed: 0, error: 0, history: 0 };
  for (const r of statusRows) counts[r.status] = r.n;
  return {
    counts,
    review: review.map(toSummary),
    latestActivity: Object.fromEntries(activity.map((r) => [r.projectId!, new Date(r.last).toISOString()])),
  };
}

/** One message in full, as its review needs it: the analysis, files, and its email thread. Its suggestions: lib/data/suggestions.ts. */
export async function inboxDetail(talentId: string, id: string): Promise<InboxMessage | null> {
  const [m] = await db.select().from(message).where(and(eq(message.id, id), eq(message.talentId, talentId)));
  if (!m) return null;
  const sameThread =
    m.connectionId && m.providerThreadId
      ? and(eq(message.talentId, talentId), eq(message.connectionId, m.connectionId), eq(message.providerThreadId, m.providerThreadId), ne(message.id, id))
      : null;
  const [[analysis], files, completed, thread] = await Promise.all([
    // Analyses are versioned; the newest wins.
    db.select().from(messageAnalysis).where(eq(messageAnalysis.messageId, id)).orderBy(desc(messageAnalysis.createdAt)).limit(1),
    db
      .select({ id: file.id, contentType: file.contentType, filename: file.filename, sizeBytes: file.sizeBytes })
      .from(file)
      .where(and(eq(file.messageId, id), eq(file.talentId, talentId)))
      .orderBy(asc(file.position)),
    // Reply to-dos this message, the person's own reply, marked done, for its Undo.
    db.select({ id: todo.id, title: todo.title }).from(todo).where(and(eq(todo.talentId, talentId), eq(todo.completedByMessageId, id), eq(todo.status, "done"))),
    sameThread
      ? db
          .select({ id: message.id, status: message.status, projectId: message.projectId, direction: message.direction, kind: message.kind, receivedAt: message.receivedAt })
          .from(message)
          .where(sameThread)
      : [],
  ]);

  const later = thread.filter((x) => x.receivedAt > m.receivedAt);
  const filedInThread = thread
    .filter((x) => x.status === "confirmed" && x.projectId)
    .sort((x, y) => y.receivedAt.getTime() - x.receivedAt.getTime());
  return {
    id: m.id,
    channel: m.channel,
    body: m.bodyText ?? "",
    receivedAt: m.receivedAt.toISOString(),
    status: m.status,
    failure: m.failure,
    projectId: m.projectId,
    analysis: analysis ? { ...upgradeAnalysis(analysis.analysis), modelVersion: analysis.modelVersion, promptVersion: analysis.promptVersion } : null,
    files: files.map((f) => ({ ...f, filename: f.filename ?? "" })),
    gmail:
      m.channel === "gmail" && m.externalRef
        ? {
            gmailId: m.externalRef,
            threadId: m.providerThreadId ?? "",
            sent: m.direction === "sent",
            recipients: m.recipients ?? "",
            sender: m.sender ?? "",
            subject: m.subject ?? "",
            unsure: m.relevance === "unsure",
            skippedAttachments: m.skippedAttachments ?? [],
          }
        : null,
    notice: m.kind === "payment_notice" ? m.notice : null,
    completedTodos: completed,
    thread: {
      projectId: filedInThread[0]?.projectId ?? null,
      replied: later.some((x) => x.direction === "sent"),
      newer: later.some((x) => x.direction !== "sent" && x.kind === "message"),
      // Others in the thread still waiting for review, oldest first, for its File all.
      waiting: thread
        .filter((x) => x.status === "analyzed" && x.kind === "message")
        .sort((x, y) => x.receivedAt.getTime() - y.receivedAt.getTime())
        .map((x) => x.id),
    },
  };
}

const flag = z.enum(["true", "false"]).transform((v) => v === "true").catch(false);
export const inboxListParams = z.object({
  history: flag,
  dismissed: flag,
  cursor: z.string().max(1000).catch(""),
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).catch(PAGE_SIZE),
});
