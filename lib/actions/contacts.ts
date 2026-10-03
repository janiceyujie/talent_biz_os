"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { contact, project } from "@/lib/db/schema";
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
});

/** Create or update a contact. Renaming one updates the name shown on its linked projects. */
export async function saveContact(data: Record<string, unknown>): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  const parsed = contactInput.safeParse(data);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { id, ...values } = parsed.data;

  const failure = await db.transaction(async (tx) => {
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
    await tx
      .update(project)
      .set({ counterparty: values.name })
      .where(and(eq(project.counterpartyId, id), eq(project.talentId, talent.id)));
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
