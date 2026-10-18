/** Local-only acceptance checks with synthetic identities and a loopback SMTP catcher. */
import env from "@next/env";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
env.loadEnvConfig(process.cwd());
const base = process.env.WORKFLOW_TEST_URL || "http://localhost:3000";
const local = (value: string) =>
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname);
assert.equal(process.env.APP_ENV, "development");
for (const url of [
  base,
  process.env.DATABASE_URL!,
  process.env.SMTP_URL!,
  process.env.STORAGE_S3_ENDPOINT!,
])
  assert.ok(local(url), "Local targets only");
const { db } = await import("../lib/db");
const s = await import("../lib/db/schema");
const { default: postgres } = await import("postgres");
const q = postgres(process.env.DATABASE_URL!);
const { hashPassword } = await import("better-auth/crypto");
const { queue } = await import("../lib/queue");
const { prepareInvoices } = await import("../lib/invoices/service");
const { renderInvoicePdf } = await import("../lib/invoices/pdf");
const { PDFDocument } = await import("pdf-lib");
const suffix = randomBytes(5).toString("hex");
const people = Array.from({ length: 3 }, (_, i) => ({
  personId: randomUUID(),
  talentId: randomUUID(),
  projectId: randomUUID(),
  name: `Invoice QA ${i}`,
  email: `invoice-qa-${suffix}-${i}@example.invalid`,
  password: randomBytes(20).toString("base64url"),
}));
const cookies: string[] = [];
const [artist, , manager] = people;
const today = new Date().toISOString().slice(0, 10),
  later = "2099-10-31";
let checks = 0;
const ok = (value: unknown, label: string) => {
  assert.ok(value, label);
  checks++;
};
const request = (path: string, cookie = "", body?: unknown, origin = base) =>
  fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      Cookie: cookie,
      Origin: origin,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
const post = async (path: string, body: unknown, cookie = cookies[0]) => {
  const r = await request(path, cookie, body);
  return { status: r.status, data: await r.json() };
};
async function action(name: string, args: unknown[], cookie = cookies[0]) {
  const manifest = JSON.parse(
    await readFile(".next/dev/server/server-reference-manifest.json", "utf8"),
  );
  const entry = Object.entries(manifest.node).find(
    ([, v]) => (v as { exportedName: string }).exportedName === name,
  );
  assert.ok(entry, `Missing action ${name}`);
  const r = await fetch(base + "/finance", {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: base,
      "Content-Type": "text/plain;charset=UTF-8",
      "Next-Action": entry[0],
    },
    body: JSON.stringify(args),
  });
  const body = await r.text();
  assert.equal(r.status, 200);
  const root = body.split("\n").find((line) => line.startsWith("0:"));
  assert.ok(root);
  const id = JSON.parse(root.slice(2)).a?.replace("$@", "");
  const result = body
    .split("\n")
    .findLast(
      (line) =>
        line.startsWith(`${id}:`) &&
        /^(null|"|\[|\{)/.test(line.slice(String(id).length + 1)),
    );
  assert.ok(result);
  return JSON.parse(result.slice(String(id).length + 1));
}
let sentId = "";
try {
  for (const p of people) {
    await db.insert(s.person).values({
      id: p.personId,
      email: p.email,
      emailVerified: true,
      displayName: p.name,
      locale: "en",
    });
    await db.insert(s.authAccount).values({
      personId: p.personId,
      accountId: p.personId,
      providerId: "credential",
      password: await hashPassword(p.password),
    });
    await db.insert(s.talent).values({
      id: p.talentId,
      name: p.name,
      vertical: "music",
      timeZone: "UTC",
    });
    await db.insert(s.membership).values({
      talentId: p.talentId,
      personId: p.personId,
      role: "owner",
      status: "active",
    });
    await db.insert(s.project).values({
      id: p.projectId,
      talentId: p.talentId,
      title: "Synthetic USD performance",
      counterparty: "Test Client",
      type: "other",
      stage: "signed",
      quoteCurrency: "USD",
    });
    const r = await request("/api/auth/sign-in/email", "", {
      email: p.email,
      password: p.password,
    });
    ok(r.status === 200, "Fixture login");
    cookies.push(
      r.headers
        .getSetCookie()
        .map((v) => v.split(";")[0])
        .join(";"),
    );
  }
  await db.insert(s.membership).values({
    personId: manager.personId,
    talentId: artist.talentId,
    role: "manager",
    status: "active",
  });
  const payments = await db
    .insert(s.payment)
    .values(
      Array.from({ length: 26 }, (_, i) => ({
        talentId: artist.talentId,
        projectId: artist.projectId,
        label: `Synthetic performance ${i}`,
        direction: "in" as const,
        amount: 1000 + i,
        currency: "USD",
        taxRate: 0,
        taxIncluded: false,
        recordedOn: today,
        dueOn: later,
      })),
    )
    .returning();
  const input = {
    paymentId: payments[0].id,
    issueOn: today,
    dueOn: later,
    documentLanguage: "en",
    sellerName: "Taloox Test Artist / 測試音樂工作室",
    sellerAddress: "100 Example Avenue\nNew York, NY 10001",
    sellerEmail: "seller@example.invalid",
    buyerName: "Example Events / 測試活動公司",
    buyerAddress: "200 Example Street\nNew York, NY 10002",
    recipient: `invoice-test-${suffix}@example.invalid`,
    description: "Live performance fee / 現場演出費用",
    paymentInstructions:
      "Synthetic test only. Do not transfer funds.\nPayment instructions must be confirmed before a real invoice is sent.",
    taxNote:
      "Test fixture: no tax assessed. Not a determination of taxability.",
    subject: `Invoice acceptance ${suffix}`,
    body: "This is a synthetic invoice test. No payment is due.",
    taxConfirmed: true,
  };
  ok((await request("/api/invoices")).status === 401, "Anonymous list denied");
  ok(
    (
      await request(
        "/api/invoices",
        cookies[0],
        input,
        "https://example.invalid",
      )
    ).status === 409,
    "Cross-origin save denied",
  );
  ok(
    (await post("/api/invoices", { ...input, taxConfirmed: false })).status ===
      409,
    "Tax confirmation required",
  );
  await q`update payment set invoice_ref='EXTERNAL-001' where id=${payments[0].id}`;
  ok(
    (await post("/api/invoices", input)).data.error === "externalInvoice",
    "External invoice reference cannot be silently replaced",
  );
  ok((await post("/api/invoices/payment-availability", { paymentIds: [payments[0].id] })).data.length === 0, "External invoice excluded from new invoice choices");
  await q`update payment set invoice_ref=null where id=${payments[0].id}`;
  const availabilityPath = "/api/invoices/payment-availability";
  ok((await post(availabilityPath, { paymentIds: [payments[0].id] })).data.includes(payments[0].id), "Uninvoiced payment remains available");
  ok((await post(availabilityPath, { paymentIds: [payments[0].id] }, cookies[1])).data.length === 0, "Payment availability is owner scoped");
  ok((await post(availabilityPath, { paymentIds: Array(201).fill(payments[0].id) })).status === 400, "Availability batch is bounded");
  ok((await request(availabilityPath, cookies[0], { paymentIds: [payments[0].id] }, "https://example.invalid")).status === 409, "Cross-origin availability denied");
  const created = await post("/api/invoices", input);
  ok(created.status === 200, "Create invoice");
  await q`update invoice set status='cancelled' where id=${created.data.id}`;
  ok((await post(availabilityPath, { paymentIds: [payments[0].id] })).data.includes(payments[0].id), "Cancelled invoice allows a replacement draft");
  await q`update payment set invoice_ref=(select number from invoice where id=${created.data.id}) where id=${payments[0].id}`;
  ok((await post(availabilityPath, { paymentIds: [payments[0].id] })).data.includes(payments[0].id), "Cancelled internal reference allows replacement");
  await q`update payment set invoice_ref=null where id=${payments[0].id}`;
  await q`update invoice set status='draft' where id=${created.data.id}`;
  ok((await post(availabilityPath, { paymentIds: [payments[0].id, payments[1].id] })).data.join() === payments[1].id, "Existing invoice excluded while other payment remains available");
  const reminder = await (
    await request("/api/invoices?ready=1&count=1", cookies[0])
  ).json();
  ok(
    reminder.total === 1 && Object.keys(reminder).length === 1,
    "Reminder reads only a scoped count",
  );
  ok(
    (await (await request("/api/invoices?ready=1&count=1", cookies[1])).json())
      .total === 0,
    "Reminder count isolated by owner",
  );
  const id = created.data.id;
  sentId = id;
  ok(
    (await post("/api/invoices", input)).data.error === "duplicate",
    "Duplicate receivable blocked",
  );
  for (const cookie of [cookies[1], cookies[2]]) {
    ok(
      (await request(`/api/invoices/${id}`, cookie)).status === 404,
      "Foreign invoice hidden",
    );
    ok(
      (await request(`/api/invoices/${id}/pdf`, cookie)).status === 404,
      "Foreign PDF hidden",
    );
    ok(
      (
        await post(
          `/api/invoices/${id}`,
          { op: "createDraft", revision: 1, confirmed: true },
          cookie,
        )
      ).status === 409,
      "Manager/foreign draft denied",
    );
  }
  ok(
    (
      await post(`/api/invoices/${id}`, {
        op: "createDraft",
        revision: 1,
        confirmed: false,
      })
    ).status === 400,
    "Explicit draft approval required",
  );
  await q`update payment set amount=999 where id=${payments[0].id}`;
  ok(
    (
      await post(`/api/invoices/${id}`, {
        op: "createDraft",
        revision: 1,
        confirmed: true,
      })
    ).data.error === "amountChanged",
    "Changed amount blocks delivery",
  );
  await q`update payment set amount=1000 where id=${payments[0].id}`;
  const edited = await post("/api/invoices", { ...input, id, revision: 1 });
  ok(edited.status === 200, "Draft editable");
  ok(
    (await post("/api/invoices", { ...input, id, revision: 1 })).data.error ===
      "changed",
    "Stale revision denied",
  );
  const detail = await (
    await request(`/api/invoices/${id}`, cookies[0])
  ).json();
  const draft = await request(`/api/invoices/${id}/pdf`, cookies[0]);
  ok(
    draft.status === 200 &&
      draft.headers.get("content-type") === "application/pdf",
    "PDF route works",
  );
  const draftBytes = new Uint8Array(await draft.arrayBuffer());
  ok(
    (await PDFDocument.load(draftBytes)).getPageCount() === 1,
    "Normal PDF fits one page",
  );
  await mkdir("/private/tmp/taloox-invoice-qa", { recursive: true });
  await writeFile(
    "/private/tmp/taloox-invoice-qa/invoice-preview.pdf",
    draftBytes,
  );
  const long = await renderInvoicePdf(
    {
      ...detail,
      snapshot: {
        ...detail.snapshot,
        documentLanguage: "zh-TW",
        sellerAddress: "臺北市測試地址測試樓層\n".repeat(35),
        description:
          "Long multilingual performance description / 音樂演出內容\n".repeat(
            25,
          ),
        paymentInstructions: "Test bank instructions / 測試付款方式\n".repeat(
          20,
        ),
      },
    },
    true,
  );
  ok(
    (await PDFDocument.load(long)).getPageCount() > 1,
    "Long Chinese PDF paginates",
  );
  await writeFile("/private/tmp/taloox-invoice-qa/invoice-long-zh.pdf", long);
  // Synthetic legacy issued state exercises existing finance and partner behavior.
  // Gmail draft creation and user-sent reconciliation are covered by check-invoice-gmail-drafts.mts.
  const { writeBytes, readBytes } = await import("../lib/storage");
  const fixtureKey=`${artist.talentId}/invoices/${id}/2.pdf`;
  const frozenBytes=Buffer.from(await renderInvoicePdf(detail,false));
  await writeBytes(fixtureKey,frozenBytes,"application/pdf");
  await q`update invoice set status='sent',storage_key=${fixtureKey},sent_at=now() where id=${id}`;
  await q`update payment set invoice_ref=${detail.number},due_on=${later} where id=${payments[0].id}`;
  const [stored]=await q`select * from invoice where id=${id}`;
  ok(Buffer.from(await readBytes(stored.storage_key)).equals(frozenBytes),"Stored PDF matches issued fixture");
  ok(
    (await post("/api/invoices", { ...input, id, revision: 2 })).data.error ===
      "changed",
    "Issued invoice cannot be edited",
  );
  ok(
    (
      await post(`/api/invoices/${id}`, {
        op: "cancel",
        revision: 2,
        confirmed: true,
      })
    ).data.error === "changed",
    "Issued invoice cannot be cancelled as draft",
  );
  await (await request("/finance", cookies[0])).text();
  const paymentEdit = {
    id: payments[0].id,
    projectId: artist.projectId,
    label: payments[0].label,
    direction: "in",
    installment: "regular",
    amount: 1000,
    currency: "USD",
    taxRate: 0,
    taxIncluded: false,
    recordedDate: today,
    dueDate: later,
    status: "expected",
    settledDate: "",
    settledAmount: "",
    invoiceRef: detail.number,
    notes: "Synthetic QA note",
  };
  ok(
    (await action("savePayment", [{ ...paymentEdit, amount: 2000 }])) !== null,
    "Issued payment amount cannot be changed through Finance",
  );
  ok(
    (await action("voidPayment", [payments[0].id, true])) !== null,
    "Issued receivable cannot be voided through Finance",
  );
  ok(
    (await action("savePayment", [paymentEdit])) === null,
    "Issued receivable notes remain editable",
  );
  const billingDefaults = {
    sellerName: input.sellerName,
    sellerAddress: input.sellerAddress,
    sellerEmail: input.sellerEmail,
    paymentInstructions: input.paymentInstructions,
  };
  ok((await (await request("/api/invoices/defaults", cookies[0])).json()) === null,
    "Saving an invoice does not implicitly save billing defaults");
  ok((await request("/api/invoices/defaults", "", billingDefaults)).status === 401,
    "Anonymous defaults write is rejected");
  ok((await request("/api/invoices/defaults", cookies[0], billingDefaults, "https://untrusted.invalid")).status !== 200,
    "Cross-origin defaults write is rejected");
  ok((await post("/api/invoices/defaults", { ...billingDefaults, recipient: "wrong@example.invalid" })).status === 400,
    "Defaults reject customer or extra fields");
  ok((await post("/api/invoices/defaults", { ...billingDefaults, sellerAddress: "" })).status === 400,
    "Incomplete billing defaults are rejected");
  ok((await post("/api/invoices/defaults", billingDefaults)).status === 200,
    "Owner can explicitly save billing defaults");
  assert.deepEqual(await (await request("/api/invoices/defaults", cookies[0])).json(), billingDefaults);
  ok(true, "Saved defaults round-trip exactly");
  ok((await (await request("/api/invoices/defaults", cookies[1])).json()) === null,
    "Billing defaults cannot cross workspaces");
  ok((await (await request("/api/invoices/defaults", cookies[2])).json()) === null,
    "Manager cannot read artist billing defaults");
  ok((await post("/api/invoices/defaults", { ...billingDefaults, sellerAddress: "Updated default address" })).status === 200,
    "Owner can update saved defaults");
  const preservedInvoice = await (await request(`/api/invoices/${id}`, cookies[0])).json();
  ok(preservedInvoice.snapshot.sellerAddress === input.sellerAddress,
    "Updating defaults preserves the existing invoice snapshot");
  await (await request("/contacts", cookies[0])).text();
  const savedOrg = await action("saveOrganization", [{name: "Billing QA Partner", notes: "", billingAddress: "100 Partner Avenue", billingEmail: "accounts@example.invalid"}]);
  ok(!!savedOrg.id, "Company billing details can be saved");
  const partnerId = savedOrg.id;
  await action("saveOrganization", [{id: partnerId, name: "Billing QA Partner", notes: "Partial edit"}]);
  const [partner] = await q`select * from organization where id=${partnerId}`;
  ok(partner.billing_address === "100 Partner Avenue" && partner.billing_email === "accounts@example.invalid", "Partial company edit preserves billing details");
  const deniedOrg = await action("saveOrganization", [{id: partnerId, name: "Other owner", billingAddress: "Overwrite"}], cookies[1]);
  ok(!!deniedOrg.error, "Foreign owner cannot edit company billing details");
  ok((await action("saveContact", [{name: "Billing QA Contact", role: "counterparty", email: "booker@example.invalid", phone: "", notes: "", organizationId: partnerId, billingAddress: "200 Contact Avenue"}])) === null, "Contact billing address can be saved");
  const [savedContact] = await q`select * from contact where talent_id=${artist.talentId} and name='Billing QA Contact'`;
  ok(savedContact.billing_address === "200 Contact Avenue", "Contact address persisted in PostgreSQL");
  ok((await action("saveContact", [{id: savedContact.id, name: "Billing QA Contact", role: "counterparty", email: "booker@example.invalid", phone: "", notes: "Partial edit"}])) === null, "Partial contact edit succeeds");
  const [preservedContact] = await q`select * from contact where id=${savedContact.id}`;
  ok(preservedContact.billing_address === "200 Contact Avenue", "Partial contact edit preserves billing address");
  ok((await action("saveContact", [{id: savedContact.id, name: "Other owner", role: "counterparty", billingAddress: "Overwrite"}], cookies[1])) !== null, "Foreign owner cannot edit contact billing address");
  ok((await action("saveOrganization", [{name: "Invalid billing email", billingEmail: "invalid"}])).error, "Invalid company billing email rejected");
  const buyerPage = await (await request("/finance", cookies[0])).text();
  ok(buyerPage.includes("100 Partner Avenue") && buyerPage.includes("200 Contact Avenue"), "Owner workspace supplies persisted billing details");
  const foreignPage = await (await request("/finance", cookies[1])).text();
  ok(!foreignPage.includes("100 Partner Avenue") && !foreignPage.includes("200 Contact Avenue"), "Foreign workspace does not receive billing addresses");
  const buyerRoute = "/api/invoices/buyer-details";
  const buyerTarget = {kind: "organization", id: partnerId};
  const reviewBuyer = {...buyerTarget, op: "review"};
  ok((await request(buyerRoute, "", reviewBuyer)).status === 401, "Anonymous buyer writeback review denied");
  ok((await request(buyerRoute, cookies[0], reviewBuyer, "https://untrusted.invalid")).status !== 200, "Cross-origin buyer review denied");
  ok((await post(buyerRoute, reviewBuyer, cookies[1])).data.error === "buyerUnavailable", "Foreign buyer review denied");
  ok((await post(buyerRoute, reviewBuyer, cookies[2])).data.error === "buyerUnavailable", "Manager cannot review artist billing writeback");
  const buyerReview = await post(buyerRoute, reviewBuyer);
  ok(buyerReview.data.name === "Billing QA Partner", "Writeback review identifies actual saved partner");
  const buyerSave = {...buyerTarget, op: "save", confirmed: true,
    expected: {address: buyerReview.data.address, email: buyerReview.data.email},
    patch: {address: "300 Updated Partner Avenue"}};
  ok((await post(buyerRoute, {...buyerSave, confirmed: false})).status === 400, "Writeback needs explicit confirmation");
  ok((await post(buyerRoute, {...buyerSave, patch: {email: "invalid"}})).status === 400, "Invalid writeback email rejected");
  ok((await post(buyerRoute, {...buyerSave, patch: {address: ""}})).status === 400, "Blank writeback cannot erase stored address");
  ok((await post(buyerRoute, {...buyerSave, patch: {name: "Rename"}})).status === 400, "Writeback cannot rename a partner");
  ok((await post(buyerRoute, buyerSave, cookies[1])).data.error === "buyerUnavailable", "Foreign buyer writeback denied");
  ok((await request(buyerRoute, cookies[0], buyerSave, "https://untrusted.invalid")).status !== 200, "Cross-origin buyer writeback denied");
  ok((await post(buyerRoute, buyerSave)).status === 200, "Selected address saves to company");
  const [updatedPartner] = await q`select * from organization where id=${partnerId}`;
  ok(updatedPartner.billing_address === "300 Updated Partner Avenue" && updatedPartner.billing_email === "accounts@example.invalid" && updatedPartner.name === "Billing QA Partner", "Writeback changes only selected company fields");
  ok((await post(buyerRoute, buyerSave)).data.error === "buyerChanged", "Stale buyer writeback cannot overwrite a newer edit");
  const contactTarget = {kind: "contact", id: savedContact.id};
  const contactReview = await post(buyerRoute, {...contactTarget, op: "review"});
  ok((await post(buyerRoute, {...contactTarget, op: "save", confirmed: true,
    expected: {address: contactReview.data.address, email: contactReview.data.email},
    patch: {address: "400 Personal Billing Avenue", email: "new-contact@example.invalid"}})).status === 200, "Contact address and email writeback succeeds");
  const [writtenContact] = await q`select * from contact where id=${savedContact.id}`;
  const [unchangedOrg] = await q`select * from organization where id=${partnerId}`;
  ok(writtenContact.email === "new-contact@example.invalid" && writtenContact.billing_address === "400 Personal Billing Avenue" && unchangedOrg.billing_address === "300 Updated Partner Avenue", "Contact writeback never mutates linked company");
  const invoiceAfterWriteback = await (await request(`/api/invoices/${id}`, cookies[0])).json();
  assert.deepEqual(invoiceAfterWriteback.snapshot, preservedInvoice.snapshot);
  ok(true, "Buyer writeback leaves historical invoice snapshot unchanged");
  await q`update organization set archived_at=now() where id=${partnerId}`;
  ok((await post(buyerRoute, reviewBuyer)).data.error === "buyerUnavailable", "Archived partner review rejected");
  ok((await post(buyerRoute, buyerSave)).data.error === "buyerUnavailable", "Archived partner writeback rejected");
  const [count] =
    await q`select count(*)::int as n from payment where talent_id=${artist.talentId}`;
  ok(count.n === 26, "Issuing did not insert duplicate income");
  for (const settledOn of ["2026-02-30", "2000-01-01", later]) {
    ok((await post(`/api/invoices/${id}`, { op: "settle", revision: 2, confirmed: true, settledOn })).status !== 200, "Invalid or out-of-range receipt date rejected");
  }
  const [stillExpected] = await q`select status from payment where id=${payments[0].id}`;
  ok(stillExpected.status === "expected", "Rejected receipt leaves payment unchanged");
  ok(
    (
      await post(`/api/invoices/${id}`, {
        op: "settle",
        revision: 2,
        confirmed: true,
        settledOn: today,
      })
    ).status === 200,
    "Full receipt recorded",
  );
  const [paid] = await q`select * from payment where id=${payments[0].id}`;
  ok(
    paid.status === "settled" && Number(paid.settled_amount) === 1000,
    "Same receivable settled",
  );
  ok(
    (await (await request(`/api/invoices/${id}`, cookies[0])).json()).paid,
    "Invoice paid readback",
  );
  const scheduled = await post("/api/invoices", {
    ...input,
    paymentId: payments[1].id,
    issueOn: later,
  });
  const sid = scheduled.data.id;
  ok(scheduled.status === 200, "Future invoice scheduled");
  await prepareInvoices();
  ok(
    (await (await request(`/api/invoices/${sid}`, cookies[0])).json())
      .status === "scheduled",
    "Future date remains scheduled",
  );
  const beforeDue = await (await request("/api/invoices?ready=1", cookies[0])).json();
  ok(beforeDue.total === 0 && beforeDue.items.length === 0, "Review list excludes scheduled and paid invoices");
  await q`update invoice set issue_on=${today} where id=${sid}`;
  await queue.enqueue(
    "invoice.prepare",
    { _cron: { ts: new Date().toISOString(), backfilled: false } },
    { jobKey: `invoice-qa:${suffix}` },
  );
  let prepared = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const [state] = await q`select status from invoice where id=${sid}`;
    if (state.status === "draft") {
      prepared = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  ok(
    prepared,
    "Real background worker prepares a due invoice with cron metadata",
  );

  const reviewPage = await (await request("/api/invoices?ready=1", cookies[0])).json();
  const reviewCount = await (await request("/api/invoices?ready=1&count=1", cookies[0])).json();
  ok(reviewPage.total === 1 && reviewPage.items[0].id === sid && reviewCount.total === reviewPage.total, "Prepared invoice appears in matching review list and reminder");
  await prepareInvoices();
  await prepareInvoices();
  ok(
    (await (await request(`/api/invoices/${sid}`, cookies[0])).json())
      .status === "draft",
    "Due invoice prepared idempotently",
  );
  await q`update invoice set status='sending',updated_at=now()-interval '10 minutes' where id=${sid}`;
  await prepareInvoices();
  ok(
    (await (await request(`/api/invoices/${sid}`, cookies[0])).json())
      .status === "delivery_unknown",
    "Interrupted send requires reconciliation",
  );
  ok(
    (
      await post(`/api/invoices/${sid}`, {
        op: "createDraft",
        revision: 1,
        confirmed: true,
      })
    ).data.error === "changed",
    "Unknown delivery cannot auto-retry",
  );
  ok((await post(`/api/invoices/${sid}`,{op:"resolveUnsent",revision:1,confirmed:true})).status===400,"Retired SMTP reconciliation route is unavailable");
  await q`update invoice set status='draft',revision=2 where id=${sid}`;
  ok(
    (
      await post(`/api/invoices/${sid}`, {
        op: "cancel",
        revision: 2,
        confirmed: true,
      })
    ).status === 200,
    "Cancel draft",
  );
  const [unchanged] = await q`select * from payment where id=${payments[1].id}`;
  ok(
    unchanged.status === "expected" && !unchanged.voided_at,
    "Cancelling preserves receivable",
  );
  for (const p of payments.slice(2))
    ok(
      (await post("/api/invoices", { ...input, paymentId: p.id })).status ===
        200,
      "Create pagination fixture",
    );
  let cursor = "";
  const ids: string[] = [],
    sizes: number[] = [];
  do {
    const page = await (
      await request(
        `/api/invoices?cursor=${encodeURIComponent(cursor)}`,
        cookies[0],
      )
    ).json();
    sizes.push(page.items.length);
    ids.push(...page.items.map((r: { id: string }) => r.id));
    cursor = page.nextCursor || "";
  } while (cursor);
  ok(
    sizes.join(",") === "20,6" && new Set(ids).size === 26,
    "Invoice pagination 20/6 without duplicates",
  );
  ok(
    (await request("/api/invoices?cursor=broken", cookies[0])).status === 400,
    "Malformed cursor rejected",
  );
  ok(
    (await (await request("/api/invoices", cookies[1])).json()).items.length ===
      0,
    "Owner list isolated",
  );
  console.log(
    JSON.stringify({
      checks,
      pdf: "English/Chinese rendered",
      delivery: "No mail sent; synthetic historical invoice only",
      finance: "no duplicate income",
      scope: "owner-only, manager read denied",
      pagination: sizes,
    }),
  );
} finally {
  // Remove only this test's generated records and files, never the user's workspace.
  const keys =
    await q`select storage_key from invoice where talent_id=${artist.talentId} and storage_key is not null`;
  if (keys.length) {
    const { S3Client, DeleteObjectCommand } =
      await import("@aws-sdk/client-s3");
    const client = new S3Client({
      endpoint: process.env.STORAGE_S3_ENDPOINT,
      region: process.env.STORAGE_S3_REGION || "local",
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.STORAGE_S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.STORAGE_S3_SECRET_ACCESS_KEY!,
      },
    });
    for (const r of keys)
      await client.send(
        new DeleteObjectCommand({
          Bucket: process.env.STORAGE_BUCKET || "talent-files",
          Key: r.storage_key,
        }),
      );
  }
  if (sentId) {
    const inbox = await (
      await fetch(
        `http://127.0.0.1:54324/api/v1/search?query=${encodeURIComponent(`to:invoice-test-${suffix}@example.invalid`)}`,
      )
    ).json();
    for (const m of inbox.messages || [])
      await fetch(`http://127.0.0.1:54324/api/v1/messages`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ IDs: [m.ID] }),
      });
  }
  for (const cookie of cookies) await request("/api/auth/sign-out", cookie, {});
  for (const p of people) {
    await q`delete from invoice where talent_id=${p.talentId}`;
    await q`delete from talent where id=${p.talentId}`;
    await q`delete from person where id=${p.personId}`;
  }
  await q.end();
}
process.exit(0);
