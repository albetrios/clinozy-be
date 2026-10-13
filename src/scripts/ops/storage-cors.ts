/**
 * Runbook-as-code: the upload bucket's CORS (pnpm ops:storage:cors).
 *
 * The browser sends upload bytes straight to S3 (avatar, organization logo, organization files), so
 * the bucket's CORS configuration — not the API — decides whether the page may. A bucket that does
 * not admit the web app's origin, or admits it for `PUT` but not the `POST` the API presigns, fails
 * every browser upload with a CORS error while every API step still answers 200.
 *
 * - **check** (default, needs no AWS permission): sends the browser's preflight from each
 *   `ALLOWED_ORIGINS` origin for each method to the URL the API hands out for a presigned POST, and
 *   lists what the bucket refuses. Exits 1 when anything is refused.
 * - **--print**: prints the configuration `--apply` writes, as the input of
 *   `aws s3api put-bucket-cors --cors-configuration file://…`.
 * - **--apply**: writes it (`s3:PutBucketCORS` — run with an AWS admin's keys in
 *   `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`; the app's own keys cannot), then checks. It
 *   **replaces** the bucket's whole CORS configuration.
 *
 * Usage:
 *   pnpm ops:storage:cors
 *   pnpm ops:storage:cors --print
 *   pnpm ops:storage:cors --apply
 */
import '@/shared/config/load-env-files.js';
import {
  UPLOAD_BUCKET_CORS_METHODS,
  buildCorsPreflightHeaders,
  buildUploadBucketCorsRules,
  corsPreflightAdmits,
} from '@/infrastructure/storage/bucket-cors.util.js';
import {
  getDefaultS3ObjectStorageAdapter,
  putUploadBucketCorsRules,
} from '@/infrastructure/storage/s3-adapter.js';
import { env } from '@/shared/config/env.config.js';
import { parseAllowedOriginsList } from '@/shared/utils/security/allowed-origins.util.js';

const PRINT_MODE = process.argv.includes('--print');
const APPLY_MODE = process.argv.includes('--apply');

/** The URL a browser posts an upload to — signing is local, nothing is created in the bucket. */
async function resolveUploadUrl(): Promise<string> {
  const { url } = await getDefaultS3ObjectStorageAdapter().createPresignedUploadPost({
    key: 'pending/storage-cors-check',
    contentType: 'image/png',
    minContentLength: 1,
    maxContentLength: 1,
    expiresInSeconds: 60,
  });
  return url;
}

/** Preflights every origin × method; prints each answer and returns how many were refused. */
async function checkBucketCors(origins: readonly string[]): Promise<number> {
  const uploadUrl = await resolveUploadUrl();
  console.log(`Upload bucket CORS check — ${env.S3_BUCKET} (${uploadUrl})`);
  let refused = 0;
  for (const origin of origins) {
    for (const method of UPLOAD_BUCKET_CORS_METHODS) {
      const response = await fetch(uploadUrl, {
        method: 'OPTIONS',
        headers: buildCorsPreflightHeaders({ origin, method }),
      });
      const admitted = corsPreflightAdmits({
        origin,
        method,
        status: response.status,
        allowOrigin: response.headers.get('access-control-allow-origin'),
        allowMethods: response.headers.get('access-control-allow-methods'),
      });
      if (!admitted) refused += 1;
      console.log(
        `  ${admitted ? 'ok     ' : 'REFUSED'}  ${method.padEnd(4)}  ${origin}  (${response.status})`,
      );
    }
  }
  if (refused === 0) {
    console.log('Every origin may upload and read.');
  } else {
    console.log(
      `${refused} refused — browser uploads from those origins fail with a CORS error. ` +
        'An AWS admin applies the policy with `pnpm ops:storage:cors --apply` ' +
        '(see docs/deployment/runbooks/upload-storage.md).',
    );
  }
  return refused;
}

async function main(): Promise<void> {
  const bucket = env.S3_BUCKET;
  if (!bucket) {
    console.error('S3_BUCKET is not configured — there is no upload bucket to check.');
    process.exitCode = 1;
    return;
  }
  const origins = parseAllowedOriginsList(env.ALLOWED_ORIGINS);
  const rules = buildUploadBucketCorsRules(origins);

  if (PRINT_MODE) {
    console.log(JSON.stringify({ CORSRules: rules }, null, 2));
    return;
  }
  if (APPLY_MODE) {
    await putUploadBucketCorsRules(rules);
    console.log(`Applied the upload CORS policy to ${bucket} for: ${origins.join(', ')}`);
  }
  process.exitCode = (await checkBucketCors(origins)) === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error('storage-cors failed:', error);
  process.exitCode = 1;
});
