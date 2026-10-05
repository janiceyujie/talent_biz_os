import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { calendarConnection, calendarImportSource, externalEvent } from "@/lib/db/schema";
import { dateInZone } from "@/lib/domain/dates";
import { googleCalendar, GoogleCalendarError } from "./api";
import { fromGoogleEvent } from "./import-plan";
import { accessToken } from "./sync";

// Phase 2 of decision 0009: the person's chosen Google calendars, read into
// external_event. Each import re-reads a window of dates and replaces what was
// stored for that calendar — simple, and right for deletions and repeating
// events. Google's change tokens and push notifications can replace it later.

export const IMPORT_WINDOW = { pastDays: 31, futureDays: 183 };

/** Read the chosen calendars again; `minAgeMs` skips ones read more recently than that (for polling). Returns whether anything was read. */
export async function importConnection(connectionId: string, { minAgeMs = 0 } = {}): Promise<boolean> {
  const [c] = await db.select().from(calendarConnection).where(eq(calendarConnection.id, connectionId));
  if (!c || c.status !== "connected") return false;
  const sources = (await db.select().from(calendarImportSource).where(eq(calendarImportSource.connectionId, c.id))).filter(
    (s) => !minAgeMs || !s.lastImportedAt || Date.now() - s.lastImportedAt.getTime() >= minAgeMs,
  );
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

  for (const source of sources) {
    let listed;
    try {
      listed = await google.listEvents(source.externalCalendarId, from, to);
    } catch (e) {
      if (e instanceof GoogleCalendarError && e.authLost) {
        await db.update(calendarConnection).set({ status: "needs_reconnect", lastError: "auth" }).where(eq(calendarConnection.id, c.id));
        return false;
      }
      // The calendar was removed from their list, or access to it ended: stop showing it.
      if (e instanceof GoogleCalendarError && (e.gone || e.status === 403)) {
        await db.delete(calendarImportSource).where(eq(calendarImportSource.id, source.id));
        continue;
      }
      await db.update(calendarConnection).set({ lastError: e instanceof GoogleCalendarError && e.status ? "google" : "network" }).where(eq(calendarConnection.id, c.id));
      continue;
    }
    const rows = listed.items.flatMap((g) => {
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
      await tx.update(calendarImportSource).set({ lastImportedAt: new Date() }).where(and(eq(calendarImportSource.id, source.id)));
    });
  }
  return true;
}
