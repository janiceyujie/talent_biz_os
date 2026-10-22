// The restricted path's code steps: masking, checking the model's fields, matching. Made-up notices only. Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Payment } from "@/lib/types";
import { checkNotice, directionOf, statesDate, type NoticeOutput } from "./check";
import { maskNotice } from "./mask";
import { matchNotice, namesMatch } from "./match";

describe("maskNotice", () => {
  test("account and card numbers keep their last four digits", () => {
    assert.equal(maskNotice("帳號 0081234567893321 入帳"), "帳號 ****3321 入帳");
    assert.equal(maskNotice("account 123-456-789012"), "account ****9012");
    assert.equal(maskNotice("card 4111 1111 1111 1234 charged"), "card ****1234 charged");
    assert.equal(maskNotice("帳號 ***-****-5678"), "帳號 ****5678");
  });
  test("balances, codes, ID numbers, and links are replaced", () => {
    assert.equal(maskNotice("可用餘額 NT$1,234,567"), "可用餘額 [balance]");
    assert.equal(maskNotice("Available balance: $8,800.50"), "Available balance: [balance]");
    assert.equal(maskNotice("驗證碼 123456，請勿告知他人"), "驗證碼 [code],請勿告知他人");
    assert.equal(maskNotice("身分證 A123456789"), "身分證 [id]");
    assert.equal(maskNotice("詳情 https://bank.example/x?id=9"), "詳情 [link]");
  });
  test("amounts, dates, short numbers, and names stay", () => {
    const text = "2026-10-16 09:12 王＊明 匯入 NT$45,000，末四碼 3321，115/10/16";
    assert.equal(maskNotice(text), text.normalize("NFKC"));
  });
  test("full-width digits are read as plain ones", () => {
    assert.equal(maskNotice("帳號０１２３４５６７８９"), "帳號****6789");
  });
});

const out = (o: Partial<NoticeOutput>): NoticeOutput => ({ direction: "in", amount: null, currency: "TWD", date: null, payer: null, last4: null, ...o });

describe("checkNotice", () => {
  const text = maskNotice("您的帳戶 ****3321 於 115/10/16 收到 王＊明 匯入 NT$45,000");
  test("keeps fields the notice states", () => {
    assert.deepEqual(checkNotice(out({ amount: 45000, date: "2026-10-16", payer: "王*明", last4: "3321" }), text), {
      amount: 45000,
      currency: "TWD",
      date: "2026-10-16",
      payer: "王*明",
      last4: "3321",
    });
  });
  test("a number the notice doesn't state is not kept", () => {
    assert.equal(checkNotice(out({ amount: 54000 }), text), null);
    const f = checkNotice(out({ amount: 45000, date: "2026-10-17", payer: "李大華", last4: "1234" }), text)!;
    assert.deepEqual([f.date, f.payer, f.last4], [null, null, null]);
  });
  test("money out is dropped", () => {
    assert.equal(checkNotice(out({ direction: "out", amount: 45000 }), "帳戶異動通知 NT$45,000"), null);
  });
  test("a currency other than TWD must be written in the notice", () => {
    assert.equal(checkNotice(out({ amount: 2400, currency: "USD" }), "Received US$2,400.00")!.currency, "USD");
    assert.equal(checkNotice(out({ amount: 2400, currency: "USD" }), "收到 2,400 元")!.currency, "TWD");
  });
});

describe("directionOf", () => {
  test("one-sided wording decides, whatever the model said", () => {
    assert.equal(directionOf("您的信用卡末四碼 5678 於 10/12 在 某某咖啡 消費 NT$285", "in"), "out");
    assert.equal(directionOf("You spent NT$285 at a cafe", "in"), "out");
    assert.equal(directionOf("王*明 匯入 NT$45,000", "out"), "in");
    assert.equal(directionOf("Harbor Sound Ltd sent you NT$12,000", "unknown"), "in");
  });
  test("both sides, or neither: the model's reading", () => {
    assert.equal(directionOf("轉出 NT$500，轉入 NT$500", "in"), "in");
    assert.equal(directionOf("帳戶異動通知 NT$500", "unknown"), "unknown");
  });
  test("a card charge read as money in is dropped", () => {
    assert.equal(checkNotice(out({ amount: 285, payer: "某某咖啡" }), "信用卡消費通知 於 10/12 在 某某咖啡 消費 NT$285"), null);
  });
});

describe("statesDate", () => {
  test("with the year, the ROC year, or month and day", () => {
    assert.ok(statesDate("2026/10/16 入帳", "2026-10-16"));
    assert.ok(statesDate("115年10月16日", "2026-10-16"));
    assert.ok(statesDate("於 10/16 入帳", "2026-10-16"));
    assert.ok(!statesDate("於 10/6 入帳", "2026-10-16"));
    assert.ok(!statesDate("2026/2/30", "2026-02-30"));
  });
});

const payment = (o: Partial<Payment>): Payment => ({
  id: "p",
  projectId: "proj",
  projectType: "other",
  direction: "in",
  installment: "regular",
  label: "",
  amount: 45000,
  currency: "TWD",
  taxRate: 0,
  taxIncluded: true,
  recordedDate: "2026-10-01",
  dueDate: null,
  status: "expected",
  receipts: [],
  settledDate: null,
  invoiceRef: "",
  notes: "",
  voided: false,
  ...o,
});

describe("matchNotice", () => {
  const none = () => [];
  test("an amount short by a transfer fee matches", () => {
    assert.deepEqual(matchNotice({ amount: 44985, currency: "TWD", payer: null }, [payment({})], none), { payment: payment({}), shortBy: 15 });
  });
  test("more than the expected, or short by more than the fee, doesn't", () => {
    assert.equal(matchNotice({ amount: 45010, currency: "TWD", payer: null }, [payment({})], none), null);
    assert.equal(matchNotice({ amount: 44500, currency: "TWD", payer: null }, [payment({})], none), null); // over 1% (450)
    assert.ok(matchNotice({ amount: 99000, currency: "TWD", payer: null }, [payment({ amount: 100000 })], none));
  });
  test("settled, voided, and outgoing payments are never matched", () => {
    for (const p of [payment({ status: "settled" }), payment({ voided: true }), payment({ direction: "out" })])
      assert.equal(matchNotice({ amount: 45000, currency: "TWD", payer: null }, [p], none), null);
  });
  test("tax not included in the amount counts toward the expected total", () => {
    assert.ok(matchNotice({ amount: 47250, currency: "TWD", payer: null }, [payment({ taxRate: 5, taxIncluded: false })], none));
  });
  test("two close payments: the payer's name decides, or nothing is suggested", () => {
    const a = payment({ id: "a", projectId: "pa" });
    const b = payment({ id: "b", projectId: "pb" });
    const names = (p: Payment) => (p.projectId === "pa" ? ["王大明"] : ["林小美"]);
    assert.equal(matchNotice({ amount: 45000, currency: "TWD", payer: "王*明" }, [a, b], names)?.payment.id, "a");
    assert.equal(matchNotice({ amount: 45000, currency: "TWD", payer: null }, [a, b], names), null);
  });
});

describe("namesMatch", () => {
  test("a masked or shortened name lines up", () => {
    assert.ok(namesMatch("王*明", "王大明"));
    assert.ok(namesMatch("樂聲音樂有限公司", "樂聲音樂"));
    assert.ok(!namesMatch("王*華", "王大明"));
    assert.ok(!namesMatch("王", "王大明"));
  });
});

test("a later bank transfer matches only the unpaid balance, excluding withholding", () => {
  const p=payment({amount:1000,settledAmount:600,receipts:[{id:"first",date:"2026-10-16",cash:600,withheld:100}]});
  assert.equal(matchNotice({amount:300,currency:"TWD",payer:null},[p],()=>[])?.shortBy,0);
  assert.equal(matchNotice({amount:1000,currency:"TWD",payer:null},[p],()=>[]),null);
  assert.equal(matchNotice({amount:300,currency:"USD",payer:null},[p],()=>[]),null);
});
