// Which of an email's attachments are brought in (decision 0013): what the
// analysis reads, PDFs and images, within the same limits as uploads (the
// total keeps a request to the model under its size cap); the rest are listed
// by name, not fetched. Pure, no server-only imports.
import type { SkippedAttachment } from "@/lib/db/schema";
import { UPLOAD_LIMITS } from "@/lib/uploads";
import type { AttachmentRef } from "./gmail/parts";

export const FETCH_LIMITS = UPLOAD_LIMITS;

/** Which attachments to fetch, in order: PDFs and images within the limits; the rest are listed, not fetched. */
export function chooseAttachments(attachments: AttachmentRef[]) {
  const fetch: AttachmentRef[] = [];
  const skipped: SkippedAttachment[] = [];
  let total = 0;
  for (const a of attachments) {
    const fits =
      (FETCH_LIMITS.types as readonly string[]).includes(a.mimeType) &&
      a.size > 0 &&
      a.size <= FETCH_LIMITS.fileBytes &&
      total + a.size <= FETCH_LIMITS.totalBytes &&
      fetch.length < FETCH_LIMITS.files;
    if (fits) {
      fetch.push(a);
      total += a.size;
    } else skipped.push({ filename: a.filename, mimeType: a.mimeType, sizeBytes: a.size });
  }
  return { fetch, skipped };
}
