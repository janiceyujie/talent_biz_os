// Whether the worker may start without Gmail push (decision 0013). Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { pushMode } from "./push-mode";

const all = { PUBSUB_TOPIC: "projects/p/topics/t", PUBSUB_SUBSCRIPTION: "projects/p/subscriptions/s", GCP_PUBSUB_CREDENTIALS: "/key.json" };

test("every setting: push, in any environment", () => {
  assert.equal(pushMode({ ...all, APP_ENV: "production" }), "push");
  assert.equal(pushMode({ ...all, APP_ENV: "development" }), "push");
});

test("none in development or testing: polling", () => {
  assert.equal(pushMode({ APP_ENV: "development" }), "polling");
  assert.equal(pushMode({ APP_ENV: "testing" }), "polling");
});

test("none in production: refuses, naming them", () => {
  assert.throws(() => pushMode({ APP_ENV: "production" }), /PUBSUB_TOPIC, PUBSUB_SUBSCRIPTION, GCP_PUBSUB_CREDENTIALS/);
  assert.throws(() => pushMode({ NODE_ENV: "production" }), /isn't fully set up/); // APP_ENV unset follows NODE_ENV
});

test("half set up: refuses anywhere, naming what's missing", () => {
  assert.throws(() => pushMode({ APP_ENV: "development", PUBSUB_TOPIC: all.PUBSUB_TOPIC }), /set PUBSUB_SUBSCRIPTION, GCP_PUBSUB_CREDENTIALS on/);
});
