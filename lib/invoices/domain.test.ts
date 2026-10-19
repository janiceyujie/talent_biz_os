import test from "node:test";
import assert from "node:assert/strict";
import {
  invoiceAmounts,
  invoiceInput,
  invoiceState,
  validInvoiceReceiptDate,
} from "./domain";
test("invoice cents agree with the existing finance quote", () => {
  assert.deepEqual(
    invoiceAmounts({
      amount: 123.45,
      taxRate: 8.25,
      taxIncluded: false,
      currency: "USD",
    }),
    { currency: "USD", subtotal: 123.45, tax: 10.18, total: 133.63 },
  );
  assert.deepEqual(
    invoiceAmounts({
      amount: 108.25,
      taxRate: 8.25,
      taxIncluded: true,
      currency: "USD",
    }),
    { currency: "USD", subtotal: 100, tax: 8.25, total: 108.25 },
  );
  assert.throws(() =>
    invoiceAmounts({
      amount: 1,
      taxRate: 0,
      taxIncluded: false,
      currency: "EUR",
    }),
  );
  assert.throws(() =>
    invoiceAmounts({
      amount: 0,
      taxRate: 0,
      taxIncluded: false,
      currency: "USD",
    }),
  );
});
test("only sent, unpaid billing documents become overdue", () => {
  assert.equal(
    invoiceState("draft", false, "2026-01-01", "2026-10-01"),
    "draft",
  );
  assert.equal(invoiceState("sent", true, "2026-01-01", "2026-10-01"), "paid");
  assert.equal(
    invoiceState("sent", false, "2026-01-01", "2026-10-01"),
    "overdue",
  );
  assert.equal(invoiceState("sent", false, "2026-10-01", "2026-10-01"), "sent");
});
test("dates, tax approval, and email headers must be valid", () => {
  const input = {
    paymentId: "11111111-1111-4111-8111-111111111111",
    issueOn: "2026-10-01",
    dueOn: "2026-10-15",
    sellerName: "Artist",
    sellerAddress: "1 Example Road",
    sellerEmail: "a@example.com",
    buyerName: "Client",
    buyerAddress: "2 Example Road",
    recipient: "b@example.com",
    description: "Service",
    paymentInstructions: "Bank transfer",
    taxNote: "Reviewed",
    subject: "Invoice",
    body: "Invoice attached",
    taxConfirmed: true,
  };
  assert.ok(invoiceInput.safeParse(input).success);
  for (const change of [
    { taxConfirmed: false },
    { documentKind: "tw_uniform_invoice" },
    { documentKind: "unknown" },
    { dueOn: "2026-09-01" },
    { recipient: "b@example.com\r\nBcc: x@example.com" },
    { subject: "Invoice\nBcc: x@example.com" },
    { description: "x".repeat(1501) },
  ])
    assert.equal(
      invoiceInput.safeParse({ ...input, ...change }).success,
      false,
    );
});

test("receipt date must be a real day within the workspace issue-to-today range", () => {
  for (const value of ["", "2026-02-30", "2026-10-16", "2026-10-19", "2026-10-17T12:00:00Z"])
    assert.equal(validInvoiceReceiptDate(value, "2026-10-17", "2026-10-18"), false);
  assert.equal(validInvoiceReceiptDate("2026-10-17", "2026-10-17", "2026-10-18"), true);
  assert.equal(validInvoiceReceiptDate("2026-10-18", "2026-10-17", "2026-10-18"), true);
});


test("TWD payment requests preserve currency and inclusive totals without determining taxability", () => {
  assert.deepEqual(invoiceAmounts({amount:55000,taxRate:5,taxIncluded:true,currency:"TWD"}),
    {currency:"TWD",subtotal:52380.95,tax:2619.05,total:55000});
  assert.deepEqual(invoiceAmounts({amount:55000,taxRate:5,taxIncluded:false,currency:"TWD"}),
    {currency:"TWD",subtotal:55000,tax:2750,total:57750});
});
