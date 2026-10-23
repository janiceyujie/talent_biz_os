// What the Support page reads and links to (decision 0026). Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableName, type Column } from "drizzle-orm";
import { failureCodes } from "@/lib/ai/errors";
import { aiCallStatuses, calendarConnectionStatuses, mailConnectionStatuses, mailDecisionDeciders, mailDecisionOutcomes, membershipRoles, membershipStatuses, messageChannels, messageDirections, messageKinds, messageRelevance, messageStatuses, verticals } from "@/lib/db/schema";
import { historyModes } from "@/lib/mail/history";
import { mailKinds } from "@/lib/mail/relevance/prompt";
import { jobs } from "@/lib/queue/jobs";
import en from "@/messages/support/en.json";
import zh from "@/messages/support/zh-TW.json";
import * as columns from "./columns";
import { codeIn, errorCodeQuery, renderLogs, sentryIssues } from "./links";

/** Each read's columns as table.column, the way the database names them (lib/db maps camelCase to snake_case). */
const snake = (name: string) => name.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
const read = Object.fromEntries(
  Object.entries(columns)
    .filter(([name]) => name.endsWith("Columns") && name !== "failedJobColumns")
    .map(([name, set]) => [name, Object.values(set as Record<string, Column>).map((c) => `${getTableName(c.table)}.${snake(c.name)}`).sort()]),
);

describe("the Support page's reads", () => {
  test("take only the columns approved here: a new one fails until it's added on purpose", () => {
    assert.deepEqual(read, {
      aiCallColumns: ["ai_call.created_at", "ai_call.failure_code", "ai_call.flags", "ai_call.id", "ai_call.latency_ms", "ai_call.message_id", "ai_call.model", "ai_call.provider", "ai_call.status", "ai_call.task"],
      auditColumns: ["audit_log.action", "audit_log.actor_person_id", "audit_log.created_at", "audit_log.id", "audit_log.target_id", "audit_log.target_type"],
      calendarConnectionColumns: ["calendar_connection.created_at", "calendar_connection.id", "calendar_connection.last_error", "calendar_connection.last_synced_at", "calendar_connection.status", "calendar_connection.talent_id"],
      mailConnectionColumns: [
        "mail_connection.account_email",
        "mail_connection.created_at",
        "mail_connection.failure",
        "mail_connection.history_done_at",
        "mail_connection.history_mode",
        "mail_connection.id",
        "mail_connection.last_synced_at",
        "mail_connection.status",
        "mail_connection.sync_requested_at",
        "mail_connection.talent_id",
        "mail_connection.watch_expires_at",
      ],
      mailDecisionColumns: ["mail_decision.connection_id", "mail_decision.decided_by", "mail_decision.fetch_failure", "mail_decision.id", "mail_decision.kind", "mail_decision.message_id", "mail_decision.outcome", "mail_decision.received_at", "mail_decision.score"],
      messageColumns: ["message.channel", "message.direction", "message.failure", "message.id", "message.kind", "message.project_id", "message.received_at", "message.relevance", "message.status"],
      personColumns: ["person.created_at", "person.display_name", "person.email", "person.id", "person.locale"],
      workspaceColumns: ["membership.created_at", "membership.role", "membership.status", "talent.id", "talent.name", "talent.vertical"],
    });
  });

  test("never a column that holds mail, free text, or a secret", () => {
    const forbidden = /\.(sender|recipients|subject|body_text|skipped_attachments|notice|references|in_reply_to|details|refresh_token_\w+|data_key_wrapped|scopes)$/;
    for (const [name, cols] of Object.entries(read)) for (const c of cols) assert.ok(!forbidden.test(c), `${name} reads ${c}`);
    const jobColumns = Object.entries(columns.failedJobColumns).flat().join(" ");
    assert.ok(!jobColumns.includes("last_error"), "a job's error text can quote content");
  });
});

describe("links", () => {
  test("the code is found in the whole line from someone's screen", () => {
    assert.equal(codeIn("Error code: 4204811731. If this keeps happening, send us this code."), "4204811731");
    assert.equal(codeIn("錯誤代碼：4204811731。如果一直發生，請把這個代碼告訴我們。"), "4204811731");
    assert.equal(codeIn("3182006865@E394"), "3182006865@E394");
    assert.equal(codeIn("error code 1a2b3c4d"), "1a2b3c4d");
    assert.equal(codeIn("it broke"), null);
  });

  test("Sentry is searched by the tag the code was given", () => {
    assert.equal(errorCodeQuery("4204811731"), "digest:4204811731");
    assert.equal(errorCodeQuery("3182006865@E394"), "digest:3182006865@E394");
    assert.equal(errorCodeQuery("1a2b3c4d"), "error_code:1a2b3c4d");
  });

  test("addresses", () => {
    assert.equal(sentryIssues("taloox", "digest:42"), "https://taloox.sentry.io/issues/?query=digest%3A42&statsPeriod=30d");
    assert.equal(renderLogs("web", "srv-abc"), "https://dashboard.render.com/web/srv-abc/logs");
  });
});

/** Every .ts and .tsx file under a folder, tests left out. */
const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(join(dir, e.name)) : /\.tsx?$/.test(e.name) && !e.name.endsWith(".test.ts") ? [join(dir, e.name)] : [],
  );

/** What the code writes to audit_log: each `action:` and `targetType:` given as text, and the calendar read-back's actions. */
function auditValues() {
  const actions = new Set<string>();
  const targets = new Set<string>();
  for (const file of [...sources("lib"), ...sources("app")]) {
    const text = readFileSync(file, "utf8");
    if (!text.includes("auditLog")) continue;
    for (const m of text.matchAll(/action: "([a-z_]+(?:\.[a-z_]+)+)"/g)) actions.add(m[1]);
    for (const m of text.matchAll(/record\(tx, \w+, "([a-z_]+(?:\.[a-z_]+)+)"/g)) actions.add(m[1]);
    for (const m of text.matchAll(/targetType: "([a-z_]+)"/g)) targets.add(m[1]);
  }
  // Given as a variable: deleting from the calendar records `targetType: source` (lib/actions/calendar.ts).
  for (const t of ["event", "todo"]) targets.add(t);
  return { actions, targets };
}

describe("the Support page's words", () => {
  // A value without words shows as its code: legible to whoever wrote it, not to support.
  const groups: Record<string, readonly string[]> = {
    action: [...auditValues().actions],
    target: [...auditValues().targets],
    task: ["extract", "relevance", "payment_notice", "assistant", "opportunity", "eval"], // lib/ai/model.ts, ModelRequest's trace
    aiStatus: aiCallStatuses,
    failure: failureCodes,
    outcome: mailDecisionOutcomes,
    decider: mailDecisionDeciders,
    kind: mailKinds,
    channel: messageChannels,
    messageKind: messageKinds,
    direction: messageDirections,
    messageStatus: messageStatuses,
    relevance: messageRelevance,
    job: Object.keys(jobs),
    connection: [...mailConnectionStatuses, ...calendarConnectionStatuses],
    history: historyModes,
    role: membershipRoles,
    membership: membershipStatuses,
    vertical: verticals,
  };

  test("the code's audit actions are all found: a change in how they're written would hide new ones", () => {
    const { actions } = auditValues();
    for (const a of ["project.created", "calendar.deleted", "calendar_event.added_in_google", "opportunity.followed"]) assert.ok(actions.has(a), a);
  });

  for (const [group, values] of Object.entries(groups))
    test(`every ${group} has words in both languages`, () => {
      for (const value of values) {
        const key = value.replace(/\./g, "_");
        for (const [name, catalog] of [["en", en], ["zh-TW", zh]] as const)
          assert.ok((catalog.support.values as Record<string, Record<string, string>>)[group]?.[key], `${name}: values.${group}.${key}`);
      }
    });
});
