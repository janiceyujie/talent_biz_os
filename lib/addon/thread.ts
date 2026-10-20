import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { file, mailConnection, mailDecision, message, project } from "@/lib/db/schema";
import { toLocale } from "@/lib/i18n/config";
import { chooseAttachments, FETCH_LIMITS } from "@/lib/mail/attachments";
import { stripQuoted } from "@/lib/mail/clean";
import { gmailDedupKey } from "@/lib/mail/dedup";
import type { gmailAddonReader } from "@/lib/mail/gmail";
import type { AttachmentRef, ReadMessage } from "@/lib/mail/gmail/parts";
import { completeReplied } from "@/lib/mail/jobs/fetch";
import { parseAddress } from "@/lib/mail/metadata";
import { senderCheck } from "@/lib/mail/sender-auth";
import { queue } from "@/lib/queue";
import { analysisQueue, analyzeJobKey } from "@/lib/queue/jobs";
import { removeObjects, writeBytes } from "@/lib/storage";

// The open conversation, for the Gmail add-on (docs/design/gmail-addon.md,
// Bringing a thread in): where what's already in is, and sending in the rest.
// No relevance check: the person chose it. Each email becomes a message like
// the mailbox's, keyed by the Gmail account and Gmail id (lib/mail/dedup.ts),
// so the two ways in never make two rows.

type Reader = ReturnType<typeof gmailAddonReader>;

const MAX_MESSAGES = 50; // the newest, as File all takes at most
const SAME_EMAIL_MS = 10 * 60_000; // one email's arrival in two mailboxes: minutes apart at most

/** What of this thread is in already, in the person's artists: by this Gmail account's ids. */
export async function threadInfo(talentIds: string[], sub: string, gmailIds: string[]) {
  if (!talentIds.length || !gmailIds.length) return [];
  return db
    .select({
      id: message.id,
      talentId: message.talentId,
      gmailId: message.externalRef,
      status: message.status,
      projectId: message.projectId,
      chosenProjectId: message.chosenProjectId,
      receivedAt: message.receivedAt,
    })
    .from(message)
    .where(and(inArray(message.talentId, talentIds), eq(message.mailboxSubject, sub), inArray(message.externalRef, gmailIds)));
}

/** The artist's open projects for the dropdown: not archived, most recently changed first. */
export async function openProjects(talentId: string, limit = 50) {
  const rows = await db
    .select({ id: project.id, title: project.title, updatedAt: project.updatedAt })
    .from(project)
    .where(and(eq(project.talentId, talentId), isNull(project.archivedAt)));
  return rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, limit);
}

/**
 * A payment notice keeps the restricted path (decision 0013), which only the
 * connected mailbox takes for now: one the mailbox already called a bank
 * notice, or from a sender whose notices are in already, isn't sent here.
 */
async function isNotice(talentId: string, sub: string, m: ReadMessage, connectionId: string | null) {
  if (connectionId) {
    const [d] = await db
      .select({ id: mailDecision.id })
      .from(mailDecision)
      .where(and(eq(mailDecision.connectionId, connectionId), eq(mailDecision.providerMessageId, m.id), eq(mailDecision.kind, "bank_notice")));
    if (d) return true;
  }
  const address = m.from.address.toLowerCase();
  if (!address) return false;
  const notices = await db
    .select({ sender: message.sender })
    .from(message)
    .where(and(eq(message.talentId, talentId), eq(message.kind, "payment_notice")));
  return notices.some((n) => parseAddress(n.sender ?? "").address.toLowerCase() === address);
}

/** The artist's mailbox connection for this Gmail account, if any. */
async function connectionFor(talentId: string, sub: string) {
  const [connection] = await db
    .select({ id: mailConnection.id })
    .from(mailConnection)
    .where(and(eq(mailConnection.talentId, talentId), eq(mailConnection.accountSubject, sub), ne(mailConnection.status, "disconnecting")));
  return connection?.id ?? null;
}

/**
 * What Send would bring in, for the card and for Send itself, so the count the
 * card shows is what Send does: the newest emails not in yet, without notices.
 * Works on bodiless reads (threadHeads) as on full ones.
 */
export async function toSend(v: { talentId: string; sub: string; mail: ReadMessage[]; openedId: string }) {
  const all = v.mail.slice(-MAX_MESSAGES);
  const opened = all.find((m) => m.id === v.openedId) ?? all[all.length - 1];
  if (!opened) return { kind: "nothing" as const };
  const connectionId = await connectionFor(v.talentId, v.sub);
  if (await isNotice(v.talentId, v.sub, opened, connectionId)) return { kind: "notice" as const };
  const fresh: ReadMessage[] = [];
  for (const m of await notInYet(v.talentId, v.sub, all)) if (m.id === opened.id || !(await isNotice(v.talentId, v.sub, m, connectionId))) fresh.push(m);
  return { kind: "fresh" as const, fresh, opened, connectionId };
}

export type SendResult = { kind: "sent"; ids: string[] } | { kind: "notice" } | { kind: "nothing" };

/**
 * Send the thread in: the emails not in yet, the open one and newer analyzed,
 * older ones kept as history (analyzed when opened), so a long thread doesn't
 * spend the day's analyses. A picked project goes on every unfiled email of it.
 */
export async function sendThread(v: {
  reader: Reader;
  sub: string;
  personId: string;
  locale: string;
  talentId: string;
  projectId: string | null;
  threadId: string;
  openedId: string;
}): Promise<SendResult> {
  const plan = await toSend({ talentId: v.talentId, sub: v.sub, mail: await v.reader.thread(v.threadId), openedId: v.openedId });
  if (plan.kind !== "fresh") return plan;
  const ids: string[] = [];
  for (const m of plan.fresh) {
    const id = await bringIn(v, m, { history: m.receivedAt < plan.opened.receivedAt, connectionId: plan.connectionId });
    if (id) ids.push(id);
  }
  if (v.projectId)
    await db
      .update(message)
      .set({ chosenProjectId: v.projectId })
      .where(
        and(
          eq(message.talentId, v.talentId),
          eq(message.mailboxSubject, v.sub),
          eq(message.providerThreadId, v.threadId),
          isNull(message.projectId),
          ne(message.status, "dismissed"),
        ),
      );
  return ids.length ? { kind: "sent", ids } : { kind: "nothing" };
}

/**
 * The emails of the thread not in this artist yet. By this account's Gmail id
 * (exact), then by Message-ID for a copy from another mailbox, only with the
 * same sender within minutes: the header is the sender's to write (decision
 * 0007), so a match on it alone never skips an email.
 */
async function notInYet(talentId: string, sub: string, mail: ReadMessage[]) {
  const byId = new Set(
    (await threadInfo([talentId], sub, mail.map((m) => m.id))).map((r) => r.gmailId),
  );
  const headers = mail.map((m) => m.headerMessageId).filter(Boolean);
  const copies = headers.length
    ? await db
        .select({ headerMessageId: message.headerMessageId, sender: message.sender, receivedAt: message.receivedAt })
        .from(message)
        .where(and(eq(message.talentId, talentId), inArray(message.headerMessageId, headers)))
    : [];
  return mail.filter((m) => {
    if (byId.has(m.id)) return false;
    return !copies.some(
      (c) =>
        c.headerMessageId === m.headerMessageId &&
        parseAddress(c.sender ?? "").address.toLowerCase() === m.from.address.toLowerCase() &&
        Math.abs(c.receivedAt.getTime() - m.receivedAt.getTime()) <= SAME_EMAIL_MS,
    );
  });
}

/** One email in, as lib/mail/jobs/fetch.ts brings in the mailbox's: files first, then every row and the analysis job at once. */
async function bringIn(
  v: { reader: Reader; sub: string; personId: string; locale: string; talentId: string; projectId: string | null; threadId: string },
  read: ReadMessage,
  { history, connectionId }: { history: boolean; connectionId: string | null },
): Promise<string | null> {
  const { fetch, skipped } = chooseAttachments(read.attachments);
  const stored: { id: string; key: string; a: AttachmentRef; size: number }[] = [];
  try {
    for (const a of fetch) {
      const bytes = a.attachmentId ? await v.reader.getAttachment(read.id, a.attachmentId) : Buffer.from(a.data ?? "", "base64url");
      if (!bytes.length || bytes.length > FETCH_LIMITS.fileBytes) {
        skipped.push({ filename: a.filename, mimeType: a.mimeType, sizeBytes: bytes.length });
        continue;
      }
      const id = randomUUID();
      const key = `files/${v.talentId}/${id}`;
      await writeBytes(key, bytes, a.mimeType);
      stored.push({ id, key, a, size: bytes.length });
    }
    const sent = read.labels.includes("SENT");
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(message)
        .values({
          talentId: v.talentId,
          submittedBy: v.personId,
          channel: "gmail_addon",
          externalRef: read.id,
          mailboxSubject: v.sub,
          providerThreadId: read.threadId,
          direction: sent ? "sent" : "received",
          recipients: sent ? read.to || null : null,
          senderCheck: sent ? null : senderCheck(read.authResults),
          headerMessageId: read.headerMessageId || null,
          inReplyTo: read.inReplyTo || null,
          references: read.references || null,
          relevance: "sure", // the person sent it in
          sender: read.from.name ? `${read.from.name} <${read.from.address}>` : read.from.address || null,
          subject: read.subject || null,
          skippedAttachments: skipped.length ? skipped : null,
          receivedAt: read.receivedAt,
          bodyText: stripQuoted(read.text),
          chosenProjectId: v.projectId,
          dedupKey: gmailDedupKey(v.sub, read.id),
          ...(history ? { status: "history" as const } : {}),
        })
        .onConflictDoNothing({ target: [message.talentId, message.dedupKey] })
        .returning({ id: message.id });
      if (!row) return null; // the mailbox brought it in meanwhile
      if (stored.length)
        await tx.insert(file).values(
          stored.map((f, position) => ({
            id: f.id,
            talentId: v.talentId,
            messageId: row.id,
            position,
            role: "attachment" as const,
            storageKey: f.key,
            contentType: f.a.mimeType,
            filename: f.a.filename,
            sizeBytes: f.size,
          })),
        );
      // From the connected mailbox's own account: the person said it's work, whatever the check said.
      if (connectionId)
        await tx
          .update(mailDecision)
          .set({ outcome: "work", decidedBy: "person", messageId: row.id })
          .where(and(eq(mailDecision.connectionId, connectionId), eq(mailDecision.providerMessageId, read.id)));
      if (sent) await completeReplied(tx, { talentId: v.talentId, mailboxSubject: v.sub, threadId: read.threadId, receivedAt: read.receivedAt, replyId: row.id });
      if (!history)
        await queue.enqueue("message.analyze", { messageId: row.id, locale: toLocale(v.locale) }, { tx, queueName: analysisQueue(v.talentId), jobKey: analyzeJobKey(row.id) });
      return row.id;
    });
    if (!created) await removeObjects(stored.map((f) => f.key));
    return created;
  } catch (e) {
    await removeObjects(stored.map((f) => f.key)).catch(() => undefined);
    // Ids and codes only: never the subject or body.
    console.error("addon send failed", read.id, (e as Error)?.name, (e as { status?: number })?.status ?? "");
    throw e;
  }
}
