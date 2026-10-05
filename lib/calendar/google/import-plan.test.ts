// Reading Google events (decision 0009, phase 2). Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { fromGoogleEvent } from "./import-plan";

test("a timed event keeps the wall time of the zone it was made in", () => {
  const e = fromGoogleEvent(
    { id: "a", summary: "牙醫", start: { dateTime: "2026-10-07T10:00:00+09:00", timeZone: "Asia/Tokyo" }, end: { dateTime: "2026-10-07T11:00:00+09:00", timeZone: "Asia/Tokyo" } },
    "Asia/Taipei",
  );
  assert.deepEqual([e?.startDate, e?.startTime, e?.endTime, e?.timeZone], ["2026-10-07", "10:00", "11:00", "Asia/Tokyo"]);
});

test("without its own zone, a timed event takes its calendar's", () => {
  const e = fromGoogleEvent({ id: "b", start: { dateTime: "2026-10-07T02:00:00Z" }, end: { dateTime: "2026-10-07T03:30:00Z" } }, "Asia/Taipei");
  assert.deepEqual([e?.startTime, e?.endTime, e?.timeZone, e?.title], ["10:00", "11:30", "Asia/Taipei", ""]);
});

test("all-day: one day has no end; several days end on the last day covered", () => {
  const one = fromGoogleEvent({ id: "c", start: { date: "2026-10-10" }, end: { date: "2026-10-11" } }, "Asia/Taipei");
  assert.deepEqual([one?.startTime, one?.endDate], [null, null]);
  const trip = fromGoogleEvent({ id: "d", start: { date: "2026-10-10" }, end: { date: "2026-10-13" } }, "Asia/Taipei");
  assert.equal(trip?.endDate, "2026-10-12");
});

test("cancelled events, and ones without a start, are skipped", () => {
  assert.equal(fromGoogleEvent({ id: "e", status: "cancelled", start: { date: "2026-10-10" } }, "UTC"), null);
  assert.equal(fromGoogleEvent({ id: "f" }, "UTC"), null);
});
