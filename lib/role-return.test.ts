import assert from "node:assert/strict";
import { test } from "node:test";
import { roleReturnHref } from "./role-return";

test("role cancellation returns to a workspace page and preserves URL filters", () => {
  for (const path of ["/", "/settings", "/assistant", "/projects/example?tab=payments#details", "/inbox?status=new"]) {
    assert.equal(roleReturnHref(path), path);
  }
});

test("role cancellation cannot leave the app or loop into onboarding", () => {
  for (const path of [undefined, ["/settings"], "https://example.com", "//example.com", "/\\example.com", "/role", "/onboarding", "/sign-in", "/api/auth/sign-out", "/projects/../role", "/projects/%2e%2e/role", " /settings", "javascript:alert(1)"]) {
    assert.equal(roleReturnHref(path), "/");
  }
});
