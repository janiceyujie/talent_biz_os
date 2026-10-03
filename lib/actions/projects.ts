"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog, contact, project } from "@/lib/db/schema";
import { projectTypeKeys } from "@/lib/project-types";
import { stages, type Stage } from "@/lib/types";
import { errorText, firstIssue, optionalId, optionalText } from "./validation";

const projectInput = z
  .object({
    id: optionalId,
    title: z.string().trim().min(1, "projectTitleRequired").max(200),
    counterparty: z.string().trim().max(200).default(""),
    counterpartyId: optionalId,
    type: z.enum(projectTypeKeys, "typeRequired"),
    stage: z.enum(stages),
    quotedAmount: z.coerce.number().min(0, "amountNegative").max(9_999_999_999.99).multipleOf(0.01, "amountDecimals"),
    taxRate: z.coerce.number().min(0).max(100, "taxRateRange").multipleOf(0.01),
    taxIncluded: z.boolean(),
    deliverables: optionalText,
    rights: optionalText,
    travel: optionalText,
    contractNotes: optionalText,
    notes: optionalText,
  })
  .refine((p) => p.counterpartyId || p.counterparty, { message: "counterpartyRequired" });

/** Create or update a project. Returns an error message, or null on success. */
export async function saveProject(data: Record<string, unknown>): Promise<string | null> {
  const { person, talent } = await requireTalent();
  const fail = await errorText();
  const parsed = projectInput.safeParse(data);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const input = parsed.data;

  let counterparty = input.counterparty;
  if (input.counterpartyId) {
    const [linked] = await db
      .select({ name: contact.name })
      .from(contact)
      .where(and(eq(contact.id, input.counterpartyId), eq(contact.talentId, talent.id)));
    if (!linked) return fail("counterpartyNotFound");
    counterparty = linked.name;
  }

  const values = {
    title: input.title,
    counterparty,
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
    if (!input.id) {
      const [created] = await tx
        .insert(project)
        .values({ ...values, talentId: talent.id })
        .returning({ id: project.id });
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
      .select({ stage: project.stage })
      .from(project)
      .where(and(eq(project.id, input.id), eq(project.talentId, talent.id)));
    if (!existing) return fail("projectNotFound");
    await tx.update(project).set(values).where(and(eq(project.id, input.id), eq(project.talentId, talent.id)));
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
