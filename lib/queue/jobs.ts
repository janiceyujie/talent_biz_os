import { z } from "zod";
import { locales } from "@/lib/i18n/config";

// Every background job and the shape of its payload, checked when a job is
// added and again when the worker runs it. Payloads carry ids, never message
// content, so the job table holds nothing someone could read
// (docs/decisions/0014-hosting-and-job-queue.md).

export const jobs = {
  "mail.review": z.strictObject({decisionId:z.uuid(),mode:z.enum(["preview","import"])}),
  "grants.refresh": z.strictObject({}),
  /** Analyze one message and store a new analysis version (lib/ai/analyze-message.ts). */
  "message.analyze": z.strictObject({ messageId: z.uuid(), locale: z.enum(locales) }),
  /** Find a mailbox's new email, run the rules, record the decisions (lib/mail/jobs/sync.ts). */
  "mail.sync": z.strictObject({ connectionId: z.uuid() }),
  /** The model step for one email the rules left pending (lib/mail/jobs/relevance.ts). */
  "mail.relevance": z.strictObject({ decisionId: z.uuid() }),
  /** Bring one email in: body and attachments into message and file, then analysis (lib/mail/jobs/fetch.ts). */
  "mail.fetch": z.strictObject({ decisionId: z.uuid() }),
  /** Revoke a mailbox's token at Google and delete the connection (lib/mail/jobs/disconnect.ts). */
  // keep: "filed" keeps email filed under a project; "none" removes everything brought in.
  "mail.disconnect": z.strictObject({ connectionId: z.uuid(), keep: z.enum(["filed", "none"]).default("none") }),
  /** Push a talent's events to one Google Calendar connection (lib/calendar/google/sync.ts); `attempt` counts tries after a failure. */
  "calendar.sync": z.strictObject({ connectionId: z.uuid(), attempt: z.number().int().min(0).max(1000).default(0) }),
  // Scheduled by the worker (worker/schedule.ts); the scheduler adds its own `_cron` details, ignored here.
  /** A sync for every connected mailbox: the poll, and push's safety net (lib/mail/jobs/reconcile.ts). */
  "mail.reconcile": z.object({}),
  /** Daily: old skipped decisions, unhandled payment notices, and jobs that gave up long ago (lib/mail/jobs/cleanup.ts). */
  "mail.cleanup": z.object({}),
};

export type JobName = keyof typeof jobs;
export type JobPayload<N extends JobName> = z.infer<(typeof jobs)[N]>;

/**
 * How many times each job runs before it gives up. A job runs again only when
 * its handler throws, after a wait that grows each time (about 3s, 7s, 20s,
 * 55s, 2.5min), so 5 attempts is about 1.5 minutes. Graphile's own default of
 * 25 would keep trying for about 3 days.
 */
export const jobAttempts: Record<JobName, number> = {
  "mail.review": 1,
  "mail.sync": 5,
  "grants.refresh": 3,
  // Model errors don't throw: the message is marked error and the person can Retry.
  // Only a failure outside that, such as the database being down, retries here.
  "message.analyze": 5,
  // Gmail unreachable or rate-limited: a few tries, then the connection shows an error until the next Sync now.
  // The model busy or unreachable: a few tries, then the email stays "Not decided yet" until the next Sync now.
  "mail.relevance": 5,
  // Gmail or storage unreachable: a few tries, then the email stays in Waiting until the next Sync now.
  "mail.fetch": 5,
  // Google unreachable: a few more tries, then the row is deleted anyway.
  "mail.disconnect": 5,
  // Its own retries follow the launch checklist's schedule (runCalendarSync); only a crash retries here.
  "calendar.sync": 3,
  // The next run comes on schedule anyway.
  "mail.reconcile": 1,
  "mail.cleanup": 3,
};

/** The key that makes a second "analyze this message" replace a waiting one instead of queueing twice. */
export const analyzeJobKey = (messageId: string) => `message.analyze:${messageId}`;

/** The key that makes a second Sync now replace a waiting sync instead of queueing twice. */
export const syncJobKey = (connectionId: string) => `mail.sync:${connectionId}`;

/** The key that keeps one email from being scored twice at once. */
export const relevanceJobKey = (decisionId: string) => `mail.relevance:${decisionId}`;

/**
 * Scoring has its own queue per mailbox, apart from the sync's, so scoring a
 * month of mail never holds up the next sync; one email at a time, as a local
 * model handles best.
 */
export const relevanceQueue = (connectionId: string) => `mail-relevance:${connectionId}`;

/** The key that keeps one email from being brought in twice at once. */
export const fetchJobKey = (decisionId: string) => `mail.fetch:${decisionId}`;

/** Bringing email in: its own queue per mailbox, one at a time, beside scoring and the sync. */
export const fetchQueue = (connectionId: string) => `mail-fetch:${connectionId}`;

/**
 * Analysis runs on a queue per talent: one at a time for each artist, so a
 * month of history brought in at once can't hold up everyone else's.
 */
export const analysisQueue = (talentId: string) => `analyze:${talentId}`;

/** One queue per mailbox: its jobs run one at a time, in order (docs/design/gmail-ingestion.md, Jobs). */
export const mailQueue = (connectionId: string) => `mail:${connectionId}`;

/** The key that makes a second calendar sync replace a waiting one: a burst of changes syncs once. */
export const calendarSyncKey = (connectionId: string) => `calendar.sync:${connectionId}`;

/** One Google Calendar connection's syncs, one at a time. */
export const calendarSyncQueue = (connectionId: string) => `calendar:${connectionId}`;
