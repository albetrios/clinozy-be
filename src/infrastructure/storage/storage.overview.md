`src/infrastructure/storage/`

# Storage infrastructure

## Purpose

S3-compatible object storage client. Owns the AWS SDK v3 client instance, presigned URL issuance for uploads + downloads, and HEAD-object validation for the upload-confirm flow. Used by [upload](src/domains/upload/), [user](src/domains/user/) avatars, [organization](src/domains/tenancy/sub-domains/organization/) logos, [user-data-export](src/domains/user/sub-domains/user-data-export/) and the audit cold export.

## Design decisions

- **One contract, one implementation**: [object-storage.port.ts](src/infrastructure/storage/object-storage.port.ts) is the only storage API; [s3-adapter.ts](src/infrastructure/storage/s3-adapter.ts) is its only implementation. Domain services receive the port by injection; workers call `getDefaultS3ObjectStorageAdapter()`. A second, function-style S3 module once served the workers and drifted — no request timeouts on its client, every HEAD failure read as "not found".
- **Results, not ambiguity**: `verifyUploadedObject` returns a verdict (`verified`, or `rejected` with a reason) and throws only when storage itself fails; `headObjectResult` separates `not_found` from `transient_error`; `deleteObject` returns `deleted` / `failed` (with `circuitOpen`). Only an explicit verdict may fail an upload, and only an explicit 404 may drive destructive cleanup.
- **Refusals don't trip the circuit**: [`countsS3ErrorAsCircuitFailure`](src/infrastructure/storage/s3-error.util.ts) is the `s3` integration default in `outbound-defaults.ts` — a 4xx answer to one request (404, 412, 416, entity too large) counts as a success; network errors, timeouts, 5xx and deployment-wide 4xx (403, throttling, bad credentials, missing bucket) count.
- **Rows go after their objects**: [`purgeRowsAfterTheirObjects`](src/infrastructure/storage/stored-object-purge.util.ts) runs retention — keyset pages, each read and deleted in its own short context, S3 deletes outside both, a row deleted only once its object is gone, the run stopped on an open circuit.
- **AWS SDK v3 over v2**: smaller bundle, modern promise-based API, native `@aws-sdk/s3-request-presigner` for presigned URLs.
- **S3-compatible by default**: `S3_ENDPOINT` env lets ops point at MinIO, R2, or any S3-compatible service. Production uses AWS S3 directly.
- **Presigned URLs for both upload and download**: we never proxy bytes through the API process. Upload uses `createPresignedPost` (browser-friendly form fields); download uses `getSignedUrl` for the GET. The presigned-PUT fallback returns the `headers` its URL signs (`content-type`, `x-amz-server-side-encryption`) beside the URL, as POST returns its `fields` — a PUT without them is refused with `SignatureDoesNotMatch`.
- **The bucket's CORS is code**: [bucket-cors.util.ts](src/infrastructure/storage/bucket-cors.util.ts) builds the one rule the upload bucket needs — the `ALLOWED_ORIGINS` origins, `POST`/`PUT`/`GET`/`HEAD`, the PUT's signed headers, `ETag` exposed — and reads a preflight answer. `pnpm ops:storage:cors` checks the live bucket with the browser's own preflights (no AWS permission), `--print` shows the configuration and `--apply` writes it (an AWS admin's `s3:PutBucketCORS`).
- **Per-call timeouts** on HEAD-object so the upload-confirm flow can't hang on a slow S3 region.
- **No PII in object keys**: keys are deterministic from public ids; never include email or organization slug.

## Operational concerns

- **Presigned URL TTL**: `PRESIGNED_URL_EXPIRY_SECONDS = 900` (15 min) for upload presigns; `USER_DATA_EXPORT_PRESIGNED_DOWNLOAD_EXPIRY_SECONDS = 900` (15 min) for GDPR export downloads.
- **Region pinning**: `S3_REGION` env. Cross-region transfers should not happen in normal operation.
- **CORS configuration on the bucket** must admit every web-app origin (`ALLOWED_ORIGINS`) for `POST` — the default upload — as well as `PUT`, `GET` and `HEAD`. Check it with `pnpm ops:storage:cors`; apply it with `pnpm ops:storage:cors --apply` ([upload-storage runbook](docs/deployment/runbooks/upload-storage.md#bucket-cors)).
- **Signed URLs and SigV4**: AWS caps presigned URL TTL at 7 days for SigV4 signers; the platform runs at much shorter TTLs.

## External dependencies

- **AWS S3** (or S3-compatible).

## Tuning parameters

- `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` (for non-AWS endpoints).
- `S3_MAX_ATTEMPTS` (SDK attempts per call) and `S3_REQUEST_TIMEOUT_MS` (bound on each attempt).
- `PRESIGNED_URL_EXPIRY_SECONDS = 900`.
- `USER_DATA_EXPORT_PRESIGNED_DOWNLOAD_EXPIRY_SECONDS = 86 400`.

## Failure modes

- **HEAD on missing object** → 404 (handled at confirm time → "upload not landed").
- **Bucket misconfigured for CORS** → presigned upload from a browser fails while every API step answers 200 (`POST /uploads` is logged, the confirm never comes); the browser console names the CORS refusal. `pnpm ops:storage:cors` lists each refused origin × method.
- **Region outage** → presign succeeds (no network call) but the upload itself fails; client retries; the platform is unaffected because the row stays `pending`.
