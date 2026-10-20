import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { calendarConnection, calendarImportSource, externalEvent } from "@/lib/db/schema";
import { dateInZone } from "@/lib/domain/dates";
import { googleCalendar, GoogleCalendarError } from "./api";
import { fromGoogleEvent } from "./import-plan";
import { needsWindowRead } from "./read-plan";
import { accessToken } from "./sync";

// Phase 2 of decision 0009: the person's chosen Google calendars, read into
// external_event. A read re-reads a window of dates and replaces what was
// stored for that calendar: simple, and right for deletions and repeating
// events. The worker asks every few minutes (calendar.sync); Google's sync
// token says cheaply whether a calendar changed, so the window is read only
// then, or once a day as it moves on (docs/design/calendar-two-way.md). A
// sync token can't be limited to a window, so it only tells *whether*.

export const IMPORT_WINDOW = { pastDays: 31, futureDays: 183 };

/** Read the chosen calendars that changed; `force` reads every one (Sync now, a new choice). Returns whether any window was read. */
export async function importConnection(connectionId: string, { force = false } = {}): Promise<boolean> {
  const [c] = await db.select().from(calendarConnection).where(eq(calendarConnection.id, connectionId));
  if (!c || c.status !== "connected") return false;
  const sources = await db.select().from(calendarImportSource).where(eq(calendarImportSource.connectionId, c.id));
  if (!sources.length) return false;

  let google;
  try {
    google = googleCalendar(await accessToken(c));
  } catch {
    await db.update(calendarConnection).set({ status: "needs_reconnect", lastError: "auth" }).where(eq(calendarConnection.id, c.id));
    return false;
  }
  const from = new Date(`${dateInZone("UTC", -IMPORT_WINDOW.pastDays)}T00:00:00Z`).toISOString();
  const to = new Date(`${dateInZone("UTC", IMPORT_WINDOW.futureDays)}T00:00:00Z`).toISOString();

  let read = false;
  for (const source of sources) {
    let listed;
    let syncToken = source.syncToken;
    try {
      // Our own calendar's repeating events (decision 0017): the sync's read of our calendar says
      // when to read them again (it clears lastImportedAt), so no token of their own.
      let changed = force;
      if (!source.own) {
        // Whether it changed: only ids since the token; with none yet, only a token.
        const found = await google.listChanges(source.externalCalendarId, source.syncToken, source.syncToken ? "id" : "");
        syncToken = found.nextSyncToken;
        changed ||= !!source.syncToken && (found.fresh || found.items.length > 0);
      }
      if (!needsWindowRead({ changed, lastImportedAt: source.lastImportedAt })) {
        if (syncToken !== source.syncToken) await db.update(calendarImportSource).set({ syncToken }).where(eq(calendarImportSource.id, source.id));
        continue;
      }
      listed = await google.listEvents(source.externalCalendarId, from, to);
    } catch (e) {
      if (e instanceof GoogleCalendarError && e.authLost) {
        await db.update(calendarConnection).set({ status: "needs_reconnect", lastError: "auth" }).where(eq(calendarConnection.id, c.id));
        return false;
      }
      // The token can't read calendars: a reconnect that asked for less. Keep every choice;
      // reconnecting asks for reading again (google-calendar-settings.tsx).
      if (e instanceof GoogleCalendarError && e.scopeMissing) {
        await db.update(calendarConnection).set({ status: "needs_reconnect", lastError: "auth" }).where(eq(calendarConnection.id, c.id));
        return read;
      }
      // The calendar was deleted, or removed from their list: stop showing it. Any other 403
      // (Google's rate limits answer 403 too) keeps it, to be read again next time.
      if (e instanceof GoogleCalendarError && e.gone) {
        await db.delete(calendarImportSource).where(eq(calendarImportSource.id, source.id));
        continue;
      }
      await db.update(calendarConnection).set({ lastError: e instanceof GoogleCalendarError && e.status ? "google" : "network" }).where(eq(calendarConnection.id, c.id));
      continue;
    }
    // From our own calendar, only occurrences of a series made in Google, never our own events.
    const items = source.own ? listed.items.filter((g) => g.recurringEventId && !g.extendedProperties?.private?.talentBizOsId) : listed.items;
    const rows = items.flatMap((g) => {
      const e = fromGoogleEvent(g, listed.timeZone);
      return e ? [{ ...e, sourceId: source.id }] : [];
    });
    // Replace this calendar's events in one step; one import per calendar at a time.
    await db.transaction(async (tx) => {
      const [{ locked }] = (await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${"import:" + source.id})) as locked`)) as unknown as {
        locked: boolean;
      }[];
      if (!locked) return;
      await tx.delete(externalEvent).where(eq(externalEvent.sourceId, source.id));
      for (let i = 0; i < rows.length; i += 500) await tx.insert(externalEvent).values(rows.slice(i, i + 500)).onConflictDoNothing();
      await tx.update(calendarImportSource).set({ lastImportedAt: new Date(), syncToken }).where(and(eq(calendarImportSource.id, source.id)));
    });
    read = true;
  }
  return read;
}
