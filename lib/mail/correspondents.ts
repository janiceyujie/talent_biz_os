// Who the other side of a filed message is (decision 0019). Pure; the server records it (lib/data/correspondents.ts).
import { parseAddress, parseAddressList, type Address } from "./metadata";

type Filed = {
  kind: "message" | "payment_notice";
  direction: "received" | "sent";
  sender: string | null; // a received email's From
  recipients: string | null; // the person's own reply's To
};

/**
 * A received email's sender, the recipients of the person's own reply, or the
 * email a pasted or uploaded message gives (`statedEmail`, from its analysis: the
 * message's claim, only a hint). A bank or payment-app notice has none.
 */
export function correspondentsOf(m: Filed, statedEmail: string, statedName = ""): Address[] {
  if (m.kind !== "message") return [];
  if (m.direction === "sent") return parseAddressList(m.recipients ?? "");
  if (m.sender) {
    const from = parseAddress(m.sender);
    return from.address ? [from] : [];
  }
  const stated = parseAddress(statedEmail);
  return stated.address ? [{ address: stated.address, name: statedName.trim() }] : [];
}
