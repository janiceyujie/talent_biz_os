# Taiwan postal reference

The bundled catalog covers the 368 administrative districts across 22 cities/counties. It is reference data, not personal address data; selected address parts continue to use the existing PostgreSQL storage and invoice snapshots. No runtime lookup or paid API is used.

- Publisher: Chunghwa Post.
- Postal reference: https://data.gov.tw/dataset/25489 (Government Open Data License 1.0).
- XML: https://www.post.gov.tw/post/download/1050812_%E8%A1%8C%E6%94%BF%E5%8D%80%E7%B6%93%E7%B7%AF%E5%BA%A6%28toPost%29.xml
- English names: https://www.post.gov.tw/post/download/County_h_10906.xml
- Download index: https://subservices.post.gov.tw/post/internet/Download/index.jsp?ID=220399
- Index dates: postal reference 2023-04-14; English XML 2020-06-12. Retrieved 2026-10-18.

The postal reference has 371 entries. Three special island entries (postal prefixes 290, 817, 819) are not administrative districts and are excluded from the 368-district dropdown. Existing free-text district values remain visible and editable by selecting a replacement. Postal codes remain manually editable, including special delivery codes.

A district selection supplies only the 3-digit prefix, not an exact 6-digit delivery code. Never infer the final three digits or enforce a district prefix on previously entered street-specific postal codes. Refresh the catalog against the official downloads when the source changes; retain stable region/name IDs and both locale label sets. District names in the JSON are matching keys for existing stored Chinese addresses.

Source SHA-256:
- tw-postal.xml: `5bdc716df9170166b3e62183a38b69851ca1d95208964485a3d8cc291316a8d7`
- tw-postal-en.xml: `24acfe52023f0ddc2149a2f8368910cd0968584913f3ac17678abb3048cba1b9`
