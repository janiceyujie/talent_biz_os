// The order of a contact's projects on their card. Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ProjectSummary, Stage } from "@/lib/types";
import { orderContactProjects } from "./contact-projects";

const project = (id: string, stage: Stage, over: Partial<ProjectSummary> = {}): ProjectSummary => ({
  id,
  title: id,
  counterparty: "",
  counterpartyId: null,
  clientId: null,
  artist: "",
  type: "gig",
  stage,
  quotedAmount: null,
  currency: "TWD",
  taxRate: 5,
  taxIncluded: true,
  details: { fields: {}, dates: [] },
  nextAction: null,
  archived: false,
  updatedAt: "2026-10-01T00:00:00Z",
  ...over,
});
const due = (dueDate: string) => ({ nextAction: { id: "t", title: "t", dueDate } });
const order = (projects: ProjectSummary[], dates: Record<string, string[]> = {}) =>
  orderContactProjects(projects, (p) => dates[p.id] ?? [], "2026-10-07").map((c) => `${c.project.id}:${c.when}`);

describe("orderContactProjects", () => {
  test("ongoing come before finished, whatever was edited last", () => {
    assert.deepEqual(order([project("old-done", "closed"), project("live", "negotiating")]), ["live:", "old-done:2026-10-01"]);
  });

  test("ongoing go by what comes next: a due to-do (overdue first), else the next date, undated last", () => {
    const projects = [
      project("undated", "signed"),
      project("dated", "in_progress"),
      project("overdue", "negotiating", due("2026-10-01")),
      project("soon", "in_progress", due("2026-10-09")),
    ];
    assert.deepEqual(order(projects, { dated: ["2026-09-01", "2026-10-20"] }), [
      "overdue:2026-10-01",
      "soon:2026-10-09",
      "dated:2026-10-20",
      "undated:",
    ]);
  });

  test("finished go by when they happened, newest first, not by when they were last edited", () => {
    const projects = [
      project("edited-yesterday", "closed", { updatedAt: "2026-10-06T00:00:00Z" }),
      project("last-year", "closed", { updatedAt: "2026-01-01T00:00:00Z" }),
    ];
    assert.deepEqual(order(projects, { "edited-yesterday": ["2023-05-01"], "last-year": ["2025-12-01"] }), [
      "last-year:2025-12-01",
      "edited-yesterday:2023-05-01",
    ]);
  });

  test("a finished project with no dates falls back to when it was last edited", () => {
    assert.deepEqual(order([project("declined", "declined", { updatedAt: "2024-03-02T10:00:00Z" })]), ["declined:2024-03-02"]);
  });
});
