"use server";

import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { analyzeMessage } from "@/lib/ai/analyze-message";
import { canAnalyze } from "@/lib/ai/usage";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { message, messageAnalysis, project } from "@/lib/db/schema";
import { toLocale } from "@/lib/i18n/config";
import { confirmFollowUps } from "./message-follow-ups";
import { errorText, firstIssue } from "./validation";

const MAX_LENGTH = 50_000;

/** Same text pasted twice is the same message: line endings and runs of spaces don't count. */
const dedupKey = (text: string) =>
  `paste:${createHash("sha256").update(text.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").trim()).digest("hex")}`;

/**
 * Take in pasted text (匯入邀約) and analyze it in the background. Pasting the
 * same text again returns the existing message rather than analyzing twice.
 */
export async function submitPastedMessage(
  text: string,
): Promise<{ id: string; duplicate: boolean } | { error: string }> {
  const { person, talent } = await requireTalent();
  const fail = await errorText();
  const parsed = z.string().trim().min(1, "pasteRequired").max(MAX_LENGTH, "pasteTooLong").safeParse(text);
  if (!parsed.success) return { error: fail(firstIssue(parsed.error), { max: MAX_LENGTH }) };

  const key = dedupKey(parsed.data);
  const [created] = await db
    .insert(message)
    .values({
      talentId: talent.id,
      submittedBy: person.personId,
      channel: "paste",
      receivedAt: new Date(),
      bodyText: parsed.data,
      dedupKey: key,
    })
    .onConflictDoNothing({ target: [message.talentId, message.dedupKey] })
    .returning({ id: message.id });
  if (!created) {
    const [existing] = await db
      .select({ id: message.id })
      .from(message)
      .where(and(eq(message.talentId, talent.id), eq(message.dedupKey, key)));
    return { id: existing.id, duplicate: true };
  }
  const locale = toLocale(person.locale);
  after(() => analyzeMessage(created.id, locale));
  refresh();
  return { id: created.id, duplicate: false };
}

/** Run the analysis again (after an error, or to get a fresh attempt); earlier analyses are kept. */
export async function reanalyzeMessage(id: string): Promise<string | null> {
  const { person, talent } = await requireTalent();
  const fail = await errorText();
  if (!z.uuid().safeParse(id).success) return fail("invalid");
  const allowed = await canAnalyze(talent.id, id);
  if (!allowed.ok) return fail(allowed.reason === "daily" ? "aiDailyLimit" : "aiMessageLimit");
  const rows = await db
    .update(message)
    .set({ status: "pending", failure: null })
    .where(and(eq(message.id, id), eq(message.talentId, talent.id), inArray(message.status, ["analyzed", "error"])))
    .returning({ id: message.id });
  if (!rows.length) return fail("messageNotFound");
  const locale = toLocale(person.locale);
  after(() => analyzeMessage(id, locale));
  refresh();
  return null;
}

/** Set a message aside (略過), or bring it back. */
export async function dismissMessage(id: string, dismissed: boolean): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  if (!z.uuid().safeParse(id).success) return fail("invalid");
  const owned = and(eq(message.id, id), eq(message.talentId, talent.id));
  if (dismissed) {
    const rows = await db
      .update(message)
      .set({ status: "dismissed" })
      .where(and(owned, inArray(message.status, ["analyzed", "error"])))
      .returning({ id: message.id });
    if (!rows.length) return fail("messageNotFound");
  } else {
    // Back to where it was: analyzed if it has an analysis, otherwise needing a retry.
    const [analyzed] = await db.select({ id: messageAnalysis.id }).from(messageAnalysis).where(eq(messageAnalysis.messageId, id)).limit(1);
    const rows = await db
      .update(message)
      .set({ status: analyzed ? "analyzed" : "error" })
      .where(and(owned, eq(message.status, "dismissed")))
      .returning({ id: message.id });
    if (!rows.length) return fail("messageNotFound");
  }
  refresh();
  return null;
}

/** File a message under an existing project (加到既有合作案), with a reply to-do when the person kept a reply-by date. */
export async function linkMessageToProject(messageId: string, projectId: string, replyBy: string): Promise<string | null> {
  const { person, talent } = await requireTalent();
  const fail = await errorText();
  if (!z.uuid().safeParse(messageId).success || !z.uuid().safeParse(projectId).success) return fail("invalid");
  const reply = z.union([z.literal(""), z.iso.date()]).safeParse(replyBy);
  if (!reply.success) return fail("dateInvalid");
  const [p] = await db
    .select({ title: project.title, archivedAt: project.archivedAt })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.talentId, talent.id)));
  if (!p) return fail("projectNotFound");
  if (p.archivedAt) return fail("projectArchived");
  const failure = await db.transaction(async (tx) => {
    const rows = await tx
      .update(message)
      .set({ projectId, status: "confirmed" })
      .where(and(eq(message.id, messageId), eq(message.talentId, talent.id), eq(message.status, "analyzed")))
      .returning({ id: message.id });
    if (!rows.length) return fail("messageNotFound");
    await confirmFollowUps(tx, {
      talentId: talent.id,
      personId: person.personId,
      messageId,
      projectId,
      projectTitle: p.title,
      replyBy: reply.data || null,
    });
    return null;
  });
  if (!failure) refresh();
  return failure;
}
