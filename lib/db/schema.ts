// Drizzle schema — the authoritative table definitions.
// Design reference and the tables not built yet: docs/architecture.md#schema.
import { sql, type SQL } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { MessageAnalysis } from "../ai/analysis"; // relative: drizzle-kit loads this file too
import { intentKeys } from "../ai/extraction/intents";
import { contactRoles, stages as projectStages, transportModes, type ContractTerms, type ProjectDetails, type TermChange } from "../types"; // relative: drizzle-kit loads this file too

const id = () => uuid().primaryKey().defaultRandom();
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// CHECK constraint restricting a text column to a fixed list of values.
const oneOf = (column: AnyPgColumn, values: readonly string[]): SQL =>
  sql`${column} in (${sql.raw(values.map((v) => `'${v}'`).join(", "))})`;

// Identity ---------------------------------------------------------------------

export const accountTypes = ["individual", "manager", "agency"] as const;
export const avatarAppearances = ["female", "male", "non_binary"] as const;

// A login. Doubles as Better Auth's `user` model (renamed); Better Auth
// lowercases emails itself, so plain unique text is enough.
export const person = pgTable(
  "person",
  {
    id: id(),
    email: text().notNull().unique(),
    emailVerified: boolean().notNull().default(false),
    displayName: text().notNull(),
    image: text(),
    accountType: text({ enum: accountTypes }).notNull().default("individual"),
    locale: text().notNull().default("zh-TW"), // UI language; supported list in lib/i18n/config
    avatarAppearance: text({ enum: avatarAppearances }).notNull().default("non_binary"), // assistant character's look
    replyWithinDays: integer().notNull().default(2), // reply-by default for a message that states none (docs/design/intake-to-project.md)
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("person_account_type_check", oneOf(t.accountType, accountTypes)),
    check("person_avatar_appearance_check", oneOf(t.avatarAppearance, avatarAppearances)),
    check("person_reply_within_days_check", sql`${t.replyWithinDays} between 0 and 30`),
  ],
).enableRLS();

// Better Auth internals. Column set follows Better Auth's core schema;
// `personId` is its `userId`, renamed in the auth config.
export const authSession = pgTable(
  "auth_session",
  {
    id: id(),
    personId: uuid()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    token: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("auth_session_person_id_idx").on(t.personId)],
).enableRLS();

// One row per sign-in method: a password (hash in `password`) or a Google link.
export const authAccount = pgTable(
  "auth_account",
  {
    id: id(),
    personId: uuid()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    accountId: text().notNull(),
    providerId: text().notNull(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("auth_account_person_id_idx").on(t.personId)],
).enableRLS();

// Email-verification and password-reset tokens.
export const authVerification = pgTable(
  "auth_verification",
  {
    id: id(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("auth_verification_identifier_idx").on(t.identifier)],
).enableRLS();

export const verticals = ["music", "influencer", "model", "video", "other"] as const;

// The artist or creator whose business is tracked.
export const talent = pgTable(
  "talent",
  {
    id: id(),
    name: text().notNull(),
    vertical: text({ enum: verticals }).notNull(),
    timeZone: text().notNull().default("Asia/Taipei"), // IANA; decides what "today" means
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("talent_vertical_check", oneOf(t.vertical, verticals))],
).enableRLS();

export const membershipRoles = ["owner", "manager", "agency_admin"] as const;
export const membershipStatuses = ["invited", "active", "revoked"] as const;

// A person's role on a talent. A solo artist has exactly one: `owner`.
export const membership = pgTable(
  "membership",
  {
    id: id(),
    talentId: uuid()
      .notNull()
      .references(() => talent.id, { onDelete: "cascade" }),
    personId: uuid()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    role: text({ enum: membershipRoles }).notNull().default("owner"),
    status: text({ enum: membershipStatuses }).notNull().default("active"),
    // SHA-256 of the calendar subscription link's secret; the secret itself is never stored.
    calendarFeedTokenHash: text().unique("membership_calendar_feed_token_hash_unique"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("membership_talent_person_unique").on(t.talentId, t.personId),
    index("membership_person_id_idx").on(t.personId),
    check("membership_role_check", oneOf(t.role, membershipRoles)),
    check("membership_status_check", oneOf(t.status, membershipStatuses)),
  ],
).enableRLS();

// Contacts and projects ----------------------------------------------------------

// A company, organisation, band, or label the talent works with (decision 0012).
// Its people are contacts linked to it; its part in a project is a role on
// project_organization. Same name never implies same organisation.
export const organization = pgTable(
  "organization",
  {
    id: id(),
    talentId: uuid()
      .notNull()
      .references(() => talent.id, { onDelete: "cascade" }),
    name: text().notNull(),
    notes: text(),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("organization_talent_idx").on(t.talentId)],
).enableRLS();

// Someone the talent works with. Same name never implies same contact.
export const contact = pgTable(
  "contact",
  {
    id: id(),
    talentId: uuid()
      .notNull()
      .references(() => talent.id, { onDelete: "cascade" }),
    role: text({ enum: contactRoles }).notNull(),
    name: text().notNull(),
    company: text(), // as typed; the organization link below replaces it over time (decision 0012)
    // Where they work, if anywhere: an independent has none. Removing the organisation keeps the person.
    organizationId: uuid().references(() => organization.id, { onDelete: "set null" }),
    email: text(),
    phone: text(),
    notes: text(),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("contact_talent_idx").on(t.talentId), check("contact_role_check", oneOf(t.role, contactRoles))],
).enableRLS();

// One ongoing deal with one counterparty (UI: Project).
export const project = pgTable(
  "project",
  {
    id: id(),
    talentId: uuid()
      .notNull()
      .references(() => talent.id, { onDelete: "cascade" }),
    title: text().notNull(),
    counterparty: text().notNull(), // kept even when linked to a contact
    counterpartyId: uuid().references(() => contact.id, { onDelete: "set null" }),
    type: text().notNull(), // project type registry key, validated in code
    stage: text({ enum: projectStages }).notNull().default("offer"),
    quotedAmount: numeric({ precision: 12, scale: 2, mode: "number" }), // as entered; see taxIncluded
    quoteCurrency: char({ length: 3 }).notNull().default("TWD"),
    taxRate: numeric({ precision: 5, scale: 2, mode: "number" }).notNull().default(0),
    taxIncluded: boolean().notNull().default(false),
    details: jsonb().$type<ProjectDetails>().notNull().default({}),
    notes: text(),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("project_talent_stage_idx").on(t.talentId, t.stage),
    check("project_stage_check", oneOf(t.stage, projectStages)),
    check("project_quote_currency_check", sql`${t.quoteCurrency} = 'TWD'`), // MVP: TWD only
    check("project_tax_rate_check", sql`${t.taxRate} between 0 and 100`),
  ],
).enableRLS();

// The organisations on a project (decision 0012), each with its part in it in
// the person's own words (e.g. "organiser", "agency", "venue"). Exactly one is
// primary: the client, which the list shows and finance groups by
// (project.counterparty mirrors its name).
export const projectOrganization = pgTable(
  "project_organization",
  {
    id: id(),
    talentId: uuid()
      .notNull()
      .references(() => talent.id, { onDelete: "cascade" }),
    projectId: uuid()
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    organizationId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    role: text(),
    isPrimary: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    unique("project_organization_project_organization").on(t.projectId, t.organizationId),
    index("project_organization_organization_idx").on(t.organizationId),
    // At most one primary per project.
    uniqueIndex("project_organization_one_primary").on(t.projectId).where(sql`${t.isPrimary}`),
  ],
).enableRLS();

// The people on a project beyond its main contact (project.counterparty_id): an
// agency, a venue, a second person at the client. `label` is their role on this
// project in the person's own words (e.g. "event coordinator"). Removing the project or the
// contact removes the link; the contact itself stays.
export const projectContact = pgTable(
  "project_contact",
  {
    id: id(),
    talentId: uuid()
      .notNull()
      .references(() => talent.id, { onDelete: "cascade" }),
    projectId: uuid()
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    contactId: uuid()
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    label: text(),
    createdAt: createdAt(),
  },
  (t) => [unique("project_contact_project_contact").on(t.projectId, t.contactId), index("project_contact_project_idx").on(t.projectId)],
).enableRLS();

// Who confirmed or changed what, and when.
// Per-person read and snooze state of derived notifications. Notifications
// themselves are computed on read, never stored; their ids are stable
// (e.g. 'calendar:{id}:{date}:{time}'). A snooze never moves the item itself.
export const notificationState = pgTable(
  "notification_state",
  {
    personId: uuid()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    notificationId: text().notNull(),
    readAt: timestamp({ withTimezone: true }),
    snoozedUntil: timestamp({ withTimezone: true }), // set by the server ("remind me in an hour")
  },
  (t) => [primaryKey({ columns: [t.personId, t.notificationId] })],
).enableRLS();

// A person's settings in one workspace, by key (e.g. 'overview.layout'): small
// JSON values the app validates on read, so a bad or outdated one falls back
// to defaults. One row per person, workspace, and key; new keys need no
// migration. The allowed keys and their shapes are in lib/preferences.
export const preference = pgTable(
  "preference",
  {
    personId: uuid()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    talentId: uuid()
      .notNull()
      .references(() => talent.id, { onDelete: "cascade" }),
    key: text().notNull(),
    value: jsonb().$type<unknown>().notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.personId, t.talentId, t.key] })],
).enableRLS();

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    talentId: uuid()
      .notNull()
      .references(() => talent.id, { onDelete: "cascade" }),
    actorPersonId: uuid().references(() => person.id, { onDelete: "set null" }),
    action: text().notNull(), // e.g. 'project.stage_changed'
    targetType: text().notNull(),
    targetId: uuid().notNull(),
    details: jsonb().$type<Record<string, unknown>>(), // e.g. { from: 'negotiating', to: 'signed' }
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_target_idx").on(t.targetType, t.targetId)],
).enableRLS();

// Money ----------------------------------------------------------------------------

export const paymentDirections = ["in", "out"] as const; // income / cost
export const paymentInstallments = ["regular", "deposit", "balance"] as const;
export const paymentStatuses = ["expected", "settled", "cancelled"] as const;

// Money in or out, usually for a project. `amount` is as entered (see
// `taxIncluded`); `settledAmount` is what actually arrived or was paid.
// Dates are calendar days in the talent's time zone.
export const payment = pgTable(
  "payment",
  {
    id: id(),
    talentId: uuid()
      .notNull()
      .references(() => talent.id, { onDelete: "cascade" }),
    projectId: uuid().references(() => project.id, { onDelete: "cascade" }), // null for a general expense
    direction: text({ enum: paymentDirections }).notNull(),
    installment: text({ enum: paymentInstallments }).notNull().default("regular"),
    label: text().notNull(),
    amount: numeric({ precision: 12, scale: 2, mode: "number" }).notNull(),
    currency: char({ length: 3 }).notNull().default("TWD"),
    taxRate: numeric({ precision: 5, scale: 2, mode: "number" }).notNull().default(0),
    taxIncluded: boolean().notNull().default(false),
    recordedOn: date().notNull(), // recorded on
    dueOn: date(),
    status: text({ enum: paymentStatuses }).notNull().default("expected"),
    settledAmount: numeric({ precision: 12, scale: 2, mode: "number" }),
    settledOn: date(),
    method: text(),
    invoiceRef: text(),
    notes: text(),
    // Void: entered by mistake or duplicated — out of every total, kept and restorable.
    voidedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("payment_talent_status_due_idx").on(t.talentId, t.status, t.dueOn),
    index("payment_project_idx").on(t.projectId),
    check("payment_direction_check", oneOf(t.direction, paymentDirections)),
    check("payment_installment_check", oneOf(t.installment, paymentInstallments)),
    check("payment_status_check", oneOf(t.status, paymentStatuses)),
    check("payment_currency_check", sql`${t.currency} = 'TWD'`), // MVP: TWD only
    check("payment_tax_rate_check", sql`${t.taxRate} between 0 and 100`),
    check("payment_amount_check", sql`${t.amount} >= 0 and (${t.settledAmount} is null or ${t.settledAmount} >= 0)`),
    check("payment_settled_check", sql`(${t.status} = 'settled') = (${t.settledOn} is not null)`),
  ],
).enableRLS();

// Calendar and to-dos ----------------------------------------------------------------
// Both store local wall time: a calendar day, an optional time (null = all day
// or no set time), and the IANA time zone it was entered in.

export const calendarEventStatuses = ["proposed", "confirmed", "cancelled"] as const;

// Something that happens at a time: a performance, meeting, travel, a stay.
export const calendarEvent = pgTable(
  "calendar_event",
  {
    id: id(),
    talentId: uuid()
      .notNull()
      .references(() => talent.id, { onDelete: "cascade" }),
    projectId: uuid().references(() => project.id, { onDelete: "cascade" }),
    kind: text().notNull(), // 'performance', 'meeting', 'travel', 'accommodation'; validated in code
    title: text().notNull(),
    location: text(),
    startDate: date().notNull(),
    startTime: time({ precision: 0 }),
    timeZone: text().notNull(),
    // Travel and stays: arrival or check-out, in its own zone.
    endDate: date(),
    endTime: time({ precision: 0 }),
    endTimeZone: text(),
    transportMode: text({ enum: transportModes }),
    operator: text(), // airline, rail operator
    serviceNumber: text(), // flight or train number
    destination: text(),
    seat: text(),
    hotelName: text(),
    // ticket_file_id arrives with the file table.
    status: text({ enum: calendarEventStatuses }).notNull().default("confirmed"),
    notes: text(),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("calendar_event_talent_start_idx").on(t.talentId, t.startDate),
    index("calendar_event_project_idx").on(t.projectId),
    check("calendar_event_status_check", oneOf(t.status, calendarEventStatuses)),
    check("calendar_event_transport_mode_check", oneOf(t.transportMode, transportModes)),
    // An end is all three parts or none.
    check(
      "calendar_event_end_check",
      sql`(${t.endDate} is null) = (${t.endTime} is null) and (${t.endDate} is null) = (${t.endTimeZone} is null)`,
    ),
  ],
).enableRLS();

// Messages and their analysis ------------------------------------------------------
// A message is something the person sent in (pasted text now; uploads, the Gmail
// add-on, and forwarding later). Its analysis is the model's proposal, versioned
// per message; nothing becomes a project, to-do, or event until a person confirms.

export const messageChannels = ["paste", "upload", "gmail_addon", "forwarded_email"] as const;
export const messageStatuses = ["pending", "analyzed", "confirmed", "dismissed", "error"] as const;

export const message = pgTable(
  "message",
  {
    id: id(),
    talentId: uuid()
      .notNull()
      .references(() => talent.id, { onDelete: "cascade" }),
    projectId: uuid().references(() => project.id, { onDelete: "set null" }), // null until confirmed
    submittedBy: uuid()
      .notNull()
      .references(() => person.id),
    channel: text({ enum: messageChannels }).notNull(),
    externalRef: text(), // Gmail message id, when channel = gmail_addon
    receivedAt: timestamp({ withTimezone: true }).notNull(),
    bodyText: text(), // the message's text: pasted text, an email's plain-text body
    dedupKey: text().notNull(), // paste: sha256 of the normalized text
    status: text({ enum: messageStatuses }).notNull().default("pending"),
    failure: text(), // why the last analysis failed, for the person to see
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("message_talent_dedup_key").on(t.talentId, t.dedupKey),
    index("message_talent_status_idx").on(t.talentId, t.status),
    index("message_project_idx").on(t.projectId),
    check("message_channel_check", oneOf(t.channel, messageChannels)),
    check("message_status_check", oneOf(t.status, messageStatuses)),
  ],
).enableRLS();

export const messageAnalysis = pgTable(
  "message_analysis",
  {
    id: id(),
    messageId: uuid()
      .notNull()
      .references(() => message.id, { onDelete: "cascade" }),
    talentId: uuid()
      .notNull()
      .references(() => talent.id, { onDelete: "cascade" }),
    intent: text({ enum: intentKeys }).notNull(), // what the message is doing — lib/ai/extraction/intents.ts
    analysis: jsonb().$type<MessageAnalysis>().notNull(), // summary, facts, asks, missing — lib/ai/analysis.ts
    confidence: numeric({ precision: 4, scale: 3, mode: "number" }).notNull(),
    modelVersion: text().notNull(), // provider and model, e.g. "gemini:gemini-3.5-flash"
    promptVersion: text().notNull(), // fingerprint of the prompt and field definitions — lib/ai/prompts.ts
    createdAt: createdAt(), // latest row wins
  },
  (t) => [
    index("message_analysis_message_idx").on(t.messageId, t.createdAt),
    check("message_analysis_intent_check", oneOf(t.intent, intentKeys)),
    check("message_analysis_confidence_check", sql`${t.confidence} between 0 and 1`),
  ],
).enableRLS();

// A stored file: one of a message's files (in order), or an upload to a
// project's archive. Bytes live in storage (lib/storage) under storage_key;
// the row never holds a URL.
export const fileRoles = ["body", "attachment", "screenshot", "upload"] as const;
export const fileCategories = ["contract", "asset", "invoice", "other"] as const;

export const file = pgTable(
  "file",
  {
    id: id(),
    talentId: uuid()
      .notNull()
      .references(() => talent.id, { onDelete: "cascade" }),
    messageId: uuid().references(() => message.id, { onDelete: "cascade" }), // set for a message's files
    projectId: uuid().references(() => project.id, { onDelete: "set null" }), // set for archive uploads
    position: integer(), // order within a message
    role: text({ enum: fileRoles }).notNull(),
    category: text({ enum: fileCategories }), // for archive uploads
    storageKey: text().notNull(), // 'files/{talent_id}/{id}'
    contentType: text().notNull(),
    filename: text(),
    sizeBytes: bigint({ mode: "number" }).notNull(),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique("file_message_position").on(t.messageId, t.position),
    index("file_talent_idx").on(t.talentId),
    index("file_project_idx").on(t.projectId),
    check("file_role_check", oneOf(t.role, fileRoles)),
    check("file_category_check", oneOf(t.category, fileCategories)),
    check("file_size_check", sql`${t.sizeBytes} > 0`),
  ],
).enableRLS();

export const contractStatuses = ["received", "changes_requested", "signed", "void"] as const;

// One version of a project's contract, from the message that brought it. Terms are
// as extracted and confirmed; the diff is against the previous version, or for
// the first, the project's agreed terms (docs/design/intake-to-project.md).
export const contract = pgTable(
  "contract",
  {
    id: id(),
    projectId: uuid()
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    talentId: uuid()
      .notNull()
      .references(() => talent.id, { onDelete: "cascade" }),
    messageId: uuid().references(() => message.id, { onDelete: "set null" }),
    versionNumber: integer().notNull().default(1),
    supersedesId: uuid().references((): AnyPgColumn => contract.id),
    status: text({ enum: contractStatuses }).notNull().default("received"),
    terms: jsonb().$type<ContractTerms>().notNull(),
    diff: jsonb().$type<TermChange[]>(),
    signedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("contract_project_version").on(t.projectId, t.versionNumber),
    index("contract_talent_idx").on(t.talentId),
    check("contract_status_check", oneOf(t.status, contractStatuses)),
  ],
).enableRLS();

// One model call: what it was for, which model and prompt version, what it
// cost, and how it ended. Feeds cost tracking, usage limits, and debugging
// (docs/decisions/0008). Replayed calls (recorded answers) are logged too, marked.
export const aiCallStatuses = ["ok", "error"] as const;

export const aiCall = pgTable(
  "ai_call",
  {
    id: id(),
    talentId: uuid().references(() => talent.id, { onDelete: "cascade" }), // null for evals and scripts
    personId: uuid().references(() => person.id, { onDelete: "set null" }),
    messageId: uuid().references(() => message.id, { onDelete: "set null" }),
    task: text().notNull(), // 'extract', 'eval', later 'draft'
    provider: text().notNull(),
    model: text().notNull(),
    promptVersion: text(),
    status: text({ enum: aiCallStatuses }).notNull(),
    failureCode: text(), // lib/ai/errors.ts
    inputTokens: integer(),
    outputTokens: integer(),
    latencyMs: integer().notNull(),
    replayed: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("ai_call_talent_created_idx").on(t.talentId, t.createdAt),
    index("ai_call_message_idx").on(t.messageId),
    check("ai_call_status_check", oneOf(t.status, aiCallStatuses)),
  ],
).enableRLS();

export const todoTypes = [
  "reply",
  "follow_up",
  "review_contract",
  "review_contract_change",
  "confirm_event",
  "payment_due",
  "confirm_logistics",
  "deliverable",
  "milestone",
  "custom",
] as const;
export const todoStatuses = ["open", "done", "dismissed"] as const;

// Something the person needs to do, optionally by a date. Dismissed is how
// a to-do is archived.
export const todo = pgTable(
  "todo",
  {
    id: id(),
    talentId: uuid()
      .notNull()
      .references(() => talent.id, { onDelete: "cascade" }),
    projectId: uuid().references(() => project.id, { onDelete: "cascade" }),
    paymentId: uuid().references(() => payment.id, { onDelete: "set null" }),
    messageId: uuid().references(() => message.id, { onDelete: "set null" }), // the message a reply to-do is about
    type: text({ enum: todoTypes }).notNull().default("custom"),
    title: text().notNull(),
    dueDate: date(),
    dueTime: time({ precision: 0 }),
    timeZone: text().notNull(),
    status: text({ enum: todoStatuses }).notNull().default("open"),
    completedAt: timestamp({ withTimezone: true }),
    notes: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("todo_talent_status_due_idx").on(t.talentId, t.status, t.dueDate),
    index("todo_project_idx").on(t.projectId),
    check("todo_type_check", oneOf(t.type, todoTypes)),
    check("todo_status_check", oneOf(t.status, todoStatuses)),
  ],
).enableRLS();

// Reply library ------------------------------------------------------------------

export const replyTemplateKinds = ["template", "past_reply"] as const;

// A reusable reply template, or a past reply kept for reference. Bodies are
// stored with language-neutral placeholders ({{counterparty}}); `language` is
// the language the reply itself is written in.
export const replyTemplate = pgTable(
  "reply_template",
  {
    id: id(),
    talentId: uuid()
      .notNull()
      .references(() => talent.id, { onDelete: "cascade" }),
    projectType: text().notNull(), // registry key; templates are per type
    kind: text({ enum: replyTemplateKinds }).notNull(),
    language: text().notNull(), // validated against lib/i18n/config in code
    title: text().notNull(),
    body: text().notNull(),
    tone: text(),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("reply_template_talent_type_idx").on(t.talentId, t.projectType),
    check("reply_template_kind_check", oneOf(t.kind, replyTemplateKinds)),
  ],
).enableRLS();

// Google Calendar sync (decision 0009). One connection per person per talent:
// their Google account (the linked auth_account) and the dedicated calendar
// we created there. `dirty` asks a running sync to go around once more.
export const calendarConnectionStatuses = ["connected", "needs_reconnect", "error"] as const;

export const calendarConnection = pgTable(
  "calendar_connection",
  {
    id: id(),
    talentId: uuid()
      .notNull()
      .references(() => talent.id, { onDelete: "cascade" }),
    personId: uuid()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    authAccountId: uuid()
      .notNull()
      .references(() => authAccount.id, { onDelete: "cascade" }),
    provider: text().notNull().default("google"),
    externalCalendarId: text(), // the dedicated calendar; null until created
    status: text({ enum: calendarConnectionStatuses }).notNull().default("connected"),
    lastError: text(), // a failure code, for the settings card
    lastSyncedAt: timestamp({ withTimezone: true }),
    dirty: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("calendar_connection_person_talent").on(t.personId, t.talentId, t.provider),
    index("calendar_connection_talent_idx").on(t.talentId),
    check("calendar_connection_status_check", oneOf(t.status, calendarConnectionStatuses)),
  ],
).enableRLS();

// Which Google event each of our events became, per connection. The event link
// is set null (not cascaded) when an event is deleted, so the next sync still
// knows which Google event to remove.
export const calendarEventSync = pgTable(
  "calendar_event_sync",
  {
    id: id(),
    connectionId: uuid()
      .notNull()
      .references(() => calendarConnection.id, { onDelete: "cascade" }),
    eventId: uuid().references(() => calendarEvent.id, { onDelete: "set null" }),
    externalEventId: text().notNull(),
    etag: text(),
    syncedAt: timestamp({ withTimezone: true }).notNull(), // our event's updated_at when last pushed
  },
  (t) => [
    unique("calendar_event_sync_connection_event").on(t.connectionId, t.eventId),
    index("calendar_event_sync_connection_idx").on(t.connectionId),
  ],
).enableRLS();

// Phase 2 of decision 0009: the person's own Google calendars shown here,
// read-only. Personal: only the person who connected sees them. Each poll
// re-reads a window of dates and replaces what's stored for that calendar.
export const calendarImportSource = pgTable(
  "calendar_import_source",
  {
    id: id(),
    connectionId: uuid()
      .notNull()
      .references(() => calendarConnection.id, { onDelete: "cascade" }),
    externalCalendarId: text().notNull(),
    name: text().notNull(),
    color: text(), // Google's background colour for the calendar, as #rrggbb
    lastImportedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [unique("calendar_import_source_connection_calendar").on(t.connectionId, t.externalCalendarId)],
).enableRLS();

// One event read from a chosen Google calendar, as wall time plus zone like our own (decision 0003).
export const externalEvent = pgTable(
  "external_event",
  {
    id: id(),
    sourceId: uuid()
      .notNull()
      .references(() => calendarImportSource.id, { onDelete: "cascade" }),
    externalEventId: text().notNull(), // a repeating event's occurrences each have their own id
    title: text().notNull(),
    startDate: date().notNull(),
    startTime: time({ precision: 0 }), // null = all day
    endDate: date(),
    endTime: time({ precision: 0 }),
    timeZone: text().notNull(),
    location: text(),
    htmlLink: text(), // opens the event in Google Calendar
  },
  (t) => [unique("external_event_source_event").on(t.sourceId, t.externalEventId), index("external_event_source_start_idx").on(t.sourceId, t.startDate)],
).enableRLS();
