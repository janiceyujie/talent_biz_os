import assert from "node:assert/strict";
import { test } from "node:test";
import { profileRoleFromForm, profileRoleSchema } from "./profile";
import { readPreferences } from "./preferences";

test("skipping differs from explicitly choosing Other", () => {
  const form = new FormData();
  form.set("role", "manager");
  form.set("intent", "skip");
  assert.deepEqual(profileRoleFromForm(form).data, { version: 1, role: null });
  form.set("intent", "save");
  form.set("role", "other");
  assert.deepEqual(profileRoleFromForm(form).data, { version: 1, role: "other" });
  form.set("role", "");
  assert.equal(profileRoleFromForm(form).data?.role, null);
});

test("invalid occupations are rejected and malformed stored data is ignored", () => {
  assert.equal(profileRoleSchema.safeParse({version: 1, role: "administrator"}).success, false);
  assert.equal(readPreferences([{key: "profile.role", value: {version: 2, role: "manager"}}])["profile.role"], null);
  assert.deepEqual(readPreferences([{key: "profile.role", value: {version: 1, role: "manager"}}])["profile.role"], {version: 1, role: "manager"});
});
