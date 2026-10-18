// Job payloads. Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { analyzeJobKey, jobs } from "./jobs";

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
});


test("scheduled jobs accept Graphile cron metadata but reject application content", () => {
  for (const name of ["invoice.prepare", "grants.refresh"] as const) {
    assert.equal(jobs[name].safeParse({}).success, true);
    assert.equal(jobs[name].safeParse({_cron:{ts:"2026-10-17T02:40:00.000Z",backfilled:false}}).success, true);
    assert.equal(jobs[name].safeParse({_cron:{ts:"not-a-date",backfilled:false}}).success, false);
    assert.equal(jobs[name].safeParse({body:"A private email"}).success, false);
  }
});
