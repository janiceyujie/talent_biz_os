// The intake rules (docs/design/intake-to-project.md). Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { MessageAnalysis } from "@/lib/ai/analysis";
import type { CalendarItem, Contact, Payment, Project } from "@/lib/types";
import { parseAmount, proposeChanges, proposeNewProject, suggestTargets, type Change, type IntakeContext } from "./intake";

const analysis = (over: Partial<MessageAnalysis> = {}): MessageAnalysis => ({
  intent: "inquiry",
  projectType: "gig",
  language: "zh-TW",
  title: "Blue Room 11/14 演出",
  summary: "",
  transcript: "",
  transcriptWithheld: false,
  counterparty: { name: "Maya", company: "Blue Room", email: "maya@blueroom.example", phone: "" },
  dates: [],
  money: { amount: null, currency: "", taxIncluded: null, asStated: "" },
  paymentTerms: "",
  replyBy: "",
  replyByStated: "",
  details: {},
  asks: [],
  missing: [],
  assumptions: [],
  flags: [],
  confidence: 0.9,
  ...over,
});

const project = (over: Partial<Project> = {}): Project => ({
  id: "p1",
  title: "Blue Room 11/14 演出",
  counterparty: "Blue Room",
  counterpartyId: "c1",
  artist: "",
  type: "gig",
  stage: "negotiating",
  quotedAmount: 30000,
  currency: "TWD",
  taxRate: 5,
  taxIncluded: true,
  details: {},
  offerText: "",
  notes: "",
  nextAction: null,
  archived: false,
  ...over,
});

const contact = (over: Partial<Contact> = {}): Contact => ({
  id: "c1",
  role: "counterparty",
  name: "Maya Chen",
  company: "Blue Room",
  email: "maya@blueroom.example",
  phone: "",
  notes: "",
  archived: false,
  ...over,
});

const payment = (over: Partial<Payment> = {}): Payment => ({
  id: "pay1",
  projectId: "p1",
  projectType: "gig",
  direction: "in",
  installment: "balance",
  label: "尾款",
  amount: 21000,
  currency: "TWD",
  taxRate: 0,
  taxIncluded: true,
  recordedDate: "2026-09-01",
  dueDate: "2026-11-30",
  status: "expected",
  settledAmount: null,
  settledDate: null,
  invoiceRef: "",
  notes: "",
  voided: false,
  ...over,
});

const event = (over: Partial<CalendarItem> = {}): CalendarItem => ({
  id: "e1",
  source: "event",
  kind: "performance",
  title: "Blue Room 演出",
  date: "2026-11-14",
  time: "20:00",
  timeZone: "Asia/Taipei",
  location: "",
  projectId: "p1",
  notes: "",
  done: false,
  archived: false,
  travel: null,
  ...over,
});

const ctx = (over: Partial<IntakeContext> = {}): IntakeContext => ({
  projects: [project()],
  contacts: [contact()],
  payments: [],
  calendar: [],
  receivedOn: "2026-10-04",
  replyWithinDays: 2,
  ...over,
});

const date = (d: string, time = "", what = "演出") => ({ what, date: d, time, timeZone: "", asStated: `${d} ${time}` });
const byKind = (changes: Change[], kind: Change["kind"]) => changes.filter((c) => c.kind === kind);
const one = <K extends Change["kind"]>(changes: Change[], kind: K) => {
  const found = changes.filter((c): c is Extract<Change, { kind: K }> => c.kind === kind);
  assert.equal(found.length, 1, `one ${kind} change, got ${found.length}`);
  return found[0];
};

describe("suggestTargets", () => {
  test("the same contact email is a strong match, with the reason", () => {
    const [s] = suggestTargets(analysis(), ctx());
    assert.equal(s.projectId, "p1");
    assert.deepEqual(s.reasons[0], { kind: "contact", value: "maya@blueroom.example" });
  });

  test("a company name matches the project's counterparty text when there's no linked contact", () => {
    const c = ctx({ projects: [project({ counterpartyId: null, counterparty: "The Blue Room 台北" })], contacts: [] });
    assert.equal(suggestTargets(analysis({ counterparty: { name: "", company: "Blue Room", email: "", phone: "" } }), c)[0]?.projectId, "p1");
  });

  test("a similar title alone isn't enough", () => {
    const c = ctx({ contacts: [], projects: [project({ counterpartyId: null, counterparty: "Someone else" })] });
    assert.deepEqual(suggestTargets(analysis({ counterparty: { name: "", company: "", email: "", phone: "" } }), c), []);
  });

  test("the same date as a project's event counts", () => {
    const c = ctx({ contacts: [], projects: [project({ counterpartyId: null, counterparty: "X" })], calendar: [event()] });
    const [s] = suggestTargets(analysis({ counterparty: { name: "", company: "", email: "", phone: "" }, dates: [date("2026-11-14")] }), c);
    assert.ok(s.reasons.some((r) => r.kind === "date"));
  });

  test("ranks the better match first and skips archived projects", () => {
    const c = ctx({
      projects: [
        project({ id: "weak", counterpartyId: null, counterparty: "Blue Room", title: "別的案子" }),
        project({ id: "strong" }),
        project({ id: "gone", archived: true }),
      ],
    });
    assert.deepEqual(
      suggestTargets(analysis({ dates: [date("2026-11-14")] }), c).map((s) => s.projectId),
      ["strong", "weak"],
    );
  });

  test("a payment notice matches an expected payment of that amount", () => {
    const c = ctx({ contacts: [], projects: [project({ counterpartyId: null, counterparty: "X", stage: "collecting_payment" })], payments: [payment()] });
    const a = analysis({ intent: "payment", counterparty: { name: "", company: "", email: "", phone: "" }, details: { amountDue: { value: "NT$19,950", asStated: "" } } });
    assert.ok(suggestTargets(a, c)[0]?.reasons.some((r) => r.kind === "payment"));
  });
});

describe("proposeChanges", () => {
  test("negotiation: proposed terms are shown but not ticked; the stage moves from offer", () => {
    const a = analysis({
      intent: "negotiation",
      money: { amount: 25000, currency: "TWD", taxIncluded: true, asStated: "25,000 含稅" },
      details: { setLength: { value: "60 分鐘", asStated: "一小時" } },
    });
    const { changes, question } = proposeChanges(a, project({ stage: "offer", details: { fields: { setLength: "90 分鐘" } } }), ctx());
    const fee = one(changes, "fee");
    assert.deepEqual([fee.from, fee.to, fee.ticked], [30000, 25000, false]);
    const field = one(changes, "field");
    assert.deepEqual([field.key, field.from, field.to, field.ticked], ["setLength", "90 分鐘", "60 分鐘", false]);
    const stage = one(changes, "stage");
    assert.deepEqual([stage.to, stage.ticked], ["negotiating", true]);
    assert.equal(question, null);
  });

  test("a value equal to the project's isn't shown", () => {
    const a = analysis({ intent: "negotiation", money: { amount: 30000, currency: "TWD", taxIncluded: true, asStated: "" }, details: { venue: { value: "Blue Room", asStated: "" } } });
    const { changes } = proposeChanges(a, project({ details: { fields: { venue: "blue room" } } }), ctx());
    assert.deepEqual(byKind(changes, "fee"), []);
    assert.deepEqual(byKind(changes, "field"), []);
  });

  test("intent fields (what the message is doing) aren't proposed as project fields", () => {
    const a = analysis({ intent: "negotiation", details: { proposedChanges: { value: "改成 25,000", asStated: "" } } });
    assert.deepEqual(byKind(proposeChanges(a, project(), ctx()).changes, "field"), []);
  });

  test("confirmation without a contract asks about the stage and ticks the agreed terms", () => {
    const a = analysis({
      intent: "confirmation",
      summary: "Maya 確認 11/14 晚上 8 點演出，合約下週寄出。",
      dates: [date("2026-11-14", "20:00")],
    });
    const { changes, question } = proposeChanges(a, project({ details: { dates: [{ what: "演出", date: "2026-11-14", time: "", timeZone: "" }] } }), ctx());
    const d = one(changes, "date");
    assert.deepEqual([d.from?.time, d.to.time, d.index, d.ticked], ["", "20:00", 0, true]);
    const todo = changes.find((c) => c.kind === "todo" && c.purpose === "awaitContract");
    assert.equal(todo?.kind === "todo" && todo.dueDate, "2026-10-11");
    assert.deepEqual(byKind(changes, "stage"), [], "the stage is asked, never ticked");
    assert.deepEqual(question?.choices, ["signed", "negotiating"]);
    assert.deepEqual(question?.ifSigned, [], "the kept date is already being changed");
  });

  test("confirmation: signing would turn the project's other dates into calendar events", () => {
    const a = analysis({ intent: "confirmation" });
    const { question } = proposeChanges(a, project({ stage: "offer", details: { dates: [{ what: "彩排", date: "2026-11-13", time: "", timeZone: "" }] } }), ctx());
    assert.deepEqual(question?.choices, ["signed", "negotiating"]);
    assert.equal(question?.ifSigned.length, 1);
  });

  test("confirmation on a signed project asks nothing", () => {
    assert.equal(proposeChanges(analysis({ intent: "confirmation" }), project({ stage: "signed" }), ctx()).question, null);
  });

  test("a changed time on a signed project moves its calendar event", () => {
    const a = analysis({ intent: "logistics", dates: [date("2026-11-14", "21:00", "演出")] });
    const d = one(proposeChanges(a, project({ stage: "signed" }), ctx({ calendar: [event()] })).changes, "date");
    assert.deepEqual([d.eventId, d.from?.time, d.to.time, d.ticked], ["e1", "20:00", "21:00", true]);
  });

  test("a new date on a signed project becomes an event; on an unsigned one it's kept on the project", () => {
    const a = analysis({ intent: "logistics", dates: [date("2026-11-13", "15:00", "彩排")] });
    const signed = one(proposeChanges(a, project({ stage: "signed" }), ctx({ calendar: [event()] })).changes, "date");
    assert.deepEqual([signed.from, signed.asEvent], [null, true]);
    const unsigned = one(proposeChanges(a, project(), ctx()).changes, "date");
    assert.equal(unsigned.asEvent, false);
  });

  test("the reply-by date isn't proposed as a project date", () => {
    const a = analysis({ intent: "inquiry", replyBy: "2026-10-08", dates: [date("2026-10-08")] });
    assert.deepEqual(byKind(proposeChanges(a, project(), ctx()).changes, "date"), []);
  });

  test("a second inquiry fills only what the project doesn't have", () => {
    const a = analysis({
      money: { amount: 28000, currency: "TWD", taxIncluded: null, asStated: "" },
      details: { venue: { value: "Legacy", asStated: "" }, setLength: { value: "45 分鐘", asStated: "" } },
    });
    const { changes } = proposeChanges(a, project({ details: { fields: { venue: "Blue Room" } } }), ctx());
    assert.deepEqual(byKind(changes, "fee"), []);
    assert.deepEqual(byKind(changes, "field").map((c) => c.kind === "field" && c.key), ["setLength"]);
  });

  test("payment sent: the one expected payment is settled with the shortfall, and the project closes", () => {
    const a = analysis({ intent: "payment", details: { paymentStatus: { value: "已匯出", asStated: "" }, amountDue: { value: "NT$19,950", asStated: "尾款 NT$19,950" } } });
    const { changes } = proposeChanges(a, project({ stage: "collecting_payment" }), ctx({ payments: [payment()] }));
    const settle = one(changes, "settlePayment");
    assert.deepEqual([settle.paymentId, settle.expected, settle.amount, settle.settledOn, settle.ticked], ["pay1", 21000, 19950, "2026-10-04", true]);
    assert.deepEqual(one(changes, "stage").to, "closed");
    assert.equal(changes.find((c) => c.kind === "todo" && c.purpose === "reply")?.ticked, false);
  });

  test("payment sent with several candidates: picks by amount; if still unclear, nothing is ticked", () => {
    const pays = [payment({ id: "dep", installment: "deposit", amount: 9000 }), payment()];
    const paid = (amount: string) => analysis({ intent: "payment", details: { paymentStatus: { value: "paid", asStated: "" }, amountDue: { value: amount, asStated: "" } } });
    const byAmount = one(proposeChanges(paid("9,000"), project({ stage: "signed" }), ctx({ payments: pays })).changes, "settlePayment");
    assert.deepEqual([byAmount.paymentId, byAmount.ticked], ["dep", true]);
    assert.deepEqual(byKind(proposeChanges(paid("9,000"), project({ stage: "signed" }), ctx({ payments: pays })).changes, "stage"), [], "not the last payment");
    const unclear = one(proposeChanges(paid("5,000"), project({ stage: "signed" }), ctx({ payments: pays })).changes, "settlePayment");
    assert.equal(unclear.ticked, false);
  });

  test("payment with nothing expected: offers a new payment, unticked", () => {
    const a = analysis({ intent: "payment", details: { paymentStatus: { value: "sent", asStated: "" }, amountDue: { value: "5000", asStated: "" } } });
    const p = one(proposeChanges(a, project({ stage: "signed" }), ctx()).changes, "newPayment");
    assert.deepEqual([p.amount, p.ticked], [5000, false]);
  });

  test("an invoice request becomes a to-do; nothing about payments on an unsigned project", () => {
    const a = analysis({ intent: "payment", details: { paymentStatus: { value: "requested", asStated: "請開發票" } } });
    assert.ok(proposeChanges(a, project({ stage: "signed" }), ctx()).changes.some((c) => c.kind === "todo" && c.purpose === "sendInvoice"));
    assert.ok(!proposeChanges(a, project(), ctx()).changes.some((c) => c.kind === "todo" && c.purpose === "sendInvoice"));
  });

  test("contract marked signed moves the stage; key terms update the contract notes", () => {
    const a = analysis({ intent: "contract", details: { contractStage: { value: "signed", asStated: "雙方已簽" }, keyTerms: { value: "取消費 50%", asStated: "" } } });
    const { changes } = proposeChanges(a, project(), ctx());
    assert.deepEqual([one(changes, "stage").to, one(changes, "contractNotes").to], ["signed", "取消費 50%"]);
  });

  test("cancellation: stage to cancelled, with a fee on a signed project; postponement moves the date instead", () => {
    const cancel = analysis({ intent: "cancellation", details: { cancellationFee: { value: "NT$10,000", asStated: "" } } });
    const { changes } = proposeChanges(cancel, project({ stage: "signed" }), ctx());
    assert.equal(one(changes, "stage").to, "cancelled");
    assert.equal(one(changes, "newPayment").amount, 10000);
    const postpone = analysis({ intent: "cancellation", details: { newDate: { value: "12/5", asStated: "" } }, dates: [date("2026-12-05", "20:00", "新日期")] });
    const moved = proposeChanges(postpone, project({ stage: "signed" }), ctx({ calendar: [event()] })).changes;
    assert.deepEqual(byKind(moved, "stage"), []);
    assert.equal(one(moved, "date").eventId, "e1");
  });

  test("reply to-do: the stated date, else the person's default", () => {
    const stated = proposeChanges(analysis({ replyBy: "2026-10-06" }), project(), ctx()).changes;
    assert.equal(stated.find((c) => c.kind === "todo")?.kind === "todo" && one(stated, "todo").dueDate, "2026-10-06");
    const defaulted = one(proposeChanges(analysis(), project(), ctx()).changes, "todo");
    assert.equal(defaulted.dueDate, "2026-10-06");
  });

  test("to-confirm items already on the project aren't repeated", () => {
    const a = analysis({ missing: ["音響由誰提供", "是否需要發票"] });
    const { items } = one(proposeChanges(a, project({ details: { toConfirm: ["音響由誰提供"] } }), ctx()).changes, "toConfirm");
    assert.deepEqual(items, ["是否需要發票"]);
  });
});

describe("proposeNewProject", () => {
  test("links a known contact, keeps type fields, and leaves the reply-by date out of the project dates", () => {
    const a = analysis({
      money: { amount: 30000, currency: "TWD", taxIncluded: true, asStated: "" },
      details: { venue: { value: "Blue Room", asStated: "" }, proposedChanges: { value: "x", asStated: "" } },
      dates: [date("2026-11-14", "20:00"), date("2026-10-08")],
      replyBy: "2026-10-08",
    });
    const p = proposeNewProject(a, "", ctx());
    assert.deepEqual(p.contact, { existing: contact() });
    assert.equal(p.project.counterparty, "Maya Chen");
    assert.deepEqual(p.project.fields, { venue: "Blue Room" });
    assert.deepEqual(p.project.dates.map((d) => d.date), ["2026-11-14"]);
    assert.equal(p.project.quotedAmount, 30000);
  });

  test("creates a contact from the sender when none matches; a foreign amount isn't the quote", () => {
    const a = analysis({ counterparty: { name: "Ken", company: "Tokyo Live", email: "", phone: "" }, money: { amount: 200000, currency: "JPY", taxIncluded: null, asStated: "" } });
    const p = proposeNewProject(a, "", ctx({ contacts: [] }));
    assert.deepEqual(p.contact, { create: { name: "Ken", company: "Tokyo Live", email: "", phone: "" } });
    assert.equal(p.project.quotedAmount, null);
    assert.deepEqual(p.foreignAmount, { amount: 200000, currency: "JPY" });
  });
});

test("parseAmount", () => {
  assert.equal(parseAmount("NT$19,950"), 19950);
  assert.equal(parseAmount("１９，９５０元"), 19950);
  assert.equal(parseAmount("訂金 9,000、尾款 21,000"), null);
  assert.equal(parseAmount(""), null);
});
