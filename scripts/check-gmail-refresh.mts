/** Synthetic loopback checks for canonical Gmail fetch plus workspace pagination. */
import env from "@next/env";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
env.loadEnvConfig(process.cwd());
assert.equal(process.env.APP_ENV, "development");
assert.ok(["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL!).hostname));
process.env.MAIL_KEY_DEV = randomBytes(32).toString("base64");
process.env.GOOGLE_CLIENT_ID = "synthetic-refresh-client";
process.env.GOOGLE_CLIENT_SECRET = "synthetic-refresh-secret";
const { db } = await import("../lib/db");
const s = await import("../lib/db/schema");
const { eq, and } = await import("drizzle-orm");
const { default: postgres } = await import("postgres");
const { seal } = await import("../lib/keys");
const { tokenAad, toColumns } = await import("../lib/mail/token");
const { fetchDecision } = await import("../lib/mail/jobs/fetch");
const { inboxDetail, listInbox, inboxListParams } = await import("../lib/data/inbox");
const q = postgres(process.env.DATABASE_URL!);
const talentId = randomUUID(), personId = randomUUID(), connectionId = randomUUID();
let reads = 0, checks = 0;
const ids: string[] = [];
const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
const fake = createServer(async (req, res) => {
  const path = new URL(req.url!, "http://127.0.0.1").pathname;
  const reply = (body: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  if (path === "/token") return reply({ access_token: "synthetic-token", expires_in: 3600, token_type: "Bearer" });
  const id = path.split("/").at(-1)!;
  reads++;
  if (id === "skip-during-read") await db.update(s.mailDecision).set({ outcome: "skipped" }).where(and(eq(s.mailDecision.connectionId, connectionId), eq(s.mailDecision.providerMessageId, id)));
  if (id === "revoke-during-read") await db.update(s.membership).set({ status: "revoked" }).where(and(eq(s.membership.talentId, talentId), eq(s.membership.personId, personId)));
  reply({ id, threadId: `thread-${id}`, internalDate: String(Date.now()), payload: {
    mimeType: "multipart/mixed", headers: [{ name: "From", value: "Synthetic Client <client@example.invalid>" }, { name: "Subject", value: `Synthetic ${id}` }],
    parts: [{ mimeType: "text/plain", body: { data: Buffer.from("Please review this synthetic performance offer.").toString("base64url") } },
      { partId: "2", mimeType: "application/zip", filename: "unsupported.zip", body: { attachmentId: "not-fetched", size: 20 } }],
  } });
});
await new Promise<void>(resolve => fake.listen(0, "127.0.0.1", resolve));
const address = fake.address(); assert.ok(address && typeof address !== "string");
process.env.GMAIL_API_URL = `http://127.0.0.1:${address.port}/gmail/v1`;
process.env.GOOGLE_OAUTH_TOKEN_URL = `http://127.0.0.1:${address.port}/token`;
const decision = async (name: string) => {
  const [row] = await db.insert(s.mailDecision).values({ talentId, connectionId, providerMessageId: name, providerThreadId: `thread-${name}`, receivedAt: new Date(), outcome: "unsure", classifierVersion: "synthetic-refresh" }).returning();
  ids.push(row.id); return row.id;
};
try {
  await db.insert(s.person).values({ id: personId, email: `refresh-${personId}@example.invalid`, displayName: "Synthetic refresh owner", locale: "en" });
  await db.insert(s.talent).values({ id: talentId, name: "Synthetic refresh", vertical: "music", timeZone: "UTC" });
  await db.insert(s.membership).values({ talentId, personId, role: "owner", status: "active" });
  await db.insert(s.mailConnection).values({ id: connectionId, talentId, connectedBy: personId, accountEmail: "synthetic@example.invalid", accountSubject: "synthetic", scopes: "https://www.googleapis.com/auth/gmail.readonly", historyMode: "new_only", ...toColumns(await seal("synthetic-refresh", tokenAad(talentId, "synthetic"))) });
  const id = await decision("offer");
  await Promise.all([fetchDecision(id), fetchDecision(id)]);
  const [d] = await db.select().from(s.mailDecision).where(eq(s.mailDecision.id, id));
  check(d.messageId && d.importStatus === "imported", "Canonical import updates legacy status");
  const detail = await inboxDetail(talentId, d.messageId!);
  check(detail?.gmail?.subject === "Synthetic offer" && detail.gmail.unsure, "Paginated detail preserves Gmail subject and relevance");
  check(detail?.gmail?.skippedAttachments[0]?.filename === "unsupported.zip", "Unsupported attachments are explained");
  const page = await listInbox(talentId, inboxListParams.parse({}));
  check(page.total === 1 && page.items[0].title === "Synthetic offer", "Concurrent imports create one message and preserve subject in list");
  const [jobs] = await q`select count(*)::int as n from graphile_worker._private_jobs where payload->>'messageId'=${d.messageId}`;
  check(jobs.n === 1, "Concurrent imports enqueue analysis once");
  const before = reads; await fetchDecision(id); check(reads === before, "Retry does not fetch imported mail again");
  const skipped = await decision("skip-during-read"); await fetchDecision(skipped);
  check(!(await db.select().from(s.mailDecision).where(eq(s.mailDecision.id, skipped)))[0].messageId, "Decision changed during fetch cannot import");
  const revoked = await decision("revoke-during-read"); await fetchDecision(revoked);
  check(!(await db.select().from(s.mailDecision).where(eq(s.mailDecision.id, revoked)))[0].messageId, "Revocation during fetch prevents persistence");
  const after = reads; await fetchDecision(revoked); check(reads === after, "Revoked owner prevents subsequent provider reads");
  console.log(JSON.stringify({ checks, realGmailCalls: 0, paidModelCalls: 0 }));
} finally {
  await q`delete from graphile_worker._private_jobs where payload->>'messageId' in (select id::text from message where talent_id=${talentId}) or payload->>'decisionId' in ${q(ids.length ? ids : ["none"])}`;
  await q`delete from talent where id=${talentId}`;
  await q`delete from person where id=${personId}`;
  await new Promise<void>(resolve => fake.close(() => resolve()));
  await q.end();
  await (globalThis as typeof globalThis & { pgClient?: ReturnType<typeof postgres> }).pgClient?.end();
}
