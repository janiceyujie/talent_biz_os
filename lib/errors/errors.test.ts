// What reaches Sentry (decision 0026): the real SDK, with a transport that keeps
// what it would send instead of sending it. Run: npm test
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import * as Sentry from "@sentry/node";
import { log, setErrorReporter } from "@/lib/log";
import { errorReporter, scrubEvent, sentryOptions } from ".";

const TALENT = "6f1c2b8e-4d7a-4b1e-9a3c-2f5e8d7b6a10";

// Made-up content, standing in for a customer's message.
const SUBJECT = "Brand deal for Mei Lin, NT$80,000";
const EMAIL = "mei.lin@example.com";
const CONTENT = ["Mei Lin", "NT$80,000", EMAIL, "session=s3cret", "code=4/0Ab"];

class GmailError extends Error {
  status = 429;
  reason = "rateLimitExceeded";
}

let sent: string[] = [];

/** Everything sent since the last test, as one string, and its error events. */
async function sentSoFar() {
  await Sentry.flush(2000);
  const events = sent.flatMap((s) => (JSON.parse(s) as unknown[][])[1].filter((item) => (item as unknown[])[0] && (item as { type?: string }[])[0].type === "event").map((item) => (item as Sentry.ErrorEvent[])[1]));
  return { text: sent.join("\n"), events };
}

function assertNoContent(text: string) {
  for (const c of CONTENT) assert.ok(!text.includes(c), `"${c}" reached Sentry: ${text}`);
}

before(() => {
  Sentry.init({
    ...sentryOptions({ dsn: "https://public@sentry.example.com/1", environment: "testing", release: "abc123" }),
    transport: () => ({
      send: async (envelope) => {
        sent.push(JSON.stringify(envelope));
        return {};
      },
      flush: async () => true,
    }),
  });
  setErrorReporter(errorReporter(Sentry));
});

beforeEach(() => {
  sent = [];
});

after(() => Sentry.close());

describe("an error reported to Sentry", () => {
  test("keeps none of the message, user, request, extra data, or breadcrumbs", async () => {
    const error = new GmailError(`Could not file "${SUBJECT}" from ${EMAIL}`, { cause: new Error(`Thread ${SUBJECT}`) });
    Sentry.withScope((scope) => {
      scope.setUser({ email: EMAIL, username: "Mei Lin" });
      scope.setExtra("subject", SUBJECT);
      scope.setTag("subject", SUBJECT);
      scope.setContext("mail", { subject: SUBJECT });
      scope.addBreadcrumb({ message: `opened ${SUBJECT}` });
      scope.setSDKProcessingMetadata({
        normalizedRequest: { url: "https://app.example.com/api/auth/callback/google?code=4/0Ab", method: "GET", headers: { cookie: "session=s3cret" } },
      });
      Sentry.captureException(error);
    });
    const { text, events } = await sentSoFar();
    assert.equal(events.length, 1);
    assertNoContent(text);
  });

  test("keeps the error's type, code, status, and stack trace", async () => {
    Sentry.captureException(new GmailError(`Could not file "${SUBJECT}"`));
    const { events } = await sentSoFar();
    const values = events[0].exception?.values ?? [];
    const top = values[values.length - 1];
    assert.equal(top.type, "GmailError");
    assert.equal(top.value, "GmailError code=rateLimitExceeded status=429");
    assert.ok((top.stacktrace?.frames?.length ?? 0) > 0);
    assert.equal(events[0].environment, "testing");
    assert.equal(events[0].release, "abc123");
  });

  test("a log.error line is reported with its event and ids", async () => {
    log.error("mail.sync.failed", { talent_id: TALENT, job: "mail.sync", error: new GmailError(SUBJECT) });
    const { text, events } = await sentSoFar();
    assertNoContent(text);
    assert.equal(events[0].tags?.event, "mail.sync.failed");
    assert.equal(events[0].tags?.talent_id, TALENT);
    assert.equal(events[0].tags?.job, "mail.sync");
  });

  test("a log.error line without an error is reported by its event name", async () => {
    log.error("ai.paused", { talent_id: TALENT });
    const { events } = await sentSoFar();
    assert.equal(events[0].message, "ai.paused");
  });

  test("a message that isn't an event name, or a thrown string, keeps no text", async () => {
    Sentry.captureMessage(`sync failed for ${EMAIL}`);
    Sentry.captureException(`failed: ${SUBJECT}`);
    const { text, events } = await sentSoFar();
    assert.equal(events.length, 2);
    assertNoContent(text);
  });
});

describe("scrubEvent", () => {
  test("the transaction keeps its route, not its query", () => {
    const event = scrubEvent({ type: undefined, transaction: `/search?q=${encodeURIComponent(SUBJECT)}` });
    assert.equal(event.transaction, "/search");
  });

  test("Next's request context keeps the route pattern only", () => {
    const event = scrubEvent({
      type: undefined,
      contexts: { nextjs: { request_path: `/inbox/1?q=${EMAIL}`, router_path: "/inbox/[id]", route_type: "render", router_kind: "App Router" } },
    });
    assert.deepEqual(event.contexts?.nextjs, { router_path: "/inbox/[id]", route_type: "render", router_kind: "App Router" });
  });
});
