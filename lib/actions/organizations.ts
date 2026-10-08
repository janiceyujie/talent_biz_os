"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { contact, organization, project, projectOrganization } from "@/lib/db/schema";
import { errorText, firstIssue, optionalText } from "./validation";

// Organisations and their people (decision 0012). Renaming one keeps the
// partner text of the projects it's the client of in step.

const orgInput = z.object({
  id: z.union([z.uuid(), z.literal("")]).optional(),
  name: z.string().trim().min(1, "organizationNameRequired").max(200),
  notes: optionalText,
});

/** Create or rename an organisation. Returns its id, or an error. */
export async function saveOrganization(data: Record<string, unknown>): Promise<{ id: string } | { error: string }> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  const parsed = orgInput.safeParse(data);
  if (!parsed.success) return { error: fail(firstIssue(parsed.error)) };
  const { id, name, notes } = parsed.data;
  const result = await db.transaction(async (tx) => {
    if (!id) {
      const [created] = await tx.insert(organization).values({ talentId: talent.id, name, notes }).returning({ id: organization.id });
      return { id: created.id };
    }
    const rows = await tx
      .update(organization)
      .set({ name, notes })
      .where(and(eq(organization.id, id), eq(organization.talentId, talent.id)))
      .returning({ id: organization.id });
    if (!rows.length) return { error: fail("organizationNotFound") };
    // project.counterparty mirrors the client's name.
    const clientOf = await tx
      .select({ projectId: projectOrganization.projectId })
      .from(projectOrganization)
      .where(and(eq(projectOrganization.organizationId, id), eq(projectOrganization.talentId, talent.id), eq(projectOrganization.isPrimary, true)));
    for (const { projectId } of clientOf)
      await tx.update(project).set({ counterparty: name }).where(and(eq(project.id, projectId), eq(project.talentId, talent.id)));
    return { id };
  });
  if (!("error" in result)) refresh();
  return result;
}

/** Archive or restore an organisation. Its people and projects keep their links. */
export async function archiveOrganization(id: string, archived: boolean): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  if (!z.uuid().safeParse(id).success) return fail("invalid");
  const rows = await db
    .update(organization)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(organization.id, id), eq(organization.talentId, talent.id)))
    .returning({ id: organization.id });
  if (!rows.length) return fail("organizationNotFound");
  refresh();
  return null;
}

const personInput = z
  .object({
    organizationId: z.uuid(),
    contactId: z.union([z.uuid(), z.literal("")]).optional(),
    newContact: z
      .object({
        name: z.string().trim().min(1, "contactNameRequired").max(200),
        email: z.union([z.literal(""), z.email("emailInvalid")]).transform((v) => v || null),
        phone: optionalText,
      })
      .nullable()
      .optional(),
  })
  .refine((i) => i.contactId || i.newContact, { message: "personRequired" });

/** Someone works at an organisation: an existing contact moves there, or a new one is added there. */
export async function addOrganizationPerson(data: Record<string, unknown>): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  const parsed = personInput.safeParse(data);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const input = parsed.data;
  const failure = await db.transaction(async (tx) => {
    const [org] = await tx
      .select({ id: organization.id, name: organization.name })
      .from(organization)
      .where(and(eq(organization.id, input.organizationId), eq(organization.talentId, talent.id)));
    if (!org) return fail("organizationNotFound");
    if (input.contactId) {
      const rows = await tx
        .update(contact)
        .set({ organizationId: org.id })
        .where(and(eq(contact.id, input.contactId), eq(contact.talentId, talent.id)))
        .returning({ id: contact.id });
      if (!rows.length) return fail("contactNotFound");
    } else {
      await tx
        .insert(contact)
        .values({ ...input.newContact!, talentId: talent.id, role: "counterparty", company: org.name, organizationId: org.id });
    }
    return null;
  });
  if (!failure) refresh();
  return failure;
}

/** Someone no longer works at their organisation. The contact stays, and stays on its projects. */
export async function removeOrganizationPerson(contactId: string): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  if (!z.uuid().safeParse(contactId).success) return fail("invalid");
  const rows = await db
    .update(contact)
    .set({ organizationId: null })
    .where(and(eq(contact.id, contactId), eq(contact.talentId, talent.id)))
    .returning({ id: contact.id });
  if (!rows.length) return fail("contactNotFound");
  refresh();
  return null;
}
