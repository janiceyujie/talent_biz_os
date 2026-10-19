// A Gmail push notice as Pub/Sub delivers it (decision 0013): which mailbox
// changed, never what. Pure, no server-only imports.

/** A Gmail notice: which mailbox changed. It carries no mail content. */
export type GmailNotice = { emailAddress: string; historyId: string };

/** A notice's data as Pub/Sub delivers it (base64 JSON); null when it isn't one. */
export function readNotice(data: string | undefined): GmailNotice | null {
  try {
    const n = JSON.parse(Buffer.from(data ?? "", "base64").toString("utf8")) as Partial<GmailNotice>;
    return typeof n.emailAddress === "string" && n.emailAddress.includes("@") ? { emailAddress: n.emailAddress.toLowerCase(), historyId: String(n.historyId ?? "") } : null;
  } catch {
    return null;
  }
}
