import "server-only";

// A small Google Calendar API v3 client: only what phase 1 needs (decision
// 0009). Plain fetch, no SDK. GOOGLE_CALENDAR_API_URL points it at a fake
// Google in tests; production leaves it unset.

import type { GoogleEvent } from "./import-plan";

const base = () => (process.env.GOOGLE_CALENDAR_API_URL || "https://www.googleapis.com/calendar/v3").replace(/\/$/, "");

/** A failed call: `status` is the HTTP status (0 = no response). */
export class GoogleCalendarError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
  /** The person's access is gone (revoked, expired consent): reconnecting is the fix. */
  get authLost() {
    return this.status === 401;
  }
  /** The calendar or event no longer exists at Google. */
  get gone() {
    return this.status === 404 || this.status === 410;
  }
}

async function call<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw new GoogleCalendarError(0, e instanceof Error ? e.message : "network error");
  }
  if (res.status === 204) return null as T;
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!res.ok) throw new GoogleCalendarError(res.status, json.error?.message ?? res.statusText);
  return json;
}

type Created = { id: string; etag?: string };
const enc = encodeURIComponent;

export function googleCalendar(token: string) {
  return {
    createCalendar: (body: { summary: string; description: string; timeZone: string }) => call<Created>(token, "POST", "/calendars", body),
    getCalendar: (id: string) => call<Created>(token, "GET", `/calendars/${enc(id)}`),
    deleteCalendar: (id: string) => call<null>(token, "DELETE", `/calendars/${enc(id)}`),
    insertEvent: (calendarId: string, body: unknown) => call<Created>(token, "POST", `/calendars/${enc(calendarId)}/events`, body),
    updateEvent: (calendarId: string, eventId: string, body: unknown) =>
      call<Created>(token, "PUT", `/calendars/${enc(calendarId)}/events/${enc(eventId)}`, body),
    deleteEvent: (calendarId: string, eventId: string) => call<null>(token, "DELETE", `/calendars/${enc(calendarId)}/events/${enc(eventId)}`),
    /** The calendars in the person's list (phase 2). */
    listCalendars: async () =>
      (
        await call<{ items?: { id: string; summary?: string; summaryOverride?: string; backgroundColor?: string; primary?: boolean }[] }>(
          token,
          "GET",
          "/users/me/calendarList?minAccessRole=reader&maxResults=250",
        )
      ).items ?? [],
    /** Every event in a date window, repeating events expanded into occurrences (phase 2). */
    listEvents: async (calendarId: string, timeMin: string, timeMax: string) => {
      const items: GoogleEvent[] = [];
      let timeZone = "UTC";
      let pageToken = "";
      for (let page = 0; page < 20; page++) {
        const query = new URLSearchParams({ singleEvents: "true", timeMin, timeMax, maxResults: "2500", ...(pageToken ? { pageToken } : {}) });
        const res = await call<{ items?: GoogleEvent[]; nextPageToken?: string; timeZone?: string }>(
          token,
          "GET",
          `/calendars/${enc(calendarId)}/events?${query}`,
        );
        items.push(...(res.items ?? []));
        timeZone = res.timeZone ?? timeZone;
        if (!res.nextPageToken) break;
        pageToken = res.nextPageToken;
      }
      return { items, timeZone };
    },
  };
}

/** Withdraw the app's access to the person's Google account (the whole grant). Best effort. */
export async function revokeGoogleToken(token: string) {
  const url = process.env.GOOGLE_OAUTH_REVOKE_URL || "https://oauth2.googleapis.com/revoke";
  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}
