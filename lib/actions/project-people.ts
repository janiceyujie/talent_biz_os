"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { contact, project, projectContact } from "@/lib/db/schema";
import { errorText, firstIssue, optionalText } from "./validation";

// A project's people: its main contact (project.counterparty_id) and anyone
// else on it (project_contact), each with their role in free text. Every
// change touches the project's updatedAt, so its screen loads the new list.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const roleLabel = z
  .string()
  .trim()
  .max(60)
  .optional()
  .transform((v) => v || null);

const addInput = z
  .object({
    projectId: z.uuid(),
    contactId: z.union([z.uuid(), z.literal("")]).optional(),
    // Someone not in contacts yet: added as a contact first.
    newContact: z
      .object({
        name: z.string().trim().min(1, "contactNameRequired").max(200),
        company: optionalText,
        email: z.union([z.literal(""), z.email("emailInvalid")]).transform((v) => v || null),
        phone: optionalText,
      })
      .nullable()
      .optional(),
    label: roleLabel,
  })
  .refine((i) => i.contactId || i.newContact, { message: "personRequired" });

/** The project, if it's this talent's: its main contact and the ids of everyone else on it. */
async function projectPeople(tx: Tx, talentId: string, projectId: string) {
  const [row] = await tx
    .select({ main: project.counterpartyId })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.talentId, talentId)));
  if (!row) return null;
  const others = await tx
    .select({ contactId: projectContact.contactId })
    .from(projectContact)
    .where(and(eq(projectContact.projectId, projectId), eq(projectContact.talentId, talentId)));
  return { main: row.main, others: others.map((o) => o.contactId) };
}

const touch = (tx: Tx, talentId: string, projectId: string) =>
  tx
    .update(project)
    .set({ updatedAt: new Date() })
    .where(and(eq(project.id, projectId), eq(project.talentId, talentId)));

/** Put someone on a project: the first person becomes its main contact, anyone after that is listed with their role. */
export async function addProjectPerson(data: Record<string, unknown>): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  const parsed = addInput.safeParse(data);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const input = parsed.data;

  const failure = await db.transaction(async (tx) => {
    const people = await projectPeople(tx, talent.id, input.projectId);
    if (!people) return fail("projectNotFound");
    let contactId = input.contactId || null;
    if (contactId) {
      const [owned] = await tx
        .select({ id: contact.id })
        .from(contact)
        .where(and(eq(contact.id, contactId), eq(contact.talentId, talent.id)));
      if (!owned) return fail("contactNotFound");
      if (contactId === people.main || people.others.includes(contactId)) return fail("alreadyOnProject");
    } else {
      const [created] = await tx
        .insert(contact)
        .values({ ...input.newContact!, talentId: talent.id, role: "counterparty" })
        .returning({ id: contact.id });
      contactId = created.id;
    }
    if (!people.main) {
      await tx
        .update(project)
        .set({ counterpartyId: contactId, updatedAt: new Date() })
        .where(and(eq(project.id, input.projectId), eq(project.talentId, talent.id)));
    } else {
      await tx.insert(projectContact).values({ talentId: talent.id, projectId: input.projectId, contactId, label: input.label });
      await touch(tx, talent.id, input.projectId);
    }
    return null;
  });
  if (!failure) refresh();
  return failure;
}

/** Change someone's role on a project (anyone but the main contact, who is marked as such). */
export async function setProjectPersonLabel(projectId: string, contactId: string, label: string): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  const parsed = z.object({ projectId: z.uuid(), contactId: z.uuid(), label: roleLabel }).safeParse({ projectId, contactId, label });
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const failure = await db.transaction(async (tx) => {
    const rows = await tx
      .update(projectContact)
      .set({ label: parsed.data.label })
      .where(and(eq(projectContact.projectId, projectId), eq(projectContact.contactId, contactId), eq(projectContact.talentId, talent.id)))
      .returning({ id: projectContact.id });
    if (!rows.length) return fail("contactNotFound");
    await touch(tx, talent.id, projectId);
    return null;
  });
  if (!failure) refresh();
  return failure;
}

/** Take someone off a project. The contact stays in contacts; the main contact leaves the project without one. */
export async function removeProjectPerson(projectId: string, contactId: string): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  if (!z.uuid().safeParse(projectId).success || !z.uuid().safeParse(contactId).success) return fail("invalid");
  const failure = await db.transaction(async (tx) => {
    const people = await projectPeople(tx, talent.id, projectId);
    if (!people) return fail("projectNotFound");
    if (contactId === people.main) {
      await tx
        .update(project)
        .set({ counterpartyId: null, updatedAt: new Date() })
        .where(and(eq(project.id, projectId), eq(project.talentId, talent.id)));
      return null;
    }
    if (!people.others.includes(contactId)) return fail("contactNotFound");
    await tx
      .delete(projectContact)
      .where(and(eq(projectContact.projectId, projectId), eq(projectContact.contactId, contactId), eq(projectContact.talentId, talent.id)));
    await touch(tx, talent.id, projectId);
    return null;
  });
  if (!failure) refresh();
  return failure;
}

/** Make someone on the project its main contact; the previous main contact stays on it. */
export async function setMainContact(projectId: string, contactId: string): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  if (!z.uuid().safeParse(projectId).success || !z.uuid().safeParse(contactId).success) return fail("invalid");
  const failure = await db.transaction(async (tx) => {
    const people = await projectPeople(tx, talent.id, projectId);
    if (!people) return fail("projectNotFound");
    if (contactId === people.main) return null;
    if (!people.others.includes(contactId)) return fail("contactNotFound");
    await tx
      .delete(projectContact)
      .where(and(eq(projectContact.projectId, projectId), eq(projectContact.contactId, contactId), eq(projectContact.talentId, talent.id)));
    if (people.main) await tx.insert(projectContact).values({ talentId: talent.id, projectId, contactId: people.main });
    await tx
      .update(project)
      .set({ counterpartyId: contactId, updatedAt: new Date() })
      .where(and(eq(project.id, projectId), eq(project.talentId, talent.id)));
    return null;
  });
  if (!failure) refresh();
  return failure;
}
