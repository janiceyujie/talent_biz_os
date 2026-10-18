/** Live Gmail writes require explicit deployment opt-in. Development defaults to no writes. */
export function invoiceGmailMode(env: Record<string, string | undefined> = process.env): "local" | "live" | "disabled" {
  if (env.INVOICE_GMAIL_DRAFTS_ENABLED !== "1") return "disabled";
  const target = env.INVOICE_GMAIL_API_URL;
  if (env.APP_ENV === "production") return target || env.GOOGLE_OAUTH_TOKEN_URL ? "disabled" : "live";
  if (env.APP_ENV !== "development") return "disabled";
  try {
    const api = new URL(target || ""), token = new URL(env.GOOGLE_OAUTH_TOKEN_URL || ""), db = new URL(env.DATABASE_URL || "");
    const local = (u: URL) => ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    if (local(api) && local(token) && local(db) && api.protocol === "http:" && token.protocol === "http:") return "local";
  } catch { /* Live development requires a separate, explicit switch. */ }
  return !target && !env.GOOGLE_OAUTH_TOKEN_URL && env.INVOICE_GMAIL_LIVE_LOCAL === "1" ? "live" : "disabled";
}
