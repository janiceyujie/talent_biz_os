// Gmail push notices (decision 0013). Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { readNotice } from "./push-notice";

const data = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");

test("a notice names the mailbox, lowercased", () => {
  assert.deepEqual(readNotice(data({ emailAddress: "Artist@Example.com", historyId: 9876 })), { emailAddress: "artist@example.com", historyId: "9876" });
});

test("anything else isn't a notice", () => {
  for (const d of [undefined, "", "not base64 json", data({ historyId: "1" }), data({ emailAddress: "nobody" })]) assert.equal(readNotice(d), null);
});
