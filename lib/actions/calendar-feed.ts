"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { requireTalent } from "@/lib/auth";
import { feedUrl, hashFeedToken, newFeedToken } from "@/lib/calendar/feed";
import { db } from "@/lib/db";
import { membership } from "@/lib/db/schema";

/**
 * Create (or reset) the signed-in person's calendar subscription link. The URL
 * is returned once and never stored; resetting cuts off the old link.
 */
export async function createCalendarFeed(): Promise<{ url: string } | { error: string }> {
  const { person, talent } = await requireTalent();
  const token = newFeedToken();
  const rows = await db
    .update(membership)
    .set({ calendarFeedTokenHash: hashFeedToken(token) })
    .where(and(eq(membership.personId, person.personId), eq(membership.talentId, talent.id)))
    .returning({ id: membership.id });
  if (!rows.length) return { error: "找不到你的工作區成員資料。" };
  refresh();
  return { url: feedUrl(token) };
}

export async function disableCalendarFeed(): Promise<string | null> {
  const { person, talent } = await requireTalent();
  await db
    .update(membership)
    .set({ calendarFeedTokenHash: null })
    .where(and(eq(membership.personId, person.personId), eq(membership.talentId, talent.id)));
  refresh();
  return null;
}
