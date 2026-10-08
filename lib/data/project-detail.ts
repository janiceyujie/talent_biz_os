import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { upgradeAnalysis } from "@/lib/ai/analysis";
import { db } from "@/lib/db";
import { auditLog, message, messageAnalysis, project, projectContact } from "@/lib/db/schema";
import type { ChangeRecord } from "@/lib/domain/intake";
import type { ProjectDetail, Stage } from "@/lib/types";

type AppliedDetails = { created?: boolean; applied?: unknown[]; left?: unknown[]; stage?: { from: Stage; to: Stage } | null };
/** Entries written before items were recorded in full stored only ids; those show as a filed message. */
const records = (items: unknown[] | undefined) =>
  (items ?? []).filter((i): i is ChangeRecord => typeof i === "object" && i !== null && "kind" in i);

/**
 * What only one project's own screen shows, loaded when it's opened rather
 * than with every page: its details and notes, the people on it, its offer text (the earliest message filed under it) and
 * its timeline (every confirmed message on it, however old, with what
 * applying each one changed). Null when the project isn't this talent's.
 */
export async function getProjectDetail(talentId: string, projectId: string): Promise<ProjectDetail | null> {
  const [owned] = await db
    .select({ details: project.details, notes: project.notes })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.talentId, talentId)));
  if (!owned) return null;

  const people = await db
    .select({ contactId: projectContact.contactId, label: projectContact.label })
    .from(projectContact)
    .where(and(eq(projectContact.projectId, projectId), eq(projectContact.talentId, talentId)))
    .orderBy(asc(projectContact.createdAt));

  const messages = await db
    .select({ id: message.id, receivedAt: message.receivedAt, bodyText: message.bodyText, status: message.status })
    .from(message)
    .where(and(eq(message.talentId, talentId), eq(message.projectId, projectId)))
    .orderBy(asc(message.receivedAt));
  const confirmed = messages.filter((m) => m.status === "confirmed").reverse(); // newest first
  const ids = confirmed.map((m) => m.id);

  const [analyses, appliedRows] = ids.length
    ? await Promise.all([
        db
          .select({ messageId: messageAnalysis.messageId, analysis: messageAnalysis.analysis })
          .from(messageAnalysis)
          .where(inArray(messageAnalysis.messageId, ids))
          .orderBy(desc(messageAnalysis.createdAt)),
        db
          .select({ targetId: auditLog.targetId, details: auditLog.details })
          .from(auditLog)
          .where(and(eq(auditLog.talentId, talentId), eq(auditLog.action, "message.applied"), eq(auditLog.targetType, "message"), inArray(auditLog.targetId, ids)))
          .orderBy(desc(auditLog.createdAt)),
      ])
    : [[], []];
  // Analyses are versioned and an applied message may be re-applied: the newest of each wins.
  const latestAnalysis = new Map<string, (typeof analyses)[number]>();
  for (const a of analyses) if (!latestAnalysis.has(a.messageId)) latestAnalysis.set(a.messageId, a);
  const appliedByMessage = new Map<string, AppliedDetails>();
  for (const r of appliedRows) if (!appliedByMessage.has(r.targetId)) appliedByMessage.set(r.targetId, r.details as AppliedDetails);

  return {
    projectId,
    details: owned.details,
    notes: owned.notes ?? "",
    people: people.map((p) => ({ contactId: p.contactId, label: p.label ?? "" })),
    offerText: messages[0]?.bodyText ?? "",
    timeline: confirmed.map((m) => {
      const a = latestAnalysis.get(m.id);
      const applied = appliedByMessage.get(m.id);
      return {
        messageId: m.id,
        projectId,
        receivedAt: m.receivedAt.toISOString(),
        title: (a && upgradeAnalysis(a.analysis).title) || (m.bodyText ?? "").trim().split("\n")[0].slice(0, 80),
        summary: (a && upgradeAnalysis(a.analysis).summary) || "",
        created: !!applied?.created,
        applied: records(applied?.applied),
        left: records(applied?.left),
        stage: applied?.stage ?? null,
        recorded: !!applied,
      };
    }),
  };
}
