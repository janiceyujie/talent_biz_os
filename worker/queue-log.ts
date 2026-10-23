import { Logger } from "graphile-worker";
import { log } from "@/lib/log";
import { jobFields } from "./job-log";

// Graphile Worker's own messages, through lib/log. They're free text, and a
// failed job's includes the error's message and stack, which can echo content,
// so only the error's name and code are kept (decision 0026).
export const queueLogger = new Logger(() => (level, _message, meta) => {
  if (meta.failure) return; // a failed job: ./job-log.ts logs it from Graphile's events
  const job = meta.job as Parameters<typeof jobFields>[0] | undefined;
  const fields = { ...(job && jobFields(job)), error: meta.error ?? meta.fatalError };
  if (level === "error") log.error("queue.error", fields);
  else if (level === "warning") log.warn("queue.warning", fields);
  // info and debug are Graphile's progress messages: not kept.
});
