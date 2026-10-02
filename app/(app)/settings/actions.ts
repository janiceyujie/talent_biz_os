"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
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
  if (current.role !== "owner") return { error: "只有負責人可以修改工作區設定。" };

  const name = String(formData.get("name") ?? "").trim();
  const timeZone = String(formData.get("timeZone") ?? "").trim();
  if (!name) return { error: "請輸入名稱。" };
  if (!isTimeZone(timeZone)) return { error: "時區無效，請使用 IANA 名稱，例如 Asia/Taipei。" };

  await db.update(talent).set({ name, timeZone }).where(eq(talent.id, current.id));
  refresh();
  return { saved: true };
}
