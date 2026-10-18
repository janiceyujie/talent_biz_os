// What an analysis says about an email brought in from Gmail (decision 0013). Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { notWork, proposesNothing } from "./analysis";

const nothing = { intent: "other" as const, dates: [], money: { amount: null, currency: "", taxIncluded: null, asStated: "" }, paymentTerms: "", details: {}, asks: [], flags: [] };
const open = { negotiating: true };
const signed = { negotiating: false };
const detail = { venue: { value: "Blue Room", asStated: "Blue Room" } };

describe("notWork", () => {
  test("nothing to act on is not work", () => assert.ok(notWork(nothing)));
  test("a detail alone keeps it", () => assert.ok(!notWork({ ...nothing, details: detail })));
});

describe("proposesNothing", () => {
  test("a thank-you or holding reply proposes nothing", () => {
    assert.ok(proposesNothing(nothing, open));
    assert.ok(proposesNothing({ ...nothing, intent: "logistics" }, open));
  });
  test("a fee, a date, a detail, or an acceptance proposes something", () => {
    assert.ok(!proposesNothing({ ...nothing, money: { ...nothing.money, amount: 60000 } }, open));
    assert.ok(!proposesNothing({ ...nothing, dates: [{ what: "", date: "2027-03-01", time: "", timeZone: "", asStated: "3/1" }] }, open));
    assert.ok(!proposesNothing({ ...nothing, details: detail }, open));
    assert.ok(!proposesNothing({ ...nothing, intent: "cancellation" }, signed));
  });
  test("a bare acceptance asks whether they signed only while negotiating", () => {
    assert.ok(!proposesNothing({ ...nothing, intent: "confirmation" }, open));
    assert.ok(proposesNothing({ ...nothing, intent: "confirmation" }, signed));
  });
});
