"use server";

import { and, eq, ne, notInArray } from "drizzle-orm";
import { z } from "zod";
import { refresh } from "next/cache";
import { after } from "next/server";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { authAccount, calendarConnection, calendarImportSource } from "@/lib/db/schema";
import { googleCalendar, revokeGoogleToken } from "@/lib/calendar/google/api";
import { importConnection } from "@/lib/calendar/google/import";
import { CALENDAR_SCOPE, hasScopes, IMPORT_SCOPES } from "@/lib/calendar/google/scope";
import { accessToken, syncConnection } from "@/lib/calendar/google/sync";
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
  after(() => syncConnection(connection.id));
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
  await importConnection(connection.id);
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

/** The person's Google calendars to choose from (not our own Talent Biz OS calendar). */
export async function listGoogleCalendars(): Promise<{ calendars: GoogleCalendarChoice[] } | { error: string }> {
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
  } catch {
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
    .where(ids.length ? and(eq(calendarImportSource.connectionId, c.id), notInArray(calendarImportSource.externalCalendarId, ids)) : eq(calendarImportSource.connectionId, c.id));
  for (const x of parsed.data)
    await db
      .insert(calendarImportSource)
      .values({ connectionId: c.id, externalCalendarId: x.id, name: x.name, color: x.color })
      .onConflictDoUpdate({ target: [calendarImportSource.connectionId, calendarImportSource.externalCalendarId], set: { name: x.name, color: x.color } });
  await importConnection(c.id);
  refresh();
  return null;
}

/** While the calendar is open: read the chosen calendars again if it's been a couple of minutes. */
export async function refreshGoogleCalendars(): Promise<void> {
  const c = await myConnection();
  if (c && (await importConnection(c.id, { minAgeMs: 2 * 60_000 }))) refresh();
}
