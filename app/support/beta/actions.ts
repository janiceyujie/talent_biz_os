"use server";

import { revalidatePath } from "next/cache";
import { isLocale } from "@/lib/i18n/config";
import { addBatch, previewBatch, previewInvitations, sendInvitations, withdrawPlace } from "@/lib/support/beta-list";

// The beta list's changes (decision 0028). Each one checks the admin role itself,
// in lib/support/beta-list.ts: these only pass the form along.

export async function checkBatch(pasted: string) {
  return previewBatch(pasted);
}

export async function addPeople(input: { pasted: string; note: string; locale: string }) {
  const done = await addBatch({ pasted: input.pasted, note: input.note, locale: isLocale(input.locale) ? input.locale : "zh-TW" });
  revalidatePath("/support/beta");
  return done;
}

export async function checkInvitations(ids: string[]) {
  return previewInvitations(ids);
}

export async function invite(ids: string[]) {
  const done = await sendInvitations(ids);
  revalidatePath("/support/beta");
  return done;
}

export async function withdraw(id: string) {
  const done = await withdrawPlace(id);
  revalidatePath("/support/beta");
  return done;
}
