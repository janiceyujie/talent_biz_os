// Drizzle schema — the authoritative table definitions.
// Design reference and the tables not built yet: docs/architecture.md#schema.
import { sql, type SQL } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

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
    createdAt: createdAt(),
  },
  (t) => [
    unique("membership_talent_person_unique").on(t.talentId, t.personId),
    index("membership_person_id_idx").on(t.personId),
    check("membership_role_check", oneOf(t.role, membershipRoles)),
    check("membership_status_check", oneOf(t.status, membershipStatuses)),
  ],
).enableRLS();
