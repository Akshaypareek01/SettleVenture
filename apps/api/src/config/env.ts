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

// Production must never run on dev defaults — fail fast at boot.
if (env.NODE_ENV === 'production') {
  const problems: string[] = [];
  if (env.JWT_SECRET.length < 32) {
    problems.push('JWT_SECRET must be at least 32 characters in production');
  }
  if (/change|example|placeholder|secret123|your[-_]?secret/i.test(env.JWT_SECRET)) {
    problems.push('JWT_SECRET looks like a placeholder — generate a real random secret');
  }
  if (/localhost|127\.0\.0\.1/.test(env.MONGODB_URI)) {
    problems.push('MONGODB_URI points at localhost in production');
  }
  if (problems.length) {
    throw new Error(`Unsafe production configuration:\n- ${problems.join('\n- ')}`);
  }
}

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

/** @returns true when public file URLs can be built with a non-S3-API base */
export function isPublicUrlConfigured(): boolean {
  const base = env.R2_PUBLIC_BASE_URL.trim();
  return Boolean(base) && isValidPublicBaseUrl(base);
}

/**
 * Public base must be r2.dev / custom domain — never the S3 API host.
 * @param base - Candidate R2_PUBLIC_BASE_URL
 */
export function isValidPublicBaseUrl(base: string): boolean {
  const normalized = base.trim().toLowerCase().replace(/\/$/, '');
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) return false;
  if (normalized.includes('.r2.cloudflarestorage.com')) return false;
  return true;
}

/**
 * Builds a permanent public URL for an object key.
 * @param r2Key - Object key in the bucket
 */
export function getPublicFileUrl(r2Key: string): string | null {
  const base = env.R2_PUBLIC_BASE_URL.trim().replace(/\/$/, '');
  if (!base || !isValidPublicBaseUrl(base)) return null;
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
  const base = env.R2_PUBLIC_BASE_URL.trim();
  if (!base) {
    throw new Error(
      'R2_PUBLIC_BASE_URL is required — use the bucket public URL (https://pub-xxxx.r2.dev) or custom domain, not the S3 API endpoint'
    );
  }
  if (!isValidPublicBaseUrl(base)) {
    throw new Error(
      'R2_PUBLIC_BASE_URL cannot be the S3 API host (*.r2.cloudflarestorage.com). Enable Public access on the bucket and paste the https://pub-….r2.dev URL'
    );
  }
}
