import "server-only";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { membership, talent } from "@/lib/db/schema";
import { auth } from "./config";

export { isGoogleEnabled } from "./config";

// The rest of the app reads identity only through these helpers, never
// through Better Auth directly (see Portability rules in docs/architecture.md).

export const getSession = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return {
    personId: session.user.id,
    email: session.user.email,
    displayName: session.user.name,
    locale: session.user.locale,
  };
});

/** The signed-in person, or a redirect to sign-in. */
export async function requirePerson() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}

/** The talent the signed-in person works on, or a redirect to onboarding. */
export const getCurrentTalent = cache(async (personId: string) => {
  const [row] = await db
    .select({ id: talent.id, name: talent.name, vertical: talent.vertical, role: membership.role })
    .from(membership)
    .innerJoin(talent, eq(talent.id, membership.talentId))
    .where(and(eq(membership.personId, personId), eq(membership.status, "active")))
    .limit(1);
  return row ?? null;
});

export async function requireTalent() {
  const person = await requirePerson();
  const current = await getCurrentTalent(person.personId);
  if (!current) redirect("/onboarding");
  return { person, talent: current };
}
