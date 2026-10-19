// Whether an email really came from the domain in its From line, as Gmail
// checked it (decision 0013): the Authentication-Results header Gmail adds,
// with its SPF, DKIM, and DMARC results. The sender's address is never trusted
// on its own (decision 0007). Pure, no server-only imports.

export type SenderCheck = "verified" | "failed" | "unknown";
export const senderChecks = ["verified", "failed", "unknown"] as const satisfies readonly SenderCheck[];

/**
 * Gmail's verdict. Only Gmail's own header counts: the topmost one, from
 * authserv-id mx.google.com. A sender can add forged ones, even naming
 * mx.google.com, but only below it. Failed: DMARC
 * failed, or both SPF and DKIM did. Verified: DMARC passed. Anything else,
 * including no result (many small senders don't sign), is unknown.
 */
export function senderCheck(headers: readonly string[]): SenderCheck {
  const gmail = headers[0];
  if (!gmail || !/^\s*mx\.google\.com\s*;/i.test(gmail)) return "unknown";
  const result = (method: string) => new RegExp(`\\b${method}=(\\w+)`, "i").exec(gmail)?.[1]?.toLowerCase() ?? "";
  const [spf, dkim, dmarc] = [result("spf"), result("dkim"), result("dmarc")];
  if (dmarc === "fail" || (["fail", "softfail"].includes(spf) && dkim === "fail")) return "failed";
  if (dmarc === "pass") return "verified";
  return "unknown";
}
