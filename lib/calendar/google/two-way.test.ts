// Two-way Google Calendar's pure parts (docs/design/calendar-two-way.md). Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { IcsEvent } from "@/lib/calendar/ics";
import { changedHere, fieldsOfOurs, fieldsOfTheirs, googleDescription, keysFor, mergeFields, notesFrom, suggestProject, type SyncFields } from "./two-way";

const markers = ["── Notes (synced with Talent Biz OS) ──", "── 備註（與 Talent Biz OS 同步）──"];
const fields = (over: Partial<SyncFields> = {}): SyncFields => ({
  title: "Show",
  date: "2026-12-13",
  time: "19:30",
  timeZone: "Asia/Taipei",
  end: null,
  location: "Main stage",
  notes: null,
  ...over,
});
const keys = keysFor("performance");

describe("mergeFields", () => {
  const base = fields();
  test("same on both sides: nothing", () => {
    assert.deepEqual(mergeFields(keys, base, base, base, true), {});
  });
  test("changed only here: nothing applied (it's pushed)", () => {
    assert.deepEqual(mergeFields(keys, base, fields({ time: "20:00" }), base, true), {});
  });
  test("changed only in Google: applied here", () => {
    assert.deepEqual(mergeFields(keys, base, base, fields({ time: "20:00" }), false), { time: "20:00" });
  });
  test("changed on both, to the same value: nothing to do", () => {
    assert.deepEqual(mergeFields(keys, base, fields({ time: "20:00" }), fields({ time: "20:00" }), true), {});
  });
  test("changed on both, differently: the newer wins", () => {
    assert.deepEqual(mergeFields(keys, base, fields({ time: "20:00" }), fields({ time: "21:00" }), true), { time: "21:00" });
    assert.deepEqual(mergeFields(keys, base, fields({ time: "20:00" }), fields({ time: "21:00" }), false), {});
  });
  test("different fields on each side: both survive", () => {
    const ours = fields({ location: "Indoor stage" });
    const theirs = fields({ time: "20:00" });
    const apply = mergeFields(keys, base, ours, theirs, false);
    assert.deepEqual(apply, { time: "20:00" });
    assert.equal(changedHere(keys, base, ours, apply), true); // the location still goes to Google
  });
  test("a field Google didn't give (notes line deleted) isn't merged", () => {
    const theirs: Partial<SyncFields> = fields({ notes: "x" });
    delete theirs.notes;
    assert.deepEqual(mergeFields(keys, fields({ notes: "keep" }), fields({ notes: "keep" }), theirs, true), {});
  });
  test("travel: the location and the end stay ours", () => {
    const t = keysFor("travel");
    assert.deepEqual(mergeFields(t, base, base, fields({ location: "Elsewhere", end: { date: "2026-12-13", time: "23:00" } }), true), {});
  });
});

describe("fieldsOfTheirs", () => {
  test("a timed event in its own zone; an hour long is no end recorded", () => {
    const f = fieldsOfTheirs(
      { id: "g", summary: "Show", start: { dateTime: "2026-12-13T19:30:00+08:00", timeZone: "Asia/Taipei" }, end: { dateTime: "2026-12-13T20:30:00+08:00", timeZone: "Asia/Taipei" } },
      "Asia/Taipei",
      markers,
    );
    assert.deepEqual(f, { title: "Show", date: "2026-12-13", time: "19:30", timeZone: "Asia/Taipei", end: null, location: null });
  });
  test("a longer one keeps its end", () => {
    const f = fieldsOfTheirs({ id: "g", summary: "Show", start: { dateTime: "2026-12-13T19:30:00+08:00" }, end: { dateTime: "2026-12-13T21:00:00+08:00" } }, "Asia/Taipei", markers);
    assert.deepEqual(f?.end, { date: "2026-12-13", time: "21:00" });
  });
  test("only an offset: read in the event's own zone", () => {
    const f = fieldsOfTheirs({ id: "g", summary: "Call", start: { dateTime: "2026-12-13T11:30:00Z" } }, "Asia/Taipei", markers);
    assert.equal(f?.time, "19:30");
    assert.equal(f?.timeZone, "Asia/Taipei");
  });
  test("no offset: already wall time in the zone Google names, whatever zone the machine is in", () => {
    const f = fieldsOfTheirs({ id: "g", summary: "Show", start: { dateTime: "2026-12-13T20:00:00", timeZone: "Asia/Tokyo" }, end: { dateTime: "2026-12-13T22:00:00", timeZone: "Asia/Tokyo" } }, "Asia/Taipei", markers);
    assert.deepEqual([f?.time, f?.timeZone, f?.end], ["20:00", "Asia/Tokyo", { date: "2026-12-13", time: "22:00" }]);
  });
  test("all day: no time", () => {
    const f = fieldsOfTheirs({ id: "g", summary: "Day off", start: { date: "2026-12-14" }, end: { date: "2026-12-15" } }, "Asia/Taipei", markers);
    assert.equal(f?.time, null);
    assert.equal(f?.date, "2026-12-14");
  });
  test("notes come from under the line, in either language; no line, no notes taken", () => {
    const desc = (m: string) => `Project: X\n${m}\nBring the in-ear monitors`;
    for (const m of markers) assert.equal(fieldsOfTheirs({ id: "g", summary: "S", start: { date: "2026-12-14" }, description: desc(m) }, "Asia/Taipei", markers)?.notes, "Bring the in-ear monitors");
    assert.equal("notes" in fieldsOfTheirs({ id: "g", summary: "S", start: { date: "2026-12-14" }, description: "Project: X" }, "Asia/Taipei", markers)!, false);
  });
  test("an emptied title isn't taken; no start, nothing", () => {
    assert.equal("title" in fieldsOfTheirs({ id: "g", summary: "", start: { date: "2026-12-14" } }, "Asia/Taipei", markers)!, false);
    assert.equal(fieldsOfTheirs({ id: "g", summary: "x" }, "Asia/Taipei", markers), null);
  });
});

describe("the description's notes line", () => {
  test("written with our lines above and the notes below, and read back", () => {
    const d = googleDescription(["Project: X", "Taipei → Tokyo · BR198"], "Bring it", markers[1]);
    assert.equal(d, `Project: X\nTaipei → Tokyo · BR198\n${markers[1]}\nBring it`);
    assert.equal(notesFrom(d, markers), "Bring it");
  });
  test("no notes: the line is still there, to write under", () => {
    assert.equal(googleDescription([], null, markers[0]), markers[0]);
    assert.equal(notesFrom(markers[0], markers), null);
  });
});

describe("fieldsOfOurs", () => {
  const ics = (over: Partial<IcsEvent> = {}): IcsEvent => ({ id: "e", title: "Show", date: "2026-12-13", time: "19:30", timeZone: "Asia/Taipei", updatedAt: new Date(), ...over });
  test("an ordinary event shares its end and location", () => {
    const f = fieldsOfOurs(ics({ kind: "performance", end: { date: "2026-12-13", time: "21:00", timeZone: "Asia/Taipei" }, location: "Main stage", notes: "n" }));
    assert.deepEqual(f, { title: "Show", date: "2026-12-13", time: "19:30", timeZone: "Asia/Taipei", end: { date: "2026-12-13", time: "21:00" }, location: "Main stage", notes: "n" });
  });
  test("travel keeps its composed location and arrival out of it", () => {
    const f = fieldsOfOurs(ics({ kind: "travel", end: { date: "2026-12-13", time: "23:00", timeZone: "Asia/Tokyo" }, location: "Taipei → Tokyo" }));
    assert.equal(f.end, null);
    assert.equal(f.location, null);
  });
});

describe("suggestProject", () => {
  const projects = [
    { id: "brightfern", names: ["Brightfern autumn campaign", "Brightfern"], emails: ["mei@brightfern.com"] },
    { id: "haoshi", names: ["Haoshi Winter Festival", "Haoshi"], emails: ["ya@haoshi.tw"] },
  ];
  test("an invited contact decides it", () => {
    assert.equal(suggestProject({ title: "Shoot", attendees: ["Mei@Brightfern.com"] }, projects), "brightfern");
  });
  test("then a name in the title", () => {
    assert.equal(suggestProject({ title: "Haoshi rehearsal" }, projects), "haoshi");
  });
  test("unclear: nothing", () => {
    assert.equal(suggestProject({ title: "Brightfern × Haoshi dinner" }, projects), null);
    assert.equal(suggestProject({ title: "Dentist" }, projects), null);
  });
});
