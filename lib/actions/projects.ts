"use server";

import { and, eq, isNull } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog, contact, organization, project } from "@/lib/db/schema";
import { organizationNamed, setClient } from "@/lib/data/organizations";
import { projectTypeKeys } from "@/lib/project-types";
import { stages, type Stage } from "@/lib/types";
import { errorText, firstIssue, optionalId, optionalText } from "./validation";

const projectInput = z
  .object({
    id: optionalId,
    title: z.string().trim().min(1, "projectTitleRequired").max(200),
    counterparty: z.string().trim().max(200).default(""),
    // The client (decision 0012): an organisation picked, or a name typed for a new one.
    organizationId: optionalId,
    organizationName: z.string().trim().max(200).default(""),
    counterpartyId: optionalId,
    // A partner not yet in contacts, added as one with the project (when nothing is linked).
    newContact: z
      .object({
        name: z.string().trim().min(1, "contactNameRequired").max(200),
        company: optionalText,
        email: z.union([z.literal(""), z.email("emailInvalid")]).transform((v) => v || null),
        phone: optionalText,
      })
      .nullable()
      .optional(),
    type: z.enum(projectTypeKeys, "typeRequired"),
    stage: z.enum(stages),
    // Blank is "quote not set" (not decided), stored as null; 0 is an explicit free project.
    // "" must be tried first: z.coerce.number() would turn "" into 0.
    quotedAmount: z
      .union([
        z.literal(""),
        z.null(),
        z.coerce.number().min(0, "amountNegative").max(9_999_999_999.99).multipleOf(0.01, "amountDecimals"),
      ])
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : v)),
    taxRate: z.coerce.number().min(0).max(100, "taxRateRange").multipleOf(0.01),
    taxIncluded: z.boolean(),
    deliverables: optionalText,
    rights: optionalText,
    travel: optionalText,
    contractNotes: optionalText,
    notes: optionalText,
  })
  .refine((p) => p.organizationId || p.organizationName || p.counterparty, { message: "clientRequired" });

/** Create or update a project. Returns an error message, or null on success. */
export async function saveProject(data: Record<string, unknown>): Promise<string | null> {
  const { person, talent } = await requireTalent();
  const fail = await errorText();
  const parsed = projectInput.safeParse(data);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const input = parsed.data;

  // The main contact, if one is picked, must be this talent's.
  if (input.counterpartyId) {
    const [linked] = await db
      .select({ id: contact.id })
      .from(contact)
      .where(and(eq(contact.id, input.counterpartyId), eq(contact.talentId, talent.id)));
    if (!linked) return fail("counterpartyNotFound");
  }

  const values = {
    title: input.title,
    counterparty: input.organizationName || input.counterparty, // replaced by the client's own name below
    counterpartyId: input.counterpartyId,
    type: input.type,
    stage: input.stage,
    quotedAmount: input.quotedAmount,
    taxRate: input.taxRate,
    taxIncluded: input.taxIncluded,
    details: {
      deliverables: input.deliverables ?? undefined,
      rights: input.rights ?? undefined,
      travel: input.travel ?? undefined,
      contractNotes: input.contractNotes ?? undefined,
    },
    notes: input.notes,
  };

  const failure = await db.transaction(async (tx) => {
    // The client: the organisation picked, else the one with the typed name (made if there's none).
    let client: { id: string; name: string };
    if (input.organizationId) {
      const [org] = await tx
        .select({ id: organization.id, name: organization.name })
        .from(organization)
        .where(and(eq(organization.id, input.organizationId), eq(organization.talentId, talent.id)));
      if (!org) return fail("organizationNotFound");
      client = org;
    } else client = await organizationNamed(tx, talent.id, input.organizationName || input.counterparty);
    values.counterparty = client.name;

    // The main contact works at the client: a new one is made there, an existing one without an organisation moves there.
    if (!input.counterpartyId && input.newContact) {
      const [created] = await tx
        .insert(contact)
        .values({ ...input.newContact, talentId: talent.id, role: "counterparty", organizationId: client.id })
        .returning({ id: contact.id });
      values.counterpartyId = created.id;
    } else if (input.counterpartyId)
      await tx
        .update(contact)
        .set({ organizationId: client.id })
        .where(and(eq(contact.id, input.counterpartyId), eq(contact.talentId, talent.id), isNull(contact.organizationId)));

    if (!input.id) {
      const [created] = await tx
        .insert(project)
        .values({ ...values, talentId: talent.id })
        .returning({ id: project.id });
      await setClient(tx, talent.id, created.id, client.id);
      await tx.insert(auditLog).values({
        talentId: talent.id,
        actorPersonId: person.personId,
        action: "project.created",
        targetType: "project",
        targetId: created.id,
      });
      return null;
    }
    const [existing] = await tx
      .select({ stage: project.stage, details: project.details })
      .from(project)
      .where(and(eq(project.id, input.id), eq(project.talentId, talent.id)));
    if (!existing) return fail("projectNotFound");
    // The form edits only some details; keep the rest (deal fields, dates, to-confirm list from messages).
    const details = { ...existing.details, ...values.details };
    await tx.update(project).set({ ...values, details }).where(and(eq(project.id, input.id), eq(project.talentId, talent.id)));
    await setClient(tx, talent.id, input.id, client.id);
    if (existing.stage !== input.stage)
      await logStageChange(tx, talent.id, person.personId, input.id, existing.stage, input.stage);
    return null;
  });
  if (!failure) refresh();
  return failure;
}

export async function setProjectStage(id: string, stage: Stage): Promise<string | null> {
  const { person, talent } = await requireTalent();
  const fail = await errorText();
  if (!z.uuid().safeParse(id).success || !stages.includes(stage)) return fail("invalid");
  const failure = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ stage: project.stage })
      .from(project)
      .where(and(eq(project.id, id), eq(project.talentId, talent.id)));
    if (!existing) return fail("projectNotFound");
    if (existing.stage === stage) return null;
    await tx.update(project).set({ stage }).where(and(eq(project.id, id), eq(project.talentId, talent.id)));
    await logStageChange(tx, talent.id, person.personId, id, existing.stage, stage);
    return null;
  });
  if (!failure) refresh();
  return failure;
}

export async function archiveProject(id: string, archived: boolean): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  if (!z.uuid().safeParse(id).success) return fail("invalid");
  const rows = await db
    .update(project)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(project.id, id), eq(project.talentId, talent.id)))
    .returning({ id: project.id });
  if (!rows.length) return fail("projectNotFound");
  refresh();
  return null;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function logStageChange(tx: Tx, talentId: string, actor: string, projectId: string, from: string, to: string) {
  await tx.insert(auditLog).values({
    talentId,
    actorPersonId: actor,
    action: "project.stage_changed",
    targetType: "project",
    targetId: projectId,
    details: { from, to },
  });
}
