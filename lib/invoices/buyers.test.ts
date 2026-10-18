import test from "node:test";
import assert from "node:assert/strict";
import { invoiceBuyers, buyerDetails, buyerNeedsConfirmation } from "./buyers";
import type { Contact, Organization } from "@/lib/types";

const org: Organization = {id: "company", name: "Example Events", notes: "Not an address", archived: false, billingAddress: "100 Example Avenue", billingEmail: "billing@example.invalid"};
const contact: Contact = {id: "person", name: "Example Booker", role: "counterparty", company: "Legacy name", organizationId: org.id, email: "booker@example.invalid", phone: "", notes: "Not an address", archived: false};

test("explicitly linked partners are recommended; matching names never link", () => {
  const rows = invoiceBuyers([contact], [org, {...org, id: "other"}], {clientId: "company", counterpartyId: "person"});
  assert.equal(rows.filter((r) => r.recommended).length, 2);
  assert.equal(rows.find((r) => r.id === "organization:other")?.recommended, false);
});
test("company billing identity and explicit contact email remain distinct", () => {
  const rows = invoiceBuyers([contact], [org]);
  assert.deepEqual(buyerDetails(rows.find((r) => r.id === "organization:company")!), {buyerName: org.name, buyerAddress: org.billingAddress, recipient: org.billingEmail});
  assert.deepEqual(buyerDetails(rows.find((r) => r.id === "contact:person")!), {buyerName: org.name, buyerAddress: org.billingAddress, recipient: contact.email});
  const personal = invoiceBuyers([{...contact, organizationId: null, company: "", billingAddress: "Personal address"}], []);
  assert.equal(personal[0].buyerName, contact.name);
  assert.equal(personal[0].buyerAddress, "Personal address");
});
test("archived partners are excluded and notes never become billing addresses", () => {
  assert.deepEqual(invoiceBuyers([{...contact, archived: true}], [{...org, archived: true}]), []);
  const rows = invoiceBuyers([{...contact, email: ""}], [{...org, archived: true}]);
  assert.equal(rows[0].buyerAddress, "");
  assert.equal(rows[0].recipient, "");
});
test("switching buyer clears missing values and requires confirmation for existing details", () => {
  const current = {buyerName: "Old Client", buyerAddress: "Old Address", recipient: "old@example.invalid"};
  const next = buyerDetails(invoiceBuyers([], [{...org, billingAddress: "", billingEmail: ""}])[0]);
  assert.equal(buyerNeedsConfirmation(current, next), true);
  assert.equal(next.buyerAddress, "");
  assert.equal(next.recipient, "");
  assert.equal(buyerNeedsConfirmation({buyerName: "", buyerAddress: "", recipient: ""}, next), false);
  assert.equal(buyerNeedsConfirmation(next, next), false);
});
