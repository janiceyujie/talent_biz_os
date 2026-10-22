// What the metadata read gives us about one email (decision 0013): a few
// headers, its labels and thread, never the body. Held in memory while the
// rules run; nothing here is stored.

/** An email by id, as a change list or search returns it. */
export type MailRef = { id: string; threadId: string };

export type MailMetadata = MailRef & {
  labels: string[]; // Gmail's label ids: INBOX, SPAM, CATEGORY_PROMOTIONS, …
  from: Address;
  subject: string;
  receivedAt: Date;
  headers: Record<MetadataHeader, string>; // "" when the email has none
  snippet: string; // Gmail's short preview; read only for the model step, "" otherwise
};

export type Address = { address: string; name: string }; // address lowercased; both "" when missing

/** The headers the metadata read asks for: who, what, and whether it's bulk mail. */
export const metadataHeaders = ["From", "Subject", "List-Unsubscribe", "List-Id", "Precedence", "Auto-Submitted"] as const;
export type MetadataHeader = (typeof metadataHeaders)[number];

/** `"Name" <a@b.com>`, `Name <a@b.com>`, or a bare `a@b.com`. */
export function parseAddress(header: string): Address {
  const angled = header.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
  const address = (angled ? angled[2] : header).trim().toLowerCase();
  const name = angled
    ? angled[1]
        .replace(/^"(.*)"$/, "$1")
        .replace(/\\(.)/g, "$1")
        .trim()
    : "";
  return address.includes("@") ? { address, name } : { address: "", name: name || header.trim() };
}

/** A list of addresses, as a To line writes it: commas inside quoted names don't split. Entries without an address are left out. */
export function parseAddressList(header: string): Address[] {
  return (header.match(/(?:"(?:[^"\\]|\\.)*"|[^,])+/g) ?? []).map(parseAddress).filter((a) => a.address);
}

/** The part after the @, lowercased; "" when there's no address. */
export const domainOf = (address: string) => address.split("@")[1] ?? "";
