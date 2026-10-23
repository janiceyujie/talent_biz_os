// The beta list's rules (decision 0028). Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { allows } from "@/lib/auth/staff-roles";
import en from "@/messages/support/en.json";
import zh from "@/messages/support/zh-TW.json";
import { canInvite, parseBatch, placeStatuses, sortBatch, statusOf } from "./beta";

// Made-up addresses.
const MEI = "mei.lin@example.com";
const KAI = "kai@example.com";

describe("parseBatch", () => {
  const emails = (pasted: string) => parseBatch(pasted).people.map((p) => p.email);

  test("one a line, commas, and mixed case come out once each, as the list stores them", () => {
    assert.deepEqual(emails(`${MEI}\n  Kai@Example.com , ${MEI};`), [MEI, KAI]);
  });

  test("a name beside the address, however it's written", () => {
    assert.deepEqual(parseBatch(`Mei Lin <${MEI}>`).people, [{ email: MEI, name: "Mei Lin" }]);
    assert.deepEqual(parseBatch(`${MEI}, Mei Lin`).people, [{ email: MEI, name: "Mei Lin" }]);
    assert.deepEqual(parseBatch(`${MEI}\tMei Lin\tmusician\tYes`).people, [{ email: MEI, name: "Mei Lin" }]);
    assert.deepEqual(parseBatch(MEI).people, [{ email: MEI, name: null }]);
  });

  test("a row of the waitlist's CSV export: the header is passed over, the name kept", () => {
    const csv = `Email,Name,Role\n"Mei Lin <${MEI}>",Mei Lin,musician\n${KAI},Kai Chen,model`;
    assert.deepEqual(parseBatch(csv), {
      people: [
        { email: MEI, name: "Mei Lin" },
        { email: KAI, name: "Kai Chen" },
      ],
      invalid: [],
    });
  });

  test("a line with several addresses is a list, without names", () => {
    assert.deepEqual(parseBatch(`${MEI}, ${KAI}`).people, [
      { email: MEI, name: null },
      { email: KAI, name: null },
    ]);
  });

  test("something with an @ that isn't an address is invalid", () => {
    assert.deepEqual(parseBatch("mei@ @example.com kai@example").invalid, ["mei@", "@example.com", "kai@example"]);
  });
});

describe("sortBatch", () => {
  test("new, withdrawn to restore, on the list, and with an account", () => {
    const listed = [
      { email: "on@example.com", withdrawnAt: null },
      { email: "back@example.com", withdrawnAt: new Date() },
    ];
    assert.deepEqual(sortBatch(["new@example.com", "on@example.com", "back@example.com", "has@example.com"], listed, ["has@example.com"]), {
      add: ["new@example.com"],
      restore: ["back@example.com"],
      listed: ["on@example.com"],
      hasAccount: ["has@example.com"],
    });
  });

  test("someone with an account is never added, even if withdrawn before", () => {
    assert.deepEqual(sortBatch([MEI], [{ email: MEI, withdrawnAt: new Date() }], [MEI]).hasAccount, [MEI]);
  });
});

describe("a place's status", () => {
  const at = new Date();
  test("withdrawn, then signed up, then invited, else only added", () => {
    assert.equal(statusOf({ usedAt: null, withdrawnAt: null, invitationSentAt: null }), "added");
    assert.equal(statusOf({ usedAt: null, withdrawnAt: null, invitationSentAt: at }), "invited");
    assert.equal(statusOf({ usedAt: at, withdrawnAt: null, invitationSentAt: at }), "signedUp");
    assert.equal(statusOf({ usedAt: null, withdrawnAt: at, invitationSentAt: at }), "withdrawn");
  });

  test("an invitation goes only to a place nobody has used and nobody withdrew", () => {
    assert.equal(canInvite({ usedAt: null, withdrawnAt: null }), true);
    assert.equal(canInvite({ usedAt: at, withdrawnAt: null }), false);
    assert.equal(canInvite({ usedAt: null, withdrawnAt: at }), false);
  });

  test("each status has words in both languages", () => {
    for (const s of placeStatuses) for (const catalog of [en, zh]) assert.ok(catalog.support.beta.status[s], s);
  });
});

describe("staff roles", () => {
  test("support reads; only admin changes the list", () => {
    assert.equal(allows("support", "support"), true);
    assert.equal(allows("support", "admin"), false);
    assert.equal(allows("admin", "admin"), true);
    assert.equal(allows("admin", "support"), true);
  });
});
