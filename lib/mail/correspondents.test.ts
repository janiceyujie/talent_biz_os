// Who a filed message is with (decision 0019). Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { correspondentsOf } from "./correspondents";
import { parseAddressList } from "./metadata";

const received = { kind: "message" as const, direction: "received" as const, sender: null, recipients: null };

describe("correspondentsOf", () => {
  test("a received email: its sender, from the header, not what the body claims", () => {
    assert.deepEqual(correspondentsOf({ ...received, sender: "Maya Chen <Maya@BlueRoom.example>" }, "other@x.example"), [
      { address: "maya@blueroom.example", name: "Maya Chen" },
    ]);
  });
  test("the person's own reply: everyone it went to", () => {
    const sent = { ...received, direction: "sent" as const, recipients: '"Chen, Maya" <maya@blueroom.example>, ops@blueroom.example' };
    assert.deepEqual(correspondentsOf(sent, "").map((a) => a.address), ["maya@blueroom.example", "ops@blueroom.example"]);
  });
  test("a pasted message: the email its analysis found, with the name it gave", () => {
    assert.deepEqual(correspondentsOf(received, "Ken@TokyoLive.example", " Ken "), [{ address: "ken@tokyolive.example", name: "Ken" }]);
    assert.deepEqual(correspondentsOf(received, "not an address"), []);
  });
  test("a bank notice is no one", () => {
    assert.deepEqual(correspondentsOf({ ...received, kind: "payment_notice", sender: "Bank <notify@bank.example>" }, ""), []);
  });
});

describe("parseAddressList", () => {
  test("commas inside a quoted name don't split; entries without an address are left out", () => {
    assert.deepEqual(parseAddressList('"Lin, Mei" <Mei@Example.com>, bob@x.io, nobody'), [
      { address: "mei@example.com", name: "Lin, Mei" },
      { address: "bob@x.io", name: "" },
    ]);
  });
});
