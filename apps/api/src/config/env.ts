import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/apexledger'),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('7d'),
  R2_ACCOUNT_ID: z.string().optional().default(''),
  R2_ACCESS_KEY_ID: z.string().optional().default(''),
  R2_SECRET_ACCESS_KEY: z.string().optional().default(''),
  R2_BUCKET_NAME: z.string().default('apexledger'),
  R2_ENDPOINT: z.string().optional().default(''),
  /** Public CDN / r2.dev base URL — e.g. https://pub-xxxx.r2.dev (no trailing slash) */
  R2_PUBLIC_BASE_URL: z.string().optional().default(''),
  MAX_FILE_SIZE_MB: z.coerce.number().default(10),
});

export const env = envSchema.parse(process.env);

/**
 * Resolves the R2 S3-compatible endpoint URL.
 * Prefers R2_ENDPOINT; falls back to account-id URL pattern.
 */
export function getR2Endpoint(): string | null {
  if (env.R2_ENDPOINT) return env.R2_ENDPOINT.replace(/\/$/, '');
  if (env.R2_ACCOUNT_ID) return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  return null;
}

/**
 * Normalizes R2 credentials (handles common access-key / secret swap).
 */
export function getR2Credentials(): { accessKeyId: string; secretAccessKey: string } {
  let accessKeyId = env.R2_ACCESS_KEY_ID.trim();
  let secretAccessKey = env.R2_SECRET_ACCESS_KEY.trim();

  // Cloudflare R2: access key id ≈ 32 chars, secret ≈ 64 chars
  if (accessKeyId.length === 64 && secretAccessKey.length === 32) {
    return { accessKeyId: secretAccessKey, secretAccessKey: accessKeyId };
  }

  return { accessKeyId, secretAccessKey };
}

/** @returns true when R2 S3 API credentials are present */
export function isR2Configured(): boolean {
  const endpoint = getR2Endpoint();
  const { accessKeyId, secretAccessKey } = getR2Credentials();
  return Boolean(endpoint && accessKeyId && secretAccessKey && env.R2_BUCKET_NAME);
}

/** @returns true when public file URLs can be built */
export function isPublicUrlConfigured(): boolean {
  return Boolean(env.R2_PUBLIC_BASE_URL.trim());
}

/**
 * Builds a permanent public URL for an object key.
 * @param r2Key - Object key in the bucket
 */
export function getPublicFileUrl(r2Key: string): string | null {
  const base = env.R2_PUBLIC_BASE_URL.trim().replace(/\/$/, '');
  if (!base) return null;
  return `${base}/${r2Key.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * Ensures R2 upload + public URL base are configured before accepting uploads.
 */
export function assertFileStorageReady(): void {
  if (!isR2Configured()) {
    throw new Error(
      'File storage is not configured. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME in .env'
    );
  }
  if (!isPublicUrlConfigured()) {
    throw new Error(
      'R2_PUBLIC_BASE_URL is required (your bucket public URL or custom domain, no trailing slash)'
    );
  }
}
