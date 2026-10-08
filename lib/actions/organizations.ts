"use server";

import { and, eq, inArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { contact, organization, organizationDistinct, project, projectOrganization } from "@/lib/db/schema";
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

/** Both organisations, if they're this talent's: smaller id first, as the distinct pairs are stored. */
async function ownedPair(talentId: string, x: string, y: string) {
  if (!z.uuid().safeParse(x).success || !z.uuid().safeParse(y).success || x === y) return null;
  const rows = await db
    .select({ id: organization.id })
    .from(organization)
    .where(and(eq(organization.talentId, talentId), inArray(organization.id, [x, y])));
  return rows.length === 2 ? (x < y ? [x, y] : [y, x]) : null;
}

/** Two organisations are different: they won't be suggested as duplicates again. */
export async function markOrganizationsDistinct(x: string, y: string): Promise<string | null> {
  const { person, talent } = await requireTalent();
  const fail = await errorText();
  const pair = await ownedPair(talent.id, x, y);
  if (!pair) return fail("organizationNotFound");
  await db
    .insert(organizationDistinct)
    .values({ talentId: talent.id, organizationAId: pair[0], organizationBId: pair[1], decidedBy: person.personId })
    .onConflictDoNothing();
  refresh();
  return null;
}

/** Undo "not the same": the pair may be suggested again. */
export async function unmarkOrganizationsDistinct(x: string, y: string): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  const pair = await ownedPair(talent.id, x, y);
  if (!pair) return fail("organizationNotFound");
  await db
    .delete(organizationDistinct)
    .where(
      and(eq(organizationDistinct.talentId, talent.id), eq(organizationDistinct.organizationAId, pair[0]), eq(organizationDistinct.organizationBId, pair[1])),
    );
  refresh();
  return null;
}

/**
 * Merge one organisation into another (decision 0012): its people and its
 * places on projects move to the one kept, which takes `name` if given. Where
 * a project had both, one row stays, the client if either was. The partner
 * text of projects the kept one is client of follows its name; the other is
 * deleted (and with it any "not the same" marks it had).
 */
export async function mergeOrganizations(keepId: string, removeId: string, name: string): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  const pair = await ownedPair(talent.id, keepId, removeId);
  const kept = z.string().trim().min(1, "organizationNameRequired").max(200).safeParse(name);
  if (!pair) return fail("organizationNotFound");
  if (!kept.success) return fail(firstIssue(kept.error));
  await db.transaction(async (tx) => {
    const [removed] = await tx.select({ notes: organization.notes }).from(organization).where(eq(organization.id, removeId));
    const [keep] = await tx.select({ notes: organization.notes }).from(organization).where(eq(organization.id, keepId));
    // Its people work at the kept one now.
    await tx.update(contact).set({ organizationId: keepId, company: kept.data }).where(and(eq(contact.talentId, talent.id), eq(contact.organizationId, removeId)));
    // Its places on projects: moved, or folded into the kept one's where a project had both.
    const links = await tx
      .select({ id: projectOrganization.id, projectId: projectOrganization.projectId, primary: projectOrganization.isPrimary, role: projectOrganization.role })
      .from(projectOrganization)
      .where(and(eq(projectOrganization.talentId, talent.id), eq(projectOrganization.organizationId, removeId)));
    for (const link of links) {
      const [both] = await tx
        .select({ id: projectOrganization.id, role: projectOrganization.role })
        .from(projectOrganization)
        .where(and(eq(projectOrganization.projectId, link.projectId), eq(projectOrganization.organizationId, keepId)));
      if (!both) {
        await tx.update(projectOrganization).set({ organizationId: keepId }).where(eq(projectOrganization.id, link.id));
        continue;
      }
      await tx.delete(projectOrganization).where(eq(projectOrganization.id, link.id));
      await tx
        .update(projectOrganization)
        .set({ ...(link.primary && { isPrimary: true }), ...(!both.role && link.role && { role: link.role }) })
        .where(eq(projectOrganization.id, both.id));
    }
    await tx
      .update(organization)
      .set({ name: kept.data, notes: [keep?.notes, removed?.notes].filter(Boolean).join("\n\n") || null })
      .where(eq(organization.id, keepId));
    // The partner text of the projects it's the client of.
    const clientOf = await tx
      .select({ projectId: projectOrganization.projectId })
      .from(projectOrganization)
      .where(and(eq(projectOrganization.organizationId, keepId), eq(projectOrganization.isPrimary, true)));
    if (clientOf.length)
      await tx
        .update(project)
        .set({ counterparty: kept.data })
        .where(and(eq(project.talentId, talent.id), inArray(project.id, clientOf.map((c) => c.projectId))));
    await tx.delete(organization).where(and(eq(organization.id, removeId), eq(organization.talentId, talent.id)));
  });
  refresh();
  return null;
}
