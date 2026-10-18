import { grantsDrafts } from "@/lib/mail/scope";
import "server-only";
import {managerLocalEnabled} from "@/lib/manager/config";
import {getManagerCapability} from "./manager-entitlement";
import {hasManagerWorkspace} from "./manager";
import { grantsLocalEnabled } from "@/lib/grants/config";
import { getGrantNotice } from "./grants";
import { and, count, sql, desc, eq, getTableColumns, inArray } from "drizzle-orm";
import { cache } from "react";
import { inboxOverview } from "./inbox";
import { relevanceQueue } from "@/lib/queue/jobs";
import { keepsData, modelFor, freeTierOk } from "@/lib/ai/model";
import { dailyUsage } from "@/lib/ai/usage";
import { CALENDAR_SCOPE, hasScopes, IMPORT_SCOPES } from "@/lib/calendar/google/scope";
import { isGoogleConfigured, isGoogleEnabled, requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { readPreferences } from "@/lib/preferences";
import { pairKey } from "@/lib/domain/organizations";
import { summaryOf } from "./projects";
import { authAccount, organization, organizationDistinct, projectContact, projectOrganization, calendarConnection, calendarEvent, calendarImportSource, contract, mailDecision, mailSenderRule, mailConnection, externalEvent, contact, membership, notificationState, grantApplication, grantTask, payment, person as personTable, preference, project, replyTemplate, talent, todo } from "@/lib/db/schema";
import { toLocale } from "@/lib/i18n/config";
import { mailPipelineEnabled } from "@/lib/mail/config";
import { mailConfigured } from "@/lib/mail/connect";
import { isProjectType } from "@/lib/project-types";
import { roleOf } from "@/lib/roles";
import { calendarKinds, type AppData, type CalendarItem, type CalendarKind, type Payment, type TravelDetails } from "@/lib/types";


const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");
const todoKind: Record<string, CalendarKind> = { deliverable: "deliverable", payment_due: "payment" };
const eventKind = (k: string): CalendarKind => (calendarKinds.includes(k as CalendarKind) ? (k as CalendarKind) : "meeting");

/**
 * Everything the signed-in talent's screens show. Each list fills in as its
 * table is built (docs/architecture.md, "Built in"); until then it's empty
 * and the screen shows its empty state.
 */
export const getAppData = cache(async (): Promise<AppData> => {
  const { person, talent: current } = await requireTalent();
  const [[talentRow], [memberRow], projectRows, contactRows, organizationRows, distinctRows, clientRows, projectPeopleRows, paymentRows, eventRows, todoRows, templateRows, stateRows, accountRows, inboxStats, preferenceRows] = await Promise.all([
    db
      .select({ id: talent.id, name: talent.name, timeZone: talent.timeZone, vertical: talent.vertical })
      .from(talent)
      .where(eq(talent.id, current.id)),
    db
      .select({
        feedHash: membership.calendarFeedTokenHash,
        accountType: personTable.accountType,
        appearance: personTable.avatarAppearance,
        replyWithinDays: personTable.replyWithinDays,
      })
      .from(membership)
      .innerJoin(personTable, eq(personTable.id, membership.personId))
      .where(and(eq(membership.personId, person.personId), eq(membership.talentId, current.id))),
    db.select().from(project).where(eq(project.talentId, current.id)).orderBy(desc(project.updatedAt)),
    db.select().from(contact).where(eq(contact.talentId, current.id)).orderBy(contact.name),
    db.select().from(organization).where(eq(organization.talentId, current.id)).orderBy(organization.name),
    db
      .select({ a: organizationDistinct.organizationAId, b: organizationDistinct.organizationBId })
      .from(organizationDistinct)
      .where(eq(organizationDistinct.talentId, current.id)),
    db
      .select({ projectId: projectOrganization.projectId, organizationId: projectOrganization.organizationId })
      .from(projectOrganization)
      .where(and(eq(projectOrganization.talentId, current.id), eq(projectOrganization.isPrimary, true))),
    db
      .select({ projectId: projectContact.projectId, contactId: projectContact.contactId })
      .from(projectContact)
      .where(eq(projectContact.talentId, current.id)),
    db
      .select({ ...getTableColumns(payment), projectType: project.type })
      .from(payment)
      .leftJoin(project, eq(project.id, payment.projectId))
      .where(eq(payment.talentId, current.id))
      .orderBy(desc(payment.recordedOn), desc(payment.createdAt)),
    db.select().from(calendarEvent).where(eq(calendarEvent.talentId, current.id)),
    db.select().from(todo).where(eq(todo.talentId, current.id)).orderBy(todo.createdAt),
    db.select().from(replyTemplate).where(eq(replyTemplate.talentId, current.id)).orderBy(desc(replyTemplate.updatedAt)),
    db.select().from(notificationState).where(eq(notificationState.personId, person.personId)),
    db
      .select({ id: authAccount.id, providerId: authAccount.providerId, scope: authAccount.scope })
      .from(authAccount)
      .where(eq(authAccount.personId, person.personId)),
    inboxOverview(current.id),
    db
      .select({ key: preference.key, value: preference.value })
      .from(preference)
      .where(and(eq(preference.personId, person.personId), eq(preference.talentId, current.id))),
  ]);

  const contractRows = await db
    .select()
    .from(contract)
    .where(eq(contract.talentId, current.id))
    .orderBy(desc(contract.versionNumber));

  const [connection] = await db
    .select()
    .from(calendarConnection)
    .where(and(eq(calendarConnection.personId, person.personId), eq(calendarConnection.talentId, current.id)));
  // The talent's connected mailbox (decision 0013): every member sees the same one. Never the token columns.
  const [mailbox] = await db
    .select({
      id: mailConnection.id,
      accountEmail: mailConnection.accountEmail,
      scopes: mailConnection.scopes,
      status: mailConnection.status,
      failure: mailConnection.failure,
      historyMode: mailConnection.historyMode,
      lastSyncedAt: mailConnection.lastSyncedAt,
      syncRequestedAt: mailConnection.syncRequestedAt,
      createdAt: mailConnection.createdAt,
      updatedAt: mailConnection.updatedAt,
    })
    .from(mailConnection)
    .where(eq(mailConnection.talentId, current.id));
  const [mailCounts, senderRules, scoring] = await Promise.all([
    mailbox
      ? db
          .select({ outcome: mailDecision.outcome, inMessages: sql<boolean>`${mailDecision.messageId} is not null`, n: count() })
          .from(mailDecision)
          .where(eq(mailDecision.connectionId, mailbox.id))
          .groupBy(mailDecision.outcome, sql`${mailDecision.messageId} is not null`)
      : [],
    db
      .select({ id: mailSenderRule.id, kind: mailSenderRule.kind, value: mailSenderRule.value, verdict: mailSenderRule.verdict })
      .from(mailSenderRule)
      .where(eq(mailSenderRule.talentId, current.id))
      .orderBy(mailSenderRule.value),
    // Emails still waiting for the model step: jobs not yet run or still retrying.
    mailbox
      ? db
          .execute<{ scoring: boolean }>(
            sql`select exists (select 1 from graphile_worker.jobs where queue_name = ${relevanceQueue(mailbox.id)} and attempts < max_attempts) as scoring`,
          )
          .then((r) => !!r[0]?.scoring)
      : false,
  ]);
  const mailCount = (o: string) => mailCounts.find((r) => r.outcome === o && !r.inMessages)?.n ?? 0;
  // Waiting: decided as work, or not yet, and not in Messages yet (brought in mail is a message there).
  const waitingCount = mailCount("work") + mailCount("unsure") + mailCount("pending");
  // This person's own Google calendars shown here (decision 0009, phase 2): only they see them.
  const importSources = connection
    ? await db.select().from(calendarImportSource).where(eq(calendarImportSource.connectionId, connection.id))
    : [];
  const importedRows = importSources.length
    ? await db
        .select()
        .from(externalEvent)
        .where(inArray(externalEvent.sourceId, importSources.map((x) => x.id)))
    : [];



  const grantLinks=grantsLocalEnabled()?await db.select({todoId:grantTask.todoId,applicationId:grantApplication.id}).from(grantTask)
    .innerJoin(grantApplication,and(eq(grantApplication.id,grantTask.applicationId),eq(grantApplication.talentId,current.id))):[];
  const grantOfTodo=new Map(grantLinks.map(row=>[row.todoId,row.applicationId]));

  const calendar: CalendarItem[] = [
    ...eventRows.map((e) => ({
      id: e.id,
      source: "event" as const,
      kind: eventKind(e.kind),
      title: e.title,
      date: e.startDate,
      time: hhmm(e.startTime),
      timeZone: e.timeZone,
      location: e.location ?? "",
      projectId: e.projectId,
      notes: e.notes ?? "",
      done: false,
      archived: e.archivedAt !== null,
      travel:
        e.kind === "travel" || e.kind === "accommodation"
          ? ({
              endDate: e.endDate ?? "",
              endTime: hhmm(e.endTime),
              endTimeZone: e.endTimeZone ?? "",
              transportMode: e.transportMode ?? "",
              operator: e.operator ?? "",
              serviceNumber: e.serviceNumber ?? "",
              destination: e.destination ?? "",
              seat: e.seat ?? "",
              hotelName: e.hotelName ?? "",
            } satisfies TravelDetails)
          : null,
      endDate: e.kind !== "travel" && e.kind !== "accommodation" ? (e.endDate ?? "") : "",
      endTime: e.kind !== "travel" && e.kind !== "accommodation" ? hhmm(e.endTime) : "",
    })),
    ...todoRows
      .filter((t) => t.dueDate) // undated to-dos have no place on a calendar
      .map((t) => ({
        id: t.id,
        source: "todo" as const,
        grantApplicationId: grantOfTodo.get(t.id),
        kind: todoKind[t.type] ?? ("todo" as const),
        title: t.title,
        date: t.dueDate!,
        time: hhmm(t.dueTime),
        timeZone: t.timeZone,
        location: "",
        projectId: t.projectId,
        notes: t.notes ?? "",
        done: t.status === "done",
        archived: t.status === "dismissed",
        travel: null,
        endDate: "",
        endTime: "",
      })),
  ];

  const clientOf = new Map(clientRows.map((r) => [r.projectId, r.organizationId]));
  // A project's next step: its earliest open to-do, undated ones last.
  const nextAction = new Map<string, { id: string; title: string; dueDate: string | null }>();
  for (const t of [...todoRows]
    .filter((t) => t.status === "open" && t.projectId)
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))) {
    if (!nextAction.has(t.projectId!)) nextAction.set(t.projectId!, { id: t.id, title: t.title, dueDate: t.dueDate });
  }

  return {
    managerToolsAvailable: managerLocalEnabled(),
    managerAvailable: (await getManagerCapability(person.personId)).enabled && (memberRow.accountType === "manager" || await hasManagerWorkspace(person.personId)),
    grantsAvailable: grantsLocalEnabled(),
    grantNotice: await getGrantNotice(current.id, person.personId),
    talent: { id: talentRow.id, name: talentRow.name, timeZone: talentRow.timeZone },
    person: {
      displayName: person.displayName,
      email: person.email,
      role: roleOf(memberRow.accountType, talentRow.vertical),
      appearance: memberRow.appearance,
      replyWithinDays: memberRow.replyWithinDays,
      workspaceOwner: current.role === "owner", // only owners change the workspace's name and zone
    },
    calendarFeed: Boolean(memberRow?.feedHash),
    aiDataNotice: process.env.AI_PROVIDER_KEEPS_DATA === "1" ? aiServiceName(process.env.AI_PROVIDER) : null,
    aiUsage: await dailyUsage(current.id),
    externalEvents: importedRows.map((e) => {
      const source = importSources.find((x) => x.id === e.sourceId)!;
      return {
        id: e.id,
        calendar: source.name,
        color: source.color,
        title: e.title,
        date: e.startDate,
        time: hhmm(e.startTime),
        endDate: e.endDate ?? "",
        endTime: hhmm(e.endTime),
        timeZone: e.timeZone,
        location: e.location ?? "",
        link: e.htmlLink ?? "",
      };
    }),
    googleCalendar: {
      available: isGoogleConfigured,
      importGranted: hasScopes(accountRows.find((a) => a.providerId === "google")?.scope, IMPORT_SCOPES),
      importing: importSources.map((x) => ({ name: x.name, color: x.color, lastImportedAt: x.lastImportedAt?.toISOString() ?? null })),
      granted: !!accountRows.find((a) => a.providerId === "google")?.scope?.split(/[ ,]/).includes(CALENDAR_SCOPE),
      connection: connection
        ? {
            status: connection.status,
            lastError: connection.lastError,
            lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
          }
        : null,
    },
    gmail: {
      reviewEnabled: mailPipelineEnabled() && mailbox?.status === "connected",
      available: mailConfigured(),
      freeTier: keepsData(modelFor("relevance").provider) && freeTierOk(),
      connection: mailbox
        ? {
            draftGranted: grantsDrafts(mailbox.scopes),
            accountEmail: mailbox.accountEmail,
            status: mailbox.status,
            failure: mailbox.failure,
            historyMode: mailbox.historyMode,
            lastSyncedAt: mailbox.lastSyncedAt?.toISOString() ?? null,
            syncing:
              mailbox.status === "connected" &&
              (scoring || (!!mailbox.syncRequestedAt && (!mailbox.lastSyncedAt || mailbox.syncRequestedAt > mailbox.lastSyncedAt))),
            connectedAt: mailbox.createdAt.toISOString(),
            updatedAt: mailbox.updatedAt.toISOString(), // when the status last changed
            counts: { waiting: waitingCount, skipped: mailCount("skipped") + mailCount("not_work") },
          }
        : null,
      senderRules,
    },
    signIn: {
      password: accountRows.some((a) => a.providerId === "credential"),
      googleAccountId: accountRows.find((a) => a.providerId === "google")?.id ?? null,
      googleAvailable: isGoogleEnabled,
    },
    preferences: readPreferences(preferenceRows),
    notificationState: Object.fromEntries(
      stateRows.map((r) => [
        r.notificationId,
        { readAt: r.readAt?.toISOString() ?? null, snoozedUntil: r.snoozedUntil?.toISOString() ?? null },
      ]),
    ),
    // A summary of each project (decision 0011); the full project: lib/data/projects.ts.
    projects: projectRows.map((p) => summaryOf(p, nextAction.get(p.id) ?? null, talentRow.name, clientOf.get(p.id) ?? null)),
    contacts: contactRows.map((c) => ({
      id: c.id,
      role: c.role,
      name: c.name,
      company: c.company ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      notes: c.notes ?? "",
      archived: c.archivedAt !== null,
      organizationId: c.organizationId,
      billingAddress: c.billingAddress ?? "",
    })),
    organizations: organizationRows.map((o) => ({ id: o.id, name: o.name, notes: o.notes ?? "", archived: o.archivedAt !== null, billingAddress: o.billingAddress ?? "", billingEmail: o.billingEmail ?? "" })),
    distinctOrganizations: distinctRows.map((r) => pairKey(r.a, r.b)),
    projectPeople: projectPeopleRows,
    calendar,
    payments: paymentRows.map((p) => ({
      id: p.id,
      projectId: p.projectId,
      projectType: p.projectType && isProjectType(p.projectType) ? p.projectType : "other",
      direction: p.direction,
      installment: p.installment,
      label: p.label,
      amount: p.amount,
      currency: p.currency as Payment["currency"],
      taxRate: p.taxRate,
      taxIncluded: p.taxIncluded,
      recordedDate: p.recordedOn,
      dueDate: p.dueOn,
      status: p.status,
      receipts: p.receipts,
      settledAmount: p.settledAmount,
      settledDate: p.settledOn,
      invoiceRef: p.invoiceRef ?? "",
      invoiceOn: p.invoiceOn,
      notes: p.notes ?? "",
      voided: p.voidedAt !== null,
    })),
    templates: templateRows.map((t) => ({
      id: t.id,
      projectType: isProjectType(t.projectType) ? t.projectType : "other",
      kind: t.kind,
      language: toLocale(t.language),
      title: t.title,
      body: t.body,
      tone: t.tone ?? "",
      archived: t.archivedAt !== null,
    })),
    drafts: [],
    files: [], // File lists are fetched per page/project, never with the shared shell.
    contracts: contractRows.map((c) => ({
      id: c.id,
      projectId: c.projectId,
      messageId: c.messageId,
      version: c.versionNumber,
      status: c.status,
      terms: c.terms,
      diff: c.diff ?? [],
      against: c.supersedesId ? ("version" as const) : ("project" as const),
      createdAt: c.createdAt.toISOString(),
    })),
    inbox: [],
    inboxOverview: inboxStats,
  };
});

/** How the AI service is named to people, for the data notice. */
function aiServiceName(provider: string | undefined) {
  return ({ gemini: "Google Gemini", anthropic: "Anthropic Claude", ollama: "Ollama" } as Record<string, string>)[provider ?? ""] ?? "AI";
}
