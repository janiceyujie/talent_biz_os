// Reading saved preferences. Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { preferences, readPreferences } from "./preferences";

describe("readPreferences", () => {
  test("a fitting value is read; a broken one, an unknown key, or none at all is null (defaults apply)", () => {
    assert.deepEqual(readPreferences([{ key: "overview.layout", value: { version: 1, hidden: ["income"] } }]), {
      "overview.layout": { version: 1, hidden: ["income"] },
    });
    assert.deepEqual(readPreferences([{ key: "overview.layout", value: { version: 2 } }]), { "overview.layout": null });
    assert.deepEqual(readPreferences([{ key: "someday.setting", value: 1 }]), { "overview.layout": null });
    assert.deepEqual(readPreferences([]), { "overview.layout": null });
  });

  test("saving only accepts known widget ids", () => {
    const save = preferences["overview.layout"].save;
    assert.equal(save.safeParse({ version: 1, order: ["actions"], hidden: [] }).success, true);
    assert.equal(save.safeParse({ version: 1, order: ["actions", "made-up"], hidden: [] }).success, false);
  });
});
