// Reading Google back (docs/design/calendar-two-way.md). Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { needsWindowRead, WINDOW_READ_EVERY_MS } from "./read-plan";

describe("needsWindowRead", () => {
  const now = Date.parse("2026-12-01T00:00:00Z");
  const ago = (ms: number) => new Date(now - ms);

  test("a change, or never read: read", () => {
    assert.equal(needsWindowRead({ changed: true, lastImportedAt: ago(60_000), now }), true);
    assert.equal(needsWindowRead({ changed: false, lastImportedAt: null, now }), true);
  });

  test("no change: only once a day, as the window moves on", () => {
    assert.equal(needsWindowRead({ changed: false, lastImportedAt: ago(WINDOW_READ_EVERY_MS - 1), now }), false);
    assert.equal(needsWindowRead({ changed: false, lastImportedAt: ago(WINDOW_READ_EVERY_MS), now }), true);
  });
});
