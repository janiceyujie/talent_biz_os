import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, lt, max } from "drizzle-orm";
import { db } from "@/lib/db";
import { file, mailConnection, mailDecision, message, person, todo } from "@/lib/db/schema";
import { toLocale } from "@/lib/i18n/config";
import { queue } from "@/lib/queue";
import { analysisQueue, analyzeJobKey, fetchJobKey, fetchQueue } from "@/lib/queue/jobs";
import { removeObjects, writeBytes } from "@/lib/storage";
import { accessToken, MailAccessLost, markReconnectNeeded } from "../access";
import { mailboxOwnerActive, lockMailboxOwner } from "../owner";
import { stripQuoted } from "../clean";
import { GmailError, gmailProvider } from "../gmail";
import { chooseAttachments, FETCH_LIMITS } from "../attachments";
import type { AttachmentRef } from "../gmail/parts";
import { senderCheck } from "../sender-auth";
import { bringNotice, pathFor } from "./notice";

// mail.fetch (docs/design/gmail-ingestion.md, Jobs): bring one email decided
// as work, or Not sure, into Intake (a bank or payment-app notice: ./notice.ts). Its text (quoted history stripped) becomes
// a message, its PDFs and images become files, and the analysis is queued, all
// in one transaction. Safe to run twice: the message's dedup key is the
// mailbox and the Gmail id.

const keyFor = (talentId: string, fileId: string) => `files/${talentId}/${fileId}`;
export const gmailDedupKey = (connectionId: string, gmailId: string) => `gmail:${connectionId}:${gmailId}`;

/** Queue bringing in every email of this mailbox decided as work or Not sure that isn't in yet. */
export async function queueFetching(connectionId: string) {
  const waiting = await db
    .select({ id: mailDecision.id })
    .from(mailDecision)
    .where(and(eq(mailDecision.connectionId, connectionId), inArray(mailDecision.outcome, ["work", "unsure"]), isNull(mailDecision.messageId)));
  for (const d of waiting) await queueFetch(connectionId, d.id);
}

/** Bring an email in, in the background; a failure recorded by an earlier try is cleared. */
export async function queueFetch(connectionId: string, decisionId: string, tx?: Parameters<Parameters<typeof db.transaction>[0]>[0]) {
  await (tx ?? db).update(mailDecision).set({ fetchFailure: null }).where(eq(mailDecision.id, decisionId));
  await queue.enqueue("mail.fetch", { decisionId }, { tx, queueName: fetchQueue(connectionId), jobKey: fetchJobKey(decisionId) });
}

/** The last try failed: say so in Waiting, with a code that names the cause and nothing from the email. */
export async function markFetchFailed(decisionId: string, e: unknown) {
  const code = e instanceof GmailError ? `gmail_${e.status}` : e instanceof Error ? e.name.slice(0, 40) : "unexpected";
  await db.update(mailDecision).set({ fetchFailure: code }).where(and(eq(mailDecision.id, decisionId), isNull(mailDecision.messageId)));
}

export async function fetchDecision(decisionId: string) {
  const [row] = await db
    .select({ d: mailDecision, c: mailConnection, locale: person.locale })
    .from(mailDecision)
    .innerJoin(mailConnection, eq(mailConnection.id, mailDecision.connectionId))
    .leftJoin(person, eq(person.id, mailConnection.connectedBy))
    .where(eq(mailDecision.id, decisionId));
  if (!row || row.d.messageId || (row.d.outcome !== "work" && row.d.outcome !== "unsure")) return; // in already, or no longer wanted
  const { d, c } = row;
  if (!await mailboxOwnerActive(c.id)) return;
  if (c.status !== "connected" && c.status !== "error") return;

  let mail, read;
  try {
    mail = gmailProvider(await accessToken(c));
    // A bank or payment-app notice takes the restricted path: fields only, never the body or files.
    const path = await pathFor(d, c, mail);
    if (path === "wait") return;
    if (path === "notice") return await bringNotice(d, c, mail, gmailDedupKey(c.id, d.providerMessageId));
    read = await mail.getMessage(d.providerMessageId);
  } catch (e) {
    if (e instanceof MailAccessLost) return markReconnectNeeded(c.id);
    // Too large to read: retrying won't shrink it. Filtered out, saying why, so it's opened in Gmail instead.
    if (e instanceof GmailError && e.reason === "response_too_large") {
      await db.update(mailDecision).set({ outcome: "skipped", decidedBy: "too_large" }).where(eq(mailDecision.id, d.id));
      return;
    }
    throw e;
  }
  if (!read) {
    await db.update(mailDecision).set({ outcome: "skipped", decidedBy: "gone" }).where(eq(mailDecision.id, d.id));
    return;
  }

  // Files first, so the transaction below only writes rows; on any failure the stored ones are removed again.
  const { fetch, skipped } = chooseAttachments(read.attachments);
  const stored: { id: string; key: string; a: AttachmentRef; size: number }[] = [];
  try {
    for (const a of fetch) {
      // One larger than Gmail's listed size said is listed, not fetched, rather than failing the whole email.
      const bytes = a.attachmentId
        ? await mail.getAttachment(read.id, a.attachmentId).catch((e) => {
            if (e instanceof GmailError && e.reason === "response_too_large") return Buffer.alloc(0);
            throw e;
          })
        : Buffer.from(a.data ?? "", "base64url");
      if (!bytes.length || bytes.length > FETCH_LIMITS.fileBytes) {
        skipped.push({ filename: a.filename, mimeType: a.mimeType, sizeBytes: bytes.length || a.size });
        continue;
      }
      const id = randomUUID();
      const key = keyFor(c.talentId, id);
      await writeBytes(key, bytes, a.mimeType);
      stored.push({ id, key, a, size: bytes.length });
    }

    // The person's own reply, in a thread already work (decision 0013): kept and analyzed as theirs.
    const sent = read.labels.includes("SENT");
    const history = await fromHistory(d, c);
    const brought = await db.transaction(async (tx) => {
      const currentConnection = await lockMailboxOwner(tx, c.id);
      if (!currentConnection || currentConnection.connectedBy !== c.connectedBy) return null;
      const [current] = await tx.select().from(mailDecision).where(and(eq(mailDecision.id, d.id), eq(mailDecision.connectionId, c.id))).for("update");
      if (!current || current.messageId || !["work", "unsure"].includes(current.outcome)) return null;
      const [created] = await tx
        .insert(message)
        .values({
          talentId: c.talentId,
          submittedBy: c.connectedBy,
          channel: "gmail",
          externalRef: read.id,
          connectionId: c.id,
          providerThreadId: read.threadId,
          direction: sent ? "sent" : "received",
          recipients: sent ? read.to || null : null,
          senderCheck: sent ? null : senderCheck(read.authResults),
          headerMessageId: read.headerMessageId || null,
          inReplyTo: read.inReplyTo || null,
          references: read.references || null,
          relevance: current.outcome === "unsure" ? "unsure" : "sure",
          sender: read.from.name ? `${read.from.name} <${read.from.address}>` : read.from.address || null,
          subject: read.subject || null,
          skippedAttachments: skipped.length ? skipped : null,
          receivedAt: read.receivedAt,
          bodyText: stripQuoted(read.text),
          dedupKey: gmailDedupKey(c.id, read.id),
          ...(history ? { status: "history" as const } : {}),
        })
        .onConflictDoNothing({ target: [message.talentId, message.dedupKey] })
        .returning({ id: message.id });
      if (!created) return null; // brought in already, by an earlier run of this job
      if (stored.length)
        await tx.insert(file).values(
          stored.map((f, position) => ({
            id: f.id,
            talentId: c.talentId,
            messageId: created.id,
            position,
            role: "attachment" as const,
            storageKey: f.key,
            contentType: f.a.mimeType,
            filename: f.a.filename,
            sizeBytes: f.size,
          })),
        );
      await tx.update(mailDecision).set({ messageId: created.id, importStatus: "imported", importFailure: null }).where(eq(mailDecision.id, d.id));
      // Replying answers what came before it in the thread: its reply to-dos are done (Undo on the reply reopens them).
      if (sent) {
        const earlier = tx
          .select({ id: message.id })
          .from(message)
          .where(
            and(
              eq(message.talentId, c.talentId),
              eq(message.connectionId, c.id),
              eq(message.providerThreadId, read.threadId),
              eq(message.direction, "received"),
              lt(message.receivedAt, read.receivedAt),
            ),
          );
        await tx
          .update(todo)
          .set({ status: "done", completedAt: new Date(), completedByMessageId: created.id })
          .where(and(eq(todo.talentId, c.talentId), eq(todo.type, "reply"), eq(todo.status, "open"), inArray(todo.messageId, earlier)));
      }
      // From your history: analyzed only when the person opens it (openFromHistory).
      if (!history)
        await queue.enqueue(
          "message.analyze",
          { messageId: created.id, locale: toLocale(row.locale) },
          { tx, queueName: analysisQueue(c.talentId), jobKey: analyzeJobKey(created.id) },
        );
      return created.id;
    });
    if (!brought) {
      await removeObjects(stored.map((f) => f.key));
      // Link the decision to the message the earlier run made.
      const [existing] = await db
        .select({ id: message.id })
        .from(message)
        .where(and(eq(message.talentId, c.talentId), eq(message.dedupKey, gmailDedupKey(c.id, read.id))));
      if (existing) await db.update(mailDecision).set({ messageId: existing.id, importStatus: "imported", importFailure: null }).where(and(eq(mailDecision.id, d.id), isNull(mailDecision.messageId), inArray(mailDecision.outcome, ["work", "unsure"])));
    }
  } catch (e) {
    await removeObjects(stored.map((f) => f.key)).catch(() => undefined);
    // Ids and codes only: never the subject or body.
    console.error("mail.fetch failed", d.id, (e as Error)?.name, (e as { status?: number })?.status ?? "");
    throw e;
  }
}

/** A thread with nothing newer than this is history, when the first read of the past brought it in. */
const QUIET_DAYS = 14;

/**
 * From your history (decision 0013): an email the connect-time read of the
 * last 30 days decided on (not one the person brought in), in a thread whose
 * latest email is over 14 days old. It's kept for reference and analyzed when
 * opened, rather than arriving as new work.
 */
async function fromHistory(d: typeof mailDecision.$inferSelect, c: typeof mailConnection.$inferSelect) {
  if (d.decidedBy === "person" || !c.historyDoneAt || d.createdAt > c.historyDoneAt) return false;
  const [latest] = await db
    .select({ at: max(mailDecision.receivedAt) })
    .from(mailDecision)
    .where(and(eq(mailDecision.connectionId, c.id), eq(mailDecision.providerThreadId, d.providerThreadId)));
  return !!latest?.at && latest.at.getTime() < Date.now() - QUIET_DAYS * 24 * 60 * 60 * 1000;
}
