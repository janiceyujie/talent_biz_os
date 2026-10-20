import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { project } from "@/lib/db/schema";
import { isOpenStage } from "@/lib/domain/phases";
import type { ErrorKey } from "./validation";

/**
 * Whether an item may link to a project (decision 0018). A new link needs a
 * project still going: not archived, declined, or cancelled, at any stage
 * before or after signing; only signed work counts in expected money and
 * reminders (countedPayments). An item keeping the link it already has is
 * left alone, so a stage change never locks its existing items.
 */
export async function checkProjectLink(
  talentId: string,
  projectId: string | null,
  currentLink: string | null = null,
): Promise<ErrorKey | null> {
  if (!projectId) return null;
  const [row] = await db
    .select({ stage: project.stage, archivedAt: project.archivedAt })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.talentId, talentId)));
  if (!row) return "projectNotFound";
  if (projectId === currentLink) return null;
  if (row.archivedAt) return "projectArchived";
  if (!isOpenStage(row.stage)) return "projectEnded";
  return null;
}
