"use server";

import { and, eq, ne, notInArray } from "drizzle-orm";
import { z } from "zod";
import { refresh } from "next/cache";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { authAccount, calendarConnection, calendarImportSource, calendarSeriesProject, externalEvent } from "@/lib/db/schema";
import { googleCalendar, GoogleCalendarError, revokeGoogleToken } from "@/lib/calendar/google/api";
import { importConnection } from "@/lib/calendar/google/import";
import { CALENDAR_SCOPE, hasScopes, IMPORT_SCOPES } from "@/lib/calendar/google/scope";
import { accessToken, queueCalendarSync, syncConnection } from "@/lib/calendar/google/sync";
import { checkProjectLink } from "./project-link";
import { errorText } from "./validation";

// Connecting, syncing, and disconnecting Google Calendar (decision 0009).
// The permission itself is granted in Google's own screen (linkSocial with the
// calendar scope); these run once the person is back.

async function googleAccount(personId: string) {
  const [account] = await db
    .select({ id: authAccount.id, scope: authAccount.scope, refreshToken: authAccount.refreshToken })
    .from(authAccount)
    .where(and(eq(authAccount.personId, personId), eq(authAccount.providerId, "google")));
  return account;
}

/** After Google's consent screen: record the connection and start the first sync. */
export async function connectGoogleCalendar(): Promise<string | null> {
  const { person, talent } = await requireTalent();
  const fail = await errorText();
  const account = await googleAccount(person.personId);
  if (!account?.scope?.split(/[ ,]/).includes(CALENDAR_SCOPE)) return fail("calendarNotGranted");
  // Background sync needs a refresh token; Google gives one only with offline access.
  if (!account.refreshToken) return fail("calendarNoOffline");
  const [connection] = await db
    .insert(calendarConnection)
    .values({ talentId: talent.id, personId: person.personId, authAccountId: account.id })
    .onConflictDoUpdate({
      target: [calendarConnection.personId, calendarConnection.talentId, calendarConnection.provider],
      set: { authAccountId: account.id, status: "connected", lastError: null, dirty: true },
    })
    .returning({ id: calendarConnection.id });
  await queueCalendarSync(connection.id);
  refresh();
  return null;
}

/** Sync now: push everything that changed (and re-create the calendar if it was deleted in Google). */
export async function syncGoogleCalendarNow(): Promise<string | null> {
  const { person, talent } = await requireTalent();
  const fail = await errorText();
  const [connection] = await db
    .update(calendarConnection)
    .set({ dirty: true })
    .where(and(eq(calendarConnection.personId, person.personId), eq(calendarConnection.talentId, talent.id), eq(calendarConnection.status, "connected")))
    .returning({ id: calendarConnection.id });
  if (!connection) return fail("calendarNotConnected");
  await syncConnection(connection.id); // here, not after the response: the card shows the result
  await importConnection(connection.id, { force: true });
  refresh();
  return null;
}

/**
 * Stop syncing. Optionally deletes the dedicated calendar in Google; withdraws
 * the app's access unless another workspace still syncs through the same
 * Google account. Sign-in with Google keeps working (it doesn't use the token).
 */
export async function disconnectGoogleCalendar(deleteCalendar: boolean): Promise<string | null> {
  const { person, talent } = await requireTalent();
  const fail = await errorText();
  const [c] = await db
    .select()
    .from(calendarConnection)
    .where(and(eq(calendarConnection.personId, person.personId), eq(calendarConnection.talentId, talent.id)));
  if (!c) return fail("calendarNotConnected");
  const token = await accessToken(c).catch(() => null);
  if (token && deleteCalendar && c.externalCalendarId) await googleCalendar(token).deleteCalendar(c.externalCalendarId).catch(() => undefined);
  await db.delete(calendarConnection).where(eq(calendarConnection.id, c.id)); // its synced-event rows go with it
  const others = await db
    .select({ id: calendarConnection.id })
    .from(calendarConnection)
    .where(and(eq(calendarConnection.authAccountId, c.authAccountId), ne(calendarConnection.id, c.id)));
  if (!others.length) {
    if (token) await revokeGoogleToken(token);
    const [account] = await db.select({ scope: authAccount.scope }).from(authAccount).where(eq(authAccount.id, c.authAccountId));
    const calendarScopes = new Set([CALENDAR_SCOPE, ...IMPORT_SCOPES]);
    const scope = (account?.scope ?? "").split(/[ ,]/).filter((s) => s && !calendarScopes.has(s)).join(",");
    await db
      .update(authAccount)
      .set({ scope, accessToken: null, refreshToken: null, accessTokenExpiresAt: null })
      .where(eq(authAccount.id, c.authAccountId));
  }
  refresh();
  return null;
}

// Phase 2: showing the person's own Google calendars here, read-only.

async function myConnection() {
  const { person, talent } = await requireTalent();
  const [c] = await db
    .select()
    .from(calendarConnection)
    .where(and(eq(calendarConnection.personId, person.personId), eq(calendarConnection.talentId, talent.id)));
  return c;
}

export type GoogleCalendarChoice = { id: string; name: string; color: string | null; selected: boolean };

/** How recently a sync counts as current: opening the Calendar screen again within it syncs nothing. */
const FRESH_MS = 60_000;

/**
 * The Calendar screen's own sync: on its own when the screen opens or comes back into view, skipped
 * when the last one is under a minute old, and only re-reading chosen calendars that changed; its ⟳
 * (`force`) does what Settings' Sync now does, re-reading every chosen calendar too.
 */
export async function syncMyGoogleCalendar({ force = false } = {}): Promise<string | null> {
  const fail = await errorText();
  const c = await myConnection();
  if (!c || c.status !== "connected") return null;
  if (!force && c.lastSyncedAt && Date.now() - c.lastSyncedAt.getTime() < FRESH_MS) return null;
  const result = await syncConnection(c.id);
  await importConnection(c.id, { force });
  refresh();
  return result ? fail(result.failure === "auth" ? "calendarNotConnected" : "calendarUnreachable") : null;
}

/**
 * The person's Google calendars to choose from (not our own Taloox calendar). `grant`: the
 * token can't read calendars after all (a reconnect that asked for less), so ask Google again.
 */
export async function listGoogleCalendars(): Promise<{ calendars: GoogleCalendarChoice[] } | { error: string } | { grant: true }> {
  const fail = await errorText();
  const c = await myConnection();
  if (!c || c.status !== "connected") return { error: fail("calendarNotConnected") };
  const [account] = await db.select({ scope: authAccount.scope }).from(authAccount).where(eq(authAccount.id, c.authAccountId));
  if (!hasScopes(account?.scope, IMPORT_SCOPES)) return { error: fail("calendarNotGranted") };
  const chosen = new Set((await db.select({ id: calendarImportSource.externalCalendarId }).from(calendarImportSource).where(eq(calendarImportSource.connectionId, c.id))).map((r) => r.id));
  try {
    const list = await googleCalendar(await accessToken(c)).listCalendars();
    return {
      calendars: list
        .filter((g) => g.id !== c.externalCalendarId)
        .map((g) => ({ id: g.id, name: g.summaryOverride || g.summary || g.id, color: g.backgroundColor ?? null, selected: chosen.has(g.id) }))
        .sort((a, b) => Number(b.selected) - Number(a.selected)),
    };
  } catch (e) {
    if (e instanceof GoogleCalendarError && e.scopeMissing) return { grant: true };
    return { error: fail("calendarUnreachable") };
  }
}

const choice = z.object({
  id: z.string().min(1).max(300),
  name: z.string().trim().min(1).max(200),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
});

/** Save which Google calendars to show here, and read them now. */
export async function saveGoogleCalendarChoice(calendars: z.input<typeof choice>[]): Promise<string | null> {
  const fail = await errorText();
  const parsed = z.array(choice).max(50).safeParse(calendars);
  if (!parsed.success) return fail("invalid");
  const c = await myConnection();
  if (!c || c.status !== "connected") return fail("calendarNotConnected");
  const ids = parsed.data.map((x) => x.id);
  // Calendars no longer chosen go, with their events.
  await db
    .delete(calendarImportSource)
    // Never our own calendar's repeating events: they aren't a choice here.
    .where(
      and(
        eq(calendarImportSource.connectionId, c.id),
        eq(calendarImportSource.own, false),
        ids.length ? notInArray(calendarImportSource.externalCalendarId, ids) : undefined,
      ),
    );
  for (const x of parsed.data)
    await db
      .insert(calendarImportSource)
      .values({ connectionId: c.id, externalCalendarId: x.id, name: x.name, color: x.color })
      .onConflictDoUpdate({ target: [calendarImportSource.connectionId, calendarImportSource.externalCalendarId], set: { name: x.name, color: x.color } });
  await importConnection(c.id, { force: true });
  refresh();
  return null;
}

/**
 * Add a repeating event in our own Taloox calendar to a project, as a whole (decision 0017):
 * every occurrence shows on it; the series stays read-only, edited in Google. The same project
 * check as any other link (project-link.ts).
 */
export async function fileGoogleSeries(seriesId: string, projectId: string): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  if (!z.string().min(1).max(1024).safeParse(seriesId).success || !z.uuid().safeParse(projectId).success) return fail("invalid");
  const c = await myConnection();
  if (!c) return fail("calendarNotConnected");
  // Only a series read from this person's own Taloox calendar.
  const [seen] = await db
    .select({ id: externalEvent.id })
    .from(externalEvent)
    .innerJoin(calendarImportSource, eq(calendarImportSource.id, externalEvent.sourceId))
    .where(and(eq(calendarImportSource.connectionId, c.id), eq(calendarImportSource.own, true), eq(externalEvent.seriesId, seriesId)))
    .limit(1);
  if (!seen) return fail("eventNotFound");
  const linkError = await checkProjectLink(talent.id, projectId);
  if (linkError) return fail(linkError);
  await db
    .insert(calendarSeriesProject)
    .values({ talentId: talent.id, connectionId: c.id, seriesId, projectId })
    .onConflictDoUpdate({ target: [calendarSeriesProject.connectionId, calendarSeriesProject.seriesId], set: { projectId } });
  refresh();
  return null;
}
