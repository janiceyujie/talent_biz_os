// Money received as receipts (decision 0021): parts, withholding, corrections. Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AppData, Payment, PaymentReceipt, ProjectSummary } from "@/lib/types";
import { financeInsights } from "./insights";
import {
  activeReceipts,
  paymentCash,
  paymentRemaining,
  paymentShort,
  paymentWithheld,
  projectSettlement,
  statusAfterReceipts,
  summarize,
} from "./workflow";

const receipt = (over: Partial<PaymentReceipt> = {}): PaymentReceipt => ({
  id: "r1", date: "2026-10-05", cash: 0, withheld: 0, note: "", replacesId: null, withdrawn: false, recordedAt: "", ...over,
});
const payment = (over: Partial<Payment> = {}): Payment => ({
  id: "x", projectId: "p1", projectType: "gig", direction: "in", installment: "regular", label: "", amount: 100000, currency: "TWD",
  taxRate: 0, taxIncluded: true, recordedDate: "2026-10-01", dueDate: "2026-10-31", status: "expected", receipts: [],
  settledDate: null, invoiceRef: "", notes: "", voided: false, ...over,
});
const project = (over: Partial<ProjectSummary> = {}): ProjectSummary =>
  ({ id: "p1", title: "", stage: "signed", archived: false, currency: "TWD", quotedAmount: 100000, taxRate: 0, taxIncluded: true, ...over }) as ProjectSummary;
const data = (payments: Payment[], projects: ProjectSummary[] = [project()]) =>
  ({ talent: { id: "t", name: "", timeZone: "Asia/Taipei" }, payments, projects, calendar: [], organizations: [] }) as unknown as AppData;

describe("receipts", () => {
  test("part received: the rest is still to come", () => {
    const p = payment({ receipts: [receipt({ cash: 60000 })] });
    assert.equal(paymentCash(p), 60000);
    assert.equal(paymentRemaining(p), 40000);
    assert.equal(paymentShort(p), 0);
    assert.equal(statusAfterReceipts(p, "coming"), "expected");
  });

  test("withheld counts toward the total but not as cash", () => {
    const p = payment({ receipts: [receipt({ cash: 87890, withheld: 12110 })] });
    assert.equal(paymentCash(p), 87890);
    assert.equal(paymentWithheld(p), 12110);
    assert.equal(paymentRemaining(p), 0);
    assert.equal(statusAfterReceipts(p, "coming"), "settled");
  });

  test("a correction replaces a receipt, a withdrawal takes it out; both stay listed", () => {
    const p = payment({
      receipts: [
        receipt({ id: "a", cash: 50000 }),
        receipt({ id: "b", cash: 45000, replacesId: "a" }),
        receipt({ id: "c", cash: 10000 }),
        receipt({ id: "d", replacesId: "c", withdrawn: true }),
      ],
    });
    assert.deepEqual(activeReceipts(p).map((r) => r.id), ["b"]);
    assert.equal(paymentCash(p), 45000);
    assert.equal(p.receipts.length, 4);
  });

  test("closing short needs money in; with none it stays open", () => {
    assert.equal(statusAfterReceipts(payment({ receipts: [receipt({ cash: 90000 })] }), "closed"), "settled");
    assert.equal(statusAfterReceipts(payment(), "closed"), "expected");
    const short = payment({ status: "settled", receipts: [receipt({ cash: 90000 })] });
    assert.equal(paymentShort(short), 10000);
    assert.equal(paymentRemaining(short), 0);
  });
});

describe("totals from receipts", () => {
  const parts = payment({ receipts: [receipt({ id: "a", date: "2026-09-20", cash: 60000 }), receipt({ id: "b", date: "2026-10-05", cash: 30000, withheld: 10000 })], status: "settled" });

  test("each part counts on its own date", () => {
    assert.equal(summarize(data([parts]), "2026-09-01", "2026-09-30").received, 60000);
    assert.equal(summarize(data([parts]), "2026-10-01", "2026-10-31").received, 30000);
    const months = financeInsights(data([parts]), new Date("2026-10-15T04:00:00Z")).monthly;
    assert.deepEqual(months.slice(-2).map((m) => [m.month, m.received]), [["2026-09", 60000], ["2026-10", 30000]]);
  });

  test("outstanding is what's left, and money in on a deal still talking counts anyway", () => {
    const open = payment({ receipts: [receipt({ cash: 25000 })] });
    const s = summarize(data([open]));
    assert.equal(s.receivable, 75000);
    assert.equal(s.received, 25000);
    const talking = summarize(data([open], [project({ stage: "negotiating" })]));
    assert.equal(talking.receivable, 75000); // A partially paid deal must retain its remaining receivable.
    assert.equal(talking.received, 25000); // money that moved is a fact
  });

  test("a project's settlement splits received, withheld, pending, and short", () => {
    const s = projectSettlement(data([parts, payment({ id: "y", amount: 20000, receipts: [receipt({ cash: 5000 })] })]), project({ quotedAmount: 120000 }));
    assert.deepEqual([s.billed, s.received, s.withheld, s.pending, s.shortfall], [120000, 95000, 10000, 15000, 0]);
  });
});
