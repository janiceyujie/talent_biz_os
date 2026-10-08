import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The talent's organisation with this name, matched ignoring case and surrounding spaces; created if there's none. */
export async function organizationNamed(tx: Tx, talentId: string, name: string) {
  const clean = name.trim();
  const [found] = await tx
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .where(and(eq(organization.talentId, talentId), sql`lower(btrim(${organization.name})) = lower(${clean})`))
    .limit(1);
  if (found) return found;
  const [created] = await tx.insert(organization).values({ talentId, name: clean }).returning({ id: organization.id, name: organization.name });
  return created;
}

/**
 * Make an organisation the project's client (decision 0012): put it on the
 * project if it isn't, make it the one primary, and mirror its name into
 * project.counterparty. The previous client stays on the project.
 */
export async function setClient(tx: Tx, talentId: string, projectId: string, organizationId: string) {
  const scope = and(eq(projectOrganization.projectId, projectId), eq(projectOrganization.talentId, talentId));
  // One primary at a time (a unique index holds it): clear the old one first.
  await tx.update(projectOrganization).set({ isPrimary: false }).where(and(scope, eq(projectOrganization.isPrimary, true)));
  const [onIt] = await tx.select({ id: projectOrganization.id }).from(projectOrganization).where(and(scope, eq(projectOrganization.organizationId, organizationId)));
  if (onIt) await tx.update(projectOrganization).set({ isPrimary: true }).where(eq(projectOrganization.id, onIt.id));
  else await tx.insert(projectOrganization).values({ talentId, projectId, organizationId, isPrimary: true });
  const [org] = await tx.select({ name: organization.name }).from(organization).where(eq(organization.id, organizationId));
  await tx.update(project).set({ counterparty: org.name }).where(and(eq(project.id, projectId), eq(project.talentId, talentId)));
}
