"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { preference } from "@/lib/db/schema";
import { isPreferenceKey, preferences } from "@/lib/preferences";
import { errorText } from "./validation";

/** Save one of this person's settings in the current workspace. Only known keys, only values that fit. */
export async function savePreference(key: string, value: unknown): Promise<string | null> {
  const { person, talent } = await requireTalent();
  const fail = await errorText();
  if (!isPreferenceKey(key)) return fail("invalid");
  const parsed = preferences[key].save.safeParse(value);
  if (!parsed.success) return fail("invalid");
  await db
    .insert(preference)
    .values({ personId: person.personId, talentId: talent.id, key, value: parsed.data })
    .onConflictDoUpdate({ target: [preference.personId, preference.talentId, preference.key], set: { value: parsed.data, updatedAt: new Date() } });
  refresh();
  return null;
}

/** Forget a setting, so the defaults apply again (恢復預設). */
export async function resetPreference(key: string): Promise<string | null> {
  const { person, talent } = await requireTalent();
  const fail = await errorText();
  if (!isPreferenceKey(key)) return fail("invalid");
  await db
    .delete(preference)
    .where(and(eq(preference.personId, person.personId), eq(preference.talentId, talent.id), eq(preference.key, key)));
  refresh();
  return null;
}
