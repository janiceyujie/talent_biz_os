import { wallTimeToUtc } from "../domain/dates";
import type { GrantApplication } from "./types";

type Task = GrantApplication["tasks"][number];
const instant = (task: Task) => wallTimeToUtc(task.date!, task.time || "00:00", task.timeZone).getTime();

/** Prefer the earliest unfinished submission; retain the latest completed plan as history. */
export function grantSubmissionTask(tasks: readonly Task[]) {
  const submissions = tasks.filter(task => task.kind === "submission" && task.date && task.status !== "dismissed");
  return submissions.filter(task => task.status === "open").sort((a, b) => instant(a) - instant(b))[0]
    ?? submissions.filter(task => task.status === "done").sort((a, b) => instant(b) - instant(a))[0]
    ?? null;
}
