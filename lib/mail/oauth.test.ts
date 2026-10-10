// The Gmail connection's OAuth pieces (decision 0016). Run: npm test
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, test } from "node:test";
import { authorizationUrl, challengeFor, idTokenClaims, pkce } from "./oauth";
import { openState, sealState, type ConnectState } from "./oauth-state";
import { GMAIL_SCOPE, grantsGmail } from "./scope";

const SECRET = "test-auth-secret";
const state: ConnectState = { state: "abc", verifier: "v", personId: "p1", talentId: "t1", historyMode: "30_days", expiresAt: 2_000 };

describe("PKCE", () => {
  test("the challenge is the verifier's SHA-256, base64url", () => {
    const { verifier, challenge } = pkce();
    assert.equal(challenge, createHash("sha256").update(verifier).digest("base64url"));
    assert.equal(challengeFor(verifier), challenge);
    assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
  });
});

describe("the consent URL", () => {
  test("asks for read-only Gmail, offline, with state and S256", () => {
    const url = new URL(authorizationUrl({ clientId: "cid", redirectUri: "http://localhost:3000/api/mail/callback", state: "s", challenge: "c" }));
    assert.deepEqual(url.searchParams.get("scope")?.split(" "), ["openid", "email", GMAIL_SCOPE]);
    assert.equal(url.searchParams.get("access_type"), "offline");
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.equal(url.searchParams.get("state"), "s");
    assert.equal(url.searchParams.get("include_granted_scopes"), "false");
  });
});

describe("the remembered attempt", () => {
  test("opens with the same secret before it expires", () => {
    assert.deepEqual(openState(sealState(state, SECRET), SECRET, 1_000), state);
  });
  test("is refused when expired, altered, or sealed with another secret", () => {
    const cookie = sealState(state, SECRET);
    assert.equal(openState(cookie, SECRET, 2_000), null);
    assert.equal(openState(cookie, "other-secret", 1_000), null);
    assert.equal(openState(cookie.slice(0, -2) + (cookie.endsWith("A") ? "BB" : "AA"), SECRET, 1_000), null);
    assert.equal(openState(undefined, SECRET, 1_000), null);
    assert.equal(openState("not.a-cookie", SECRET, 1_000), null);
  });
  test("doesn't show the PKCE verifier to anyone holding the cookie", () => {
    const withVerifier = { ...state, verifier: "super-secret-verifier" };
    const cookie = sealState(withVerifier, SECRET);
    assert.ok(!Buffer.from(cookie.replace(/\./g, ""), "base64url").toString().includes("super-secret-verifier"));
  });
});

describe("what Google granted", () => {
  test("Gmail must be among the granted scopes", () => {
    assert.equal(grantsGmail(`openid ${GMAIL_SCOPE} https://www.googleapis.com/auth/userinfo.email`), true);
    assert.equal(grantsGmail("openid https://www.googleapis.com/auth/userinfo.email"), false);
    assert.equal(grantsGmail(undefined), false);
  });
  test("the account comes from the ID token's sub and email", () => {
    const token = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
    assert.deepEqual(idTokenClaims(token({ sub: "1234", email: "booking@example.com" })), { subject: "1234", email: "booking@example.com" });
    assert.equal(idTokenClaims(token({ email: "booking@example.com" })), null);
    assert.equal(idTokenClaims("garbage"), null);
    assert.equal(idTokenClaims(undefined), null);
  });
});
