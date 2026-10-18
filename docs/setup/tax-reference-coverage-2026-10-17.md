# Official tax reference expansion — 2026-10-17

Local-only reference release for the remaining 25 states and Washington, DC. Existing SST/California calculation tables and service rules are unchanged. No paid API, external account, automatic tax filing, mail, or GitHub publication is involved.

## Coverage and limits

The 26 state/district records and 26 local-coverage records are present. An additional 19,167 scoped local/combined reference rows were parsed from public official tables. This is not a complete nationwide local-tax or service-taxability engine. A local row can describe a category, district overlap, or component rather than one unique city.

All imported rows are `pending` for invoice applicability. Known rates remain numeric references; unknown rates remain NULL. Missing effective dates remain NULL and are never replaced by retrieval dates. A snapshot period, administrative activation date and legal effective date are separate values. General zero state tax does not imply zero local or special tax.

| State | State reference % | Local/combined rows | Official state source | Local source / outstanding coverage |
|---|---:|---:|---|---|
| AL | 4.0 | 4,750 | [Official source](https://www.revenue.alabama.gov/sales-use/tax-rates/) | [Local source](https://www.revenue.alabama.gov/sales-use/tax-rates/). Parsed reference table; exact address, category and exceptions pending. |
| AK | 0.0 | 0 | [Official source](https://www.commerce.alaska.gov/web/dcra/officeofthestateassessor/alaskasalestaxinformation.aspx) | [Local source](https://www.commerce.alaska.gov/dcra/admin/Taxable/ViewFile/2de31798-e2aa-42c9-8a50-43e1c7c6ddb8). Local detail remains pending; source index retained or retrieval failure recorded. |
| AZ | 5.6 | 3,251 | [Official source](https://azdor.gov/sites/default/files/document/TPT_RATETABLE_10012026.pdf) | [Local source](https://azdor.gov/business/transaction-privilege-tax/tax-rate-table). Parsed reference table; exact address, category and exceptions pending. Tribal/special region codes excluded pending composition review. |
| CO | 2.9 | 447 | [Official source](https://tax.colorado.gov/sites/tax/files/documents/Colorado_Jurisdiction_Codes_Rates_July-Dec2026.xlsx) | [Local source](https://tax.colorado.gov/DR1002). Parsed reference table; exact address, category and exceptions pending. |
| CT | 6.35 | 0 | [Official source](https://portal.ct.gov/DRS/Sales-Tax/Tax-Information) | [Local source](https://portal.ct.gov/DRS/Sales-Tax/Tax-Information). No additional general local sales tax in cited source; special taxes still separate. |
| DE | 0.0 | 0 | [Official source](https://revenue.delaware.gov/business-tax-forms/doing-business-in-delaware/step-4-gross-receipts-taxes/) | [Local source](https://revenue.delaware.gov/business-tax-forms/doing-business-in-delaware/step-4-gross-receipts-taxes/). No additional general local sales tax in cited source; special taxes still separate. |
| DC | 6.0 | 0 | [Official source](https://otr.cfo.dc.gov/topic/taxes-and-payments?page=11) | [Local source](https://otr.cfo.dc.gov/page/sales-and-use-tax-faqs). Local detail remains pending; source index retained or retrieval failure recorded. |
| FL | 6.0 | 67 | [Official source](https://floridarevenue.com/taxes/taxesfees/Pages/tax_interest_rates.aspx) | [Local source](https://floridarevenue.com/Forms_library/current/dr15dss_26.pdf). Parsed reference table; exact address, category and exceptions pending. |
| HI | 4.0 | 4 | [Official source](https://tax.hawaii.gov/geninfo/countysurcharge/) | [Local source](https://tax.hawaii.gov/geninfo/countysurcharge/). Parsed reference table; exact address, category and exceptions pending. |
| ID | 6.0 | 0 | [Official source](https://tax.idaho.gov/taxes/sales-use/online-guide/) | [Local source](https://business.idaho.gov/taxes/). Local detail remains pending; source index retained or retrieval failure recorded. |
| IL | 6.25 | 1,596 | [Official source](https://tax.illinois.gov/research/taxinformation/sales/rot/pio-101.html) | [Local source](https://tax.illinois.gov/research/taxrates/sales-tax-rate-machine-readable-files.html). Parsed reference table; exact address, category and exceptions pending. |
| LA | 5.0 | 0 | [Official source](https://revenue.louisiana.gov/tax-education-and-faqs/faqs/sales-tax/what-is-the-sales-tax-rate-in-louisiana/) | [Local source](https://revenue.louisiana.gov/tax-education-and-faqs/faqs/sales-tax/what-is-the-sales-tax-rate-in-louisiana/). Local detail remains pending; source index retained or retrieval failure recorded. |
| ME | 5.5 | 0 | [Official source](https://www1.maine.gov/revenue/taxes/sales-use-service-provider-tax/rates-due-dates) | [Local source](https://www1.maine.gov/revenue/taxes/sales-use-service-provider-tax/rates-due-dates). Local detail remains pending; source index retained or retrieval failure recorded. |
| MD | 6.0 | 0 | [Official source](https://www.marylandtaxes.gov/forms/Business_Tax_Tips/bustip8.pdf) | [Local source](https://www.marylandtaxes.gov/forms/Tax_Publications/Tax_Tips/Miscellaneous_Tax_Tips/taxtip30.pdf). No additional general local sales tax in cited source; special taxes still separate. |
| MA | 6.25 | 0 | [Official source](https://www.mass.gov/guides/sales-and-use-tax) | [Local source](https://www.mass.gov/local-option-excise-taxes). Local detail remains pending; source index retained or retrieval failure recorded. |
| MS | 7.0 | 1 | [Official source](https://www.dor.ms.gov/business/sales-use-tax/sales-tax-rates) | [Local source](https://www.dor.ms.gov/node/238). Parsed reference table; exact address, category and exceptions pending. Jackson only; other local levies pending. |
| MO | 4.225 | 2,597 | [Official source](https://dor.mo.gov/taxation/business/tax-types/sales-use/) | [Local source](https://dor.mo.gov/taxation/business/tax-types/sales-use/rate-tables/2026/). Parsed reference table; exact address, category and exceptions pending. |
| MT | 0.0 | 0 | [Official source](https://revenue.mt.gov/taxes/general-sales-tax) | [Local source](https://revenue.mt.gov/taxes/miscellaneous/local-resort-tax). Local detail remains pending; source index retained or retrieval failure recorded. |
| NH | 0.0 | 0 | [Official source](https://www.revenue.nh.gov/faq/does-new-hampshire-have-sales-tax) | [Local source](https://www.revenue.nh.gov/taxes-glance/meals-rooms-tax). Local detail remains pending; source index retained or retrieval failure recorded. |
| NM | 4.875 | 248 | [Official source](https://www.tax.newmexico.gov/governments/municipal-county-governments/local-option-taxes/) | [Local source](https://www.tax.newmexico.gov/businesses/geographic-information-system-gis/data-download/). Parsed reference table; exact address, category and exceptions pending. State warns of Lovington Industrial Park omission; tribal/class-2 ambiguity stored NULL. |
| NY | 4.0 | 76 | [Official source](https://www.tax.ny.gov/pubs_and_bulls/tg_bulletins/st/sales_tax_rates_additional_sales_taxes_and_fees.htm) | [Local source](https://www.tax.ny.gov/pdf/publications/sales/pub718.pdf). Parsed reference table; exact address, category and exceptions pending. |
| OR | 0.0 | 0 | [Official source](https://www.oregon.gov/dor/programs/businesses/Pages/Sales-tax.aspx) | [Local source](https://www.oregon.gov/dor/programs/businesses/Pages/Sales-tax.aspx). Local detail remains pending; source index retained or retrieval failure recorded. |
| PA | 6.0 | 2 | [Official source](https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/sales-use-and-hotel-occupancy-tax) | [Local source](https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/sales-use-and-hotel-occupancy-tax/local-sales-tax). Parsed reference table; exact address, category and exceptions pending. |
| SC | 6.0 | 340 | [Official source](https://dor.sc.gov/sales-use-tax-index/sales-tax) | [Local source](https://dor.sc.gov/sites/dor/files/forms/ST575.pdf). Parsed reference table; exact address, category and exceptions pending. Locally collected taxes excluded from state table. |
| TX | 6.25 | 5,655 | [Official source](https://comptroller.texas.gov/taxes/sales/) | [Local source](https://comptroller.texas.gov/taxes/sales/spd.php). Parsed reference table; exact address, category and exceptions pending. |
| VA | 4.3 | 133 | [Official source](https://www.tax.virginia.gov/sites/default/files/taxforms/retail-sales-and-use/any/53-sales-tax-any.pdf) | [Local source](https://www.tax.virginia.gov/retail-sales-and-use-tax). Parsed reference table; exact address, category and exceptions pending. |

## Sources, storage and versioning

- 55 successful raw source snapshots and 11 failed retrieval attempts are retained in the manifest. Some failed attempts are superseded by successful official alternatives; seven active reference records still lack a retained source snapshot (AK, CO local index, MA and NH).
- Raw files and the full parsed manifest are in the existing local object store under `tax-references/`. PostgreSQL holds reference rows, source URLs, SHA-256 hashes, object keys, source status, retrieval time, published dates, date basis and pending reasons.
- `tax_reference_release` keeps immutable manifest revisions; the importer atomically changes the active revision. Re-importing the same manifest reuses its rows. Original `tax_rate`, `tax_rate_batch` and `tax_service_rule` are not changed.
- The authenticated Invoice catalogue endpoint returns only 20 reference rows at a time. The UI shows an expandable row with source, period, scope and pending reasons. There is no apply action for these reference records.
- The local importer checks development mode, loopback PostgreSQL and storage, an official-host allowlist, schema/date/rate constraints, source checksums and retrieval age. It does not install a background scraper or infer taxability from contracts.

## Reproduction

```sh
python3 scripts/fetch-tax-references.py /private/tmp/tax-reference-import
python3 scripts/build-tax-references.py /private/tmp/tax-reference-import
node --conditions=react-server --import tsx scripts/import-tax-references.mts /private/tmp/tax-reference-import/references.json
node --conditions=react-server --import tsx scripts/check-tax-references.mts /private/tmp/tax-reference-import/references.json
```

Pinned source paths and parser windows describe this release. Review changed source layouts and dates before refreshing; do not treat a successful download as a reviewed new tax rule. macOS Swift/PDFKit extracts the PDF text without a new project dependency. The acceptance script checks this release against the pre-expansion 34,177 rate rows / 25 batches / 614 service-rule rows.

## Validation

- 270 unit tests passed, including null-versus-zero, source provenance, invalid dates, duplicate records and pending-state safeguards.
- 67 local reference acceptance assertions passed; a repeated import produced one release and no duplicate rows.
- Date-window filtering, 20-row pagination, literal wildcard search, DC 6%, NY 8.875%, FL Palm Beach 0.5%, Colorado percent units, Missouri fractional cells and Arizona state/county composition were checked.
- Type checking, targeted lint and translation parity passed. HTTP checks passed for anonymous denial, authenticated reference retrieval and invalid pagination. Traditional Chinese browser QA confirmed the state/local separation, New York 8.875% combined rate, expandable dates, pending reasons and official source link. No invoice was saved or sent.

## Remaining verification

Detailed local/special-tax completeness remains pending for Alaska, Idaho, Louisiana, Maine, Massachusetts, Montana, New Hampshire and Oregon. Connecticut, Delaware and Maryland have general-local-tax scope notes rather than a blanket exemption. DC is treated as its own district. Parsed states also retain special-district, boundary, exemption and service-taxability gaps. No automatic rate application is enabled for any of this release.
