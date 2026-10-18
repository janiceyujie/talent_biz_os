"use server";

import { and, eq, lt, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { requirePerson } from "@/lib/auth";
import { db } from "@/lib/db";
import { notificationState } from "@/lib/db/schema";
import { notificationIdPattern } from "@/lib/domain/notifications";
import { errorText } from "./validation";

const SNOOZE_MS = 3600_000; // "remind me in an hour"
const ids = z.array(z.string().max(120).regex(notificationIdPattern)).min(1).max(200);

/** Mark notifications read. Reading one also ends its snooze. */
export async function markNotificationsRead(notificationIds: string[]): Promise<string | null> {
  const person = await requirePerson();
  const fail = await errorText();
  const parsed = ids.safeParse(notificationIds);
  if (!parsed.success) return fail("invalid");
  const now = new Date();
  await db
    .insert(notificationState)
    .values(parsed.data.map((notificationId) => ({ personId: person.personId, notificationId, readAt: now })))
    .onConflictDoUpdate({
      target: [notificationState.personId, notificationState.notificationId],
      set: { readAt: now, snoozedUntil: null },
    });
  await prune(person.personId);
  refresh();
  return null;
}

/** Snooze by duration or absolute time, or end its snooze. Durations use the server clock. */
export async function snoozeNotification(notificationId: string, snooze: boolean | string | number): Promise<string | null> {
  const person = await requirePerson();
  const fail = await errorText();
  if (!ids.safeParse([notificationId]).success) return fail("invalid");
  const instant = typeof snooze === "string" ? Date.parse(snooze) : typeof snooze === "number" ? Date.now() + snooze * 60_000 : snooze ? Date.now() + SNOOZE_MS : null;
  if (instant !== null && (!Number.isFinite(instant) || instant <= Date.now() || instant > Date.now() + 30 * 86400_000)) return fail("invalid");
  const snoozedUntil = instant === null ? null : new Date(instant);
  await db
    .insert(notificationState)
    .values({ personId: person.personId, notificationId, snoozedUntil, readAt: null })
    .onConflictDoUpdate({
      target: [notificationState.personId, notificationState.notificationId],
      set: { snoozedUntil, readAt: null },
    });
  refresh();
  return null;
}

// Ids carry their due date, so marks on long-past notifications are dead weight.
async function prune(personId: string) {
  await db
    .delete(notificationState)
    .where(
      and(
        eq(notificationState.personId, personId),
        lt(sql`coalesce(${notificationState.snoozedUntil}, ${notificationState.readAt})`, sql`now() - interval '90 days'`),
      ),
    );
}
