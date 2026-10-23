// The line for a failed request, and its request_id (decision 0026). Run: npm test
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { log, setErrorReporter, setLogContext } from "@/lib/log";
import { logRequestError } from "./request";

const TRACE = "4bf92f3577b34da6a3ce929d0e0e4736";
const EMAIL = "mei.lin@example.com"; // made-up

let lines: Record<string, unknown>[] = [];

beforeEach(() => {
  lines = [];
  setErrorReporter((_error, line) => lines.push(line));
  setLogContext(() => ({ request_id: TRACE }));
});

afterEach(() => setLogContext(() => ({})));

const request = {
  path: `/search?q=${encodeURIComponent(EMAIL)}`,
  method: "POST",
  headers: { "rndr-id": "74f98356-6f57-48a5", cookie: "session=s3cret" },
};
const context = { routerKind: "App Router", routePath: "/search", routeType: "action", renderSource: undefined, revalidateReason: undefined } as const;

describe("logRequestError", () => {
  test("writes the route, method, kind, digest, Render's id, and the request_id", async () => {
    await logRequestError(Object.assign(new Error(`no results for ${EMAIL}`), { digest: "2716389457" }), request, context);
    assert.equal(lines.length, 1);
    const line = lines[0];
    assert.equal(line.event, "request.failed");
    assert.equal(line.route, "/search");
    assert.equal(line.method, "POST");
    assert.equal(line.source, "action");
    assert.equal(line.digest, "2716389457");
    assert.equal(line.rndr_id, "74f98356-6f57-48a5");
    assert.equal(line.request_id, TRACE);
  });

  test("never the path, its query, a header, or the error's message", async () => {
    await logRequestError(new Error(`no results for ${EMAIL}`), request, context);
    const json = JSON.stringify(lines[0]);
    assert.ok(!json.includes(EMAIL) && !json.includes(encodeURIComponent(EMAIL)), json);
    assert.ok(!json.includes("s3cret"), json);
  });
});

describe("request_id", () => {
  test("every line written during a request carries it", () => {
    log.error("mail.connect.exchange_failed", {});
    assert.equal(lines[0].request_id, TRACE);
  });

  test("a line outside a request has none", () => {
    setLogContext(() => ({}));
    log.error("worker.crashed", {});
    assert.equal("request_id" in lines[0], false);
  });
});
