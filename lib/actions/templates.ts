"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { replyTemplate } from "@/lib/db/schema";
import { locales } from "@/lib/i18n/config";
import { projectTypeKeys } from "@/lib/project-types";
import { toStored } from "@/lib/templates/placeholders";
import { errorText, firstIssue, optionalId, optionalText } from "./validation";

const templateInput = z.object({
  id: optionalId,
  projectType: z.enum(projectTypeKeys, "typeRequired"),
  kind: z.enum(["template", "past_reply"]),
  language: z.enum(locales, "languageRequired"),
  title: z.string().trim().min(1, "templateTitleRequired").max(200),
  body: z.string().trim().min(1, "templateBodyRequired").max(10000),
  tone: optionalText,
});

/** Create or update a reply template; placeholders are stored as neutral keys, whatever language they were typed in. */
export async function saveTemplate(data: Record<string, unknown>): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  const parsed = templateInput.safeParse(data);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { id, ...input } = parsed.data;
  const values = { ...input, body: toStored(input.body) };

  if (!id) {
    await db.insert(replyTemplate).values({ ...values, talentId: talent.id });
  } else {
    const rows = await db
      .update(replyTemplate)
      .set(values)
      .where(and(eq(replyTemplate.id, id), eq(replyTemplate.talentId, talent.id)))
      .returning({ id: replyTemplate.id });
    if (!rows.length) return fail("templateNotFound");
  }
  refresh();
  return null;
}

export async function archiveTemplate(id: string, archived: boolean): Promise<string | null> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  if (!z.uuid().safeParse(id).success) return fail("invalid");
  const rows = await db
    .update(replyTemplate)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(replyTemplate.id, id), eq(replyTemplate.talentId, talent.id)))
    .returning({ id: replyTemplate.id });
  if (!rows.length) return fail("templateNotFound");
  refresh();
  return null;
}
