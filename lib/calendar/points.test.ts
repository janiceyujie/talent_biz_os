// The month view's markers. Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ExternalEvent } from "@/lib/types";
import { externalPoints } from "./points";

const google = (over: Partial<ExternalEvent> = {}): ExternalEvent => ({
  id: "g1",
  calendar: "Personal",
  color: null,
  title: "Dentist",
  date: "2026-10-30",
  time: "09:00",
  endDate: "2026-10-30",
  endTime: "10:00",
  timeZone: "Asia/Taipei",
  location: "",
  link: "",
  ...over,
});

describe("externalPoints", () => {
  test("a timed event sits on its start date", () => {
    assert.deepEqual(
      externalPoints([google({ endDate: "2026-10-31", endTime: "01:00" })]).map((p) => p.date),
      ["2026-10-30"],
    );
  });

  test("an all-day event covers each day, across a month end", () => {
    assert.deepEqual(
      externalPoints([google({ time: "", endTime: "", endDate: "2026-11-01" })]).map((p) => [p.date, p.key]),
      [
        ["2026-10-30", "g1:2026-10-30"],
        ["2026-10-31", "g1:2026-10-31"],
        ["2026-11-01", "g1:2026-11-01"],
      ],
    );
  });

  test("a very long all-day event is capped", () => {
    assert.equal(externalPoints([google({ time: "", endTime: "", endDate: "2027-06-01" })]).length, 31);
  });
});
