import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { project, todo } from "@/lib/db/schema";
import { identifyingFields } from "@/lib/domain/intake";
import { phaseOf } from "@/lib/domain/phases";
import { listViews, PAGE_MAX, type ListSort, type ListView, type ProjectPage } from "@/lib/domain/project-list";
import { isProjectType } from "@/lib/project-types";
import { stages, type Project, type ProjectSummary } from "@/lib/types";

type Row = typeof project.$inferSelect;
type NextAction = Project["nextAction"];

/** The fields every page sees (decision 0011): no notes, and only the details intake matching scores. */
export function summaryOf(p: Row, nextAction: NextAction, artist: string): ProjectSummary {
  const fields = Object.fromEntries(Object.entries(p.details.fields ?? {}).filter(([k]) => identifyingFields.includes(k)));
  return {
    id: p.id,
    title: p.title,
    counterparty: p.counterparty,
    counterpartyId: p.counterpartyId,
    artist,
    type: isProjectType(p.type) ? p.type : "other",
    stage: p.stage,
    quotedAmount: p.quotedAmount,
    currency: "TWD",
    taxRate: p.taxRate,
    taxIncluded: p.taxIncluded,
    details: { fields, dates: p.details.dates ?? [] },
    nextAction,
    archived: p.archivedAt !== null,
    updatedAt: p.updatedAt.toISOString(),
  };
}

// A project's next step: its earliest open to-do, undated ones last (as lib/data/index.ts).
// The outer column is written out in full: in a one-table query Drizzle leaves
// columns unqualified, and a bare "id" here would mean the to-do's own.
const nextTodo = (column: "title" | "due_date") =>
  sql`(select ${sql.raw(`t.${column}`)} from ${todo} t where t.project_id = "project"."id" and t.status = 'open' order by t.due_date asc nulls last, t.created_at asc limit 1)`;

/** One project in full, for its own screen and for applying a message to it. Null when it isn't this talent's. */
export async function getProject(talentId: string, id: string, artist: string): Promise<Project | null> {
  const [row] = await db
    .select({ project, nextTitle: nextTodo("title").mapWith(String), nextDue: nextTodo("due_date").mapWith(String) })
    .from(project)
    .where(and(eq(project.id, id), eq(project.talentId, talentId)));
  if (!row) return null;
  const nextAction = row.nextTitle ? { title: row.nextTitle, dueDate: row.nextDue || null } : null;
  return { ...summaryOf(row.project, nextAction, artist), details: row.project.details, notes: row.project.notes ?? "" };
}


/**
 * Each sort: its key as SQL, which way it runs, and the key's SQL type (to
 * compare a cursor against it). Ties break on id, so the order is total and
 * a keyset cursor never repeats or skips a row.
 */
const sortKeys: Record<ListSort, { key: SQL; dir: "asc" | "desc"; cast: string }> = {
  // Most urgent first: the soonest next step, then projects with none.
  due: { key: sql`coalesce(${nextTodo("due_date")}::text, '9999-12-31')`, dir: "asc", cast: "text" },
  updated: { key: sql`${project.updatedAt}`, dir: "desc", cast: "timestamptz" },
  // The tax-inclusive quote; quote not set sorts last.
  amount: {
    key: sql`coalesce(${project.quotedAmount} * (case when ${project.taxIncluded} then 1 else 1 + ${project.taxRate} / 100.0 end), -1)`,
    dir: "desc",
    cast: "numeric",
  },
  title: { key: sql`${project.title}`, dir: "asc", cast: "text" },
};

const encodeCursor = (key: string, id: string) => Buffer.from(JSON.stringify([key, id])).toString("base64url");
function decodeCursor(cursor: string): [string, string] | null {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString());
    return Array.isArray(value) && value.length === 2 && value.every((v) => typeof v === "string") ? [value[0], value[1]] : null;
  } catch {
    return null;
  }
}

const viewFilter = (view: ListView) =>
  view === "archived"
    ? isNotNull(project.archivedAt)
    : view === "all"
      ? isNull(project.archivedAt)
      : and(isNull(project.archivedAt), inArray(project.stage, stages.filter((s) => phaseOf(s) === view)));

/** `%` and `_` typed in a search are literal characters, not patterns. */
const likeText = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;


/**
 * One page of the projects list: a view (a phase, or archived), optionally
 * one type and a search of title and partner, in one of four orders. The
 * counts are per view under the same type and search, so a tab's number
 * always matches the list it opens.
 */
export async function listProjects(
  talentId: string,
  artist: string,
  params: { view: ListView; type: string; q: string; sort: ListSort; cursor: string; limit: number },
): Promise<ProjectPage> {
  const { key, dir, cast } = sortKeys[params.sort];
  const after = params.cursor ? decodeCursor(params.cursor) : null;
  const q = params.q.trim();
  const filtered = and(
    eq(project.talentId, talentId),
    params.type !== "all" ? eq(project.type, params.type) : undefined,
    q ? or(ilike(project.title, likeText(q)), ilike(project.counterparty, likeText(q))) : undefined,
  );
  const where = and(
    filtered,
    viewFilter(params.view),
    after
      ? sql`(${key} ${sql.raw(dir === "asc" ? ">" : "<")} ${after[0]}::${sql.raw(cast)} or (${key} = ${after[0]}::${sql.raw(cast)} and ${project.id} > ${after[1]}))`
      : undefined,
  );
  const limit = Math.min(Math.max(params.limit, 1), PAGE_MAX);

  const [rows, countRows] = await Promise.all([
    db
      .select({
        project,
        sortKey: sql<string>`(${key})::text`,
        nextTitle: nextTodo("title").mapWith(String),
        nextDue: nextTodo("due_date").mapWith(String),
      })
      .from(project)
      .where(where)
      .orderBy(dir === "asc" ? asc(key) : desc(key), asc(project.id))
      .limit(limit + 1), // one more than shown says whether there's a next page
    db
      .select({ stage: project.stage, archived: sql<boolean>`${project.archivedAt} is not null`, n: count() })
      .from(project)
      .where(filtered)
      .groupBy(project.stage, sql`${project.archivedAt} is not null`),
  ]);

  const counts = Object.fromEntries(listViews.map((v) => [v, 0])) as Record<ListView, number>;
  for (const r of countRows) {
    counts[r.archived ? "archived" : phaseOf(r.stage)] += r.n;
    if (!r.archived) counts.all += r.n;
  }

  const shown = rows.slice(0, limit);
  const last = shown.at(-1);
  return {
    items: shown.map((r) =>
      summaryOf(r.project, r.nextTitle ? { title: r.nextTitle, dueDate: r.nextDue || null } : null, artist),
    ),
    nextCursor: rows.length > limit && last ? encodeCursor(last.sortKey, last.project.id) : null,
    total: counts[params.view],
    counts,
  };
}
