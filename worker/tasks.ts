import type { Task } from "graphile-worker";
import { analyzeMessage, markAnalysisFailed } from "@/lib/ai/analyze-message";
import { jobs, type JobName } from "@/lib/queue/jobs";

// One handler per job in lib/queue/jobs.ts. Each must be safe to run twice:
// a job can run again after a crash or a redeploy.

export const taskList: Record<JobName, Task> = {
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
};
