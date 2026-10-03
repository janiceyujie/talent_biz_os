"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { person } from "@/lib/db/schema";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";

/** Switch the UI language: saved on the person when signed in, and in a cookie for signed-out pages. */
export async function setLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const session = await getSession();
  if (session) await db.update(person).set({ locale }).where(eq(person.id, session.personId));
  refresh();
}
