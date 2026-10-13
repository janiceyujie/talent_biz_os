import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { mailConnection, mailDecision } from "@/lib/db/schema";
import { peek } from "@/lib/mail/worker-client";
import type { GmailMailPage, GmailMailView } from "@/lib/types";

const PAGE_SIZE = 30;
const outcomes = {
  waiting: ["work", "unsure", "pending"],
  skipped: ["skipped"],
} as const;

/**
 * One page of the emails Intake's Waiting or Filtered out lists: our decisions,
 * newest first, with sender and subject read live from Gmail by the worker
 * (decision 0013). Scoped to the talent's own mailbox.
 */
export async function listMailDecisions(talentId: string, view: GmailMailView, offset: number): Promise<GmailMailPage> {
  const [c] = await db
    .select({ id: mailConnection.id })
    .from(mailConnection)
    .where(and(eq(mailConnection.talentId, talentId), inArray(mailConnection.status, ["connected", "error"])));
  if (!c) return { items: [], more: false, error: "gone" };
  const rows = await db
    .select({
      id: mailDecision.id,
      gmailId: mailDecision.providerMessageId,
      receivedAt: mailDecision.receivedAt,
      outcome: mailDecision.outcome,
      decidedBy: mailDecision.decidedBy,
      score: mailDecision.score,
      kind: mailDecision.kind,
    })
    .from(mailDecision)
    .where(and(eq(mailDecision.connectionId, c.id), inArray(mailDecision.outcome, outcomes[view])))
    .orderBy(desc(mailDecision.receivedAt), desc(mailDecision.id))
    .limit(PAGE_SIZE + 1)
    .offset(offset);
  const page = rows.slice(0, PAGE_SIZE);
  if (!page.length) return { items: [], more: false, error: null };

  const live = await peek({
    connectionId: c.id,
    ids: page.map((r) => r.gmailId),
  });
  const found = new Map("items" in live ? live.items.map((i) => [i.id, i]) : []);
  return {
    items: page.map((r) => ({
      id: r.id,
      gmailId: r.gmailId,
      receivedAt: r.receivedAt.toISOString(),
      outcome: r.outcome,
      decidedBy: r.decidedBy,
      score: r.score,
      kind: r.kind,
      from: found.get(r.gmailId)?.from ?? null, // null: deleted in Gmail since, or not readable right now
      subject: found.get(r.gmailId)?.subject ?? null,
    })),
    more: rows.length > PAGE_SIZE,
    error: "error" in live ? live.error : null,
  };
}
