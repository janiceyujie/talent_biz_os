// Links from the Support page to Render's logs and Sentry's issues (decision
// 0026), which hold what the database doesn't. Built here only, so if a site's
// address format turns out different, this is the one place to change
// (docs/setup/support.md, "Checking it works").
//
// Render's log search isn't documented to take a query in its address, so its
// links open the service's logs and the page offers the text to paste. Sentry's
// issue search keeps its query in the address.

export type SearchTargets = { renderWeb: string | null; renderWorker: string | null; sentryOrg: string | null };

export const renderLogs = (kind: "web" | "pserv", serviceId: string) => `https://dashboard.render.com/${kind}/${serviceId}/logs`;

export const sentryIssues = (org: string, query: string) =>
  `https://${org}.sentry.io/issues/?${new URLSearchParams({ query, statsPeriod: "30d" })}`;

/**
 * Sentry's search for an error code: a server error's code is Next's digest
 * (digits, sometimes with "@E" and Next's own code), tagged `digest`; one thrown
 * in the browser is 8 hex characters, tagged `error_code` (lib/errors/client.ts).
 */
export const errorCodeQuery = (code: string) => (/^\d+(@E\d+)?$/.test(code) ? `digest:${code}` : `error_code:${code}`);

/** The code in what someone pasted, which may be the whole sentence from their screen. */
export function codeIn(pasted: string) {
  const match = /\b(\d{6,20}(?:@E\d{1,6})?|[0-9a-f]{8})\b/i.exec(pasted);
  return match ? match[1] : null;
}
