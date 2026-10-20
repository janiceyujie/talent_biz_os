import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  auditLog,
  calendarConnection,
  calendarEvent,
  calendarEventSync,
  calendarImportSource,
  contact,
  organization,
  person,
  project,
  projectContact,
  projectOrganization,
  talent,
} from "@/lib/db/schema";
import { isOpenStage } from "@/lib/domain/phases";
import { locales, toLocale } from "@/lib/i18n/config";
import { translator } from "@/lib/i18n/translator";
import { feedEvents } from "../feed";
import type { googleCalendar } from "./api";
import type { GoogleEvent } from "./import-plan";
import { toGoogleEvent } from "./plan";
import { changedHere, fieldsOfOurs, fieldsOfTheirs, infoFrom, keysFor, mergeFields, suggestProject, type SyncFields } from "./two-way";

// Our own calendar read back (docs/design/calendar-two-way.md, decision 0017):
// what changed in Google since the last read, by its sync token, brought into
// our events. Edits are merged field by field with ours; events added there
// become events here, without a project; a delete hides the event here and
// it's removed for good 30 days later. Nothing is shown about it on screen:
// each change is recorded in audit_log only. Repeating events stay read-only,
// read like a chosen calendar (import.ts, the `own` source).

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Connection = typeof calendarConnection.$inferSelect;
type Google = ReturnType<typeof googleCalendar>;
type EventRow = typeof calendarEvent.$inferSelect;

const FIELDS = "id,etag,status,summary,description,location,start,end,updated,recurrence,recurringEventId,attendees(email),extendedProperties";

/** The notes line in every language, so it's found whichever language wrote it. */
const notesMarkers = async () => Promise.all(locales.map(async (l) => (await translator(l, "googleCalendar"))("notesMarker")));

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);
const ordinary = (kind: string) => keysFor(kind).includes("end");

/** A row's shared fields, as fieldsOfOurs gives them for its pushed form. */
function fieldsOfRow(e: EventRow): SyncFields {
  return {
    title: e.title,
    date: e.startDate,
    time: hhmm(e.startTime),
    timeZone: e.timeZone,
    end: ordinary(e.kind) && e.startTime && e.endDate && e.endTime ? { date: e.endDate, time: hhmm(e.endTime)! } : null,
    location: ordinary(e.kind) ? e.location : null,
    notes: e.notes,
  };
}

/** The columns for shared fields: an ordinary event's end is in its start zone. */
function columnsOf(f: SyncFields, kind: string) {
  return {
    title: f.title,
    startDate: f.date,
    startTime: f.time,
    timeZone: f.timeZone,
    ...(ordinary(kind)
      ? { endDate: f.time && f.end ? f.end.date : null, endTime: f.time && f.end ? f.end.time : null, endTimeZone: f.time && f.end ? f.timeZone : null, location: f.location }
      : {}),
    notes: f.notes,
  };
}

/** One change, recorded and not shown for now (a history or Restore can come later). */
const record = (tx: Tx, c: Connection, action: string, eventId: string, details: Record<string, unknown>) =>
  tx.insert(auditLog).values({ talentId: c.talentId, actorPersonId: c.personId, action, targetType: "calendar_event", targetId: eventId, details: { connectionId: c.id, ...details } });

const diff = (from: SyncFields, to: Partial<SyncFields>) =>
  Object.fromEntries(Object.entries(to).map(([k, v]) => [k, { from: from[k as keyof SyncFields], to: v }]));

/** The projects an added event may be suggested for (still going, decision 0018), with their names and people's addresses. */
async function suggestionTargets(tx: Tx, talentId: string) {
  const rows = (await tx.select().from(project).where(and(eq(project.talentId, talentId), isNull(project.archivedAt)))).filter((p) => isOpenStage(p.stage));
  if (!rows.length) return [];
  const ids = rows.map((p) => p.id);
  const people = await tx
    .select({ projectId: projectContact.projectId, email: contact.email })
    .from(projectContact)
    .innerJoin(contact, eq(contact.id, projectContact.contactId))
    .where(and(eq(projectContact.talentId, talentId), inArray(projectContact.projectId, ids)));
  const counterparts = await tx.select({ id: contact.id, email: contact.email }).from(contact).where(eq(contact.talentId, talentId));
  const orgs = await tx
    .select({ projectId: projectOrganization.projectId, name: organization.name })
    .from(projectOrganization)
    .innerJoin(organization, eq(organization.id, projectOrganization.organizationId))
    .where(and(eq(projectOrganization.talentId, talentId), inArray(projectOrganization.projectId, ids)));
  return rows.map((p) => ({
    id: p.id,
    names: [p.title, p.counterparty, ...orgs.filter((o) => o.projectId === p.id).map((o) => o.name)],
    emails: [
      ...people.filter((x) => x.projectId === p.id).map((x) => x.email),
      counterparts.find((x) => x.id === p.counterpartyId)?.email,
    ].filter((e): e is string => !!e),
  }));
}

/**
 * Read our calendar's changes since the last read and bring them in, inside the sync's
 * transaction (one per connection at a time). Returns how many events changed here, and whether
 * this copy needs a push even so (ours going back over what stays ours).
 */
export async function readBack(tx: Tx, c: Connection, google: Google): Promise<{ changed: number; push: boolean }> {
  if (!c.externalCalendarId) return { changed: 0, push: false };
  const [who] = await tx
    .select({ locale: person.locale, name: talent.name, timeZone: talent.timeZone })
    .from(person)
    .innerJoin(talent, eq(talent.id, c.talentId))
    .where(eq(person.id, c.personId));
  const locale = toLocale(who.locale);
  const marker = (await translator(locale, "googleCalendar"))("notesMarker");
  const markers = await notesMarkers();
  const found = await google.listChanges(c.externalCalendarId, c.syncToken, FIELDS);
  const synced = new Map((await tx.select().from(calendarEventSync).where(eq(calendarEventSync.connectionId, c.id))).map((s) => [s.externalEventId, s]));

  let changed = 0;
  let push = false;
  let repeating = false;
  for (const g of found.items as GoogleEvent[]) {
    // An occurrence of a repeating event: shown read-only, from the own source.
    if (g.recurringEventId) {
      repeating = true;
      continue;
    }
    let s = synced.get(g.id);
    // Ours, but no longer mapped (a full read after Google's token ran out): map it again.
    const tagged = g.extendedProperties?.private?.talentBizOsId;
    if (!s && tagged && /^[0-9a-f-]{36}$/i.test(tagged)) {
      const [mine] = await tx.select({ id: calendarEvent.id }).from(calendarEvent).where(and(eq(calendarEvent.id, tagged), eq(calendarEvent.talentId, c.talentId)));
      if (mine) {
        [s] = await tx
          .insert(calendarEventSync)
          .values({ connectionId: c.id, eventId: mine.id, externalEventId: g.id, etag: null, syncedAt: new Date(0) })
          .onConflictDoUpdate({ target: [calendarEventSync.connectionId, calendarEventSync.eventId], set: { externalEventId: g.id, etag: null, syncedAt: new Date(0) } })
          .returning();
      }
    }
    if (!s) {
      if (g.status === "cancelled") continue;
      if (g.recurrence?.length) {
        repeating = true;
        continue;
      }
      if (await addFromGoogle(tx, c, g, who.timeZone, markers, locale)) changed++;
      continue;
    }
    if (g.etag && g.etag === s.etag) continue; // our own write coming back
    if (!s.eventId) continue; // deleted here: the push removes it there
    const [e] = await tx.select().from(calendarEvent).where(eq(calendarEvent.id, s.eventId));
    if (!e || e.archivedAt || e.deletedInGoogleAt) continue;
    if (g.status === "cancelled") {
      await tx.update(calendarEvent).set({ deletedInGoogleAt: new Date() }).where(eq(calendarEvent.id, e.id));
      await record(tx, c, "calendar_event.deleted_in_google", e.id, {});
      changed++;
      continue;
    }
    const result = await applyFromGoogle(tx, c, s, e, g, marker, markers, locale);
    if (result.changed) changed++;
    push ||= result.push;
  }

  if (found.nextSyncToken !== c.syncToken) await tx.update(calendarConnection).set({ syncToken: found.nextSyncToken }).where(eq(calendarConnection.id, c.id));
  // Repeating events seen: read our calendar's occurrences again, read-only (import.ts).
  if (repeating) {
    const name = (await translator(locale, "googleCalendar"))("calendarName", { talent: who.name });
    await tx
      .insert(calendarImportSource)
      .values({ connectionId: c.id, externalCalendarId: c.externalCalendarId, name, own: true, lastImportedAt: null })
      .onConflictDoUpdate({ target: [calendarImportSource.connectionId, calendarImportSource.externalCalendarId], set: { own: true, lastImportedAt: null } });
  }
  return { changed, push };
}

/** One of ours changed in Google: merge it, and line up what's pushed next. Returns whether it changed here, and whether this copy needs a push. */
async function applyFromGoogle(
  tx: Tx,
  c: Connection,
  s: typeof calendarEventSync.$inferSelect,
  e: EventRow,
  g: GoogleEvent,
  marker: string,
  markers: string[],
  locale: string,
) {
  const [ics] = await feedEvents(c.talentId, locale, e.id, tx);
  if (!ics) return { changed: false, push: false }; // not one we push (unconfirmed): the push removes it there
  const keys = keysFor(e.kind);
  const ours = fieldsOfOurs(ics);
  // Pushed before two-way existed: what we'd push now, if nothing changed here since.
  const base = s.pushed ?? (e.updatedAt.getTime() <= s.syncedAt.getTime() ? ours : null);
  const theirs = fieldsOfTheirs(g, e.timeZone, markers);
  const apply = base && theirs ? mergeFields(keys, base, ours, theirs, Date.parse(g.updated ?? "") > e.updatedAt.getTime()) : {};
  // What stays ours (a route, a hotel, the lines above the notes, repeating) goes back over it.
  const expected = toGoogleEvent(ics, marker);
  const oursOnly =
    infoFrom(g.description, markers) !== infoFrom(expected.description, markers) ||
    (!keys.includes("location") && (g.location ?? "") !== (expected.location ?? "")) ||
    !!g.recurrence?.length;

  let syncedAt = s.syncedAt;
  let pushed = base ?? ours;
  if (Object.keys(apply).length) {
    const merged = { ...ours, ...apply };
    const [row] = await tx.update(calendarEvent).set(columnsOf(merged, e.kind)).where(eq(calendarEvent.id, e.id)).returning({ updatedAt: calendarEvent.updatedAt });
    await record(tx, c, "calendar_event.changed_in_google", e.id, { fields: diff(ours, apply) });
    pushed = merged;
    // This copy already matches unless ours had changes of its own; the others push from their syncs.
    if (base && !changedHere(keys, base, ours, apply)) syncedAt = row.updatedAt;
  }
  if (oursOnly || !base) syncedAt = new Date(0);
  await tx.update(calendarEventSync).set({ etag: g.etag ?? null, pushed, syncedAt }).where(eq(calendarEventSync.id, s.id));
  return { changed: Object.keys(apply).length > 0, push: syncedAt.getTime() === 0 };
}

/** An event added in Google to our calendar: an event here, without a project, with the likely one suggested. */
async function addFromGoogle(tx: Tx, c: Connection, g: GoogleEvent, zone: string, markers: string[], locale: string) {
  const theirs = fieldsOfTheirs(g, zone, markers);
  if (!theirs || !theirs.date || !theirs.timeZone) return false;
  const untitled = (await translator(toLocale(locale), "planner"))("untitled");
  const fields: SyncFields = {
    title: (theirs.title ?? untitled).slice(0, 200),
    date: theirs.date,
    time: theirs.time ?? null,
    timeZone: theirs.timeZone,
    end: theirs.end ?? null,
    location: theirs.location?.slice(0, 500) ?? null,
    // Its whole description is its notes: it has no notes line of ours.
    notes: (theirs.notes ?? g.description ?? "").trim().slice(0, 5000) || null,
  };
  const attendees = (g.attendees ?? []).map((a) => a.email ?? "").filter(Boolean); // read for the match only, never stored
  const suggested = suggestProject({ title: fields.title, attendees }, await suggestionTargets(tx, c.talentId));
  const [row] = await tx
    .insert(calendarEvent)
    .values({ talentId: c.talentId, kind: "meeting", ...columnsOf(fields, "meeting"), suggestedProjectId: suggested })
    .returning();
  await tx.insert(calendarEventSync).values({ connectionId: c.id, eventId: row.id, externalEventId: g.id, etag: g.etag ?? null, syncedAt: row.updatedAt, pushed: fieldsOfRow(row) });
  await record(tx, c, "calendar_event.added_in_google", row.id, {});
  return true;
}
