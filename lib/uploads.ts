// What can be sent in as screenshots, photos, and documents. Shared by the
// upload form and the server, which checks again. Files go to the model inline,
// base64-encoded (a third larger), and a Gemini request is capped at 20 MB, so
// 12 MB of files leaves room for the prompt. Bigger files need the provider's file API.
export const UPLOAD_LIMITS = {
  files: 10,
  fileBytes: 10 * 1024 * 1024,
  totalBytes: 12 * 1024 * 1024,
  types: ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif", "application/pdf"] as const,
};
export type UploadType = (typeof UPLOAD_LIMITS.types)[number];
