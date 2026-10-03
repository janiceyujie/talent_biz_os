"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { errorText } from "@/lib/actions/validation";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { talent } from "@/lib/db/schema";

export type SettingsState = { error?: string; saved?: boolean };

const isTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

export async function updateWorkspace(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const { talent: current } = await requireTalent();
  const fail = await errorText();
  if (current.role !== "owner") return { error: fail("onlyOwner") };

  const name = String(formData.get("name") ?? "").trim();
  const timeZone = String(formData.get("timeZone") ?? "").trim();
  if (!name) return { error: fail("nameRequired") };
  if (!isTimeZone(timeZone)) return { error: fail("timeZoneInvalid") };

  await db.update(talent).set({ name, timeZone }).where(eq(talent.id, current.id));
  refresh();
  return { saved: true };
}
