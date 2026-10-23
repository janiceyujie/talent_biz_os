import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { staff } from "@/lib/db/schema";
import { requirePerson } from ".";

/**
 * The signed-in person, if they're staff whose access holds (decision 0026); for
 * anyone else a 404, so the Support page doesn't show it exists. Every read in
 * lib/support calls it, not only the page: revoking takes effect on the next
 * read, and no reader can skip it. Not cached, for the same reason.
 */
export async function requireStaff() {
  const person = await requirePerson();
  const [row] = await db
    .select({ role: staff.role })
    .from(staff)
    .where(and(eq(staff.personId, person.personId), isNull(staff.revokedAt)))
    .limit(1);
  if (!row) notFound();
  return { personId: person.personId, role: row.role, locale: person.locale };
}
