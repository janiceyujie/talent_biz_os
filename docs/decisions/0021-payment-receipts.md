# 0021 — Money received is a list of receipts, and a payment's total is worked out from them

**Status:** Accepted (2026-10-21).

## Context

A payment (one amount owed to the talent, or by them) held what arrived as two columns: `settled_amount` and `settled_on`, filled when it was marked received. That fits money that arrives whole and once. Three common cases didn't fit:

- **It arrives in parts.** A client pays 60,000 of 100,000 now and the rest next month. Marking it received at 60,000 closed it, and the 40,000 still owed became a shortfall: out of money owed, with no reminder.
- **Some is withheld.** In Taiwan a client withholds income tax (often 10%) and the NHI supplementary premium (2.11%) and pays the rest. That gap can be claimed back at tax time; a client paying short has to be chased. One received amount couldn't tell them apart, so Finance asked "withholding or fees? please check".
- **A mistake was overwritten.** Correcting what was received replaced it, with no record of what it said before.

Timothy's branch (`user/timothy0324/invoice-settlement`) solved this with an append-only list of receipts stored as JSON on the payment. The idea is right; the storage makes Finance's reports hard, since each receipt has to count in its own month and JSON can't be filtered or indexed by date.

## Decision

- **Each time money arrives or is paid, it's a row in `payment_receipt`**: the date, the cash, what was withheld (0 if nothing), a note, and who recorded it when. Costs use it too: a cost can be paid in parts.
- **Receipts are only added.** Correcting one adds a new row that names the one it replaces (`replaces_id`); withdrawing one (it never arrived) adds a row with `withdrawn` set. The old row stays and shows struck through. A receipt is active when nothing replaces it and it isn't withdrawn.
- **Nothing derived is stored.** What a payment has received, what was withheld, what's left, and the date it was settled are worked out from its active receipts when payments are read (`lib/data/index.ts`, `lib/domain/workflow.ts`). The `settled_amount` and `settled_on` columns are gone: their data was moved into receipts first.
- **`status` stays stored**, because closing is sometimes a person's decision:
  - **expected**: still open, whether nothing or part has arrived;
  - **settled**: closed, either because receipts cover the total (cash plus withheld), which happens on its own, or because the person said the rest won't come (closed short);
  - **cancelled**: as before (decision 0018).
- **Recording a receipt** is a dialog, not part of the payment's form: date, cash, withheld (with 10% and 2.11% as shortcuts), note. When something is still left, it asks whether the rest is still coming (the default, kept open and reminded) or won't come (closed short).
- **Money still to come is what's left, not the total.** Receivables, reminders, aging, a client's outstanding, and the intake's and bank notices' matching use the remaining amount.
- **Money received counts on each receipt's date.** Finance's received and paid for a date range, the six months of cash, and the split by type add up receipts dated in the range, so money in two parts lands in two months.
- **The automatic flows add a receipt.** A bank notice filed onto a payment, or the intake's "mark received", adds one receipt with the amount stated and closes the payment, as before; a difference shows as short until the person corrects the receipt (to enter what was withheld, say).
- **The move**: every settled payment became one receipt, its cash the settled amount (or the full total where none was given), withheld 0, dated the day it was settled. A payment settled short is still settled short, so every figure reads as it did before the change.

## Alternatives considered

- **Split a payment when part arrives.** No schema change: marking 60,000 of 100,000 received would make two payments, one received and one still owed. It fixes the first case only; withholding and corrections stay as they were.
- **Receipts as JSON on the payment** (Timothy's). Same behaviour, but reports by date need to unpack JSON, and nothing can be indexed.
- **Keep `settled_amount` and `settled_on` as a cache** of the receipts, so nothing that reads them changes. Two copies of the same fact can drift (a write path that forgets to update it, a manual fix in the database). Only the data loader read those columns, so working them out there costs little.

## Consequences

- Anything new that writes money received must add a receipt; nothing sets a payment settled on its own except the receipt actions and the deal-cleanup in decision 0018 (which cancels).
- Reading payments reads their receipts too: one more query, indexed on `payment_id`.
- `countedPayments` (0018) is unchanged: it decides which expected money counts. Cash received is counted from receipts whatever the deal's stage, since money that moved is a fact.
- Invoices and the cash scenario (both parked) get "what's left" from here.
- Rolling back to code from before this change needs the columns back; the migration that removes them can't be undone by itself.
