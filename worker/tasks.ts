import { processMailReview } from "@/lib/mail/jobs/review";
import { refreshGrantSources } from "@/lib/grants/sync";
import type { Task } from "graphile-worker";
import { analyzeMessage, markAnalysisFailed } from "@/lib/ai/analyze-message";
import { disconnectMailbox } from "@/lib/mail/jobs/disconnect";
import { scoreDecision } from "@/lib/mail/jobs/relevance";
import { syncMailbox } from "@/lib/mail/jobs/sync";
import { jobs, type JobName } from "@/lib/queue/jobs";

// One handler per job in lib/queue/jobs.ts. Each must be safe to run twice:
// a job can run again after a crash or a redeploy.

export const taskList: Record<JobName, Task> = {
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
  "mail.disconnect": async (payload, { job }) => {
    const { connectionId } = jobs["mail.disconnect"].parse(payload);
    await disconnectMailbox(connectionId, { lastAttempt: job.attempts >= job.max_attempts });
  },
};
