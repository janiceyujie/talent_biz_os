// Drizzle schema — the authoritative table definitions.
// Design reference and the tables not built yet: docs/architecture.md#schema.
import { sql, type SQL } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  char,
  check,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { contactRoles, stages as projectStages } from "../types"; // relative: drizzle-kit loads this file too

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
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("person_account_type_check", oneOf(t.accountType, accountTypes))],
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

export const verticals = ["music", "influencer", "model", "other"] as const;

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
    company: text(),
    email: text(),
    phone: text(),
    notes: text(),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("contact_talent_idx").on(t.talentId), check("contact_role_check", oneOf(t.role, contactRoles))],
).enableRLS();

/** Type-specific fields; each type's registry entry decides which apply. */
export type ProjectDetails = { deliverables?: string; rights?: string; travel?: string; contractNotes?: string };

// One ongoing deal with one counterparty (UI: 專案 / 合作案).
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

// Who confirmed or changed what, and when.
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

export const paymentDirections = ["in", "out"] as const; // 收入 / 成本
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
    recordedOn: date().notNull(), // 登錄日期
    dueOn: date(),
    status: text({ enum: paymentStatuses }).notNull().default("expected"),
    settledAmount: numeric({ precision: 12, scale: 2, mode: "number" }),
    settledOn: date(),
    method: text(),
    invoiceRef: text(),
    notes: text(),
    archivedAt: timestamp({ withTimezone: true }),
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
