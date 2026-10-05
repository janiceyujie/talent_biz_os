// Pushing our events to the dedicated Google calendar (decision 0009, phase 1):
// what a Google event looks like, and what a sync has to create, update, or
// remove. Pure functions; lib/calendar/google/sync.ts does the calls.
import { DEFAULT_DURATION_MINUTES, type IcsEvent } from "../ics";

/** The fields we write on a Google Calendar event (Events resource). */
export type GoogleEventBody = {
  summary: string;
  description?: string;
  location?: string;
  start: { date: string } | { dateTime: string; timeZone: string };
  end: { date: string } | { dateTime: string; timeZone: string };
  /** Our event's id, so a Google event can always be traced back. */
  extendedProperties: { private: { talentBizOsId: string } };
};

const nextDay = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** Wall time plus minutes, staying wall time (the zone stays alongside it). */
function addMinutes(date: string, time: string, minutes: number) {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), h, m + minutes));
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
}

/**
 * Google takes local wall time plus an IANA zone, as we store it (decision
 * 0003), so a Tokyo show stays at Tokyo time. An event without a time is
 * all-day; a timed event without an end lasts an hour, as in the .ics feed.
 */
export function toGoogleEvent(e: IcsEvent): GoogleEventBody {
  const base = {
    summary: e.title,
    ...(e.description ? { description: e.description } : {}),
    ...(e.location ? { location: e.location } : {}),
    extendedProperties: { private: { talentBizOsId: e.id } },
  };
  if (!e.time) return { ...base, start: { date: e.date }, end: { date: nextDay(e.date) } };
  const end = e.end ?? { ...addMinutes(e.date, e.time, DEFAULT_DURATION_MINUTES), timeZone: e.timeZone };
  return {
    ...base,
    start: { dateTime: `${e.date}T${e.time}:00`, timeZone: e.timeZone },
    end: { dateTime: `${end.date}T${end.time}:00`, timeZone: end.timeZone },
  };
}

/** What we last pushed for an event (calendar_event_sync); `eventId` null once our event is deleted. */
export type SyncedEvent = { id: string; eventId: string | null; externalEventId: string; syncedAt: Date };

export type SyncPlan = {
  create: IcsEvent[];
  update: { event: IcsEvent; synced: SyncedEvent }[];
  remove: SyncedEvent[];
};

/**
 * Compare the events that belong in Google with what was pushed: new ones are
 * created, ones changed since their last push updated, and pushed ones that no
 * longer belong (deleted, archived, unconfirmed) removed.
 */
export function planSync(events: IcsEvent[], synced: SyncedEvent[]): SyncPlan {
  const byEvent = new Map(synced.filter((s) => s.eventId).map((s) => [s.eventId!, s]));
  const wanted = new Set(events.map((e) => e.id));
  return {
    create: events.filter((e) => !byEvent.has(e.id)),
    update: events.flatMap((e) => {
      const s = byEvent.get(e.id);
      return s && e.updatedAt.getTime() > s.syncedAt.getTime() ? [{ event: e, synced: s }] : [];
    }),
    remove: synced.filter((s) => !s.eventId || !wanted.has(s.eventId)),
  };
}
