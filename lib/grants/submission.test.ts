import assert from "node:assert/strict";
import { test } from "node:test";
import { grantSubmissionTask } from "./submission";
import type { GrantApplication } from "./types";
const task = (id: string, values: Partial<GrantApplication["tasks"][number]> = {}): GrantApplication["tasks"][number] => ({
  id, kind: "submission", title: "Submit application", date: "2026-10-19", time: "23:00", timeZone: "Asia/Taipei", status: "open", ...values,
});
test("submission summary ignores unrelated deadlines and dismissed plans, without altering task order", () => {
  const tasks = [task("report", {kind: "report", date: "2026-10-12"}), task("dismissed", {status: "dismissed"}), task("undated", {date: null}), task("submission")];
  const before = JSON.stringify(tasks);
  assert.equal(grantSubmissionTask(tasks)?.id, "submission");
  assert.equal(JSON.stringify(tasks), before);
  assert.equal(grantSubmissionTask(tasks.slice(0, 3)), null);
});
test("unfinished submissions take priority, even overdue, and are ordered across time zones", () => {
  const tasks = [task("done", {date: "2026-10-01", status: "done"}), task("later", {time: "10:00", timeZone: "America/New_York"}), task("earlier", {time: "20:00"})];
  assert.equal(grantSubmissionTask(tasks)?.id, "earlier");
});
test("all completed submissions retain the latest planned date and reopening restores the unfinished plan", () => {
  const early = task("early", {date: "2026-10-18", status: "done", time: ""});
  const late = task("late", {status: "done"});
  assert.equal(grantSubmissionTask([early, late])?.id, "late");
  assert.equal(grantSubmissionTask([{...early, status: "open"}, late])?.id, "early");
  assert.equal(grantSubmissionTask([]), null);
});
