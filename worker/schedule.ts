import type { CronItem } from "graphile-worker";
import { appEnv } from "@/lib/app-env";
import { pushConfigured } from "@/lib/mail/pubsub";
import { jobAttempts } from "@/lib/queue/jobs";

// The worker's scheduled jobs (decision 0014: Graphile's crontab). Times are UTC.
// A run missed while the worker was down isn't made up later: the next one does the same work.
// Plain items: worker/index.ts parses them with the same copy of graphile-worker that runs them
// (a second copy's parsed items aren't recognized). Each names its own tries: the scheduler
// doesn't go through lib/queue, so it would otherwise get Graphile's 25 (about 3 days).

export function schedule(): CronItem[] {
  return [
    // With push, a safety net for missed notices; without it, how mail arrives (lib/mail/jobs/reconcile.ts).
    {
      task: "mail.reconcile",
      match: pushConfigured() ? "*/15 * * * *" : "*/2 * * * *",
      identifier: "mail.reconcile",
      options: { maxAttempts: jobAttempts["mail.reconcile"] },
    },
    // Google Calendar read back without anyone on the Calendar screen (docs/design/calendar-two-way.md).
    // Every 5 minutes until Google's change notices work after deploy; then a 30-minute safety net.
    // Every minute in development, where there are no notices and a person is waiting to see a change.
    {
      task: "calendar.reconcile",
      match: appEnv() === "development" ? "* * * * *" : "*/5 * * * *",
      identifier: "calendar.reconcile",
      options: { maxAttempts: jobAttempts["calendar.reconcile"] },
    },
    // 03:30 in Taipei, when little else runs.
    { task: "mail.cleanup", match: "30 19 * * *", identifier: "mail.cleanup", options: { maxAttempts: jobAttempts["mail.cleanup"] } },
  ];
}
