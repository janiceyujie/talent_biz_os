"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { contact, organization, project, projectContact, projectOrganization } from "@/lib/db/schema";
import { setClient } from "@/lib/data/organizations";
import { errorText, firstIssue, optionalText } from "./validation";

// Who a project is with (decision 0012): its organisations (project_organization,
// one primary: the client), its main contact (project.counterparty_id), and
// anyone else on it (project_contact), each with a free-text role. Every change
// touches the project's updatedAt, so its screen loads the new list.

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
    // Added from an organisation's group: a new person works there, and so does an existing one without an organisation.
    organizationId: z.union([z.uuid(), z.literal("")]).optional(),
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

/** The project's client (primary organisation) by name, mirrored into project.counterparty. */
async function mirrorClient(tx: Tx, talentId: string, projectId: string) {
  const [client] = await tx
    .select({ name: organization.name })
    .from(projectOrganization)
    .innerJoin(organization, eq(organization.id, projectOrganization.organizationId))
    .where(and(eq(projectOrganization.projectId, projectId), eq(projectOrganization.talentId, talentId), eq(projectOrganization.isPrimary, true)));
  if (client) await tx.update(project).set({ counterparty: client.name }).where(and(eq(project.id, projectId), eq(project.talentId, talentId)));
}

/** Put an organisation on a project if it isn't yet; with no client yet, it becomes the client. */
async function bringOnto(tx: Tx, talentId: string, projectId: string, organizationId: string, role: string | null = null) {
  const onIt = await tx
    .select({ organizationId: projectOrganization.organizationId, primary: projectOrganization.isPrimary })
    .from(projectOrganization)
    .where(and(eq(projectOrganization.projectId, projectId), eq(projectOrganization.talentId, talentId)));
  if (onIt.some((o) => o.organizationId === organizationId)) return false;
  const primary = !onIt.some((o) => o.primary);
  await tx.insert(projectOrganization).values({ talentId, projectId, organizationId, role, isPrimary: primary });
  if (primary) await mirrorClient(tx, talentId, projectId);
  return true;
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
    const groupOrg = input.organizationId || null;
    if (groupOrg) {
      const [org] = await tx.select({ id: organization.id }).from(organization).where(and(eq(organization.id, groupOrg), eq(organization.talentId, talent.id)));
      if (!org) return fail("organizationNotFound");
    }
    let contactId = input.contactId || null;
    let worksAt = groupOrg;
    if (contactId) {
      const [owned] = await tx
        .select({ id: contact.id, organizationId: contact.organizationId })
        .from(contact)
        .where(and(eq(contact.id, contactId), eq(contact.talentId, talent.id)));
      if (!owned) return fail("contactNotFound");
      if (contactId === people.main || people.others.includes(contactId)) return fail("alreadyOnProject");
      // Someone without an organisation, added under one, now works there; anyone else keeps theirs.
      if (!owned.organizationId && groupOrg) await tx.update(contact).set({ organizationId: groupOrg }).where(eq(contact.id, contactId));
      else worksAt = owned.organizationId;
    } else {
      const [created] = await tx
        .insert(contact)
        .values({ ...input.newContact!, talentId: talent.id, role: "counterparty", organizationId: groupOrg })
        .returning({ id: contact.id });
      contactId = created.id;
    }
    // Their organisation comes onto the project with them.
    if (worksAt) await bringOnto(tx, talent.id, input.projectId, worksAt);
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

const orgInput = z
  .object({
    projectId: z.uuid(),
    organizationId: z.union([z.uuid(), z.literal("")]).optional(),
    newOrganization: z.object({ name: z.string().trim().min(1, "organizationNameRequired").max(200) }).nullable().optional(),
    role: roleLabel,
  })
  .refine((i) => i.organizationId || i.newOrganization, { message: "organizationRequired" });

/** Put an organisation on a project, existing or new; the first one becomes the client. */
export async function addProjectOrganization(data: Record<string, unknown>): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  const parsed = orgInput.safeParse(data);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const input = parsed.data;
  const failure = await db.transaction(async (tx) => {
    if (!(await projectPeople(tx, talent.id, input.projectId))) return fail("projectNotFound");
    let organizationId = input.organizationId || null;
    if (organizationId) {
      const [org] = await tx.select({ id: organization.id }).from(organization).where(and(eq(organization.id, organizationId), eq(organization.talentId, talent.id)));
      if (!org) return fail("organizationNotFound");
    } else {
      const [created] = await tx.insert(organization).values({ talentId: talent.id, name: input.newOrganization!.name }).returning({ id: organization.id });
      organizationId = created.id;
    }
    if (!(await bringOnto(tx, talent.id, input.projectId, organizationId, input.role))) return fail("alreadyOnProject");
    await touch(tx, talent.id, input.projectId);
    return null;
  });
  if (!failure) refresh();
  return failure;
}

/** An organisation's part in a project, in the person's words. */
export async function setProjectOrganizationRole(projectId: string, organizationId: string, role: string): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  const parsed = z.object({ projectId: z.uuid(), organizationId: z.uuid(), role: roleLabel }).safeParse({ projectId, organizationId, role });
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const failure = await db.transaction(async (tx) => {
    const rows = await tx
      .update(projectOrganization)
      .set({ role: parsed.data.role })
      .where(and(eq(projectOrganization.projectId, projectId), eq(projectOrganization.organizationId, organizationId), eq(projectOrganization.talentId, talent.id)))
      .returning({ id: projectOrganization.id });
    if (!rows.length) return fail("organizationNotFound");
    await touch(tx, talent.id, projectId);
    return null;
  });
  if (!failure) refresh();
  return failure;
}

/** Make an organisation on the project its client; the previous client stays on it. */
export async function setClientOrganization(projectId: string, organizationId: string): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  if (!z.uuid().safeParse(projectId).success || !z.uuid().safeParse(organizationId).success) return fail("invalid");
  const failure = await db.transaction(async (tx) => {
    const [onIt] = await tx
      .select({ id: projectOrganization.id })
      .from(projectOrganization)
      .where(and(eq(projectOrganization.projectId, projectId), eq(projectOrganization.talentId, talent.id), eq(projectOrganization.organizationId, organizationId)));
    if (!onIt) return fail("organizationNotFound");
    await setClient(tx, talent.id, projectId, organizationId);
    await touch(tx, talent.id, projectId);
    return null;
  });
  if (!failure) refresh();
  return failure;
}

/** Take an organisation off a project. Not the client: make another the client first. Its people stay on the project. */
export async function removeProjectOrganization(projectId: string, organizationId: string): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  if (!z.uuid().safeParse(projectId).success || !z.uuid().safeParse(organizationId).success) return fail("invalid");
  const failure = await db.transaction(async (tx) => {
    const scope = and(eq(projectOrganization.projectId, projectId), eq(projectOrganization.talentId, talent.id), eq(projectOrganization.organizationId, organizationId));
    const [onIt] = await tx.select({ primary: projectOrganization.isPrimary }).from(projectOrganization).where(scope);
    if (!onIt) return fail("organizationNotFound");
    if (onIt.primary) return fail("clientCantBeRemoved");
    await tx.delete(projectOrganization).where(scope);
    await touch(tx, talent.id, projectId);
    return null;
  });
  if (!failure) refresh();
  return failure;
}
