import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { staff } from "@/lib/db/schema";
import { requirePerson } from ".";
import { allows, type StaffRole } from "./staff-roles";

/**
 * The signed-in person, if they're staff whose access holds (decision 0026); for
 * anyone else a 404, so the Support page doesn't show it exists. Every read in
 * lib/support calls it, not only the page: revoking takes effect on the next
 * read, and no reader can skip it. Not cached, for the same reason.
 *
 * `support` reads. `admin` also changes things that are hard to take back, such
 * as who may sign up and the emails sent to them (decision 0028): pass "admin"
 * for those, and support staff get the same 404.
 */
export async function requireStaff(need: StaffRole = "support") {
  const person = await requirePerson();
  const [row] = await db
    .select({ role: staff.role })
    .from(staff)
    .where(and(eq(staff.personId, person.personId), isNull(staff.revokedAt)))
    .limit(1);
  if (!row || !allows(row.role, need)) notFound();
  return { personId: person.personId, role: row.role, locale: person.locale };
}
