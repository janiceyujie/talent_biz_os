import "server-only";
import type { MailRef } from "../metadata";
import type { MailProvider } from "../provider";
import { gmailApi, GmailError } from "./api";
import { toMetadata } from "./parse";
import { readMessage } from "./parts";

export { GmailError };

const MAX_PAGES = 50; // 25,000 changes: far past a mailbox's busiest day

/** The Gmail mailbox behind an access token. */
export function gmailProvider(accessToken: string): MailProvider {
  const api = gmailApi(accessToken);
  return {
    currentCursor: async () => (await api.profile()).historyId,

    async listChanges(cursor) {
      const mail: MailRef[] = [];
      let next = cursor;
      let pageToken: string | undefined;
      try {
        for (let page = 0; page < MAX_PAGES; page++) {
          const res = await api.history(cursor, pageToken);
          for (const h of res.history ?? []) for (const { message } of h.messagesAdded ?? []) mail.push({ id: message.id, threadId: message.threadId });
          next = res.historyId;
          if (!res.nextPageToken) break;
          pageToken = res.nextPageToken;
        }
      } catch (e) {
        if (e instanceof GmailError && e.status === 404) return null; // the cursor is too old: Gmail keeps about a week
        throw e;
      }
      return { mail, cursor: next };
    },

    async listSince(after, limit) {
      const mail: MailRef[] = [];
      const q = `after:${Math.floor(after.getTime() / 1000)}`;
      let pageToken: string | undefined;
      while (mail.length < limit) {
        const res = await api.messages(q, pageToken);
        mail.push(
          ...(res.messages ?? []).map((m) => ({
            id: m.id,
            threadId: m.threadId,
          })),
        );
        if (!res.nextPageToken) break;
        pageToken = res.nextPageToken;
      }
      return mail.slice(0, limit).reverse(); // Gmail lists newest first
    },

    async getMetadata(id, options) {
      try {
        return toMetadata(await api.metadata(id, options));
      } catch (e) {
        if (e instanceof GmailError && e.status === 404) return null;
        throw e;
      }
    },

    async getMessage(id) {
      try {
        return readMessage(await api.full(id));
      } catch (e) {
        if (e instanceof GmailError && e.status === 404) return null;
        throw e;
      }
    },

    async watch(topic) {
      const res = await api.watch(topic);
      return { expiresAt: new Date(Number(res.expiration)) };
    },

    async stopWatch() {
      await api.stop();
    },

    getAttachment: async (messageId, attachmentId) => Buffer.from((await api.attachment(messageId, attachmentId)).data, "base64url"),
  };
}
