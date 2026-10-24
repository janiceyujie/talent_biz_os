import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { opportunity, opportunityApplication, opportunityPage, opportunitySource, opportunityTask, preference, todo } from "@/lib/db/schema";
import { dateInZone } from "@/lib/domain/dates";
import { pageOf, type ListParams } from "@/lib/opportunities/list";
import { trackedPages } from "@/lib/opportunities/tracked";
import { screeningProfileSchema, type Application, type OpportunitiesWorkspace, type Opportunity, type OpportunityChange } from "@/lib/opportunities/types";

type Row = typeof opportunity.$inferSelect;
const opportunityOf = (r: Row): Opportunity => ({
  id: r.id,
  source: r.source as Opportunity["source"], // the foreign key keeps it to opportunitySources
  region: r.region,
  kind: r.kind,
  title: r.title,
  agency: r.agency,
  url: r.url,
  opensOn: r.opensOn,
  closesOn: r.closesOn,
  sourceStatus: r.sourceStatus,
  timeZone: r.timeZone,
  summary: r.summary,
  rules: r.rules,
  highlights: r.highlights,
  passages: r.passages,
  checkedAt: r.checkedAt.toISOString(),
  changedAt: r.changedAt.toISOString(),
});

/** What the Opportunities screen shows besides the list: the calls this talent follows, their applications and to-dos, and each source's last read. */
export async function getOpportunitiesWorkspace(talentId: string): Promise<OpportunitiesWorkspace> {
  const [applications, sources, lists] = await Promise.all([
    db.select().from(opportunityApplication).where(eq(opportunityApplication.talentId, talentId)).orderBy(desc(opportunityApplication.updatedAt)),
    db.select().from(opportunitySource),
    // Each tracked page's list, last read: a page that moved keeps its old address's row, so the newest.
    db
      .select({ trackedId: opportunityPage.trackedId, checkedAt: sql<Date | null>`max(${opportunityPage.checkedAt})`.mapWith((v: string | null) => (v ? new Date(v) : null)) })
      .from(opportunityPage)
      .where(eq(opportunityPage.role, "list"))
      .groupBy(opportunityPage.trackedId),
  ]);
  const ids = applications.map((a) => a.id);
  const [followed, tasks] = ids.length
    ? await Promise.all([
        db.select().from(opportunity).where(inArray(opportunity.id, applications.map((a) => a.opportunityId))),
        db
          .select({ applicationId: opportunityTask.applicationId, kind: opportunityTask.kind, id: todo.id, title: todo.title, date: todo.dueDate, time: todo.dueTime, timeZone: todo.timeZone, status: todo.status })
          .from(opportunityTask)
          .innerJoin(todo, and(eq(todo.id, opportunityTask.todoId), eq(todo.talentId, talentId)))
          .where(inArray(opportunityTask.applicationId, ids))
          .orderBy(asc(todo.dueDate)),
      ])
    : [[], []];
  return {
    followed: followed.map(opportunityOf),
    applications: applications.map(
      (a): Application => ({
        id: a.id,
        opportunityId: a.opportunityId,
        stage: a.stage,
        projectId: a.projectId,
        notes: a.notes,
        tasks: tasks
          .filter((t) => t.applicationId === a.id)
          .map((t) => ({ id: t.id, kind: t.kind, title: t.title, date: t.date, time: t.time?.slice(0, 5) ?? "", timeZone: t.timeZone, status: t.status })),
      }),
    ),
    // A failed read isn't shown: the team is told (lib/opportunities/alert.ts), and a call not read lately is Check.
    sources: [
      ...(["moc", "grants_gov"] as const).map((id) => ({ id, source: id, agency: null, checkedAt: sources.find((s) => s.id === id)?.checkedAt?.toISOString() ?? null })),
      ...trackedPages.map((p) => ({ id: p.id, source: "pages" as const, agency: p.agency, checkedAt: lists.find((l) => l.trackedId === p.id)?.checkedAt?.toISOString() ?? null })),
    ],
  };
}

/**
 * One page of the catalogue for this person (decision 0011), screened against
 * their profile. The catalogue's calls still open, or closed in the last day
 * or so, number in the hundreds, so they're read whole and screened here:
 * one screening, the same the screen shows (lib/opportunities/screening).
 */
export async function listOpportunities(talentId: string, personId: string, params: ListParams) {
  const [[saved], follows] = await Promise.all([
    db
      .select({ value: preference.value })
      .from(preference)
      .where(and(eq(preference.personId, personId), eq(preference.talentId, talentId), eq(preference.key, "opportunities.profile"))),
    db.select({ id: opportunityApplication.opportunityId }).from(opportunityApplication).where(eq(opportunityApplication.talentId, talentId)),
  ]);
  const followed = new Set(follows.map((f) => f.id));
  const profile = screeningProfileSchema.safeParse(saved?.value);
  // Two days' margin for zones: the exact cut is each call's own (lib/opportunities/list).
  const since = dateInZone("UTC", -2);
  const rows = await db
    .select()
    .from(opportunity)
    // Every tab's count needs the open calls, and Following its closed ones too.
    .where(or(isNull(opportunity.closesOn), gte(opportunity.closesOn, since), followed.size ? inArray(opportunity.id, [...followed]) : undefined));
  return pageOf(rows.map(opportunityOf), params, { profile: profile.success ? profile.data : null, followed });
}

/**
 * The calls this talent follows whose dates at the source aren't the ones
 * they last saw, each with its open Submit to-do: the date-change
 * notification (decision 0024), until they move the to-do or say they've seen it.
 */
export async function opportunityChanges(talentId: string): Promise<OpportunityChange[]> {
  const rows = await db
    .select({
      applicationId: opportunityApplication.id,
      title: opportunity.title,
      timeZone: opportunity.timeZone,
      opensOn: opportunity.opensOn,
      closesOn: opportunity.closesOn,
      knownOpensOn: opportunityApplication.knownOpensOn,
      knownClosesOn: opportunityApplication.knownClosesOn,
    })
    .from(opportunityApplication)
    .innerJoin(opportunity, eq(opportunity.id, opportunityApplication.opportunityId))
    .where(
      and(
        eq(opportunityApplication.talentId, talentId),
        inArray(opportunityApplication.stage, ["preparing", "submitted"]),
        or(sql`${opportunityApplication.knownOpensOn} is distinct from ${opportunity.opensOn}`, sql`${opportunityApplication.knownClosesOn} is distinct from ${opportunity.closesOn}`),
      ),
    );
  if (!rows.length) return [];
  const submits = await db
    .select({ applicationId: opportunityTask.applicationId, todoId: todo.id, date: todo.dueDate })
    .from(opportunityTask)
    .innerJoin(todo, and(eq(todo.id, opportunityTask.todoId), eq(todo.talentId, talentId), eq(todo.status, "open")))
    .where(and(inArray(opportunityTask.applicationId, rows.map((r) => r.applicationId)), eq(opportunityTask.kind, "submission")))
    .orderBy(asc(opportunityTask.createdAt));
  return rows.map((r) => {
    const submit = submits.find((s) => s.applicationId === r.applicationId);
    return {
      applicationId: r.applicationId,
      title: r.title,
      from: { opensOn: r.knownOpensOn, closesOn: r.knownClosesOn },
      to: { opensOn: r.opensOn, closesOn: r.closesOn },
      zone: r.timeZone,
      submit: submit ? { todoId: submit.todoId, date: submit.date } : null,
    };
  });
}
