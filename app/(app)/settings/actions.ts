"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { errorText } from "@/lib/actions/validation";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { talent } from "@/lib/db/schema";
import { canonicalZone } from "@/lib/time-zones";

/** Save one workspace setting as it changes (the settings page saves each field on its own). Owners only. */
export async function updateWorkspace(change: { name: string } | { timeZone: string }): Promise<string | null> {
  const { talent: current } = await requireTalent();
  const fail = await errorText();
  if (current.role !== "owner") return fail("onlyOwner");

  if ("name" in change) {
    const name = change.name.trim();
    if (!name) return fail("nameRequired");
    await db.update(talent).set({ name }).where(eq(talent.id, current.id));
  } else {
    const timeZone = canonicalZone(change.timeZone);
    if (!timeZone) return fail("timeZoneInvalid");
    await db.update(talent).set({ timeZone }).where(eq(talent.id, current.id));
  }
  refresh();
  return null;
}
