import assert from "node:assert/strict";
import { test } from "node:test";
import { cards, FIELD, replace, show } from "./cards";
import { parseEvent } from "./event";

const t = (key: string, values?: Record<string, string | number>) => (values ? `${key}:${JSON.stringify(values)}` : key);
const c = cards(t, "https://app.example/api/addon/gmail");
const json = (x: unknown) => JSON.stringify(x);

test("an email opening: its ids and tokens; a button: its action and form fields", () => {
  const opened = parseEvent({
    authorizationEventObject: { userOAuthToken: "u", userIdToken: "id", systemIdToken: "sys" },
    gmail: { messageId: "m1", accessToken: "a" },
  });
  assert.deepEqual([opened?.action, opened?.email, opened?.userToken], [null, { messageId: "m1", threadId: null, accessToken: "a" }, "u"]);

  const clicked = parseEvent({
    commonEventObject: { parameters: { action: "send", artist: "t1" }, formInputs: { project: { stringInputs: { value: ["p1"] } } } },
    authorizationEventObject: {},
  });
  assert.deepEqual([clicked?.action, clicked?.field(FIELD.project), clicked?.field(FIELD.artist), clicked?.email], ["send", "p1", "t1", null]);
  assert.equal(parseEvent({ commonEventObject: { parameters: { action: "deleteEverything" } }, authorizationEventObject: {} })?.action, null);
  assert.equal(parseEvent("nonsense"), null);
});

test("connect opens our site and reloads the card after", () => {
  const card = c.connect("https://app.example/addon/link?token=x");
  assert.match(json(card), /"openAs":"OVERLAY","onClose":"RELOAD"/);
  assert.deepEqual(Object.keys(show(card).action.navigations[0]), ["pushCard"]);
  assert.deepEqual(Object.keys(replace(card).renderActions.action.navigations[0]), ["updateCard"]);
});

const form = { fresh: 3, artists: [{ id: "t1", name: "Lin" }], artistId: "t1", projects: [{ id: "p1", title: "Blue Room" }], projectId: "" };
const thread = { person: "me@example.test", total: 3, waiting: 0, dismissed: 0, filed: [], openUrl: null, form, notice: false };

test("one artist: no artist picker, the artist goes with Send; Decide in Intake by default", () => {
  const s = json(c.thread(thread));
  assert.doesNotMatch(s, /"name":"artist"/);
  assert.match(s, /\{"key":"action","value":"send"\},\{"key":"artist","value":"t1"\}/);
  assert.match(s, /"text":"decideInIntake","value":"","selected":true/);
});

test("several artists: a picker that redraws the card", () => {
  const s = json(c.thread({ ...thread, form: { ...form, artists: [...form.artists, { id: "t2", name: "Mei" }] } }));
  assert.match(s, /"name":"artist"/);
  assert.match(s, /"value":"pickArtist"/);
});

test("all in: where it is, no form; a payment notice: no form either", () => {
  const filed = json(c.thread({ ...thread, filed: ["Blue Room"], openUrl: "https://app.example/inbox?message=m", form: null }));
  assert.match(filed, /filedUnder/);
  assert.doesNotMatch(filed, /"value":"send"/);
  assert.doesNotMatch(json(c.thread({ ...thread, notice: true })), /"value":"send"/);
});

test("an email's text can't add markup to the card", () => {
  assert.match(json(c.thread({ ...thread, filed: ["<b>x</b>"], form: null })), /&lt;b&gt;x&lt;\/b&gt;/);
});
