import "server-only";
import {mailboxOwnerActive,lockMailboxOwner} from "../owner";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { mailConnection, mailDecision } from "@/lib/db/schema";
import { accessToken, dropAccessToken, MailAccessLost, markReconnectNeeded } from "../access";
import { gmailProvider, GmailError } from "../gmail";
import type { MailRef } from "../metadata";
import type { MailProvider } from "../provider";
import { readMetadata } from "../read";
import { ruleContext } from "../relevance/context";
import { decideAll, RULES_VERSION } from "../relevance/rules";
import { queueFetching } from "./fetch";
import { expireNotices } from "./notice";
import { queueScoring } from "./relevance";

// mail.sync (docs/design/gmail-ingestion.md, Jobs): find the mailbox's new
// email, read each one's metadata, run the rules, and record what they
// decided; what they leave pending is queued for the model step
// (./relevance.ts). Runs on the mailbox's own queue, so two syncs never move the same
// cursor. Safe to run twice: an email already decided is never read again,
// except one still pending when the rules have changed since.

type Connection = typeof mailConnection.$inferSelect;

const HISTORY_DAYS = 30; // "the last 30 days", chosen when connecting
const MAX_MAIL = 5_000; // per sync; a 30-day history read is usually far below it
const CHUNK = 100; // emails read and recorded together, so a retry keeps what's done
const DAY_MS = 24 * 60 * 60 * 1000;

export async function syncMailbox(connectionId: string, { lastAttempt }: { lastAttempt: boolean }) {
  const [c] = await db.select().from(mailConnection).where(eq(mailConnection.id, connectionId));
  if (!c || c.status === "disconnecting" || c.status === "reconnect_needed") return;
  if(!await mailboxOwnerActive(c.id))return;
  try {
    await sync(c);
  } catch (e) {
    if (e instanceof MailAccessLost) return markReconnectNeeded(c.id);
    if (e instanceof GmailError && e.status === 401) dropAccessToken(c.id); // the next attempt gets a fresh one
    // Ids and codes only: never a subject or a token.
    console.error("mail.sync failed", c.id, e instanceof GmailError ? `${e.status} ${e.reason}` : (e as Error)?.name);
    if (lastAttempt)
      await db
        .update(mailConnection)
        .set({ status: "error", failure: "sync_failed" })
        .where(and(eq(mailConnection.id, c.id), eq(mailConnection.status, "connected")));
    throw e;
  }
}

async function sync(c: Connection) {
  // Until scheduled jobs arrive (gmail-push-backfill), each sync clears notices left too long.
  await expireNotices(c.talentId);
  const mail = gmailProvider(await accessToken(c));
  const { refs, cursor } = await whatsNew(c, mail);
  const fresh = await undecided(c.id, refs);
  const ctx = await ruleContext(c.talentId, c.id);

  for (let i = 0; i < fresh.length; i += CHUNK) {
    if (!await mailboxOwnerActive(c.id)) return;
    const read = await readMetadata(
      mail,
      fresh.slice(i, i + CHUNK).map((r) => r.id),
    );
    const decided = decideAll(read, ctx);
    if (decided.length) await db.transaction(async tx=>{
      if(!await lockMailboxOwner(tx,c.id))return;
      await tx
        .insert(mailDecision)
        .values(
          decided.map(({ mail: m, verdict }) => ({
            talentId: c.talentId,
            connectionId: c.id,
            providerMessageId: m.id,
            providerThreadId: m.threadId,
            receivedAt: m.receivedAt,
            outcome: verdict.outcome,
            decidedBy: verdict.rule,
            classifierVersion: RULES_VERSION,
          })),
        )
        .onConflictDoNothing();
    });
    for (const { mail: m, verdict } of decided) if (verdict.outcome === "work") ctx.workThreads.add(m.threadId);
  }
  await recheckPending(c, mail, ctx);

  const saved = await db.transaction(async (tx) => {
    if (!await lockMailboxOwner(tx, c.id)) return false;
    await tx
    .update(mailConnection)
    .set({
      historyId: cursor,
      historyDoneAt: c.historyDoneAt ?? new Date(),
      lastSyncedAt: new Date(),
      status: "connected",
      failure: null,
    })
    .where(and(eq(mailConnection.id, c.id), inArray(mailConnection.status, ["connected", "error"])));
    return true;
  });
  if (!saved) return;
  // Also anything still pending from before: a model that was down, or the rules-only version.
  await queueScoring(c.id);
  await queueFetching(c.id);
}

/**
 * The emails to look at, oldest first, and the cursor to save afterwards. The
 * first sync takes the cursor before reading the history, so nothing arriving
 * meanwhile falls between them (an email in both is decided once).
 */
async function whatsNew(c: Connection, mail: MailProvider): Promise<{ refs: MailRef[]; cursor: string }> {
  if (!c.historyId) {
    const cursor = await mail.currentCursor();
    const refs = c.historyMode === "30_days" && !c.historyDoneAt ? await mail.listSince(new Date(Date.now() - HISTORY_DAYS * DAY_MS), MAX_MAIL) : [];
    return { refs, cursor };
  }
  const changes = await mail.listChanges(c.historyId);
  if (changes) return { refs: changes.mail, cursor: changes.cursor };
  // The cursor is too old (no sync for about a week): search from the last sync instead.
  const cursor = await mail.currentCursor();
  const since = c.lastSyncedAt ? c.lastSyncedAt.getTime() - DAY_MS : Date.now() - 7 * DAY_MS;
  return { refs: await mail.listSince(new Date(since), MAX_MAIL), cursor };
}

/** Emails left pending by an older version of the rules: decide them again with the current one. */
async function recheckPending(c: Connection, mail: MailProvider, ctx: Awaited<ReturnType<typeof ruleContext>>) {
  const stale = await db
    .select({ id: mailDecision.id, gmailId: mailDecision.providerMessageId })
    .from(mailDecision)
    .where(and(eq(mailDecision.connectionId, c.id), eq(mailDecision.outcome, "pending"), ne(mailDecision.classifierVersion, RULES_VERSION)))
    .limit(MAX_MAIL);
  const rowFor = new Map(stale.map((r) => [r.gmailId, r.id]));
  for (let i = 0; i < stale.length; i += CHUNK) {
    if (!await mailboxOwnerActive(c.id)) return;
    const read = await readMetadata(
      mail,
      stale.slice(i, i + CHUNK).map((r) => r.gmailId),
    );
    const decided = decideAll(read, ctx);
    await db.transaction(async (tx) => {
      if(!await lockMailboxOwner(tx,c.id))return;
      for (const { mail: m, verdict } of decided)
        await tx
          .update(mailDecision)
          .set({ outcome: verdict.outcome, decidedBy: verdict.rule, classifierVersion: RULES_VERSION })
          .where(and(eq(mailDecision.id, rowFor.get(m.id)!), eq(mailDecision.outcome, "pending")));
    });
    for (const { mail: m, verdict } of decided) if (verdict.outcome === "work") ctx.workThreads.add(m.threadId);
  }
}

/** Drop repeats and emails already decided. */
async function undecided(connectionId: string, refs: MailRef[]): Promise<MailRef[]> {
  const unique = [...new Map(refs.map((r) => [r.id, r])).values()];
  const decided = new Set<string>();
  for (let i = 0; i < unique.length; i += 1000) {
    const rows = await db
      .select({ id: mailDecision.providerMessageId })
      .from(mailDecision)
      .where(
        and(
          eq(mailDecision.connectionId, connectionId),
          inArray(
            mailDecision.providerMessageId,
            unique.slice(i, i + 1000).map((r) => r.id),
          ),
        ),
      );
    for (const r of rows) decided.add(r.id);
  }
  return unique.filter((r) => !decided.has(r.id)).slice(0, MAX_MAIL);
}
