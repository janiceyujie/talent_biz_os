import "server-only";
import { and, asc, desc, eq, isNotNull, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { file, message, messageAnalysis, project, talent } from "@/lib/db/schema";
import { dateInZone } from "@/lib/domain/dates";
import { isSigned } from "@/lib/domain/phases";
import { toLocale, type Locale } from "@/lib/i18n/config";
import { dropBroughtIn } from "@/lib/mail/not-work";
import { readBytes } from "@/lib/storage";
import { notWork, proposesNothing } from "./analysis";
import { extractMessage } from "./extract";
import { canAnalyze } from "./usage";
import { ModelError } from "./model";

/**
 * Analyze one message and store a new analysis version. Marks the message analyzed, or error with the reason.
 * Runs as a queued job, so it may run twice: a message no longer pending was already handled.
 * An email brought in from Gmail that the analysis finds isn't work loses its body and files at once (decision 0013).
 */
export async function analyzeMessage(messageId: string, outputLocale: Locale) {
  const [row] = await db
    .select({
      talentId: message.talentId,
      status: message.status,
      submittedBy: message.submittedBy,
      body: message.bodyText,
      channel: message.channel,
      kind: message.kind,
      direction: message.direction,
      recipients: message.recipients,
      connectionId: message.connectionId,
      threadId: message.providerThreadId,
      sender: message.sender,
      subject: message.subject,
      receivedAt: message.receivedAt,
      timeZone: talent.timeZone,
    })
    .from(message)
    .innerJoin(talent, eq(talent.id, message.talentId))
    .where(eq(message.id, messageId));
  if (!row || row.status !== "pending" || row.kind !== "message") return; // a payment notice has only its fields
  // Usage limits are checked here, where every analysis passes, not only in the actions.
  const allowed = await canAnalyze(row.talentId, messageId);
  if (!allowed.ok) {
    await db
      .update(message)
      .set({ status: "error", failure: "usage_limit" })
      .where(and(eq(message.id, messageId), eq(message.status, "pending")));
    return;
  }
  try {
    const stored = await db
      .select({ storageKey: file.storageKey, contentType: file.contentType, filename: file.filename })
      .from(file)
      .where(eq(file.messageId, messageId))
      .orderBy(asc(file.position));
    const files = await Promise.all(
      stored.map(async (f, i) => ({ name: f.filename ?? `file-${i + 1}`, mimeType: f.contentType, data: await readBytes(f.storageKey) })),
    );
    const gmail = row.channel === "gmail";
    const sent = row.direction === "sent";
    // An email's sender and subject are part of what it says: who's asking, and about what.
    // For the person's own reply, whom it went to.
    const header = !gmail
      ? ""
      : sent
        ? `From: (the artist)\nTo: ${row.recipients ?? ""}\nSubject: ${row.subject ?? ""}\n\n`
        : `From: ${row.sender ?? ""}\nSubject: ${row.subject ?? ""}\n\n`;
    const { analysis, modelVersion, promptVersion } = await extractMessage({
      body: header + (row.body ?? ""),
      fromMailbox: gmail,
      textIfFilesUnreadable: gmail,
      sent,
      files,
      today: dateInZone(row.timeZone, 0, row.receivedAt),
      timeZone: row.timeZone,
      outputLocale: toLocale(outputLocale),
      trace: { task: "extract", talentId: row.talentId, personId: row.submittedBy, messageId },
    });
    await db.transaction(async (tx) => {
      await tx.insert(messageAnalysis).values({
        messageId,
        talentId: row.talentId,
        intent: analysis.intent,
        analysis,
        confidence: analysis.confidence,
        modelVersion,
        promptVersion,
      });
      await tx
        .update(message)
        .set({ status: "analyzed", failure: null })
        .where(and(eq(message.id, messageId), eq(message.status, "pending")));
    });
    // The person's own reply is kept even when it says little: it's their side of the thread.
    if (gmail && !sent && notWork(analysis)) await dropBroughtIn(row.talentId, messageId, "analysis");
    if (sent) await fileWithThread(messageId, row, analysis);
  } catch (e) {
    // The code is shown to the person in their language (inbox.failure.*); details go to the log.
    const failure = e instanceof ModelError ? e.code : "unexpected";
    console.error("analyzeMessage", messageId, e instanceof ModelError ? `${e.code}: ${e.message}` : e);
    await db
      .update(message)
      .set({ status: "error", failure: failure.slice(0, 500) })
      .where(and(eq(message.id, messageId), eq(message.status, "pending")));
  }
}

/**
 * The analysis job gave up (its last attempt threw before the message was marked),
 * so show the message as failed and let the person Retry instead of it waiting forever.
 */
export async function markAnalysisFailed(messageId: string) {
  await db
    .update(message)
    .set({ status: "error", failure: "unexpected" })
    .where(and(eq(message.id, messageId), eq(message.status, "pending")));
}

/**
 * The person's own reply that changes nothing is filed under its thread's
 * project at once, to show on its timeline (decision 0013). With no filed
 * message in the thread yet, it waits in Intake like any message.
 */
async function fileWithThread(
  messageId: string,
  row: { talentId: string; connectionId: string | null; threadId: string | null },
  analysis: Parameters<typeof proposesNothing>[0],
) {
  if (!row.connectionId || !row.threadId) return;
  const [filed] = await db
    .select({ projectId: message.projectId, stage: project.stage })
    .from(message)
    .innerJoin(project, eq(project.id, message.projectId))
    .where(
      and(
        eq(message.talentId, row.talentId),
        eq(message.connectionId, row.connectionId),
        eq(message.providerThreadId, row.threadId),
        eq(message.status, "confirmed"),
        isNotNull(message.projectId),
        ne(message.id, messageId),
      ),
    )
    .orderBy(desc(message.receivedAt))
    .limit(1);
  if (!filed?.projectId) return;
  const negotiating = !isSigned(filed.stage) && !["declined", "cancelled", "closed"].includes(filed.stage);
  if (!proposesNothing(analysis, { negotiating })) return; // it waits in Messages, its changes for the person
  await db
    .update(message)
    .set({ projectId: filed.projectId, status: "confirmed" })
    .where(and(eq(message.id, messageId), eq(message.status, "analyzed")));
}
