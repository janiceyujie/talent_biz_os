import { z } from "zod";
import type { MailMetadata } from "./metadata";
export class MailProviderError extends Error { constructor(readonly code:string){super(code);} }
export type MailContent = { metadata: MailMetadata; text: string };
export interface MailContentProvider { metadata(id: string): Promise<MailMetadata | null>; content(id: string): Promise<MailContent | null>; }
const partSchema = z.object({ mimeType: z.string().optional(), filename: z.string().optional(),
  headers: z.array(z.object({name:z.string(),value:z.string()})).max(200).optional(),
  body: z.object({ data: z.string().max(140_000).optional(), attachmentId: z.string().optional() }).optional(),
  parts: z.array(z.unknown()).max(100).optional() });
/** Only bounded UTF-8 plain text is eligible in the local pilot. No attachment or HTML fallback. */
export function plainText(payload: unknown): string {
  let visited = 0, bytes = 0;
  const blocks: string[] = [];
  const walk = (input: unknown, depth: number) => {
    if (++visited > 100 || depth > 10) throw new MailProviderError("invalid_response");
    const parsed = partSchema.safeParse(input);
    if (!parsed.success) throw new MailProviderError("invalid_response");
    const p = parsed.data;
    if (p.filename || p.body?.attachmentId) return;
    if (p.mimeType === "text/plain" && p.body?.data) {
      const charset = p.headers?.find(h => h.name.toLowerCase() === "content-type")?.value.match(/charset=["']?([^;"'\s]+)/i)?.[1];
      if (charset && !/^(utf-8|us-ascii)$/i.test(charset)) throw new MailProviderError("invalid_response");
      if (!/^[A-Za-z0-9_-]*={0,2}$/.test(p.body.data)) throw new MailProviderError("invalid_response");
      const raw = Buffer.from(p.body.data, "base64url"); bytes += raw.length;
      if (bytes > 100_000) throw new MailProviderError("invalid_response");
      try { blocks.push(new TextDecoder("utf-8", {fatal:true}).decode(raw)); } catch { throw new MailProviderError("invalid_response"); }
    } else if (p.mimeType?.startsWith("multipart/")) for (const child of p.parts ?? []) walk(child, depth + 1);
  };
  walk(payload, 0);
  const text = blocks.join("\n").replace(/\r\n?/g, "\n").trim();
  if (!text || text.length > 50_000) throw new MailProviderError("invalid_response");
  return text;
}
