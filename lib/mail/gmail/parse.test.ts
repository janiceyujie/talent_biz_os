// Gmail's metadata answer as our own shape. Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { toMetadata } from "./parse";

test("only the headers asked for, matched whatever their case", () => {
  const m = toMetadata({
    id: "a1",
    threadId: "t1",
    labelIds: ["INBOX", "CATEGORY_UPDATES"],
    internalDate: "1760000000000",
    payload: {
      headers: [
        { name: "From", value: "Studio <Hi@Studio.example>" },
        { name: "subject", value: "Booking" },
        { name: "List-Unsubscribe", value: "<mailto:u@studio.example>" },
        { name: "Received", value: "from somewhere" },
      ],
    },
  });
  assert.deepEqual(m.from, { address: "hi@studio.example", name: "Studio" });
  assert.equal(m.subject, "Booking");
  assert.equal(m.headers["List-Unsubscribe"], "<mailto:u@studio.example>");
  assert.equal(m.headers.Precedence, "");
  assert.equal("Received" in m.headers, false);
  assert.equal(m.receivedAt.getTime(), 1760000000000);
  assert.equal(m.snippet, ""); // not asked for
});

test("the snippet, unescaped", () => {
  const m = toMetadata({ id: "a", threadId: "t", snippet: "Rock &amp; roll &#39;26 &lt;tour&gt; &#x4e2d;&#25991; &bogus;" });
  assert.equal(m.snippet, "Rock & roll '26 <tour> 中文 &bogus;");
});
