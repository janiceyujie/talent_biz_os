import "server-only";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assistantConversation, assistantMessage, membership } from "@/lib/db/schema";
import { PAGE_SIZE, type ListPage } from "@/lib/domain/list-page";
import type { AssistantAnswer } from "./answers";
import { answerContent, questionContent, savedLine, titleOf, type Question, type SavedLine } from "./content";

// The assistant's saved conversations (decision 0023). Every read is scoped to
// the person who had the conversation. They see the conversations about the
// talent they're working on, and those about a talent they no longer have
// access to, read-only; one about another talent they still work on shows
// when they work on that talent. Anything else is "not found", never "forbidden".

export type ConversationSummary = { id: string; title: string; updatedAt: string; readOnly: boolean };

/**
 * Whether this person may read it: theirs, and about the talent they're on or one they've lost access to.
 * The outer column is written out in full: in a one-table query Drizzle leaves columns unqualified, and a
 * bare "talent_id" inside the subquery would mean the membership's own (as lib/data/projects.ts notes).
 */
const visible = (personId: string, talentId: string) =>
  and(
    eq(assistantConversation.personId, personId),
    sql`("assistant_conversation"."talent_id" = ${talentId} or not exists (
      select 1 from ${membership} m where m.person_id = ${personId} and m.talent_id = "assistant_conversation"."talent_id" and m.status = 'active'))`,
  );

const encodeCursor = (updatedAt: string, id: string) => Buffer.from(JSON.stringify([updatedAt, id])).toString("base64url");
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

/** One page of this person's conversations, latest first. */
export async function listConversations(personId: string, talentId: string, cursor: string): Promise<ListPage<ConversationSummary>> {
  const after = cursor ? decodeCursor(cursor) : null;
  const filtered = visible(personId, talentId);
  const [rows, [total]] = await Promise.all([
    db
      .select({ id: assistantConversation.id, title: assistantConversation.title, updatedAt: assistantConversation.updatedAt, talentId: assistantConversation.talentId })
      .from(assistantConversation)
      .where(and(filtered, after ? sql`(${assistantConversation.updatedAt}, ${assistantConversation.id}) < (${after[0]}::timestamptz, ${after[1]}::uuid)` : undefined))
      .orderBy(desc(assistantConversation.updatedAt), desc(assistantConversation.id))
      .limit(PAGE_SIZE + 1), // one more than shown says whether there's a next page
    db.select({ n: count() }).from(assistantConversation).where(filtered),
  ]);
  const shown = rows.slice(0, PAGE_SIZE);
  const last = shown.at(-1);
  return {
    items: shown.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updatedAt.toISOString(), readOnly: r.talentId !== talentId })),
    nextCursor: rows.length > PAGE_SIZE && last ? encodeCursor(last.updatedAt.toISOString(), last.id) : null,
    total: total.n,
  };
}

/** One conversation and its messages, oldest first, or null when this person can't read it. */
export async function getConversation(personId: string, talentId: string, id: string): Promise<(ConversationSummary & { lines: SavedLine[] }) | null> {
  const [row] = await db
    .select()
    .from(assistantConversation)
    .where(and(eq(assistantConversation.id, id), visible(personId, talentId)));
  if (!row) return null;
  const messages = await db
    .select()
    .from(assistantMessage)
    .where(eq(assistantMessage.conversationId, id))
    .orderBy(asc(assistantMessage.createdAt), asc(assistantMessage.id));
  return { id: row.id, title: row.title, updatedAt: row.updatedAt.toISOString(), readOnly: row.talentId !== talentId, lines: messages.map(savedLine) };
}

/** Whether this person can add to it: theirs, and about the talent they're on now. */
export async function canContinue(personId: string, talentId: string, id: string) {
  const [row] = await db
    .select({ id: assistantConversation.id })
    .from(assistantConversation)
    .where(and(eq(assistantConversation.id, id), eq(assistantConversation.personId, personId), eq(assistantConversation.talentId, talentId)));
  return !!row;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A question and its answer, added to a conversation, or to a new one titled by the question. Returns the conversation's id. */
export async function saveTurn(
  tx: Tx,
  turn: { personId: string; talentId: string; conversationId?: string; question: Question; answer: AssistantAnswer; title: string },
) {
  const now = new Date();
  let id = turn.conversationId;
  if (id) await tx.update(assistantConversation).set({ updatedAt: now }).where(eq(assistantConversation.id, id));
  else
    [{ id }] = await tx
      .insert(assistantConversation)
      .values({ personId: turn.personId, talentId: turn.talentId, title: titleOf(turn.title), createdAt: now, updatedAt: now })
      .returning({ id: assistantConversation.id });
  const projectId = "projectId" in turn.question ? (turn.question.projectId ?? null) : null;
  // The answer a moment after the question, so the two keep their order.
  await tx.insert(assistantMessage).values([
    { conversationId: id!, role: "user", content: questionContent(turn.question), projectId, createdAt: now },
    { conversationId: id!, role: "assistant", content: answerContent(turn.answer), projectId, createdAt: new Date(now.getTime() + 1) },
  ]);
  return id!;
}

/** Deletes one of this person's conversations, with its messages. Whether there was one to delete. */
export async function deleteConversation(personId: string, id: string) {
  const deleted = await db
    .delete(assistantConversation)
    .where(and(eq(assistantConversation.id, id), eq(assistantConversation.personId, personId)))
    .returning({ id: assistantConversation.id });
  return deleted.length > 0;
}
