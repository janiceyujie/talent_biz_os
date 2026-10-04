"use server";

import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { analyzeMessage } from "@/lib/ai/analyze-message";
import { requireTalent } from "@/lib/auth";
import { db } from "@/lib/db";
import { file, message } from "@/lib/db/schema";
import { toLocale } from "@/lib/i18n/config";
import { readBytes, stat, uploadUrl } from "@/lib/storage";
import { UPLOAD_LIMITS } from "@/lib/uploads";
import { errorText } from "./validation";

// Screenshots, photos, and PDFs sent in as one message (docs/architecture.md,
// "Screenshots and uploads"): the browser puts the bytes straight into storage
// through short-lived signed URLs, then registers them. Keys are scoped to the
// workspace, so a person can only register files under their own talent.

const keyFor = (talentId: string, fileId: string) => `files/${talentId}/${fileId}`;

const fileMeta = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(UPLOAD_LIMITS.types),
  size: z.number().int().positive().max(UPLOAD_LIMITS.fileBytes),
});
const batch = z
  .array(fileMeta)
  .min(1)
  .max(UPLOAD_LIMITS.files)
  .refine((files) => files.reduce((n, f) => n + f.size, 0) <= UPLOAD_LIMITS.totalBytes, "uploadTooLarge");

/** Signed upload URLs for a batch of files, in order. */
export async function prepareUpload(
  files: { name: string; type: string; size: number }[],
): Promise<{ uploads: { id: string; url: string }[] } | { error: string }> {
  const { talent } = await requireTalent();
  const fail = await errorText();
  const parsed = batch.safeParse(files);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error: fail(issue?.message === "uploadTooLarge" || issue?.code === "too_big" ? "uploadTooLarge" : "uploadInvalid", {
        files: UPLOAD_LIMITS.files,
        megabytes: UPLOAD_LIMITS.totalBytes / 1024 / 1024,
      }),
    };
  }
  const uploads = await Promise.all(
    parsed.data.map(async (f) => {
      const id = randomUUID();
      return { id, url: await uploadUrl(keyFor(talent.id, id), f.type, f.size) };
    }),
  );
  return { uploads };
}

/**
 * Register uploaded files as one message and analyze it in the background.
 * Each file must be in storage with the declared size and type. The same files
 * in the same order are the same message: that returns the existing one.
 */
export async function registerUpload(
  files: { id: string; name: string; type: string; size: number }[],
): Promise<{ id: string; duplicate: boolean } | { error: string }> {
  const { person, talent } = await requireTalent();
  const fail = await errorText();
  const parsed = z.array(fileMeta.extend({ id: z.uuid() })).min(1).max(UPLOAD_LIMITS.files).safeParse(files);
  if (!parsed.success) return { error: fail("uploadInvalid", { files: UPLOAD_LIMITS.files, megabytes: UPLOAD_LIMITS.totalBytes / 1024 / 1024 }) };

  const digest = createHash("sha256");
  for (const f of parsed.data) {
    const key = keyFor(talent.id, f.id);
    const stored = await stat(key);
    if (!stored || stored.size !== f.size || !stored.contentType.startsWith(f.type)) return { error: fail("uploadMissing") };
    const bytes = await readBytes(key);
    // The declared type comes from the browser; the bytes must agree.
    if (!looksLike(bytes, f.type)) return { error: fail("uploadInvalid", { files: UPLOAD_LIMITS.files, megabytes: UPLOAD_LIMITS.totalBytes / 1024 / 1024 }) };
    digest.update(createHash("sha256").update(bytes).digest());
  }
  const dedupKey = `upload:${digest.digest("hex")}`;

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(message)
      .values({ talentId: talent.id, submittedBy: person.personId, channel: "upload", receivedAt: new Date(), dedupKey })
      .onConflictDoNothing({ target: [message.talentId, message.dedupKey] })
      .returning({ id: message.id });
    if (!row) return null;
    await tx.insert(file).values(
      parsed.data.map((f, position) => ({
        id: f.id,
        talentId: talent.id,
        messageId: row.id,
        position,
        role: f.type.startsWith("image/") ? ("screenshot" as const) : ("upload" as const),
        storageKey: keyFor(talent.id, f.id),
        contentType: f.type,
        filename: f.name,
        sizeBytes: f.size,
      })),
    );
    return row;
  });
  if (!created) {
    const [existing] = await db
      .select({ id: message.id })
      .from(message)
      .where(and(eq(message.talentId, talent.id), eq(message.dedupKey, dedupKey)));
    return { id: existing.id, duplicate: true };
  }
  const locale = toLocale(person.locale);
  after(() => analyzeMessage(created.id, locale));
  refresh();
  return { id: created.id, duplicate: false };
}

/** Whether a file's first bytes match its declared type (PNG, JPEG, WebP, HEIC/HEIF, PDF). */
function looksLike(bytes: Uint8Array, type: string) {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  switch (type) {
    case "image/png":
      return bytes[0] === 0x89 && ascii(1, 4) === "PNG";
    case "image/jpeg":
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "image/webp":
      return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    case "image/heic":
    case "image/heif":
      return ascii(4, 8) === "ftyp";
    case "application/pdf":
      return ascii(0, 5) === "%PDF-";
    default:
      return false;
  }
}
