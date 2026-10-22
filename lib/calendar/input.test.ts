// Dates and times as people type them. Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { addDateDays, addDateMonths, parseDateInput, parseTimeInput } from "./input";

describe("parseDateInput", () => {
  test("year first, with or without separators, in full-width digits too", () => {
    for (const text of ["20261012", "2026/10/12", "2026-10-12", "2026.10.12", "２０２６１０１２"]) assert.equal(parseDateInput(text), "2026-10-12");
    assert.equal(parseDateInput("2024/2/29"), "2024-02-29");
  });
  test("impossible dates, and day-first or month-first orders, are refused rather than guessed", () => {
    for (const text of ["2026/2/29", "2026/13/1", "2026/4/31", "2026/0/1", "2026/1/0", "202610", "10/12/2026"]) assert.equal(parseDateInput(text), null, text);
  });
  test("blank is empty, not invalid", () => assert.equal(parseDateInput("  "), ""));
});

describe("parseTimeInput", () => {
  test("shorthand, any minute, and am/pm", () => {
    const cases = [["9", "09:00"], ["930", "09:30"], ["0947", "09:47"], ["1530", "15:30"], ["9:3", "09:03"], ["３３０pm", "15:30"], ["12am", "00:00"], ["12:30 PM", "12:30"], ["2359", "23:59"]];
    for (const [text, want] of cases) assert.equal(parseTimeInput(text), want, text);
  });
  test("past midnight, past the hour, or a 13 o'clock pm are refused", () => {
    for (const text of ["2400", "2360", "13pm", "0am", "99999", "9.5", "-100"]) assert.equal(parseTimeInput(text), null, text);
  });
});

describe("date arithmetic", () => {
  test("crosses months and years, and a longer month's last day becomes a shorter one's", () => {
    assert.equal(addDateDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDateDays("2024-03-01", -1), "2024-02-29");
    assert.equal(addDateMonths("2026-01-31", 1), "2026-02-28");
    assert.equal(addDateMonths("2024-01-31", 1), "2024-02-29");
    assert.equal(addDateMonths("2026-12-31", 1), "2027-01-31");
  });
});
