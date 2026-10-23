// The staging password (decision 0027). Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { sitePasswordAllows } from "./site-password";

const basic = (credentials: string) => `Basic ${Buffer.from(credentials).toString("base64")}`;

describe("sitePasswordAllows", () => {
  test("with no password set, everything goes through", () => {
    assert.equal(sitePasswordAllows("/", null, undefined), true);
    assert.equal(sitePasswordAllows("/api/inbox", null, ""), true);
  });

  test("without the password, pages, API routes, and static files are refused", () => {
    for (const path of ["/", "/sign-in", "/api/inbox", "/api/auth/callback/google", "/_next/static/chunks/app.js", "/favicon.ico"])
      assert.equal(sitePasswordAllows(path, null, "s3cret"), false, path);
  });

  test("the right password is let through, whatever the user name", () => {
    assert.equal(sitePasswordAllows("/api/inbox", basic("anyone:s3cret"), "s3cret"), true);
    assert.equal(sitePasswordAllows("/", basic(":s3cret"), "s3cret"), true);
  });

  test("a password with a colon in it works", () => {
    assert.equal(sitePasswordAllows("/", basic("me:pa:ss"), "pa:ss"), true);
  });

  test("a wrong password, a prefix of it, or a malformed header is refused", () => {
    for (const header of [basic("me:wrong"), basic("me:s3cre"), basic("me:s3cret "), basic("s3cret"), "Bearer s3cret", "Basic", "", basic("")])
      assert.equal(sitePasswordAllows("/", header, "s3cret"), false, header);
  });

  test("the scheme name is case-insensitive", () => {
    assert.equal(sitePasswordAllows("/", basic("me:s3cret").replace("Basic", "basic"), "s3cret"), true);
  });

  test("paths servers call go through without it", () => {
    assert.equal(sitePasswordAllows("/api/health", null, "s3cret"), true);
    assert.equal(sitePasswordAllows("/api/calendar/feed/abc123", null, "s3cret"), true);
  });

  test("only those exact paths: nothing beside or below them", () => {
    for (const path of ["/api/health/x", "/api/healthz", "/api/calendar/feed", "/api/calendar/feed/abc/x", "/api/calendar/events/1"])
      assert.equal(sitePasswordAllows(path, null, "s3cret"), false, path);
  });
});
