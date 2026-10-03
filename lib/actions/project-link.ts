import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { project } from "@/lib/db/schema";
import { isSigned } from "@/lib/domain/phases";
import type { ErrorKey } from "./validation";

/**
 * Whether an item may link to a project. A new link needs a live, signed
 * project; an item keeping the link it already has is left alone, so moving a
 * project back to negotiation doesn't lock its existing items.
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
  if (!isSigned(row.stage)) return "projectNotSigned";
  return null;
}
