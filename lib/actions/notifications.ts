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

/** Snooze one notification for an hour, or end its snooze. The deadline is the server's clock. */
export async function snoozeNotification(notificationId: string, snooze: boolean): Promise<string | null> {
  const person = await requirePerson();
  const fail = await errorText();
  if (!ids.safeParse([notificationId]).success) return fail("invalid");
  const snoozedUntil = snooze ? new Date(Date.now() + SNOOZE_MS) : null;
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
