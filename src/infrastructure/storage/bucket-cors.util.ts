import { ConfigurationError } from '@/shared/errors/index.js';

/** One S3 CORS rule, in the shape `PutBucketCors` takes (and `aws s3api put-bucket-cors` reads). */
export interface UploadBucketCorsRule {
  AllowedOrigins: string[];
  AllowedMethods: string[];
  AllowedHeaders: string[];
  ExposeHeaders: string[];
  MaxAgeSeconds: number;
}

/**
 * The methods a browser uses against the upload bucket: `POST` (the presigned form, the default)
 * and `PUT` (the presigned-URL fallback) write; `GET` and `HEAD` read a signed link back.
 */
export const UPLOAD_BUCKET_CORS_METHODS = ['POST', 'PUT', 'GET', 'HEAD'] as const;

/** One of {@link UPLOAD_BUCKET_CORS_METHODS}. */
export type UploadBucketCorsMethod = (typeof UPLOAD_BUCKET_CORS_METHODS)[number];

/**
 * The request headers a browser sets itself on a presigned PUT — the ones the URL signs, returned
 * to the client as the presign response's `headers`. A presigned POST sends none (its form fields
 * travel in the body), so these are what the bucket's `AllowedHeaders` must admit.
 */
export const UPLOAD_BUCKET_CORS_ALLOWED_HEADERS = [
  'content-type',
  'x-amz-server-side-encryption',
] as const;

/** Response headers the page may read: the `ETag` of what it just wrote. */
export const UPLOAD_BUCKET_CORS_EXPOSE_HEADERS = ['ETag'] as const;

/** How long a browser may cache a preflight answer, in seconds. */
export const UPLOAD_BUCKET_CORS_MAX_AGE_SECONDS = 3600;

/**
 * The upload bucket's CORS configuration: one rule admitting the web app's origins.
 *
 * @remarks
 * The browser sends upload bytes straight to S3, so the bucket — not the API — decides whether the
 * page may. `allowedOrigins` is `ALLOWED_ORIGINS`, the API's own CORS allowlist, because the origins
 * that may call the API are exactly the ones that upload. Applying this configuration replaces the
 * bucket's whole CORS configuration (`PutBucketCors`).
 *
 * @param allowedOrigins - The web app's origins, already split and trimmed.
 * @throws ConfigurationError when the list is empty — a bucket that admits no origin refuses every
 *   browser upload.
 */
export function buildUploadBucketCorsRules(
  allowedOrigins: readonly string[],
): UploadBucketCorsRule[] {
  if (allowedOrigins.length === 0) {
    throw new ConfigurationError(
      'ALLOWED_ORIGINS is empty: the upload bucket CORS needs the web app origins',
    );
  }
  return [
    {
      AllowedOrigins: [...allowedOrigins],
      AllowedMethods: [...UPLOAD_BUCKET_CORS_METHODS],
      AllowedHeaders: [...UPLOAD_BUCKET_CORS_ALLOWED_HEADERS],
      ExposeHeaders: [...UPLOAD_BUCKET_CORS_EXPOSE_HEADERS],
      MaxAgeSeconds: UPLOAD_BUCKET_CORS_MAX_AGE_SECONDS,
    },
  ];
}

/**
 * The preflight a browser sends before `method` from `origin`: a `PUT` also asks for the headers it
 * will set; a `POST` form and the reads ask for none.
 */
export function buildCorsPreflightHeaders(options: {
  origin: string;
  method: UploadBucketCorsMethod;
}): Record<string, string> {
  return {
    Origin: options.origin,
    'Access-Control-Request-Method': options.method,
    ...(options.method === 'PUT'
      ? { 'Access-Control-Request-Headers': UPLOAD_BUCKET_CORS_ALLOWED_HEADERS.join(',') }
      : {}),
  };
}

/**
 * Whether a preflight answer lets the page send `method` from `origin`.
 *
 * @remarks
 * S3 answers a refused preflight with 403 and no CORS headers. An admitted one is 2xx, echoes the
 * origin (or `*`) in `Access-Control-Allow-Origin` and lists the method in
 * `Access-Control-Allow-Methods`; anything short of all three is a refusal the browser would report
 * as a network error.
 */
export function corsPreflightAdmits(options: {
  origin: string;
  method: UploadBucketCorsMethod;
  status: number;
  allowOrigin: string | null;
  allowMethods: string | null;
}): boolean {
  const { origin, method, status, allowOrigin, allowMethods } = options;
  if (status < 200 || status >= 300) return false;
  if (allowOrigin !== '*' && allowOrigin !== origin) return false;
  const methods = (allowMethods ?? '').split(',').map((entry) => entry.trim().toUpperCase());
  return methods.includes(method);
}
