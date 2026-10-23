// Job payloads. Run: npm test
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { describe, test } from "node:test";
import { z } from "zod";
import { analyzeJobKey, jobs } from "./jobs";

// Every payload shape that has shipped (jobs.ts, "A job's payload never changes").
// A new job is recorded with: UPDATE_JOB_PAYLOADS=1 npm test
const shippedFile = new URL("./payloads.json", import.meta.url);

describe("shipped job payloads", () => {
  const shipped = JSON.parse(readFileSync(shippedFile, "utf8")) as Record<string, unknown>;

  test("a job's payload keeps the shape it shipped with; a new shape is a new job name", () => {
    for (const [name, schema] of Object.entries(jobs)) {
      if (!(name in shipped)) continue; // new: the next test records it
      assert.deepEqual(
        z.toJSONSchema(schema),
        shipped[name],
        `${name}'s payload changed. During a deploy the previous worker would fail it: add a new job (${name}.v2) and keep this one until its jobs drain.`,
      );
    }
  });

  test("every job's shape is recorded before it ships", () => {
    const unrecorded = Object.keys(jobs).filter((name) => !(name in shipped));
    if (unrecorded.length && process.env.UPDATE_JOB_PAYLOADS === "1") {
      // Adds the new ones only; a recorded shape is never overwritten. Retired names stay, so they aren't reused.
      for (const name of unrecorded) shipped[name] = z.toJSONSchema(jobs[name as keyof typeof jobs]);
      writeFileSync(shippedFile, `${JSON.stringify(shipped, null, 2)}\n`);
      return;
    }
    assert.deepEqual(unrecorded, [], "New jobs: record their payloads with UPDATE_JOB_PAYLOADS=1 npm test, and commit payloads.json.");
  });
});

describe("job payloads", () => {
  const id = "3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90";

  test("an analysis job carries the message id and the output language", () => {
    assert.equal(jobs["message.analyze"].safeParse({ messageId: id, locale: "zh-TW" }).success, true);
    assert.equal(jobs["message.analyze"].safeParse({ messageId: "not-a-uuid", locale: "zh-TW" }).success, false);
    assert.equal(jobs["message.analyze"].safeParse({ messageId: id, locale: "fr" }).success, false);
  });

  test("a sync job carries only the connection id", () => {
    assert.equal(jobs["mail.sync"].safeParse({ connectionId: id }).success, true);
    assert.equal(jobs["mail.sync"].safeParse({ connectionId: id, subject: "Offer" }).success, false);
  });

  test("a relevance job carries only the decision id", () => {
    assert.equal(jobs["mail.relevance"].safeParse({ decisionId: id }).success, true);
    assert.equal(jobs["mail.relevance"].safeParse({ decisionId: id, snippet: "Booking" }).success, false);
  });

  test("a fetch job carries only the decision id", () => {
    assert.equal(jobs["mail.fetch"].safeParse({ decisionId: id }).success, true);
    assert.equal(jobs["mail.fetch"].safeParse({ decisionId: id, body: "Fee NT$12,000" }).success, false);
  });

  test("a disconnect job carries the connection id and what to keep, nothing else", () => {
    assert.deepEqual(jobs["mail.disconnect"].parse({ connectionId: id }), { connectionId: id, keep: "none" }); // queued before the choice existed
    assert.equal(jobs["mail.disconnect"].safeParse({ connectionId: id, keep: "filed" }).success, true);
    assert.equal(jobs["mail.disconnect"].safeParse({ connectionId: id, keep: "some" }).success, false);
  });

  test("a disconnect job carries only the connection id", () => {
    assert.equal(jobs["mail.disconnect"].safeParse({ connectionId: id }).success, true);
    assert.equal(jobs["mail.disconnect"].safeParse({ connectionId: id, token: "1//x" }).success, false);
  });

  test("nothing else rides along: payloads hold ids, never message content", () => {
    assert.equal(jobs["message.analyze"].safeParse({ messageId: id, locale: "en", body: "Fee NT$12,000" }).success, false);
  });

  test("a message has one analysis job key, so queueing it again replaces the waiting job", () => {
    assert.equal(analyzeJobKey(id), analyzeJobKey(id));
    assert.notEqual(analyzeJobKey(id), analyzeJobKey("9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"));
  });

  test("scheduled jobs take what the scheduler adds", () => {
    const cron = { _cron: { ts: "2026-10-18T00:00:00Z", backfilled: false } };
    assert.equal(jobs["mail.reconcile"].safeParse(cron).success, true);
    assert.equal(jobs["mail.cleanup"].safeParse(cron).success, true);
  });
});
