# Local US tax catalogue

## Release status

This is a partial local implementation, not a nationwide automated tax service.
There is no paid tax vendor, customer-address transmission to a tax vendor, live
email, GitHub push, or production deployment in this work.

- PostgreSQL contains 51 state/DC coverage entries, 25 imported rate batches,
  34,177 rate records (including historical records), and 612 pending
  state/category review entries. A coverage entry is not proof of support.
- California provides 541 combined city/county reference rows. These are not an
  address resolver and are not a guarantee that every district/address is covered.
- The 24 SST member-state imports contain 33,636 component/history rows. They
  remain reference-only: importing rate files does not import address boundaries,
  supply sourcing rules, or authorize adding arbitrary state/county/city rows.
- Two narrowly scoped California photography rules are source-reviewed and
  usable after the user confirms their conditions. This is not professional tax
  certification. The release window is 2026-10-17 through 2026-11-16. Re-importing
  rate files does not extend that review window.
- Nationwide service taxability, address resolution, cross-state sourcing,
  registration/nexus decisions, exemption certificates, tax holidays, mixed-line
  invoices and jurisdiction-specific rounding remain unimplemented.
- Contract/PDF text is not automatically classified into a tax treatment. The
  user selects and confirms the service and delivery facts. A future extraction
  model may propose facts, but must not publish rules or decide collection duties.
- No recurring tax refresh job has been installed. The operator commands below
  refresh public data explicitly. A production scheduler, source-change review,
  parser monitoring and failure alerts are still required.

## Sources and verified meaning

- [SST rates](https://www.streamlinedsalestax.org/ratesandboundry/Rates/)
  and [boundaries](https://www.streamlinedsalestax.org/ratesandboundry/Boundary/).
  The [technology guide](https://www.streamlinedsalestax.org/docs/default-source/technology/technology-guide-october-2022.pdf)
  defines rate-file fields, fractional units, intrastate/interstate differences,
  jurisdiction codes and effective intervals. Boundary files are linked but NOT
  imported or implemented in this release.
- [California rates](https://cdtfa.ca.gov/taxes-and-fees/sales-use-tax-rates.htm)
  provides the current workbook (effective October 1, 2026 at verification).
  Use [official address lookup](https://maps.cdtfa.ca.gov/) to confirm tax areas.
- [California photography guidance](https://cdtfa.ca.gov/industry/photography/industry-topics.htm)
  supports the limited electronic-only and ordinary physical-print scenarios.
  Electronic-only treatment requires no tangible goods or planned later physical
  delivery; physical packages exclude special rights valuation, technology
  transfer agreements, exemptions and other bundled services.
- [State agency directory](https://taxadmin.org/tax-agencies/) is a discovery
  pointer for pending states, not a verified dataset or taxability rule.
- [New York Publication 718](https://www.tax.ny.gov/pdf/publications/sales/pub718.pdf)
  and [taxability guide](https://www.tax.ny.gov/pubs_and_bulls/tg_bulletins/st/quick_reference_guide_for_taxable_and_exempt_property_and_services.htm)
  were researched as expansion sources; New York is NOT enabled by this import.

## Data ownership and flow

1. Fetch public sources to a staging folder. Check expected source format, rate
   bounds, actual calendar dates, state FIPS codes and expected member coverage.
   Keep absent special food/drug rates unknown, not zero. SST fractional rates
   are converted to percentage values; leading jurisdiction zeros are retained.
2. The guarded importer accepts only a local development PostgreSQL database and
   local object storage. Verify every source-file SHA-256 before publishing.
3. Raw public source files live in immutable object-storage paths:
   `tax-catalogue/<provider>/<state>/<sha256>.source`. Structured data lives in
   `tax_source`, `tax_rate_batch`, `tax_rate`, `tax_service_rule`. Batch rows link
   to retained raw files, URL, checksum, retrieval time and row count.
4. One database transaction with an advisory lock publishes a complete import.
   Identical batches reuse existing records. Previous revisions remain available;
   only the active marker changes. No user-facing endpoint can import or publish.
5. Authenticated locality searches return 20 rows plus a bounded next offset.
   They never load the full national catalogue into the browser. Sources lacking
   combined locality support return an explicit coverage explanation.
6. Resolution requires the transaction date/location, seller state, service,
   delivery form, confirmed collection obligation, exemption status and confirmed
   applicable jurisdiction. Source data older than 30 days or expired rules stop
   automatic application. Unsupported cases return `review`, never default 0%.
7. Invoice saving reruns the server-side resolver in the invoice transaction.
   Submitted rate, treatment, state, location and source must match. The server
   stores rule ID/hash and rate ID/batch hash/name in the immutable Invoice
   snapshot. Existing receivable tax updates use the existing ownership, revision
   and payment-basis guards. No duplicate revenue record is created.
8. Historical invoices use their saved tax snapshot; catalogue updates do not
   rewrite them. Internal source evidence does not appear in the customer PDF.

## Local commands

Run from the formal `talent_biz_os` repository, with local environment variables:

```sh
python3 scripts/fetch-tax-catalogue.py /private/tmp/taloox-tax-data
npm run db:migrate
npx tsx --conditions=react-server scripts/import-tax-catalogue.mts /private/tmp/taloox-tax-data/catalogue.json
```

Python uses only standard-library CSV, ZIP and XLSX XML parsing. No new project
package was added. The importer fails on unexpected formats rather than silently
publishing a partial dataset. Raw uploads can leave an unreferenced immutable
object if database publication fails; do not delete old source objects merely
because a batch is inactive.

## Coverage

| State group | Current status | Missing work |
| --- | --- | --- |
| CA | Combined locality references; two constrained photography rules | Address resolver; other services and special cases |
| AR, GA, IA, IN, KS, KY, MI, MN, NC, ND, NE, NJ, NV, OH, OK, RI, SD, TN, UT, VT, WA, WI, WV, WY | Component/history rates imported | Boundary import, address matching, sourcing and service rules |
| AL, AK, AZ, CO, CT, DE, DC, FL, HI, ID, IL, LA, ME, MD, MA, MS, MO, MT, NH, NM, NY, OR, PA, SC, TX, VA | Pending | Verify source-specific data and rules before enabling |

Service categories are live performance, influencer sponsorship, video production,
photography, modeling, podcast sponsorship, music licensing, digital downloads,
merchandise, consulting/creative services, management commission and mixed/unknown.
Categories are a fact taxonomy, not a statement that all services in a category
share one treatment. Unsupported categories remain manual-review only.

## Verification

- 267 unit tests passed, including date boundaries, stale evidence, mixed services,
  unknown collection duties, exemptions, ambiguity and component-rate rejection.
- 120 local integration assertions passed using disposable users and fake Gmail;
  four fake draft creations, zero send calls and zero draft updates/deletes.
- Integration verifies authenticated pagination, cross-origin denial, owner
  isolation, unsupported-state coverage, tampered rate/address rejection and
  frozen source evidence. Existing PDF/Gmail-draft assertions continue to pass.
- Browser QA verified Traditional Chinese desktop and 390px mobile layouts,
  locality change invalidation, scope-change invalidation and saved rate evidence.
  A synthetic USD 1,028 invoice at 11.25% saved USD 115.65 tax / USD 1,143.65 total.
- Type checking, targeted lint, translation parity and diff whitespace checks are
  part of the release checks. This is not a completed 50-state legal review.

## Next implementation gates

1. Review state-specific source licenses/terms and durable update endpoints.
2. Implement and test exact jurisdiction boundaries, including special districts;
   do not join city names or ZIP codes as if they were exact tax areas.
3. Review rules per service and delivery with evidence, effective dates, exceptions
   and test cases. Keep unsupported conditions visibly blocked.
4. Integrate proposed facts from contracts with user confirmation and provenance;
   do not let document instructions modify tax rules.
5. Add production refresh scheduling, change detection, review/publish separation,
   data-age alerts, retention and operational ownership before a nationwide claim.

## Remaining-state reference expansion

See [the 2026-10-17 coverage report](tax-reference-coverage-2026-10-17.md) for the local-only 25-state plus DC reference import. These evidence-only records are separate from calculation-ready rates; pending local coverage and source/date limitations remain explicit.
