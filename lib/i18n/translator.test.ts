// Translations without a request (the worker's jobs). Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { translator } from "./translator";

test("fills plain placeholders, in the locale, with the app's fallback", async () => {
  const t = await translator("zh-TW", "googleCalendar");
  assert.ok(t("calendarName", { talent: "小明" }).includes("小明"));
  assert.equal(t("noSuchKey"), "googleCalendar.noSuchKey");
});

test("refuses plural or select, rather than formatting it wrong", async () => {
  const t = await translator("en", "inbox");
  assert.throws(() => t("listCount", { count: 2 }));
});
