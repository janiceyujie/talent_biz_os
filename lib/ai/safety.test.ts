// Deterministic date checks around the analysis. Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { relativeWeekday } from "./safety";

describe("relative weekdays, counted in code", () => {
  const saturday = "2026-10-03"; // weeks start on Monday: this week is 9/28–10/4
  test("next week's Monday from a Saturday is two days later, not nine", () => {
    assert.equal(relativeWeekday("下週一前", saturday), "2026-10-05");
    assert.equal(relativeWeekday("下禮拜一", saturday), "2026-10-05");
    assert.equal(relativeWeekday("下個星期天", saturday), "2026-10-11");
  });
  test("this week's, and the week after next", () => {
    assert.equal(relativeWeekday("這週五", saturday), "2026-10-02"); // already past: still this week's
    assert.equal(relativeWeekday("本週日", saturday), "2026-10-04");
    assert.equal(relativeWeekday("下下週三", saturday), "2026-10-14");
  });
  test("from a Monday", () => {
    assert.equal(relativeWeekday("下週一", "2026-10-05"), "2026-10-12");
    assert.equal(relativeWeekday("這週一", "2026-10-05"), "2026-10-05");
  });
  test("a date stated outright, or no such phrase, stays with the model", () => {
    assert.equal(relativeWeekday("下週一（10/12）", saturday), null);
    assert.equal(relativeWeekday("週五前", saturday), null);
    assert.equal(relativeWeekday("next Monday", saturday), null);
    assert.equal(relativeWeekday("", saturday), null);
  });
});
