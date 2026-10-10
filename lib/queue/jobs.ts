import { z } from "zod";
import { locales } from "@/lib/i18n/config";

// Every background job and the shape of its payload, checked when a job is
// added and again when the worker runs it. Payloads carry ids, never message
// content, so the job table holds nothing someone could read
// (docs/decisions/0014-hosting-and-job-queue.md).

export const jobs = {
  /** Analyze one message and store a new analysis version (lib/ai/analyze-message.ts). */
  "message.analyze": z.strictObject({ messageId: z.uuid(), locale: z.enum(locales) }),
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
  // Model errors don't throw: the message is marked error and the person can Retry.
  // Only a failure outside that, such as the database being down, retries here.
  "message.analyze": 5,
};

/** The key that makes a second "analyze this message" replace a waiting one instead of queueing twice. */
export const analyzeJobKey = (messageId: string) => `message.analyze:${messageId}`;
