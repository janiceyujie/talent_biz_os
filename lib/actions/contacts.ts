"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { organizationNamed } from "@/lib/data/organizations";
import { contact, organization } from "@/lib/db/schema";
import { contactRoles } from "@/lib/types";
import { errorText, firstIssue, optionalId, optionalText } from "./validation";

const contactInput = z.object({
  id: optionalId,
  name: z.string().trim().min(1, "contactNameRequired").max(200),
  role: z.enum(contactRoles, "roleRequired"),
  company: optionalText,
  email: z
    .union([z.email("emailInvalid"), z.literal("")])
    .optional()
    .transform((v) => v || null),
  phone: optionalText,
  notes: optionalText,
  // Where they work (decision 0012): an organisation picked, or a name typed for a new one; both "" to clear.
  // Left out entirely (e.g. editing name and phone from a project), the organisation doesn't change.
  organizationId: z.union([z.uuid(), z.literal("")]).optional(),
  organizationName: z.string().trim().max(200).optional(),
});

/** Create or update a contact, and where they work. A project's partner text follows its client organisation, not its contacts. */
export async function saveContact(data: Record<string, unknown>): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  const parsed = contactInput.safeParse(data);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { id, organizationId, organizationName, ...fields } = parsed.data;

  const failure = await db.transaction(async (tx) => {
    // undefined: leave the organisation as it is; null: no organisation.
    let works: { id: string; name: string } | null | undefined;
    if (organizationId) {
      const [org] = await tx
        .select({ id: organization.id, name: organization.name })
        .from(organization)
        .where(and(eq(organization.id, organizationId), eq(organization.talentId, talent.id)));
      if (!org) return fail("organizationNotFound");
      works = org;
    } else if (organizationName !== undefined) works = organizationName ? await organizationNamed(tx, talent.id, organizationName) : null;
    const values = {
      ...fields,
      ...(works !== undefined && { organizationId: works?.id ?? null, company: works?.name ?? null }),
    };
    if (!id) {
      await tx.insert(contact).values({ ...values, talentId: talent.id });
      return null;
    }
    const rows = await tx
      .update(contact)
      .set(values)
      .where(and(eq(contact.id, id), eq(contact.talentId, talent.id)))
      .returning({ id: contact.id });
    if (!rows.length) return fail("contactNotFound");
    return null;
  });
  if (!failure) refresh();
  return failure;
}

export async function archiveContact(id: string, archived: boolean): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  if (!z.uuid().safeParse(id).success) return fail("invalid");
  const rows = await db
    .update(contact)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(contact.id, id), eq(contact.talentId, talent.id)))
    .returning({ id: contact.id });
  if (!rows.length) return fail("contactNotFound");
  refresh();
  return null;
}
