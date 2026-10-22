# Cash scenario (parked)

Status: parked on 2026-10-21. Nothing is built on this branch yet; this note holds what was found and what's still open.

## What it is

A what-if on the Finance page: given cash on hand today, how much is there in 30, 60 and 90 days if payments come in late, only partly, or with extra costs each month. It's a calculation from the person's own assumptions, not a bank balance and not a probability forecast.

The starting point is Timothy's version on `origin/user/timothy0324/ui-visual-polish`:

- `lib/domain/cash-scenario.ts` (+ test): the calculation. Inputs are opening cash, delay in days (0–90), collection percent (0–100), and extra costs per 30 days. Only payments in the chosen currency count; payments with no due date or a past due date are left out and reported as counts and totals.
- `components/views/cash-scenario.tsx`: the panel and its dialog. It passes `countedPayments` (decision 0018), so only signed work counts.
- `lib/domain/cash-scenario-example.ts`: made-up payments for an "example" mode.
- Commits: `617e578`, `c816f89`, `c702e24`, `38c925c` (mixed in with invoice and calendar work, so port by hand, not by cherry-pick).

## Why it's parked

- It's not core: Finance already shows expected money in and out.
- It uses `paymentRemaining` from Timothy's partial receipts and settlement work, which isn't on `main`. Without partial receipts the "what's left to collect" number is only right for payments that are wholly paid or wholly unpaid.
- The details below need deciding first.

## Open questions

1. **Overdue payments.** They're left out of the projection today. Show them apart ("overdue, not in the projection") or let the person choose to count them, and with what delay?
2. **Currencies.** One currency at a time, others reported as left out, or wait for the FX conversion decision?
3. **Opening cash.** Typed each time, remembered per browser, or stored on the talent? Storing it is a schema change and money data.
4. **Example mode.** Keep the made-up example for an empty workspace, or show an empty state that points to adding payments?
5. **Where it lives.** A panel on Finance, a dialog, or its own page?
6. **Partial receipts.** Build after settlement lands (use `paymentRemaining`) or first with whole payments only?

## Picking this up

1. Rebase this branch on `main`; check whether partial receipts (`paymentRemaining`) have landed.
2. Settle the open questions above, one at a time, and write a decision record if the answers are load-bearing (overdue handling, stored opening cash).
3. Port the calculation and its test first, then the panel; strings go in both message files.
