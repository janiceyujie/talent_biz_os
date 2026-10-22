// What may go on a deal, and what counts, at each stage (decision 0018). Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { quote } from "@/lib/domain/money";
import type { Payment, Stage } from "@/lib/types";
import { isOpenStage, isSigned } from "./phases";
import { countedPayments, summarize } from "./workflow";

// A settled one received its settled amount, or its whole total, on its settled date: one receipt.
const payment = ({ settledAmount = null, ...over }: Partial<Payment> & { settledAmount?: number | null } = {}): Payment => {
  const p = {
    id: "x", projectId: null, projectType: "gig", direction: "in", installment: "regular", label: "", amount: 1000, currency: "TWD",
    taxRate: 0, taxIncluded: true, recordedDate: "2026-10-01", dueDate: null, status: "expected",
    settledDate: null, invoiceRef: "", notes: "", voided: false, receipts: [], ...over,
  } as Payment;
  const cash = settledAmount ?? quote(p.amount, p.taxRate, p.taxIncluded, p.currency).total;
  const receipt = { id: `${p.id}-r`, date: p.settledDate!, cash, withheld: 0, note: "", replacesId: null, withdrawn: false, recordedAt: "" };
  return over.receipts || p.status !== "settled" ? p : { ...p, receipts: [receipt] };
};
const projects = [
  { id: "offer", stage: "offer" as Stage },
  { id: "signed", stage: "signed" as Stage },
];

describe("isOpenStage", () => {
  test("anything may be added before or after signing, not once a deal is declined or cancelled", () => {
    for (const s of ["offer", "negotiating", "signed", "in_progress", "collecting_payment", "closed"] as Stage[]) assert.equal(isOpenStage(s), true, s);
    for (const s of ["declined", "cancelled"] as Stage[]) assert.equal(isOpenStage(s), false, s);
  });
  test("signed is still execution or settlement", () => {
    assert.deepEqual((["offer", "signed", "closed", "declined"] as Stage[]).map(isSigned), [false, true, true, false]);
  });
});

describe("countedPayments", () => {
  test("money still expected counts only for signed work or no project", () => {
    const got = countedPayments(
      [payment({ id: "a", projectId: "offer" }), payment({ id: "b", projectId: "signed" }), payment({ id: "c" })],
      projects,
    );
    assert.deepEqual(got.map((p) => p.id), ["b", "c"]);
  });
  test("money that moved counts whatever the stage: a deposit, a pitch's travel", () => {
    const got = countedPayments(
      [payment({ id: "deposit", projectId: "offer", status: "settled", settledDate: "2026-10-02" }), payment({ id: "travel", projectId: "offer", direction: "out", status: "settled", settledDate: "2026-10-02" })],
      projects,
    );
    assert.deepEqual(got.map((p) => p.id), ["deposit", "travel"]);
  });
});

describe("summarize", () => {
  test("receivable leaves out a deal still being negotiated; received keeps its deposit", () => {
    const s = summarize({
      payments: [
        payment({ amount: 80000, projectId: "offer", dueDate: "2026-11-01" }),
        payment({ amount: 30000, projectId: "signed", dueDate: "2026-11-01" }),
        payment({ amount: 5000, projectId: "offer", status: "settled", settledDate: "2026-10-05" }),
      ],
      projects,
    });
    assert.equal(s.receivable, 30000);
    assert.equal(s.received, 5000);
  });
});


test("partial receipts and withholding keep genuine balances visible after a deal is cancelled", () => {
  const partial = payment({ id: "partial", projectId: "offer", amount: 1000, receipts: [{id:"r1",date:"2026-10-02",cash:400,withheld:100}] });
  const data = { payments: [partial, payment({id:"plan", projectId:"offer", amount:9000})], projects: [{id:"offer", stage:"cancelled" as const}] };
  assert.deepEqual(countedPayments(data.payments, data.projects).map(p=>p.id), ["partial"]);
  const report = summarize(data);
  assert.equal(report.receivable, 500);
  assert.equal(report.received, 400);
  const reversed = {...partial, receipts:[...partial.receipts!, {id:"r2",replaces:"r1",date:"2026-10-02",cash:0,withheld:0,withdrawn:true}]};
  assert.deepEqual(countedPayments([reversed],data.projects), []);
});
