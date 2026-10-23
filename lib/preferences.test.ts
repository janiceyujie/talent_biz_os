// Reading saved preferences. Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { preferences, readPreferences } from "./preferences";

describe("readPreferences", () => {
  test("a fitting value is read; a broken one, an unknown key, or none at all is null (defaults apply)", () => {
    const unset = { "overview.layout": null, "opportunities.profile": null };
    assert.deepEqual(readPreferences([{ key: "overview.layout", value: { version: 1, hidden: ["income"] } }]), {
      ...unset,
      "overview.layout": { version: 1, hidden: ["income"] },
    });
    assert.deepEqual(readPreferences([{ key: "overview.layout", value: { version: 2 } }]), unset);
    assert.deepEqual(readPreferences([{ key: "someday.setting", value: 1 }]), unset);
    assert.deepEqual(readPreferences([]), unset);
  });

  test("a screening profile with an unknown area or discipline is not set", () => {
    const profile = { version: 1, applicantType: "individual", country: "TW", area: "TW-TPE", disciplines: ["music"] };
    assert.deepEqual(readPreferences([{ key: "opportunities.profile", value: profile }])["opportunities.profile"], profile);
    assert.equal(readPreferences([{ key: "opportunities.profile", value: { ...profile, area: "TW-XXX" } }])["opportunities.profile"], null);
    assert.equal(readPreferences([{ key: "opportunities.profile", value: { ...profile, disciplines: ["dance"] } }])["opportunities.profile"], null);
  });

  test("saving only accepts known widget ids", () => {
    const save = preferences["overview.layout"].save;
    assert.equal(save.safeParse({ version: 1, order: ["actions"], hidden: [] }).success, true);
    assert.equal(save.safeParse({ version: 1, order: ["actions", "made-up"], hidden: [] }).success, false);
  });
});
