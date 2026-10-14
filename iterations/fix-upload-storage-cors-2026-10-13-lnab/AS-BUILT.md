# fix-upload-storage-cors-2026-10-13-lnab — as built

Baseline: none · KICKOFF.md approved 2026-10-13 ([UC4](plans/decisions.md))

## Rows

| #   | Planned | Actually built | Difference | Why | Decision | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| #1  | ROUTE 1 — bucket CORS policy as code | `src/infrastructure/storage/bucket-cors.util.ts`: `buildUploadBucketCorsRules(ALLOWED_ORIGINS)` (one rule — origins, `POST`/`PUT`/`GET`/`HEAD`, `content-type` + `x-amz-server-side-encryption`, `ETag`, 3600 s; an empty list throws `ConfigurationError`), `buildCorsPreflightHeaders`, `corsPreflightAdmits`, and its own `UploadBucketCorsRule` type. Unit tests: `bucket-cors.util.unit.test.ts` | The rule type is ours, not the SDK's `CORSRule` | Biome allows `@aws-sdk/client-s3` only in the storage wrapper (`s3-adapter.ts`) | UC5 | (this commit) |
| #2  | ROUTE 2 — `pnpm ops:storage:cors` | `src/scripts/ops/storage-cors.ts`: check (default) preflights each origin × method against the presigned-POST URL and exits 1 on a refusal; `--print`; `--apply` → `putUploadBucketCorsRules` in `s3-adapter.ts`, then the check. Run against the development bucket: 5 refused (`POST` from `localhost:3000`; all four from `localhost:5173`), exit 1. Against a local S3 emulator: `--apply` then check → every origin admitted, a foreign origin's preflight 403. With the app's keys on the development bucket, `--apply` fails `AccessDenied`, exit 1, nothing written | The write lives in `s3-adapter.ts` as an operator-only export, outside `ObjectStoragePort`, and calls the client directly rather than through `outboundCall` | The SDK import rule (above); and through `outboundCall` the `s3` circuit's Redis connection kept the command from exiting — an operator write must not count toward the app's circuit either | UC6, UC7 | (this commit) |
| #3  | ROUTE 3 — presigned PUT returns its signed headers | `ObjectStoragePort.createPresignedUploadUrl` → `PresignedUploadPut { url, headers }`; the S3 adapter returns `{ 'content-type', 'x-amz-server-side-encryption': 'AES256' }`; `UploadService.createUpload` / `serializeUploadCreate` / `UploadCreateOutput` carry `headers` beside `upload_method: 'PUT'`; route description names `fields` and `headers`. Every storage fake moved to the new shape. Verified on the development bucket from Node: a PUT with `Content-Type` alone → 403 `SignatureDoesNotMatch` (the old client); with the returned headers → 200 | none | — | UC8 | (this commit) |
| #4  | ROUTE 4 — docs | `docs/deployment/runbooks/upload-storage.md` gains **Bucket CORS** (the rule, the three commands, who applies it) and a troubleshooting row for the browser symptom; its PUT row names `headers`; its hardening bullet no longer says "the API client origin". `storage.overview.md`, `CLAUDE.md` (structure + command), `be-structure-maintainer` (re-locked), `scripts-layout.md` and the generated structure tree follow | none | — | — | (this commit) |

## Summary

- **Cause** ([UC1](plans/decisions.md)): the development bucket's CORS admits only
  `http://localhost:3000` (the API) for `PUT`/`GET`/`HEAD`; the browser posts from the web app's
  origin with `POST`. Every API step works — reproduced from Node and in Chromium, and with
  Chromium's CORS checks switched off the web app's avatar and logo uploads complete end to end
  (S3 204 → confirm 200 → attach 200).
- **Planned, not built:** none.
- **Built, not planned:** none beyond the two placements in rows #1–#2.
- **Definition of done (`KICKOFF.md` § 5):** 1 ✓ (check exits 1 listing the 5 refusals; `--print`
  prints the rule) · 2 ⏳ needs an AWS admin to run `pnpm ops:storage:cors --apply` on the
  development bucket — the app's keys are denied `s3:PutBucketCORS` ([UC7](plans/decisions.md)); the
  apply → check path is verified on a local S3 emulator · 3 ✓ · 4 ✓ · 5 ✓ (`pnpm validate`,
  `typecheck`, `test:unit` 5270/5270, `test:global` 142/142, the storage integration suites 44/44,
  `test:contract` 57/57, `tsdoc:check`, `routes:catalog:check`, `docs:check`, `docs:links:check`,
  `agent-os:check`, `validate:scripts-layout`, `tool:project-structure-tree:check`).
- **Operator follow-up:** for each environment, with an AWS admin's keys in `S3_ACCESS_KEY_ID` /
  `S3_SECRET_ACCESS_KEY` and that environment's `S3_BUCKET` / `ALLOWED_ORIGINS`:
  `pnpm ops:storage:cors --apply`. Production's `ALLOWED_ORIGINS` must list the deployed web app's
  domain.

## Standing deviations

None. This iteration has no design input; the bucket's CORS is configuration outside the code, and
until it is applied the development bucket still refuses browser uploads (row #2).
