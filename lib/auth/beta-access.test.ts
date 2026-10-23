// Invite-only sign-up during the beta (decision 0028). Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isAPIError } from "better-auth/api";
import { allowlistOn, checkSignupAllowed, listEmail, SIGNUP_NOT_ALLOWED } from "./beta-access";

const list = (...emails: string[]) => {
  const asked: string[] = [];
  return { asked, isListed: async (email: string) => (asked.push(email), emails.includes(email)) };
};

describe("checkSignupAllowed", () => {
  test("with the allowlist off, anyone may sign up and the list isn't read", async () => {
    const l = list();
    await checkSignupAllowed("stranger@example.com", { on: false, ...l });
    assert.deepEqual(l.asked, []);
  });

  test("on, an email on the list may sign up", async () => {
    await checkSignupAllowed("invited@example.com", { on: true, ...list("invited@example.com") });
  });

  test("on, the email is trimmed and lowercased before it's looked up", async () => {
    const l = list("invited@example.com");
    await checkSignupAllowed("  Invited@Example.COM ", { on: true, ...l });
    assert.deepEqual(l.asked, ["invited@example.com"]);
  });

  test("on, an email not on the list is refused with the code the screens show", async () => {
    await assert.rejects(
      checkSignupAllowed("stranger@example.com", { on: true, ...list("invited@example.com") }),
      (e) => isAPIError(e) && e.status === "BAD_REQUEST" && (e.body as { code?: string })?.code === SIGNUP_NOT_ALLOWED,
    );
  });
});

describe("allowlistOn", () => {
  test("only SIGNUP_ALLOWLIST=1 turns it on", () => {
    assert.equal(allowlistOn({ SIGNUP_ALLOWLIST: "1" }), true);
    for (const value of [undefined, "", "0", "true", "on"]) assert.equal(allowlistOn({ SIGNUP_ALLOWLIST: value }), false, String(value));
  });
});

test("listEmail matches how Better Auth stores emails", () => {
  assert.equal(listEmail(" Someone@Example.com\n"), "someone@example.com");
});
