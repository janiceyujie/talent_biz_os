"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { requirePerson } from "@/lib/auth";
import { claimRequest } from "@/lib/addon/link";
import { db } from "@/lib/db";
import { gmailAddonLink } from "@/lib/db/schema";
import { errorText } from "./validation";

/** Our site's half of linking a Gmail account (docs/design/gmail-addon.md): the card confirms the rest. */
export async function confirmAddonLink(token: string): Promise<string | null> {
  const person = await requirePerson();
  const fail = await errorText();
  if (!z.string().min(20).max(200).safeParse(token).success) return fail("invalid");
  if (!(await claimRequest(token, person.personId))) return fail("addonLinkExpired");
  refresh();
  return null;
}

/** Settings: this person's Gmail account no longer sends to them. */
export async function unlinkGmailAddon(linkId: string): Promise<string | null> {
  const person = await requirePerson();
  const fail = await errorText();
  if (!z.uuid().safeParse(linkId).success) return fail("invalid");
  await db.delete(gmailAddonLink).where(and(eq(gmailAddonLink.id, linkId), eq(gmailAddonLink.personId, person.personId)));
  refresh();
  return null;
}
