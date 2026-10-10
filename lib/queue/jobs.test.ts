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

  test("nothing else rides along: payloads hold ids, never message content", () => {
    assert.equal(jobs["message.analyze"].safeParse({ messageId: id, locale: "en", body: "Fee NT$12,000" }).success, false);
  });

  test("a message has one analysis job key, so queueing it again replaces the waiting job", () => {
    assert.equal(analyzeJobKey(id), analyzeJobKey(id));
    assert.notEqual(analyzeJobKey(id), analyzeJobKey("9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"));
  });
});
