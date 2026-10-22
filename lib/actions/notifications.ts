"use server";

import { and, eq, lt, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { requirePerson } from "@/lib/auth";
import { db } from "@/lib/db";
import { notificationState } from "@/lib/db/schema";
import { notificationIdPattern, SNOOZE_HOURS } from "@/lib/domain/notifications";
import { errorText } from "./validation";

const SNOOZE_MAX_MS = 30 * 86_400_000; // a time picked: up to 30 days ahead
// Hours from now, a time picked (an instant), or false to end the snooze.
const snoozeInput = z.union([z.literal(false), z.literal([...SNOOZE_HOURS]), z.iso.datetime({ offset: true })]);
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

/**
 * Snooze one notification for some hours or until a time picked, or end its snooze. Hours count
 * from the server's clock; a time picked must be ahead, and within 30 days.
 */
export async function snoozeNotification(notificationId: string, snooze: false | (typeof SNOOZE_HOURS)[number] | string): Promise<string | null> {
  const person = await requirePerson();
  const fail = await errorText();
  const parsed = snoozeInput.safeParse(snooze);
  if (!ids.safeParse([notificationId]).success || !parsed.success) return fail("invalid");
  const now = Date.now();
  const snoozedUntil = parsed.data === false ? null : new Date(typeof parsed.data === "number" ? now + parsed.data * 3600_000 : parsed.data);
  if (snoozedUntil && (snoozedUntil.getTime() <= now || snoozedUntil.getTime() > now + SNOOZE_MAX_MS)) return fail("snoozeTime");
  await db
    .insert(notificationState)
    .values({ personId: person.personId, notificationId, snoozedUntil })
    .onConflictDoUpdate({
      target: [notificationState.personId, notificationState.notificationId],
      set: { snoozedUntil },
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
