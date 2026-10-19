import {prepareInvoices} from "@/lib/invoices/service";
import { processMailReview } from "@/lib/mail/jobs/review";
import { refreshGrantSources } from "@/lib/grants/sync";
import type { Task } from "graphile-worker";
import { analyzeMessage, markAnalysisFailed } from "@/lib/ai/analyze-message";
import { runCalendarSync } from "@/lib/calendar/google/sync";
import { disconnectMailbox } from "@/lib/mail/jobs/disconnect";
import { cleanup } from "@/lib/mail/jobs/cleanup";
import { fetchDecision } from "@/lib/mail/jobs/fetch";
import { reconcile } from "@/lib/mail/jobs/reconcile";
import { scoreDecision } from "@/lib/mail/jobs/relevance";
import { syncMailbox } from "@/lib/mail/jobs/sync";
import { JOB_LIMIT_MS } from "@/lib/queue/heartbeat";
import { jobs, type JobName } from "@/lib/queue/jobs";

// One handler per job in lib/queue/jobs.ts. Each must be safe to run twice:
// a job can run again after a crash or a redeploy.

/**
 * No job runs longer than JOB_LIMIT_MS: a call stuck past every timeout would
 * hold its named queue (a mailbox's scoring, say) while its worker keeps
 * beating. The job fails and retries; jobs are safe to run twice.
 */

const limited = (task: Task): Task => (payload, helpers) => {
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${helpers.job.task_identifier} ran over ${JOB_LIMIT_MS / 60_000} minutes`)), JOB_LIMIT_MS);
  });
  return Promise.race([Promise.resolve(task(payload, helpers)), limit]).finally(() => clearTimeout(timer)) as ReturnType<Task>;
};

const tasks: Record<JobName, Task> = {
  "invoice.gmail": async payload => {
    const input = jobs["invoice.gmail"].parse(payload);
    const { processInvoiceGmail } = await import("@/lib/invoices/gmail-worker");
    await processInvoiceGmail(input);
  },
  "invoice.prepare": async payload => { jobs["invoice.prepare"].parse(payload); await prepareInvoices(); },
  "mail.review": async payload => { const {decisionId,mode}=jobs["mail.review"].parse(payload); await processMailReview(decisionId,mode); },
  "grants.refresh": async payload => { jobs["grants.refresh"].parse(payload); if((await refreshGrantSources()).some(r=>!r.ok))throw new Error("grant_source_refresh_failed"); },
  "message.analyze": async (payload, { job }) => {
    const { messageId, locale } = jobs["message.analyze"].parse(payload);
    try {
      await analyzeMessage(messageId, locale);
    } catch (e) {
      // The last attempt: no retry follows, so don't leave the message pending.
      if (job.attempts >= job.max_attempts) {
        await markAnalysisFailed(messageId).catch((err) => console.error("markAnalysisFailed", messageId, err));
      }
      throw e;
    }
  },
  "mail.sync": async (payload, { job }) => {
    const { connectionId } = jobs["mail.sync"].parse(payload);
    await syncMailbox(connectionId, { lastAttempt: job.attempts >= job.max_attempts });
  },
  "mail.relevance": async (payload) => {
    const { decisionId } = jobs["mail.relevance"].parse(payload);
    await scoreDecision(decisionId);
  },
  "mail.fetch": async (payload) => {
    const { decisionId } = jobs["mail.fetch"].parse(payload);
    await fetchDecision(decisionId);
  },
  "mail.disconnect": async (payload, { job }) => {
    const { connectionId, keep } = jobs["mail.disconnect"].parse(payload);
    await disconnectMailbox(connectionId, { lastAttempt: job.attempts >= job.max_attempts, keep });
  },
  "calendar.sync": async (payload) => {
    const { connectionId, attempt } = jobs["calendar.sync"].parse(payload);
    await runCalendarSync(connectionId, attempt);
  },
    "mail.reconcile": async () => {
    await reconcile();
  },
  "mail.cleanup": async () => {
    await cleanup();
  },
};

export const taskList = Object.fromEntries(Object.entries(tasks).map(([name, task]) => [name, limited(task)])) as Record<JobName, Task>;
