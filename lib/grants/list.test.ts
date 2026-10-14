import assert from "node:assert/strict";
import { test } from "node:test";
import { addDateDays } from "../calendar/input";
import { dateInZone } from "../domain/dates";
import { filterGrantOpportunities } from "./list";
import type { GrantOpportunity } from "./types";
const today = dateInZone("Asia/Taipei");
const listing = (id: string, values: Partial<GrantOpportunity> = {}): GrantOpportunity => ({
  id, source: "moc", externalId: id, region: "TW", title: id, agency: "Arts Council", url: "https://grants.moc.gov.tw/", summary: "",
  sourceStatus: "posted", opensOn: addDateDays(today, -2), closesOn: addDateDays(today, 10), checkedAt: new Date().toISOString(), changedAt: new Date().toISOString(), ...values,
});
const options = {region: "all", query: "", availability: "active" as const, timeZone: "Asia/Taipei"};
test("grant discovery hides passed deadlines and orders open, upcoming and unconfirmed without changing source records", () => {
  const rows = [listing("closed", {closesOn: addDateDays(today, -1)}), listing("check", {opensOn: null}), listing("upcoming", {opensOn: addDateDays(today, 2), closesOn: null}), listing("open-later"), listing("open-sooner", {closesOn: today})];
  const original = JSON.stringify(rows);
  assert.deepEqual(filterGrantOpportunities(rows, options).map(g => g.id), ["open-sooner", "open-later", "upcoming", "check"]);
  assert.equal(JSON.stringify(rows), original);
});
test("unknown or stale announcements are not filtered as verified open", () => {
  const rows = [listing("missing", {opensOn: null}), listing("stale", {checkedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()}), listing("open")];
  assert.deepEqual(filterGrantOpportunities(rows, {...options, availability: "open"}).map(g => g.id), ["open"]);
  assert.deepEqual(filterGrantOpportunities(rows, {...options, availability: "check"}).map(g => g.id), ["missing", "stale"]);
});
test("saved application history includes passed deadlines but excludes other applications", () => {
  const rows = [listing("old", {closesOn: addDateDays(today, -1)}), listing("unrelated")];
  assert.deepEqual(filterGrantOpportunities(rows, {...options, availability: "all", savedIds: ["old"]}).map(g => g.id), ["old"]);
  assert.equal(filterGrantOpportunities(rows, {...options, savedIds: []}).length, 0);
});
test("grant search supports Chinese, full-width input, agency names and source filters", () => {
  const rows = [listing("tw", {title: "音樂創作 ABC"}), listing("us", {source: "grants_gov", region: "US", title: "Creative ABC"})];
  assert.deepEqual(filterGrantOpportunities(rows, {...options, query: "ＡＢＣ", region: "TW"}).map(g => g.id), ["tw"]);
  assert.deepEqual(filterGrantOpportunities(rows, {...options, query: "音樂"}).map(g => g.id), ["tw"]);
  assert.equal(filterGrantOpportunities(rows, {...options, query: "arts council"}).length, 2);
});
