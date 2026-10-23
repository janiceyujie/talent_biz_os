import type { Job, WorkerEvents } from "graphile-worker";
import { log, type LogFields } from "@/lib/log";

// One line when each job starts and one when it ends (decision 0026), from
// Graphile's events, for both pools. A job's ids come from its payload
// (lib/queue/jobs.ts): connectionId becomes connection_id, and so on.
// lib/log drops anything that isn't an id.

const payloadIds: Record<string, keyof LogFields> = {
  messageId: "message_id",
  connectionId: "connection_id",
  decisionId: "decision_id",
  talentId: "talent_id",
};

export function jobFields(job: Pick<Job, "id" | "task_identifier" | "attempts" | "payload">): LogFields {
  const fields: Record<string, unknown> = { job: job.task_identifier, job_id: job.id, attempt: job.attempts };
  if (job.payload && typeof job.payload === "object")
    for (const [key, value] of Object.entries(job.payload)) if (payloadIds[key]) fields[payloadIds[key]] = value;
  return fields as LogFields;
}

export function logJobs(events: WorkerEvents) {
  const started = new Map<string, number>();
  const took = (job: Job) => Date.now() - (started.get(job.id) ?? Date.now());
  events.on("job:start", ({ job }) => {
    started.set(job.id, Date.now());
    log.info("job.started", jobFields(job));
  });
  events.on("job:success", ({ job }) => log.info("job.succeeded", { ...jobFields(job), duration_ms: took(job) }));
  // Graphile retries until max_attempts; the last failure is job.failed.
  events.on("job:error", ({ job, error }) => {
    if (job.attempts < job.max_attempts) log.warn("job.will_retry", { ...jobFields(job), duration_ms: took(job), error });
  });
  events.on("job:failed", ({ job, error }) => log.error("job.failed", { ...jobFields(job), duration_ms: took(job), error }));
  events.on("job:complete", ({ job }) => started.delete(job.id));
}
