import "server-only";
import { and, asc, count, desc, eq, getTableColumns, inArray, isNull, sql } from "drizzle-orm";
import { freeTierOk, keepsData, modelFor } from "@/lib/ai/model";
import { relevanceQueue } from "@/lib/queue/jobs";
import { cache } from "react";
import { upgradeAnalysis } from "@/lib/ai/analysis";
import { dailyUsage } from "@/lib/ai/usage";
import { CALENDAR_SCOPE, hasScopes, IMPORT_SCOPES } from "@/lib/calendar/google/scope";
import { isGoogleConfigured, isGoogleEnabled, requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { readPreferences } from "@/lib/preferences";
import { pairKey } from "@/lib/domain/organizations";
import { summaryOf } from "./projects";
import { changeMark } from "./changes";
import { authAccount, calendarSeriesProject, organization, organizationDistinct, projectContact, projectOrganization, calendarConnection, calendarEvent, calendarImportSource, contract, gmailAddonLink, mailConnection, mailDecision, mailSenderRule, externalEvent, contact, file, membership, message, messageAnalysis, notificationState, payment, person as personTable, preference, project, replyTemplate, talent, todo } from "@/lib/db/schema";
import { toLocale } from "@/lib/i18n/config";
import { addonAvailable } from "@/lib/addon/request";
import { isEmailChannel } from "@/lib/mail/channel";
import { mailConfigured } from "@/lib/mail/connect";
import { isProjectType } from "@/lib/project-types";
import { roleOf } from "@/lib/roles";
import { calendarKinds, type AppData, type CalendarItem, type CalendarKind, type TravelDetails } from "@/lib/types";


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
  // Read before the data, so a change made while it loads moves the mark again and is caught next check.
  const changes = await changeMark(current.id, person.personId);
  const [[talentRow], [memberRow], projectRows, contactRows, organizationRows, distinctRows, clientRows, projectPeopleRows, paymentRows, eventRows, todoRows, templateRows, stateRows, accountRows, messageRows, preferenceRows] = await Promise.all([
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
    // Not events deleted in Google Calendar: they're gone from every screen (decision 0017).
    db.select().from(calendarEvent).where(and(eq(calendarEvent.talentId, current.id), isNull(calendarEvent.deletedInGoogleAt))),
    db.select().from(todo).where(eq(todo.talentId, current.id)).orderBy(todo.createdAt),
    db.select().from(replyTemplate).where(eq(replyTemplate.talentId, current.id)).orderBy(desc(replyTemplate.updatedAt)),
    db.select().from(notificationState).where(eq(notificationState.personId, person.personId)),
    db
      .select({ id: authAccount.id, providerId: authAccount.providerId, scope: authAccount.scope })
      .from(authAccount)
      .where(eq(authAccount.personId, person.personId)),
    db.select().from(message).where(eq(message.talentId, current.id)).orderBy(desc(message.receivedAt)).limit(200),
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
      accountSubject: mailConnection.accountSubject,
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
  // Repeating events in our own calendar added to a project, by series (decision 0017).
  const seriesLinks = connection ? await db.select().from(calendarSeriesProject).where(eq(calendarSeriesProject.connectionId, connection.id)) : [];
  const importedRows = importSources.length
    ? await db
        .select()
        .from(externalEvent)
        .where(inArray(externalEvent.sourceId, importSources.map((x) => x.id)))
    : [];



  // Reply to-dos each of the person's own replies marked done, for its Undo.
  const completedBy = new Map<string, { id: string; title: string }[]>();
  for (const t of todoRows)
    if (t.completedByMessageId && t.status === "done")
      completedBy.set(t.completedByMessageId, [...(completedBy.get(t.completedByMessageId) ?? []), { id: t.id, title: t.title }]);
  // Latest analysis per message (analyses are versioned; the newest wins).
  const analysisRows = messageRows.length
    ? await db
        .select()
        .from(messageAnalysis)
        .where(inArray(messageAnalysis.messageId, messageRows.map((m) => m.id)))
        .orderBy(desc(messageAnalysis.createdAt))
    : [];
  // The address of each mailbox email came from, for Open in Gmail: the connected one's, or a Gmail add-on link's.
  const subjects = [...new Set(messageRows.flatMap((m) => (m.mailboxSubject ? [m.mailboxSubject] : [])))];
  const linkRows = subjects.length
    ? await db.select({ subject: gmailAddonLink.googleSubject, email: gmailAddonLink.googleEmail }).from(gmailAddonLink).where(inArray(gmailAddonLink.googleSubject, subjects))
    : [];
  const mailboxEmail = new Map(linkRows.map((l) => [l.subject, l.email]));
  const addonLinks = await db
    .select({ id: gmailAddonLink.id, googleEmail: gmailAddonLink.googleEmail, lastUsedAt: gmailAddonLink.lastUsedAt })
    .from(gmailAddonLink)
    .where(eq(gmailAddonLink.personId, person.personId))
    .orderBy(asc(gmailAddonLink.createdAt));
  if (mailbox) mailboxEmail.set(mailbox.accountSubject, mailbox.accountEmail);
  const fileRows = messageRows.length
    ? await db
        .select({ id: file.id, messageId: file.messageId, contentType: file.contentType, filename: file.filename, sizeBytes: file.sizeBytes })
        .from(file)
        .where(inArray(file.messageId, messageRows.map((m) => m.id)))
        .orderBy(asc(file.position))
    : [];
  const latestAnalysis = new Map<string, (typeof analysisRows)[number]>();
  for (const a of analysisRows) if (!latestAnalysis.has(a.messageId)) latestAnalysis.set(a.messageId, a);

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
      suggestedProjectId: e.suggestedProjectId,
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
        kind: todoKind[t.type] ?? ("todo" as const),
        title: t.title,
        date: t.dueDate!,
        time: hhmm(t.dueTime),
        timeZone: t.timeZone,
        location: "",
        projectId: t.projectId,
        suggestedProjectId: null,
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
    changes,
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
    // The provider paste and upload actually use (AI_PRIMARY, or AI_PROVIDER in development).
    aiDataNotice: keepsData(modelFor("analysis", false).provider) ? aiServiceName(modelFor("analysis", false).provider) : null,
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
        series: source.own && e.seriesId ? { id: e.seriesId, projectId: seriesLinks.find((l) => l.seriesId === e.seriesId)?.projectId ?? null } : null,
      };
    }),
    googleCalendar: {
      available: isGoogleConfigured,
      importGranted: hasScopes(accountRows.find((a) => a.providerId === "google")?.scope, IMPORT_SCOPES),
      // The person's chosen calendars; not our own calendar's repeating events, read the same way.
      importing: importSources.filter((x) => !x.own).map((x) => ({ name: x.name, color: x.color, lastImportedAt: x.lastImportedAt?.toISOString() ?? null })),
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
      available: mailConfigured(),
      freeTier: keepsData(modelFor("relevance").provider) && freeTierOk(),
      connection: mailbox
        ? {
            accountEmail: mailbox.accountEmail,
            status: mailbox.status,
            failure: mailbox.failure,
            historyMode: mailbox.historyMode,
            lastSyncedAt: mailbox.lastSyncedAt?.toISOString() ?? null,
            syncing:
              mailbox.status === "connected" && !!mailbox.syncRequestedAt && (!mailbox.lastSyncedAt || mailbox.syncRequestedAt > mailbox.lastSyncedAt),
            // Emails the model is still scoring: a backlog on a slow local model can take a while.
            sorting: mailbox.status === "connected" && scoring ? mailCount("pending") : 0,
            connectedAt: mailbox.createdAt.toISOString(),
            updatedAt: mailbox.updatedAt.toISOString(), // when the status last changed
            counts: { waiting: waitingCount, skipped: mailCount("skipped") + mailCount("not_work") },
          }
        : null,
      senderRules,
    },
    gmailAddon: {
      available: addonAvailable(),
      links: addonLinks.map((l) => ({ id: l.id, email: l.googleEmail, lastUsedAt: l.lastUsedAt?.toISOString() ?? null })),
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
    })),
    organizations: organizationRows.map((o) => ({ id: o.id, name: o.name, notes: o.notes ?? "", archived: o.archivedAt !== null })),
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
      currency: "TWD",
      taxRate: p.taxRate,
      taxIncluded: p.taxIncluded,
      recordedDate: p.recordedOn,
      dueDate: p.dueOn,
      status: p.status,
      settledAmount: p.settledAmount,
      settledDate: p.settledOn,
      invoiceRef: p.invoiceRef ?? "",
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
    files: [],
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
    inbox: messageRows.map((m) => {
      const a = latestAnalysis.get(m.id);
      return {
        id: m.id,
        channel: m.channel,
        body: m.bodyText ?? "",
        receivedAt: m.receivedAt.toISOString(),
        status: m.status,
        failure: m.failure,
        projectId: m.projectId,
        chosenProjectId: m.chosenProjectId,
        analysis: a ? { ...upgradeAnalysis(a.analysis), modelVersion: a.modelVersion, promptVersion: a.promptVersion } : null,
        files: fileRows
          .filter((f) => f.messageId === m.id)
          .map((f) => ({ id: f.id, contentType: f.contentType, filename: f.filename ?? "", sizeBytes: f.sizeBytes })),
        gmail:
          isEmailChannel(m.channel) && m.externalRef
            ? {
                gmailId: m.externalRef,
                accountEmail: (m.mailboxSubject && mailboxEmail.get(m.mailboxSubject)) || "",
                threadId: m.providerThreadId ?? "",
                sent: m.direction === "sent",
                recipients: m.recipients ?? "",
                sender: m.sender ?? "",
                subject: m.subject ?? "",
                unsure: m.relevance === "unsure",
                skippedAttachments: m.skippedAttachments ?? [],
              }
            : null,
        notice: m.kind === "payment_notice" ? m.notice : null,
        completedTodos: completedBy.get(m.id) ?? [],
      };
    }),
  };
});

/** How the AI service is named to people, for the data notice. */
function aiServiceName(provider: string | undefined) {
  return ({ gemini: "Google Gemini", anthropic: "Anthropic Claude", openai: "OpenAI", ollama: "Ollama" } as Record<string, string>)[provider ?? ""] ?? "AI";
}
