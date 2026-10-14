# 0023: Integrate canonical Gmail classification with the local pilot

Status: local integration, 2026-10-13. Supersedes the Gmail runtime and migration details in decisions 0021 and 0022. Manager and inbox access boundaries remain unchanged.

## Source and selection

Base: Janice main `b8e3e0a` (PRs 9 and 10). Local feature snapshot: `d74e3e4`.

| Area | Selected implementation | Reason |
| --- | --- | --- |
| Gmail synchronization and classification | Main metadata sync, sender/domain/contact/thread rules, then model scoring for unresolved mail | Includes provider transport, retry/cursor behavior, configurable model roles, injection safeguards and usage logging; the local embedding seam was not a connected classifier. |
| Gmail list | Main Waiting and Filtered out views, 30 records per request and live metadata peek | One canonical classification vocabulary and no stored sender/subject previews. |
| Imported messages and other long lists | Local cursor pagination, 20 summaries per request and detail on demand | Preserves complete counts, old deep links, server filters and tenant isolation without loading message bodies in the shared shell. |
| Explicit mail import | Local owner-approved import, adapted to canonical decisions | Adds cancellation, bounded plain text, payment restrictions and account/message deduplication without changing classification into an import state. |
| Manager | Local entitlement and invitation model, three-artist trial limit, scoped read-only portfolio views | Main does not provide this workflow. Today, Calendar, Finance and Projects retain the shared artist filter. |
| Grants, contracts and assistant | Local pilot features | Retains grant deadlines/calendar links, document storage/catalogs, finance tools and deterministic assistant answers. |
| AI routing | Main role-specific provider/privacy policy plus bounded local OpenAI adapter | Mailbox extraction now carries the mailbox privacy flag as well as relevance scoring. |

## Runtime boundaries

- Mail decisions use main outcomes: pending, work, unsure and skipped. Import status is independent: idle, queued, imported or error.
- Waiting/Filtered out does not retain subject, sender, snippet or body. Explicit import stores bounded plain text as an ordinary inbox message only after confirmation.
- Import never creates payments, accepts an offer, signs a contract or sends an email. Existing extraction confirmation remains mandatory.
- Mailbox ownership is checked before reads and again when committing work. A manager cannot import an artist's private mailbox.
- Gmail synchronization remains main's manual queued Sync now flow. No six-hour Gmail schedule is claimed. Grant polling has its separate schedule.
- Local import, manager and assistant experiments retain their existing environment gates. Embedding code remains an inactive experiment, not a second classifier.

## Database migration

Main migrations 0000 through 0028 are preserved byte for byte. Only the unpublished feature migration chain was regenerated as `0029_integrated_local_features.sql`, following the repository migration-conflict workflow. It adds the local feature tables and import fields after main's Gmail schema.

For a database on current main: back up, then run the normal migration command. For a database that already applied the earlier local 0026-0031 chain: do not run this new chain in place or copy migration journals. Build a separate database from the canonical chain and transfer compatible application data after checking schema differences.

This local integration used a separate database and retained the old database. All three old Gmail tables were empty before transfer, so no classification data needed conversion. Nonempty legacy Gmail tables require an explicit mapping; do not silently discard them. Object-storage binaries remain in their existing bucket; the copied document records retain their storage keys.
