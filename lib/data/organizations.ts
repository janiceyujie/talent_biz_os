import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organization, project, projectOrganization } from "@/lib/db/schema";
import type { Stage } from "@/lib/types";

export type OrganizationProject = { projectId: string; title: string; stage: Stage; archived: boolean; role: string; primary: boolean };

/**
 * The projects one organisation is on (decision 0012), newest first, with its
 * role on each and whether it's the client. Null when the organisation isn't
 * this talent's.
 */
export async function getOrganizationProjects(talentId: string, organizationId: string): Promise<OrganizationProject[] | null> {
  const [owned] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(and(eq(organization.id, organizationId), eq(organization.talentId, talentId)));
  if (!owned) return null;
  const rows = await db
    .select({
      projectId: project.id,
      title: project.title,
      stage: project.stage,
      archivedAt: project.archivedAt,
      role: projectOrganization.role,
      primary: projectOrganization.isPrimary,
    })
    .from(projectOrganization)
    .innerJoin(project, eq(project.id, projectOrganization.projectId))
    .where(and(eq(projectOrganization.organizationId, organizationId), eq(projectOrganization.talentId, talentId), eq(project.talentId, talentId)))
    .orderBy(desc(project.updatedAt));
  return rows.map((r) => ({ projectId: r.projectId, title: r.title, stage: r.stage, archived: r.archivedAt !== null, role: r.role ?? "", primary: r.primary }));
}
