import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { mailConnection, mailDecision } from "@/lib/db/schema";
import { accessToken, dropAccessToken, MailAccessLost, markReconnectNeeded } from "./access";
import { gmailProvider, GmailError } from "./gmail";
import type { Address } from "./metadata";
import { readMetadata } from "./read";
import { log } from "@/lib/log";

// Sender and subject for the emails Filtered out and Waiting list in Intake,
// read live from Gmail as the page opens (decision 0013): we store only ids.
// Runs in the worker (worker/http.ts), the one process that can decrypt a
// mailbox's token; the web service asks it for one page at a time.

export const PEEK_LIMIT = 50;

export type PeekItem = { id: string; from: Address; subject: string };
export type PeekResult = { items: PeekItem[] } | { error: "gone" | "reconnect" | "gmail" };

/** Only emails this mailbox has a decision for: the endpoint can't be used to read anything else. */
export async function peekMail(connectionId: string, ids: string[]): Promise<PeekResult> {
  const [c] = await db.select().from(mailConnection).where(eq(mailConnection.id, connectionId));
  if (!c || c.status === "disconnecting") return { error: "gone" };
  if (c.status === "reconnect_needed") return { error: "reconnect" };
  const known = ids.length
    ? await db
        .select({ id: mailDecision.providerMessageId })
        .from(mailDecision)
        .where(and(eq(mailDecision.connectionId, c.id), inArray(mailDecision.providerMessageId, ids.slice(0, PEEK_LIMIT))))
    : [];
  try {
    const read = await readMetadata(
      gmailProvider(await accessToken(c)),
      known.map((k) => k.id),
    );
    return {
      items: read.map((m) => ({ id: m.id, from: m.from, subject: m.subject })),
    };
  } catch (e) {
    if (e instanceof MailAccessLost) {
      await markReconnectNeeded(c.id);
      return { error: "reconnect" };
    }
    if (e instanceof GmailError) {
      if (e.status === 401) dropAccessToken(c.id);
      log.error("mail.peek.failed", { connection_id: c.id, error: e });
      return { error: "gmail" };
    }
    throw e;
  }
}
