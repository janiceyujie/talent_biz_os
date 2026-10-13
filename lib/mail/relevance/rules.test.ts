// The relevance rules on metadata alone (decision 0013). Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseAddress, type MailMetadata } from "../metadata";
import { hasWorkWords } from "./keywords";
import { decide, decideAll, isBulk, isPersonalDomain, senderRuleFor, type RuleContext } from "./rules";

const none: RuleContext = {
  senderRules: [],
  contacts: new Set(),
  workThreads: new Set(),
};

function mail(
  o: {
    from?: string;
    subject?: string;
    labels?: string[];
    thread?: string;
    at?: number;
    headers?: Partial<MailMetadata["headers"]>;
  } = {},
): MailMetadata {
  return {
    id: `m${o.at ?? 0}`,
    threadId: o.thread ?? "t1",
    labels: o.labels ?? ["INBOX"],
    from: parseAddress(o.from ?? "Someone <someone@example.com>"),
    subject: o.subject ?? "Hello",
    receivedAt: new Date(o.at ?? 0),
    snippet: "",
    headers: {
      From: "",
      Subject: "",
      "List-Unsubscribe": "",
      "List-Id": "",
      Precedence: "",
      "Auto-Submitted": "",
      ...o.headers,
    },
  };
}

const newsletter = {
  "List-Unsubscribe": "<mailto:unsubscribe@news.example.com>",
};

describe("addresses", () => {
  test("a name and an address", () => {
    assert.deepEqual(parseAddress('"Lin, Mei" <Mei@Example.COM>'), {
      address: "mei@example.com",
      name: "Lin, Mei",
    });
    assert.deepEqual(parseAddress("Studio <studio@example.com>"), {
      address: "studio@example.com",
      name: "Studio",
    });
  });
  test("a bare address", () => {
    assert.deepEqual(parseAddress("a@b.com"), { address: "a@b.com", name: "" });
  });
  test("no address at all", () => {
    assert.deepEqual(parseAddress("undisclosed-recipients"), {
      address: "",
      name: "undisclosed-recipients",
    });
  });
});

describe("work words", () => {
  test("English, as whole words and plurals", () => {
    assert.ok(hasWorkWords("Booking inquiry for March"));
    assert.ok(hasWorkWords("Updated rate  card"));
    assert.ok(hasWorkWords("Invoices for Q3"));
    assert.ok(!hasWorkWords("Weekly digest")); // nothing
    assert.ok(!hasWorkWords("Offering you 20% off")); // "offer" is not a whole word here
  });
  test("\"offer\" doesn't count in Promotions; other words do", () => {
    assert.ok(!hasWorkWords("Exclusive offer inside", { promotions: true }));
    assert.ok(hasWorkWords("Exclusive offer inside"));
    assert.ok(hasWorkWords("Collab offer", { promotions: true }));
    assert.ok(hasWorkWords("十二月演出邀約", { promotions: true }));
  });
  test("Chinese, anywhere in the subject", () => {
    assert.ok(hasWorkWords("十二月演出邀約"));
    assert.ok(hasWorkWords("【通知】您的帳戶有一筆入帳"));
    assert.ok(!hasWorkWords("本週精選好物"));
  });
});

describe("sender rules", () => {
  const rules = [
    {
      kind: "domain" as const,
      value: "agency.example",
      verdict: "never" as const,
    },
    {
      kind: "address" as const,
      value: "booker@agency.example",
      verdict: "always" as const,
    },
  ];
  test("an address rule beats its domain's rule", () => {
    assert.equal(senderRuleFor("booker@agency.example", rules)?.verdict, "always");
    assert.equal(senderRuleFor("news@agency.example", rules)?.verdict, "never");
  });
  test("no domain rules for free mailbox providers", () => {
    assert.ok(isPersonalDomain("Gmail.com"));
    assert.ok(!isPersonalDomain("agency.example"));
  });
  test("a domain rule covers its subdomains, not look-alikes", () => {
    assert.equal(senderRuleFor("a@mail.agency.example", rules)?.verdict, "never");
    assert.equal(senderRuleFor("a@notagency.example", rules), undefined);
  });
});

describe("decide", () => {
  test("anything no rule decides waits for the model", () => {
    assert.deepEqual(decide(mail(), none), { outcome: "pending", rule: null });
  });
  test("a contact is work, even as a newsletter in Promotions", () => {
    const ctx = { ...none, contacts: new Set(["someone@example.com"]) };
    assert.deepEqual(decide(mail({ labels: ["CATEGORY_PROMOTIONS"], headers: newsletter }), ctx), { outcome: "work", rule: "contact" });
  });
  test("the artist's own rules come first", () => {
    const never = {
      ...none,
      contacts: new Set(["someone@example.com"]),
      senderRules: [
        {
          kind: "address" as const,
          value: "someone@example.com",
          verdict: "never" as const,
        },
      ],
    };
    assert.equal(decide(mail(), never).rule, "sender_never");
    const always = {
      ...none,
      senderRules: [
        {
          kind: "domain" as const,
          value: "example.com",
          verdict: "always" as const,
        },
      ],
    };
    assert.deepEqual(decide(mail({ headers: newsletter }), always), {
      outcome: "work",
      rule: "sender_always",
    });
  });
  test("a thread already decided as work", () => {
    assert.deepEqual(decide(mail({ thread: "t9" }), { ...none, workThreads: new Set(["t9"]) }), { outcome: "work", rule: "thread" });
  });
  test("e-sign notices, from no-reply senders too", () => {
    assert.deepEqual(decide(mail({ from: "DocuSign <dse_na2@docusign.net>", headers: newsletter }), none), { outcome: "work", rule: "esign" });
  });
  test("spam, trash, drafts, and sent mail are skipped", () => {
    assert.equal(decide(mail({ labels: ["SPAM"] }), none).rule, "spam");
    assert.equal(decide(mail({ labels: ["TRASH"] }), none).rule, "trash");
    assert.equal(decide(mail({ labels: ["DRAFT"] }), none).rule, "draft");
    assert.equal(decide(mail({ labels: ["SENT"] }), none).rule, "sent");
  });
  test("bulk mail without work words is skipped", () => {
    assert.deepEqual(decide(mail({ subject: "This week's picks", headers: newsletter }), none), { outcome: "skipped", rule: "bulk" });
    assert.equal(decide(mail({ from: "no-reply@shop.example" }), none).rule, "bulk");
    assert.equal(decide(mail({ headers: { Precedence: "bulk" } }), none).rule, "bulk");
  });
  test("bulk mail with work words waits: a bank notice, a platform's offer", () => {
    assert.equal(decide(mail({ from: "no-reply@bank.example", subject: "您有一筆匯款入帳" }), none).outcome, "pending");
    assert.equal(decide(mail({ subject: "New booking request", headers: newsletter }), none).outcome, "pending");
  });
  test("Promotions and Updates without work words are skipped, like bulk mail", () => {
    assert.deepEqual(decide(mail({ labels: ["INBOX", "CATEGORY_PROMOTIONS"] }), none), { outcome: "skipped", rule: "tab" });
    assert.equal(decide(mail({ labels: ["INBOX", "CATEGORY_UPDATES"], subject: "Your order shipped" }), none).rule, "tab");
  });
  test("a tab with work words waits: offers land in Promotions too", () => {
    assert.equal(decide(mail({ labels: ["INBOX", "CATEGORY_PROMOTIONS"], subject: "Collab with our brand?" }), none).outcome, "pending");
    assert.equal(decide(mail({ labels: ["INBOX", "CATEGORY_UPDATES"], subject: "Booking request for May 3" }), none).outcome, "pending");
  });
  test("in Promotions, \"offer\" is a sale, not work; elsewhere it still counts", () => {
    const promo = ["INBOX", "CATEGORY_PROMOTIONS"];
    assert.equal(decide(mail({ labels: promo, subject: "Special offer: 50% off" }), none).rule, "tab");
    assert.equal(decide(mail({ labels: promo, subject: "Special offer: 50% off", headers: newsletter }), none).rule, "bulk");
    assert.equal(decide(mail({ labels: ["INBOX", "CATEGORY_UPDATES"], subject: "Offer for the March show" }), none).outcome, "pending");
  });
  test("Primary and Social mail from a person waits", () => {
    assert.equal(decide(mail({ labels: ["INBOX", "CATEGORY_PERSONAL"] }), none).outcome, "pending");
    assert.equal(decide(mail({ labels: ["INBOX", "CATEGORY_SOCIAL"] }), none).outcome, "pending");
  });
});

describe("bulk headers", () => {
  test("Auto-Submitted: no is a person's mail", () => {
    assert.ok(!isBulk(mail({ headers: { "Auto-Submitted": "no" } })));
    assert.ok(isBulk(mail({ headers: { "Auto-Submitted": "auto-generated" } })));
  });
  test("no-reply, not a name that starts with it", () => {
    assert.ok(isBulk(mail({ from: "noreply@x.example" })));
    assert.ok(isBulk(mail({ from: "do-not-reply+tw@x.example" })));
    assert.ok(!isBulk(mail({ from: "noreplyhazel@x.example" })));
  });
});

describe("decideAll", () => {
  test("a reply joins the thread its earlier email made work, whatever the order given", () => {
    const ctx = { ...none, contacts: new Set(["booker@agency.example"]) };
    const reply = mail({
      from: "assistant@agency.example",
      thread: "deal",
      at: 2,
    });
    const first = mail({
      from: "booker@agency.example",
      thread: "deal",
      at: 1,
    });
    const [a, b] = decideAll([reply, first], ctx);
    assert.equal(a.mail, first);
    assert.equal(a.verdict.rule, "contact");
    assert.deepEqual(b.verdict, { outcome: "work", rule: "thread" });
  });
});
