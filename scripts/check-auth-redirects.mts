/** Local-only regression: invalid session cookies must not trap sign-in in a redirect loop. */
import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL || "http://localhost:3000";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname));
let checks = 0;
for (const cookie of ["", "better-auth.session_token=expired.invalid", "__Secure-better-auth.session_token=expired.invalid"]) {
  const response = await fetch(`${base}/sign-in`, { headers: { cookie }, redirect: "follow" });
  assert.equal(response.status, 200);
  assert.equal(new URL(response.url).pathname, "/sign-in");
  assert.match(await response.text(), /method="post"/);
  const denied = await fetch(`${base}/api/inbox`, { headers: { cookie }, redirect: "manual" });
  assert.equal(denied.status, 401);
  checks += 4;
}
console.log(JSON.stringify({ checks, staleSession: "sign-in reachable", protectedApi: "unauthorized" }));
