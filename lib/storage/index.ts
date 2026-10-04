import "server-only";
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// The one place that talks to file storage. Supabase Storage through its
// S3-compatible API, so moving to S3, R2, or GCS is a configuration change
// (docs/architecture.md, "Portability rules"). Store keys, never URLs.

const config = {
  endpoint: process.env.STORAGE_S3_ENDPOINT,
  region: process.env.STORAGE_S3_REGION || "local",
  accessKeyId: process.env.STORAGE_S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.STORAGE_S3_SECRET_ACCESS_KEY,
  bucket: process.env.STORAGE_BUCKET || "talent-files",
};

let client: S3Client | undefined;
function s3() {
  if (!config.endpoint || !config.accessKeyId || !config.secretAccessKey)
    throw new Error("File storage isn't configured (STORAGE_S3_* in .env.local)");
  client ??= new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true, // Supabase and most S3-compatible stores address buckets by path
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  return client;
}

let bucketReady: Promise<void> | undefined;
/** Create the private bucket on first use if it doesn't exist (local development). */
function ensureBucket() {
  bucketReady ??= (async () => {
    try {
      await s3().send(new HeadBucketCommand({ Bucket: config.bucket }));
    } catch {
      await s3().send(new CreateBucketCommand({ Bucket: config.bucket }));
    }
  })().catch((e) => {
    bucketReady = undefined;
    throw e;
  });
  return bucketReady;
}

/** A URL the browser can PUT exactly this file to, for a few minutes. */
export async function uploadUrl(key: string, contentType: string, size: number) {
  await ensureBucket();
  return getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: config.bucket, Key: key, ContentType: contentType, ContentLength: size }),
    { expiresIn: 600, signableHeaders: new Set(["content-type", "content-length"]) },
  );
}

/** What's stored at a key, or null if nothing is. */
export async function stat(key: string) {
  try {
    const head = await s3().send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
    return { size: head.ContentLength ?? 0, contentType: head.ContentType ?? "" };
  } catch {
    return null;
  }
}

/** The whole object, for analysis (files are capped in size at upload). */
export async function readBytes(key: string) {
  const object = await s3().send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
  return Buffer.from(await object.Body!.transformToByteArray());
}

/** The object as a web stream, for serving it through an authenticated route. */
export async function readStream(key: string) {
  const object = await s3().send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
  return { body: object.Body!.transformToWebStream(), contentType: object.ContentType ?? "application/octet-stream", size: object.ContentLength };
}

/** Upload from the server (tests and scripts; the app uploads from the browser). */
export async function writeBytes(key: string, bytes: Uint8Array, contentType: string) {
  await ensureBucket();
  await s3().send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: bytes, ContentType: contentType }));
}
