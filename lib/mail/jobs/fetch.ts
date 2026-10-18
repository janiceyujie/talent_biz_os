import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { file, mailConnection, mailDecision, message, person, todo } from "@/lib/db/schema";
import { toLocale } from "@/lib/i18n/config";
import { queue, type EnqueueOptions } from "@/lib/queue";
import { analysisQueue, analyzeJobKey, fetchJobKey, fetchQueue } from "@/lib/queue/jobs";
import { removeObjects, writeBytes } from "@/lib/storage";
import { accessToken, MailAccessLost, markReconnectNeeded } from "../access";
import { stripQuoted } from "../clean";
import { gmailProvider } from "../gmail";
import { chooseAttachments, FETCH_LIMITS } from "../attachments";
import type { AttachmentRef } from "../gmail/parts";
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

export const queueFetch = (connectionId: string, decisionId: string, tx?: EnqueueOptions["tx"]) =>
  queue.enqueue("mail.fetch", { decisionId }, { tx, queueName: fetchQueue(connectionId), jobKey: fetchJobKey(decisionId) });

export async function fetchDecision(decisionId: string) {
  const [row] = await db
    .select({ d: mailDecision, c: mailConnection, locale: person.locale })
    .from(mailDecision)
    .innerJoin(mailConnection, eq(mailConnection.id, mailDecision.connectionId))
    .leftJoin(person, eq(person.id, mailConnection.connectedBy))
    .where(eq(mailDecision.id, decisionId));
  if (!row || row.d.messageId || (row.d.outcome !== "work" && row.d.outcome !== "unsure")) return; // in already, or no longer wanted
  const { d, c } = row;
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
      const bytes = a.attachmentId ? await mail.getAttachment(read.id, a.attachmentId) : Buffer.from(a.data ?? "", "base64url");
      if (!bytes.length || bytes.length > FETCH_LIMITS.fileBytes) {
        skipped.push({ filename: a.filename, mimeType: a.mimeType, sizeBytes: bytes.length });
        continue;
      }
      const id = randomUUID();
      const key = keyFor(c.talentId, id);
      await writeBytes(key, bytes, a.mimeType);
      stored.push({ id, key, a, size: bytes.length });
    }

    // The person's own reply, in a thread already work (decision 0013): kept and analyzed as theirs.
    const sent = read.labels.includes("SENT");
    const brought = await db.transaction(async (tx) => {
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
          headerMessageId: read.headerMessageId || null,
          inReplyTo: read.inReplyTo || null,
          references: read.references || null,
          relevance: d.outcome === "unsure" ? "unsure" : "sure",
          sender: read.from.name ? `${read.from.name} <${read.from.address}>` : read.from.address || null,
          subject: read.subject || null,
          skippedAttachments: skipped.length ? skipped : null,
          receivedAt: read.receivedAt,
          bodyText: stripQuoted(read.text),
          dedupKey: gmailDedupKey(c.id, read.id),
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
      await tx.update(mailDecision).set({ messageId: created.id }).where(eq(mailDecision.id, d.id));
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
      if (existing) await db.update(mailDecision).set({ messageId: existing.id }).where(eq(mailDecision.id, d.id));
    }
  } catch (e) {
    await removeObjects(stored.map((f) => f.key)).catch(() => undefined);
    // Ids and codes only: never the subject or body.
    console.error("mail.fetch failed", d.id, (e as Error)?.name, (e as { status?: number })?.status ?? "");
    throw e;
  }
}
