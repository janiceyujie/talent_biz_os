// What screens receive. Shapes follow the planned tables in
// docs/architecture.md#schema; until a table is built, its list is empty
// (see lib/data). Dates are local YYYY-MM-DD strings in the talent's time zone.
import type { Locale } from "@/lib/i18n/config";
import type { Appearance, Role } from "@/lib/roles";
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

export type Project = {
  id: string;
  title: string;
  counterparty: string;
  counterpartyId: string | null;
  artist: string; // display only until manager accounts pick a talent per project
  type: ProjectType;
  stage: Stage;
  quotedAmount: number | null; // null = 報價未定 (not decided yet), not zero
  currency: "TWD";
  taxRate: number;
  taxIncluded: boolean;
  details: { deliverables?: string; rights?: string; travel?: string; contractNotes?: string };
  offerText: string; // from the project's source message
  notes: string;
  nextAction: { title: string; dueDate: string | null } | null; // the next open to-do
  archived: boolean;
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
};

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
  recordedDate: string; // 登錄日期
  dueDate: string | null;
  status: "expected" | "settled" | "cancelled";
  settledAmount: number | null; // what actually arrived or was paid; null = the full total
  settledDate: string | null;
  invoiceRef: string;
  notes: string;
  voided: boolean; // 作廢: a mistaken or duplicate entry, out of every total
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

export type InboxMessage = {
  id: string;
  sender: string;
  subject: string;
  body: string;
  receivedAt: string;
  suggestedType: ProjectType | null;
  analysisNote: string;
  projectId: string | null;
};

export type AppData = {
  talent: { id: string; name: string; timeZone: string };
  person: { displayName: string; email: string; role: Role; appearance: Appearance };
  calendarFeed: boolean; // a subscription link exists (the URL itself is only shown once)
  projects: Project[];
  contacts: Contact[];
  calendar: CalendarItem[];
  payments: Payment[];
  templates: ReplyTemplate[];
  drafts: ReplyDraft[];
  files: StoredFile[];
  inbox: InboxMessage[];
  notificationState: NotificationState; // this person's read and snooze marks
  // This person's sign-in methods; googleAccountId is our auth_account row id (what unlinking takes).
  signIn: { password: boolean; googleAccountId: string | null; googleAvailable: boolean };
};

/** Read and snooze marks by notification id (ISO timestamps). */
export type NotificationState = Record<string, { readAt: string | null; snoozedUntil: string | null }>;
