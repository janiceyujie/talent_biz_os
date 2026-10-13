// The worker's private endpoint: who may call it, and what it accepts. Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { authorized, peekRequest } from "./worker-api";

describe("the worker endpoint", () => {
  test("needs the shared secret", () => {
    assert.ok(authorized("Bearer s3cret", "s3cret"));
    assert.ok(!authorized("Bearer wrong", "s3cret"));
    assert.ok(!authorized("s3cret", "s3cret"));
    assert.ok(!authorized(undefined, "s3cret"));
    assert.ok(!authorized("Bearer ", "")); // no secret configured: nobody gets in
  });
  test("takes one connection and up to 50 Gmail ids", () => {
    const connectionId = "3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90";
    assert.ok(peekRequest.safeParse({ connectionId, ids: ["18c2f0a1b2c3d4e5"] }).success);
    assert.ok(!peekRequest.safeParse({ connectionId, ids: ["../profile"] }).success);
    assert.ok(!peekRequest.safeParse({ connectionId, ids: Array(51).fill("a1") }).success);
    assert.ok(!peekRequest.safeParse({ connectionId, ids: [], query: "from:me" }).success);
  });
});
