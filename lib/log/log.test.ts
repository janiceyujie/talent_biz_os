// Structured logs and their allowlist (decision 0026). Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { errorFields, logLine, type LogFields } from ".";

const base = { ts: "2026-10-23T00:00:00.000Z", service: "worker" as const, env: "production", release: "abc123def456" };
const TALENT = "6f1c2b8e-4d7a-4b1e-9a3c-2f5e8d7b6a10";

// Made-up content, standing in for a customer's message.
const SUBJECT = "Brand deal for Mei Lin, NT$80,000";
const EMAIL = "mei.lin@example.com";

describe("logLine", () => {
  test("every line has the base fields and the event", () => {
    assert.deepEqual(logLine("info", "mail.sync.done", {}, base), { ...base, level: "info", event: "mail.sync.done" });
  });

  test("ids, codes, and numbers are written as given", () => {
    const line = logLine("error", "mail.sync.failed", { talent_id: TALENT, job_id: "123", job: "mail.sync", route: "/api/inbox/[id]", attempt: 2, duration_ms: 812 }, base);
    assert.equal(line.talent_id, TALENT);
    assert.equal(line.job_id, "123");
    assert.equal(line.job, "mail.sync");
    assert.equal(line.route, "/api/inbox/[id]");
    assert.equal(line.attempt, 2);
    assert.equal(line.duration_ms, 812);
  });

  test("a null id stays null: an account that doesn't exist", () => {
    assert.equal(logLine("warn", "auth.sign_in.failed", { person_id: null }, base).person_id, null);
  });

  test("content put in an id or code field is replaced, not written", () => {
    const line = logLine("error", "mail.sync.failed", { talent_id: EMAIL, reason: SUBJECT, provider: "https://example.com/?code=secret" }, base);
    assert.equal(line.talent_id, "[invalid]");
    assert.equal(line.reason, "[invalid]");
    assert.equal(line.provider, "[invalid]");
  });

  test("a field outside the allowlist is dropped, even forced past the types", () => {
    const line = logLine("info", "mail.sync.done", { subject: SUBJECT, from: EMAIL } as unknown as LogFields, base);
    assert.equal("subject" in line, false);
    assert.equal("from" in line, false);
  });

  test("a non-number in a number field is replaced", () => {
    assert.equal(logLine("info", "a.b", { count: Number.NaN }, base).count, "[invalid]");
    assert.equal(logLine("info", "a.b", { count: "12" } as unknown as LogFields, base).count, "[invalid]");
  });

  test("an event that isn't <area>.<what> is replaced", () => {
    assert.equal(logLine("info", "mail sync failed for mei.lin@example.com", {}, base).event, "[invalid]");
    assert.equal(logLine("info", "sync", {}, base).event, "[invalid]");
  });

  test("an error built from a message keeps none of its text", () => {
    class GmailError extends Error {
      status = 429;
      reason = "rateLimitExceeded";
    }
    const e = new GmailError(`Could not file "${SUBJECT}" from ${EMAIL}`);
    const json = JSON.stringify(logLine("error", "mail.sync.failed", { talent_id: TALENT, error: e }, base));
    assert.ok(!json.includes("Mei Lin"), json);
    assert.ok(!json.includes(EMAIL), json);
    assert.ok(!json.includes("stack"), json);
    assert.deepEqual(JSON.parse(json).error, { name: "GmailError", code: "rateLimitExceeded", status: 429 });
  });
});

describe("errorFields", () => {
  test("name, code, and status; never the message", () => {
    const e = Object.assign(new Error(`relation for ${EMAIL}`), { code: "57P01" });
    assert.deepEqual(errorFields(e), { name: "Error", code: "57P01" });
  });

  test("a subclass that doesn't set its name is named by its class", () => {
    class ModelError extends Error {
      code = "timeout";
    }
    assert.deepEqual(errorFields(new ModelError(SUBJECT)), { name: "ModelError", code: "timeout" });
  });

  test("a code that carries content is replaced", () => {
    assert.equal(errorFields({ name: "Error", code: SUBJECT }).code, "[invalid]");
  });

  test("a numeric code and a statusCode are kept as numbers", () => {
    assert.deepEqual(errorFields({ name: "HttpError", code: 3, statusCode: 503 }), { name: "HttpError", code: 3, status: 503 });
  });

  test("a thrown non-object is only its type", () => {
    assert.deepEqual(errorFields(`failed: ${SUBJECT}`), { name: "string" });
    assert.deepEqual(errorFields(undefined), { name: "undefined" });
  });
});
