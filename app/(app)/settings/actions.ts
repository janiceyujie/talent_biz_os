"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { errorText } from "@/lib/actions/validation";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { talent } from "@/lib/db/schema";
import { canonicalZone } from "@/lib/time-zones";

export type SettingsState = { error?: string; saved?: boolean };


export async function updateWorkspace(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const { talent: current } = await requireTalent();
  const fail = await errorText();
  if (current.role !== "owner") return { error: fail("onlyOwner") };

  const name = String(formData.get("name") ?? "").trim();
  const timeZone = canonicalZone(String(formData.get("timeZone") ?? ""));
  if (!name) return { error: fail("nameRequired") };
  if (!timeZone) return { error: fail("timeZoneInvalid") };

  await db.update(talent).set({ name, timeZone }).where(eq(talent.id, current.id));
  refresh();
  return { saved: true };
}
