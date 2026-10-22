// Where Change role's close button goes back to. Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { roleReturnHref } from "./role-return";

describe("roleReturnHref", () => {
  test("a page on this site, with its address, goes back there", () => {
    assert.equal(roleReturnHref("/settings"), "/settings");
    assert.equal(roleReturnHref("/projects?id=p1#money"), "/projects?id=p1#money");
  });
  test("anything else is the home page: another site, a protocol-relative or backslash path, an auth page, nothing", () => {
    for (const value of ["https://evil.example", "//evil.example", "/\\evil.example", "/ /x", "/role", "/sign-in", "/api/inbox", "settings", "", undefined, ["/settings"]])
      assert.equal(roleReturnHref(value as string | undefined), "/", String(value));
  });
});
