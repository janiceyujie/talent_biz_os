import "server-only";
import { and, desc, eq, inArray, isNotNull, isNull, ne, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { calendarEvent, contact, organization, project, replyTemplate, todo } from "@/lib/db/schema";
import { searchWorkspace, SUGGESTIONS, type SearchItem } from "@/lib/workspace-search";
import { likeText } from "./projects";

// The ⌘K search, in the database: every word typed matched against each kind's name and details,
// then ranked by lib/workspace-search.ts. Only what's still live; only the signed-in talent's.

/** A result as the browser words it: `detail` is the raw text it's shown with (a partner, a date…). */
export type SearchHit = SearchItem & { role?: string };

/** Candidates read per kind before ranking; past it, the result says there are more. */
const PER_KIND = 100;
export const SHOWN = 30;

/** Every word in one of these columns. */
const allWords = (words: string[], columns: (AnyColumn | SQL)[]) =>
  and(...words.map((w) => or(...columns.map((c) => sql`coalesce(${c}, '') ilike ${likeText(w)}`))));

const hrefOf = {
  project: (id: string) => `/projects?id=${encodeURIComponent(id)}`,
  contact: () => "/contacts",
  organization: (id: string) => `/contacts/organizations/${encodeURIComponent(id)}`,
  calendar: (date: string) => `/calendar?day=${encodeURIComponent(date)}`,
  template: () => "/drafts",
};

/** The rows of each kind matching `match` (or, with ids, those ids), as unranked hits. */
async function candidates(talentId: string, match: (columns: (AnyColumn | SQL)[]) => SQL | undefined, ids?: Map<SearchHit["kind"], string[]>) {
  const only = (kind: SearchHit["kind"], column: AnyColumn) => (ids ? inArray(column, ids.get(kind) ?? [""]) : undefined);
  const skip = (kind: SearchHit["kind"]) => !!ids && !ids.get(kind)?.length;
  const [projects, contacts, organizations, events, todos, templates] = await Promise.all([
    skip("project")
      ? []
      : db
          .select({ id: project.id, label: project.title, detail: project.counterparty })
          .from(project)
          .where(and(eq(project.talentId, talentId), isNull(project.archivedAt), match([project.title, project.counterparty]), only("project", project.id)))
          .orderBy(desc(project.updatedAt))
          .limit(PER_KIND),
    skip("contact")
      ? []
      : db
          .select({ id: contact.id, label: contact.name, detail: contact.company, email: contact.email, role: contact.role })
          .from(contact)
          .where(and(eq(contact.talentId, talentId), isNull(contact.archivedAt), match([contact.name, contact.company, contact.email]), only("contact", contact.id)))
          .orderBy(desc(contact.updatedAt))
          .limit(PER_KIND),
    skip("organization")
      ? []
      : db
          .select({ id: organization.id, label: organization.name })
          .from(organization)
          .where(and(eq(organization.talentId, talentId), isNull(organization.archivedAt), match([organization.name]), only("organization", organization.id)))
          .orderBy(desc(organization.updatedAt))
          .limit(PER_KIND),
    skip("calendar")
      ? []
      : db
          .select({ id: calendarEvent.id, label: calendarEvent.title, date: calendarEvent.startDate })
          .from(calendarEvent)
          .where(and(eq(calendarEvent.talentId, talentId), isNull(calendarEvent.archivedAt), isNull(calendarEvent.deletedInGoogleAt), match([calendarEvent.title]), only("calendar", calendarEvent.id)))
          .orderBy(desc(calendarEvent.startDate))
          .limit(PER_KIND),
    skip("calendar")
      ? []
      : db
          .select({ id: todo.id, label: todo.title, date: todo.dueDate })
          .from(todo)
          // Undated to-dos have no day to open on the calendar, as there.
          .where(and(eq(todo.talentId, talentId), ne(todo.status, "dismissed"), isNotNull(todo.dueDate), match([todo.title]), only("calendar", todo.id)))
          .orderBy(desc(todo.dueDate))
          .limit(PER_KIND),
    skip("template")
      ? []
      : db
          .select({ id: replyTemplate.id, label: replyTemplate.title })
          .from(replyTemplate)
          .where(and(eq(replyTemplate.talentId, talentId), isNull(replyTemplate.archivedAt), match([replyTemplate.title]), only("template", replyTemplate.id)))
          .orderBy(desc(replyTemplate.updatedAt))
          .limit(PER_KIND),
  ]);
  const hits: SearchHit[] = [
    ...projects.map((r) => ({ id: `project:${r.id}`, kind: "project" as const, label: r.label, detail: r.detail, href: hrefOf.project(r.id) })),
    ...contacts.map((r) => ({ id: `contact:${r.id}`, kind: "contact" as const, label: r.label, detail: r.detail ?? "", keywords: r.email ?? "", role: r.role, href: hrefOf.contact() })),
    ...organizations.map((r) => ({ id: `organization:${r.id}`, kind: "organization" as const, label: r.label, detail: "", href: hrefOf.organization(r.id) })),
    ...[...events, ...todos].map((r) => ({ id: `calendar:${r.id}`, kind: "calendar" as const, label: r.label, detail: r.date!, href: hrefOf.calendar(r.date!) })),
    ...templates.map((r) => ({ id: `template:${r.id}`, kind: "template" as const, label: r.label, detail: "", href: hrefOf.template() })),
  ];
  const full = [projects, contacts, organizations, events, todos, templates].some((rows) => rows.length === PER_KIND);
  return { hits, full };
}

/**
 * What the search lists. With words typed: the best matches, how many there are, and whether there
 * may be more than were read. With none: `recent` (ids, as the browser remembers them) still live,
 * in that order, then the most recently changed projects, up to SUGGESTIONS.
 */
export async function searchWorkspaceItems(talentId: string, query: string, recent: string[]) {
  const words = query.normalize("NFKC").trim().split(/\s+/).filter(Boolean).slice(0, 8);
  if (words.length) {
    const { hits, full } = await candidates(talentId, (columns) => allWords(words, columns));
    const ranked = searchWorkspace(hits, query) as SearchHit[];
    return { items: ranked.slice(0, SHOWN), total: ranked.length, more: full };
  }
  const ids = new Map<SearchHit["kind"], string[]>();
  for (const key of recent) {
    const [kind, id] = key.split(":") as [SearchHit["kind"], string];
    if (kind in hrefOf && /^[0-9a-f-]{36}$/.test(id ?? "")) ids.set(kind, [...(ids.get(kind) ?? []), id]);
  }
  const remembered = ids.size ? (await candidates(talentId, () => undefined, ids)).hits : [];
  const recentProjects = await db
    .select({ id: project.id, label: project.title, detail: project.counterparty })
    .from(project)
    .where(and(eq(project.talentId, talentId), isNull(project.archivedAt)))
    .orderBy(desc(project.updatedAt))
    .limit(SUGGESTIONS);
  const others: SearchHit[] = recentProjects.map((r) => ({ id: `project:${r.id}`, kind: "project", label: r.label, detail: r.detail, href: hrefOf.project(r.id) }));
  const items = searchWorkspace([...remembered, ...others], "", recent) as SearchHit[];
  return { items, total: items.length, more: false };
}
