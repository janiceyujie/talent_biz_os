import type { MailMetadata } from "./metadata";
import type { MailProvider } from "./provider";

// A few reads in flight hide Gmail's response time; the pace itself is set in gmail/api.ts.
const CONCURRENCY = 4;

/** The metadata of several emails, in the order given; emails deleted since are left out. */
export async function readMetadata(mail: MailProvider, ids: string[]): Promise<MailMetadata[]> {
  const found: (MailMetadata | null)[] = new Array(ids.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const i = next++;
      found[i] = await mail.getMetadata(ids[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));
  return found.filter((m): m is MailMetadata => m !== null);
}
