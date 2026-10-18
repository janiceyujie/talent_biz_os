# Creator platform analytics access

Reviewed against official sources on 2026-10-12. The Settings page provides official dashboard launchers and export guides. These are external links, not account connections or automatic analytics ingestion.

## Supported entry points

| Platform | Audience | Dashboard | Export |
| --- | --- | --- | --- |
| Spotify for Artists | Music artists and authorized teams | https://artists.spotify.com/c | Some song streams, audience timeline and song/playlist tables can be exported as CSV. |
| Spotify for Creators | Audio/video podcast owners and authorized teams | https://creators.spotify.com/pod/login | Web analytics charts support CSV exports for a selected date range. |
| Apple Music for Artists | Approved artists and authorized teams | https://artists.apple.com/a | Music → See All, select a date range and download CSV. |

Links open a new tab. Sign-in and access verification happen on the official platform. Taloox does not receive passwords, login cookies, tokens or reports from these launchers. It does not mark a provider connected merely because someone clicks a link. There is no database schema change.

## Automatic connection limits

Spotify Web API OAuth and Apple Music subscriber authentication must not be described as permission to read artist/creator analytics. Public catalog or personal listening-library data is a different resource from private creator reports. Do not reverse-engineer private dashboard endpoints or request browser session cookies as an integration path.

Apple **does** offer a separate Music Analytics API for providers. Apple's July 6, 2026 announcement expanded engagement/overlap endpoints to all Apple Music label partners. Access is tied to the provider organization; Legal/Admin users manage it through iTunes Connect Users and Access → Keys, and a Legal user must accept its associated terms. This is not ordinary Apple sign-in or an Apple Music for Artists account alone.

A future authorized API connector would require eligibility verification, explicit data access, securely stored credentials, organization/catalog scoping, revocation, refresh/job status and auditing. A future CSV importer should preview actual platform exports before saving, preserve source/date range/time zone/metric definition, prevent repeated imports and keep platform audience metrics separate. These capabilities are not implemented by the current dashboard launchers.

## Official references

- Spotify artist export: https://support.spotify.com/us/artists/article/exporting-data/
- Spotify creator export: https://support.spotify.com/us/creators/article/downloading-your-shows-analytics-data/
- Spotify creator login: https://creators.spotify.com/pod/login
- Spotify Web API: https://developer.spotify.com/documentation/web-api
- Apple artist access: https://artists.apple.com/support/1101-claim-your-account
- Apple artist analytics and CSV: https://artists.apple.com/support/1105-understand-your-analytics
- Apple subscriber authentication: https://developer.apple.com/documentation/applemusicapi/user-authentication-for-musickit
- Apple provider API setup: https://itunespartner.apple.com/music/support/5241-music-analytics-api
- Apple provider API access expansion: https://itunespartner.apple.com/5603-music-analytics-api-access-audience-segmentation

Royalty accounting is a separate concern. Apple directs royalty/payment questions to the distributor; do not equate plays or projected royalties with Finance receipts.

## Local verification

TypeScript, lint, i18n catalog parity and the production build passed. Browser checks covered English and Traditional Chinese, keyboard navigation, dismissing the information tooltip, opening the Spotify for Creators official login in a separate tab, and 320/768/1024/1440 px layouts with no horizontal overflow. No browser console errors were captured. The isolated local test account was signed out and removed; existing user records were preserved. Changes remain local and uncommitted.
