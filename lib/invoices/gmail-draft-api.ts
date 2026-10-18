import { invoiceGmailMode } from "./gmail-config";
export type GmailDraftMessage = { id: string; threadId?: string; labelIds?: string[]; internalDate?: string; payload?: { headers?: {name:string;value:string}[] } };
export type GmailDraft = { id: string; message: GmailDraftMessage };
export class DraftApiError extends Error {
  constructor(readonly status: number) { super(`Gmail draft API ${status}`); }
}

/** Only draft creation and metadata reads exist here. No send, update or delete method. */
export function invoiceDraftApi(token: string) {
  const mode = invoiceGmailMode();
  if (mode === "disabled") throw new DraftApiError(0);
  const base = (process.env.INVOICE_GMAIL_API_URL || "https://gmail.googleapis.com/gmail/v1").replace(/\/$/, "");
  async function call<T>(path: string, raw?: string): Promise<T> {
    // A POST is never retried: a timeout may mean Gmail already created the draft.
    let res: Response;
    try {
      res = await fetch(`${base}/users/me${path}`, {
        method: raw ? "POST" : "GET", redirect: "error",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: raw ? JSON.stringify({message:{raw}}) : undefined,
        signal: AbortSignal.timeout(15000), cache: "no-store",
      });
    } catch { throw new DraftApiError(0); }
    if (!res.ok) throw new DraftApiError(res.status);
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = []; let bytes=0;
    if(reader) try { for(;;) {const p=await reader.read();if(p.done)break;bytes+=p.value.length;if(bytes>1_000_000)throw new DraftApiError(0);chunks.push(p.value);} } finally {await reader.cancel().catch(()=>{});}
    try { return JSON.parse(Buffer.concat(chunks).toString()) as T; } catch { throw new DraftApiError(0); }
  }
  return {
    create: (raw:string) => call<GmailDraft>("/drafts",raw),
    get: (id:string) => call<GmailDraft>(`/drafts/${encodeURIComponent(id)}?format=metadata&fields=id,message(id,threadId,labelIds,internalDate,payload/headers)`),
    message: (id:string) => call<GmailDraftMessage>(`/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Message-ID&fields=id,threadId,labelIds,internalDate,payload/headers`),
    find: (messageId:string) => call<{messages?:{id:string}[]}>(`/messages?${new URLSearchParams({q:`in:anywhere rfc822msgid:${messageId.replace(/[<>]/g,"")}`,maxResults:"10",includeSpamTrash:"true"})}`),
    drafts: (pageToken?:string) => call<{drafts?:GmailDraft[];nextPageToken?:string}>(`/drafts?${new URLSearchParams({maxResults:"100",...(pageToken?{pageToken}:{})})}`),
  };
}

/** A missing draft alone never proves that the user sent it. */
export function isMatchingSent(message:GmailDraftMessage, messageId:string) {
  return !!message.labelIds?.includes("SENT") && !!message.payload?.headers?.some(h=>h.name.toLowerCase()==="message-id" && h.value===messageId);
}
