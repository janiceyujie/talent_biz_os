// Pushing events to Google (decision 0009). Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { IcsEvent } from "../ics";
import { planSync, toGoogleEvent, type SyncedEvent } from "./plan";

const event = (over: Partial<IcsEvent> = {}): IcsEvent => ({
  id: "e1",
  title: "Blue Room 演出",
  date: "2026-11-14",
  time: "20:00",
  timeZone: "Asia/Taipei",
  end: null,
  location: null,
  description: null,
  updatedAt: new Date("2026-10-05T10:00:00Z"),
  ...over,
});

describe("toGoogleEvent", () => {
  test("a timed event keeps its wall time and zone; without an end it lasts an hour", () => {
    const g = toGoogleEvent(event());
    assert.deepEqual([g.start, g.end], [
      { dateTime: "2026-11-14T20:00:00", timeZone: "Asia/Taipei" },
      { dateTime: "2026-11-14T21:00:00", timeZone: "Asia/Taipei" },
    ]);
    assert.equal(g.extendedProperties.private.talentBizOsId, "e1");
  });
  test("an hour past 23:30 ends on the next day", () => {
    assert.deepEqual(toGoogleEvent(event({ time: "23:30" })).end, { dateTime: "2026-11-15T00:30:00", timeZone: "Asia/Taipei" });
  });
  test("an end in another zone (a flight) is kept as given", () => {
    const g = toGoogleEvent(event({ time: "09:00", end: { date: "2026-11-14", time: "13:30", timeZone: "Asia/Tokyo" } }));
    assert.deepEqual(g.end, { dateTime: "2026-11-14T13:30:00", timeZone: "Asia/Tokyo" });
  });
  test("no time is all day; empty description and location are left out", () => {
    const g = toGoogleEvent(event({ time: null }));
    assert.deepEqual([g.start, g.end], [{ date: "2026-11-14" }, { date: "2026-11-15" }]);
    assert.ok(!("description" in g) && !("location" in g));
  });
});

describe("planSync", () => {
  const synced = (over: Partial<SyncedEvent> = {}): SyncedEvent => ({
    id: "s1",
    eventId: "e1",
    externalEventId: "g1",
    syncedAt: new Date("2026-10-05T10:00:00Z"),
    ...over,
  });
  test("new events are created; unchanged ones left alone; changed ones updated", () => {
    const plan = planSync(
      [event(), event({ id: "e2" }), event({ id: "e3", updatedAt: new Date("2026-10-05T11:00:00Z") })],
      [synced(), synced({ id: "s3", eventId: "e3", externalEventId: "g3" })],
    );
    assert.deepEqual(plan.create.map((e) => e.id), ["e2"]);
    assert.deepEqual(plan.update.map((u) => u.event.id), ["e3"]);
    assert.deepEqual(plan.remove, []);
  });
  test("pushed events that no longer belong are removed: deleted (no event) or no longer listed (archived)", () => {
    const plan = planSync([], [synced(), synced({ id: "s2", eventId: null, externalEventId: "g2" })]);
    assert.deepEqual(plan.remove.map((s) => s.externalEventId), ["g1", "g2"]);
  });
});
