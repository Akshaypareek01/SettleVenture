import { v4 as uuidv4 } from 'uuid';
import { PutObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand as PutCmd } from '@aws-sdk/client-s3';
import {
  assertFileStorageReady,
  env,
  getPublicFileUrl,
  getR2Credentials,
  getR2Endpoint,
  isR2Configured,
  isPublicUrlConfigured,
} from '../config/env.js';

export interface PresignResult {
  uploadUrl: string;
  r2Key: string;
  publicUrl: string;
}

/**
 * Builds S3 client for Cloudflare R2.
 */
function getR2Client(): S3Client {
  assertFileStorageReady();
  const endpoint = getR2Endpoint();
  if (!endpoint) throw new Error('R2 endpoint is not configured');

  const { accessKeyId, secretAccessKey } = getR2Credentials();
  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

/**
 * Uploads a file buffer to R2 (no local disk).
 * @param r2Key - Object key in bucket
 * @param buffer - File contents
 * @param contentType - MIME type
 */
export async function uploadToR2(r2Key: string, buffer: Buffer, contentType: string): Promise<void> {
  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: r2Key,
      Body: buffer,
      ContentType: contentType,
    })
  );
}

/**
 * Builds a unique storage key for a venture file.
 * @param ventureId - Venture ID for folder structure
 * @param fileName - Original file name
 */
export function buildStorageKey(ventureId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `ventures/${ventureId}/proofs/${uuidv4()}-${safeName}`;
}

/**
 * Stores a file in R2 only.
 * @param r2Key - Object key
 * @param buffer - File contents
 * @param contentType - MIME type
 * @returns Permanent public URL for the object
 */
export async function storeFile(
  r2Key: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  assertFileStorageReady();
  await uploadToR2(r2Key, buffer, contentType);
  const publicUrl = getPublicFileUrl(r2Key);
  if (!publicUrl) {
    throw new Error('Failed to build public URL for uploaded file');
  }
  return publicUrl;
}

/**
 * Generates presigned PUT URL for direct browser → R2 upload.
 * @param ventureId - Venture ID for folder structure
 * @param fileName - Original file name
 * @param fileType - MIME type
 */
export async function presignUpload(
  ventureId: string,
  fileName: string,
  fileType: string
): Promise<PresignResult> {
  assertFileStorageReady();
  const r2Key = buildStorageKey(ventureId, fileName);
  const publicUrl = getPublicFileUrl(r2Key);
  if (!publicUrl) {
    throw new Error('R2_PUBLIC_BASE_URL is not configured');
  }

  const client = getR2Client();
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: r2Key,
    ContentType: fileType,
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 3600 });
  return { uploadUrl, r2Key, publicUrl };
}

/**
 * Resolves the URL clients should use to view/download a file.
 * Prefers stored publicUrl; falls back to building from r2Key.
 * @param r2Key - Object key
 * @param storedPublicUrl - URL saved on attachment at upload time
 */
export function resolveFileUrl(r2Key: string, storedPublicUrl?: string | null): string {
  if (storedPublicUrl?.trim()) return storedPublicUrl.trim();
  const built = getPublicFileUrl(r2Key);
  if (built) return built;
  throw new Error('File URL unavailable — configure R2_PUBLIC_BASE_URL');
}

/**
 * @deprecated Use resolveFileUrl — kept for call sites that await URLs
 * @param r2Key - Object key
 * @param storedPublicUrl - Optional stored public URL
 */
export async function getDownloadUrl(
  r2Key: string,
  storedPublicUrl?: string | null
): Promise<string> {
  return resolveFileUrl(r2Key, storedPublicUrl);
}

/**
 * Deletes a file from R2.
 * @param r2Key - Storage key
 */
export async function deleteFile(r2Key: string): Promise<void> {
  if (!isR2Configured()) return;
  const client = getR2Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: r2Key,
    })
  );
}

/** Logs storage mode at startup. */
export function logStorageConfig(): void {
  if (isR2Configured() && isPublicUrlConfigured()) {
    console.info('[storage] Cloudflare R2 — public URLs via', env.R2_PUBLIC_BASE_URL);
  } else {
    console.warn(
      '[storage] R2 not fully configured — uploads will fail until R2_* and R2_PUBLIC_BASE_URL are set'
    );
  }
}
