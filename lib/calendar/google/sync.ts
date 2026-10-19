import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { calendarConnection, calendarEventSync, person, talent } from "@/lib/db/schema";
import { toLocale } from "@/lib/i18n/config";
import { translator } from "@/lib/i18n/translator";
import { queue } from "@/lib/queue";
import { calendarSyncKey, calendarSyncQueue } from "@/lib/queue/jobs";
import { feedEvents } from "../feed";
import { googleCalendar, GoogleCalendarError } from "./api";
import { planSync, toGoogleEvent } from "./plan";

// Phase 1 of decision 0009: our events, pushed to a dedicated calendar in the
// person's Google account. A sync compares what belongs there with what was
// pushed (plan.ts) and makes the difference. One sync per connection at a time
// (a transaction-scoped advisory lock); a change arriving mid-sync sets
// `dirty`, and the running sync goes around again. It runs as a job in the
// worker (calendar.sync, decision 0014), which retries what Google or the
// network failed on; Sync now still runs it in the request, to show the result.

export { CALENDAR_SCOPE } from "./scope";

export type SyncFailure = "auth" | "google" | "network";

/** After a change to a talent's events: mark its connections and queue their syncs. */
export async function requestCalendarSync(talentId: string) {
  const rows = await db
    .update(calendarConnection)
    .set({ dirty: true })
    .where(and(eq(calendarConnection.talentId, talentId), eq(calendarConnection.status, "connected")))
    .returning({ id: calendarConnection.id });
  for (const r of rows) await queueCalendarSync(r.id);
}

/** A sync for one connection; a waiting one is replaced, so a burst of changes syncs once. */
export const queueCalendarSync = (connectionId: string, attempt = 0, runAt?: Date) =>
  queue.enqueue("calendar.sync", { connectionId, attempt }, { queueName: calendarSyncQueue(connectionId), jobKey: calendarSyncKey(connectionId), runAt });

/** After a failure Google or the network may get over: 1 min, 5 min, 30 min, 2 h, then every 6 h (launch checklist). */
const RETRY_AFTER_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 6 * 60 * 60_000];
export const retryAfter = (attempt: number) => RETRY_AFTER_MS[Math.min(attempt, RETRY_AFTER_MS.length - 1)];

/**
 * calendar.sync: one connection's sync, and the next try when it failed on
 * something that passes (the network, Google down or asking us to slow down).
 * Lost access waits for the person to reconnect; a request Google rejects
 * would fail the same way again, so it waits for the next change or Sync now.
 */
export async function runCalendarSync(connectionId: string, attempt: number) {
  const result = await syncConnection(connectionId);
  if (result?.retry) await queueCalendarSync(connectionId, attempt + 1, new Date(Date.now() + retryAfter(attempt)));
}

/**
 * Bring one connection's Google calendar in line with our events. Never throws;
 * failures are recorded on the connection, and returned with whether trying
 * again later may help.
 */
export async function syncConnection(connectionId: string): Promise<{ failure: SyncFailure; retry: boolean } | null> {
  return db.transaction(async (tx) => {
    const [{ locked }] = (await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${connectionId})) as locked`)) as unknown as {
      locked: boolean;
    }[];
    if (!locked) return null; // another sync is running; it will see `dirty`
    for (let pass = 0; pass < 5; pass++) {
      const [c] = await tx.select().from(calendarConnection).where(eq(calendarConnection.id, connectionId));
      if (!c || c.status !== "connected" || !c.dirty) return null;
      await tx.update(calendarConnection).set({ dirty: false }).where(eq(calendarConnection.id, c.id));
      try {
        await pushOnce(tx, c);
        await tx.update(calendarConnection).set({ lastSyncedAt: new Date(), lastError: null }).where(eq(calendarConnection.id, c.id));
      } catch (e) {
        const failure: SyncFailure =
          e instanceof AccessLost || (e instanceof GoogleCalendarError && e.authLost) ? "auth" : e instanceof GoogleCalendarError && e.status ? "google" : "network";
        // Still behind Google, so stay dirty. Lost access needs the person; the network,
        // Google being down, or its "slow down" are tried again later (runCalendarSync).
        await tx
          .update(calendarConnection)
          .set({ dirty: true, lastError: failure, ...(failure === "auth" ? { status: "needs_reconnect" as const } : {}) })
          .where(eq(calendarConnection.id, c.id));
        console.error("calendar sync failed", { connectionId, failure, message: e instanceof Error ? e.message : String(e) });
        const status = e instanceof GoogleCalendarError ? e.status : 0;
        return { failure, retry: failure === "network" || (failure === "google" && (status === 429 || status >= 500)) };
      }
    }
    return null;
  });
}

class AccessLost extends Error {}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Connection = typeof calendarConnection.$inferSelect;

/** A valid access token for the connection's Google account, refreshed by Better Auth when it's about to expire. */
export async function accessToken(c: Pick<Connection, "authAccountId" | "personId">) {
  try {
    const { accessToken } = await auth.api.getAccessToken({ body: { accountId: c.authAccountId, userId: c.personId } });
    if (!accessToken) throw new AccessLost();
    return accessToken;
  } catch {
    throw new AccessLost();
  }
}

async function pushOnce(tx: Tx, c: Connection) {
  const google = googleCalendar(await accessToken(c));
  const [{ locale, name, timeZone }] = await tx
    .select({ locale: person.locale, name: talent.name, timeZone: talent.timeZone })
    .from(person)
    .innerJoin(talent, eq(talent.id, c.talentId))
    .where(eq(person.id, c.personId));

  // The dedicated calendar: create it on the first sync, and again if the person deleted it in Google.
  let calendarId = c.externalCalendarId;
  if (calendarId) {
    try {
      await google.getCalendar(calendarId);
    } catch (e) {
      if (!(e instanceof GoogleCalendarError && e.gone)) throw e;
      calendarId = null;
    }
  }
  if (!calendarId) {
    const t = await translator(toLocale(locale), "googleCalendar");
    calendarId = (await google.createCalendar({ summary: t("calendarName", { talent: name }), description: t("calendarDescription"), timeZone })).id;
    await tx.update(calendarConnection).set({ externalCalendarId: calendarId }).where(eq(calendarConnection.id, c.id));
    await tx.delete(calendarEventSync).where(eq(calendarEventSync.connectionId, c.id)); // nothing is in the new calendar yet
  }

  const events = await feedEvents(c.talentId, locale);
  const synced = await tx.select().from(calendarEventSync).where(eq(calendarEventSync.connectionId, c.id));
  const plan = planSync(events, synced);

  for (const e of plan.create) {
    const made = await google.insertEvent(calendarId, toGoogleEvent(e));
    await tx.insert(calendarEventSync).values({ connectionId: c.id, eventId: e.id, externalEventId: made.id, etag: made.etag, syncedAt: e.updatedAt });
  }
  for (const { event: e, synced: s } of plan.update) {
    let made;
    try {
      made = await google.updateEvent(calendarId, s.externalEventId, toGoogleEvent(e));
    } catch (err) {
      // Deleted in Google: our calendar is ours to write (decision 0009), so it comes back.
      if (!(err instanceof GoogleCalendarError && err.gone)) throw err;
      made = await google.insertEvent(calendarId, toGoogleEvent(e));
    }
    await tx
      .update(calendarEventSync)
      .set({ externalEventId: made.id, etag: made.etag, syncedAt: e.updatedAt })
      .where(eq(calendarEventSync.id, s.id));
  }
  for (const s of plan.remove) {
    try {
      await google.deleteEvent(calendarId, s.externalEventId);
    } catch (err) {
      if (!(err instanceof GoogleCalendarError && err.gone)) throw err;
    }
    await tx.delete(calendarEventSync).where(eq(calendarEventSync.id, s.id));
  }
}
