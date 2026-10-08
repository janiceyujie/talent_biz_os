// What screens receive. Shapes follow the planned tables in
// docs/architecture.md#schema; until a table is built, its list is empty
// (see lib/data). Dates are local YYYY-MM-DD strings in the talent's time zone.
import type { Preferences } from "@/lib/preferences";
import type { Locale } from "@/lib/i18n/config";
import type { Appearance, Role } from "@/lib/roles";
import type { MessageAnalysis } from "@/lib/ai/analysis";
import type { ChangeRecord } from "@/lib/domain/intake";
import type { ProjectType } from "@/lib/project-types";

export const stages = [
  "offer",
  "negotiating",
  "signed",
  "in_progress",
  "collecting_payment",
  "closed",
  "declined",
  "cancelled",
] as const;
export type Stage = (typeof stages)[number];

/**
 * A project as every page sees it (decision 0011): no notes, and of the
 * details only what intake matching scores — the type's identifying fields
 * and the dates. The full project loads when it's opened.
 */
export type ProjectSummary = Omit<Project, "details" | "notes"> & { details: Pick<ProjectDetails, "fields" | "dates"> };

export type Project = {
  id: string;
  title: string;
  counterparty: string;
  counterpartyId: string | null;
  clientId: string | null; // the primary organisation (decision 0012); counterparty mirrors its name
  artist: string; // display only until manager accounts pick a talent per project
  type: ProjectType;
  stage: Stage;
  quotedAmount: number | null; // null = quote not set (not decided yet), not zero
  currency: "TWD";
  taxRate: number;
  taxIncluded: boolean;
  details: ProjectDetails;
  notes: string;
  nextAction: { id: string; title: string; dueDate: string | null } | null; // the next open to-do
  archived: boolean;
  updatedAt: string; // ISO instant of the last change (any edit, including stage)
};

/** A date kept on a project before it's signed, or one that isn't a calendar event (decision 0004). */
export type ProjectDate = { what: string; date: string; time: string; timeZone: string };

/**
 * Free-form deal details. The form edits the first four; messages fill the
 * rest (docs/design/intake-to-project.md). `fields` holds the project type's
 * registry fields (lib/project-types) by key, except those with a home above.
 */
export type ProjectDetails = {
  deliverables?: string;
  rights?: string;
  travel?: string;
  contractNotes?: string;
  fields?: Record<string, string>;
  dates?: ProjectDate[];
  toConfirm?: string[]; // To confirm with them: open questions for the other side
};

/** A contract's terms as extracted from it, for comparing versions. Empty or null = not stated. */
export type ContractTerms = {
  fee: number | null;
  taxIncluded: boolean | null;
  paymentTerms: string;
  keyTerms: string;
  fields: Record<string, string>; // the project type's registry fields
  dates: ProjectDate[];
};

/** One difference between two sets of terms. `key`: "fee", "taxIncluded", "paymentTerms", "keyTerms", "field:<key>", "date:<what>". */
export type TermChange = { key: string; before: string; after: string };

export type Contract = {
  id: string;
  projectId: string;
  messageId: string | null;
  version: number;
  status: "received" | "changes_requested" | "signed" | "void";
  terms: ContractTerms;
  diff: TermChange[];
  /** What the diff compares against: the previous version, or for the first version, the project's agreed terms. */
  against: "version" | "project";
  createdAt: string;
};

export const contactRoles = ["artist", "counterparty", "manager"] as const;
export type ContactRole = (typeof contactRoles)[number];

export type Contact = {
  id: string;
  role: ContactRole;
  name: string;
  company: string;
  email: string;
  phone: string;
  notes: string;
  archived: boolean;
  organizationId: string | null; // where they work (decision 0012); none for an independent
};

/** A company, organisation, band, or label the talent works with (decision 0012). */
export type Organization = { id: string; name: string; notes: string; archived: boolean };

// One calendar list over two tables: calendar_event (things that happen) and
// todo (deadlines). `kind` decides which table a new item goes to.
export const calendarKinds = [
  "todo",
  "performance",
  "deliverable",
  "meeting",
  "travel",
  "accommodation",
  "payment",
] as const;
export type CalendarKind = (typeof calendarKinds)[number];

export type CalendarItem = {
  id: string;
  source: "event" | "todo";
  kind: CalendarKind;
  title: string;
  date: string;
  time: string; // HH:mm or ""
  timeZone: string;
  location: string;
  projectId: string | null;
  notes: string;
  done: boolean;
  archived: boolean;
  travel: TravelDetails | null; // travel and accommodation events only
  // An ordinary event's end, in its own zone ("" = no end recorded); travel and stays use `travel`.
  endDate: string;
  endTime: string;
};

export const transportModes = ["high_speed_rail", "train", "flight", "transfer", "other"] as const;
export type TransportMode = (typeof transportModes)[number];

/** Arrival or check-out (in its own zone) and the ticket details. "" = not recorded. */
export type TravelDetails = {
  endDate: string;
  endTime: string;
  endTimeZone: string;
  transportMode: TransportMode | "";
  operator: string;
  serviceNumber: string;
  destination: string;
  seat: string;
  hotelName: string;
};

export type Payment = {
  id: string;
  projectId: string | null;
  projectType: ProjectType; // the project's type, or "other" for a general expense
  direction: "in" | "out";
  installment: "regular" | "deposit" | "balance";
  label: string;
  amount: number;
  currency: "TWD";
  taxRate: number;
  taxIncluded: boolean;
  recordedDate: string; // recorded on
  dueDate: string | null;
  status: "expected" | "settled" | "cancelled";
  settledAmount: number | null; // what actually arrived or was paid; null = the full total
  settledDate: string | null;
  invoiceRef: string;
  notes: string;
  voided: boolean; // Void: a mistaken or duplicate entry, out of every total
};

export type ReplyTemplate = {
  id: string;
  projectType: ProjectType;
  kind: "template" | "past_reply";
  language: Locale; // the language the reply is written in, not the UI's
  title: string;
  /** Stored with language-neutral placeholders ({{counterparty}}); see lib/templates/placeholders. */
  body: string;
  tone: string;
  archived: boolean;
};

export type ReplyDraft = {
  id: string;
  projectId: string | null;
  messageId: string | null;
  projectType: ProjectType;
  subject: string;
  recipient: string;
  source: string;
  body: string;
  archived: boolean;
};

export type StoredFile = {
  id: string;
  projectId: string | null;
  filename: string;
  sizeBytes: number;
  createdAt: string;
  archived: boolean;
};

/** A message the person sent in, with the latest analysis of it (the model's proposal). */
export type InboxMessage = {
  id: string;
  channel: "paste" | "upload" | "gmail_addon" | "forwarded_email";
  body: string;
  receivedAt: string; // ISO instant
  status: "pending" | "analyzed" | "confirmed" | "dismissed" | "error";
  failure: string | null;
  projectId: string | null;
  analysis: (MessageAnalysis & { modelVersion: string; promptVersion: string }) | null;
  files: { id: string; contentType: string; filename: string; sizeBytes: number }[]; // screenshots, photos, PDFs, in order
};

/** What only a project's own screen shows, loaded when it's opened (lib/data/project-detail.ts). */
export type ProjectDetail = {
  projectId: string;
  details: ProjectDetails;
  notes: string;
  /** Everyone on the project besides its main contact (counterpartyId), with their role there. */
  people: { contactId: string; label: string }[];
  /** The organisations on the project, the primary one (its client) first, each with its role there. */
  organizations: { organizationId: string; role: string; primary: boolean }[];
  offerText: string; // the earliest message filed under it
  timeline: TimelineEntry[]; // newest first
};

/** One message on a project's timeline, with what applying it changed (audit_log `message.applied`). */
export type TimelineEntry = {
  messageId: string;
  projectId: string;
  receivedAt: string; // ISO instant
  title: string;
  summary: string;
  /** Created this project, rather than updating it. */
  created: boolean;
  applied: ChangeRecord[];
  /** Proposed but not applied (e.g. a counter-offer's terms). */
  left: ChangeRecord[];
  /** The stage as changed by applying it, ticked or answered (the stage question). */
  stage: { from: Stage; to: Stage } | null;
  /** Filed before applying was recorded: nothing to show beyond the message. */
  recorded: boolean;
};

export type ExternalEvent = {
  id: string;
  calendar: string; // the Google calendar's name
  color: string | null;
  title: string;
  date: string;
  time: string; // "" = all day
  endDate: string;
  endTime: string;
  timeZone: string;
  location: string;
  link: string; // opens the event in Google Calendar
};

export type AppData = {
  talent: { id: string; name: string; timeZone: string };
  person: { displayName: string; email: string; role: Role; appearance: Appearance; replyWithinDays: number; workspaceOwner: boolean };
  calendarFeed: boolean; // a subscription link exists (the URL itself is only shown once)
  projects: ProjectSummary[]; // the full project: GET /api/projects/[id]
  contacts: Contact[];
  organizations: Organization[];
  calendar: CalendarItem[];
  payments: Payment[];
  templates: ReplyTemplate[];
  drafts: ReplyDraft[];
  files: StoredFile[];
  inbox: InboxMessage[];
  contracts: Contract[]; // newest version first
  notificationState: NotificationState; // this person's read and snooze marks
  preferences: Preferences; // this person's settings in this workspace (lib/preferences)
  // Google Calendar sync for this person and talent (decision 0009): whether Google granted the
  // calendar permission, and the connection's state once made.
  /** This person's own Google events, read-only (decision 0009, phase 2); "" = not set. Wall time in `timeZone`. */
  externalEvents: ExternalEvent[];
  googleCalendar: {
    available: boolean; // a Google provider is configured here
    importGranted: boolean; // Google allowed listing and reading their calendars
    importing: { name: string; color: string | null; lastImportedAt: string | null }[]; // the calendars shown here
    granted: boolean;
    connection: { status: "connected" | "needs_reconnect" | "error"; lastError: string | null; lastSyncedAt: string | null } | null;
  };
  // This person's sign-in methods; googleAccountId is our auth_account row id (what unlinking takes).
  signIn: { password: boolean; googleAccountId: string | null; googleAvailable: boolean };
  // The AI service's name when it may keep what's sent (e.g. a free tier) — shown as a notice; null otherwise.
  aiDataNotice: string | null;
  aiUsage: { used: number; limit: number; remaining: number }; // AI analyses in the last 24 hours (docs/decisions/0008)
};

/** Read and snooze marks by notification id (ISO timestamps). */
export type NotificationState = Record<string, { readAt: string | null; snoozedUntil: string | null }>;
