# change-remove-storage-cors-2026-10-14-dtjx — as built

Baseline: none · KICKOFF.md approved 2026-10-14 ([RC4](plans/decisions.md))

## Rows

| #   | Planned | Actually built | Difference | Why | Decision | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| #1  | ROUTE 1 — remove the command and its code | Deleted `src/scripts/ops/storage-cors.ts`, the `ops:storage:cors` script in `package.json`, `src/infrastructure/storage/bucket-cors.util.ts` and `__tests__/unit/bucket-cors.util.unit.test.ts`. `s3-adapter.ts` loses `putUploadBucketCorsRules`, the `PutBucketCorsCommand` import and the `UploadBucketCorsRule` type import; its unit test loses the `PutBucketCorsCommand` mock, the `putUploadBucketCorsRules` suite and the assertion against `UPLOAD_BUCKET_CORS_ALLOWED_HEADERS`. Against their state before `fix-upload-storage-cors` (`af62803`), the adapter and its test now differ only by the presigned-PUT `headers` and their assertions | The `createPresignedUploadUrl` TSDoc keeps one line: the bucket's `AllowedHeaders`, owned by clinozy-infra, must admit each returned header | The constraint stays real when another repository writes the rule | RC1, RC5 | (this commit) |
| #2  | ROUTE 2 — docs | `POST /uploads` description drops "(pnpm ops:storage:cors)". In `upload-storage.md`, **Bucket CORS** now names clinozy-infra as the owner. It keeps a table of what the upload flow needs (origins, `POST`/`PUT`/`GET`/`HEAD`, `content-type` + `x-amz-server-side-encryption`, `ETag`) and shows a `curl` preflight; the hardening bullet and the troubleshooting row point there. `storage.overview.md` says clinozy-infra writes the rule. `CLAUDE.md`, `be-structure-maintainer` (re-locked), `scripts-layout.md`, `skills-lock.json` and `src-structure-tree.txt` are back to their text before `fix-upload-storage-cors` | none | — | RC6 | (this commit) |

## Summary

- **Removed:** the operator command `pnpm ops:storage:cors` and the code that existed only for it
  ([RC1](plans/decisions.md)). No code in clinozy-be checks or writes bucket configuration any
  more.
- **Kept:** the presigned-PUT `headers` ([RC5](plans/decisions.md)).
- **Planned, not built:** none. **Built, not planned:** none.
- **Definition of done (`KICKOFF.md` § 4):**
  1. ✓. The grep's `bucket-cors` term still matches links to the runbook's **Bucket CORS**
     heading (`#bucket-cors` in `upload-storage.md` and `storage.overview.md`). That is the
     section the docs keep ([RC6](plans/decisions.md)), not the removed util.
  2. ✓
  3. ✓ `lint`, `typecheck`, `knip`, `test:unit`, `test:global`, `test:contract`, and the storage,
     upload and user integration suites.
  4. ✓
  5. ✓ `tsdoc:check`, `routes:catalog:check`, `docs:check`, `docs:links:check`, `agent-os:check`,
     `validate:scripts-layout`, `validate:route-schema-docs`, `tool:project-structure-tree:check`,
     `validate:domain`.
- **Reported, not built** ([RC7](plans/decisions.md)): clinozy-infra's rule at `97f5316` allows
  `PUT, GET, HEAD` but not `POST`, the method of clinozy-be's default browser upload. It also
  writes the rule only for a bucket not yet in its setup state. Until clinozy-infra allows `POST`
  on the existing buckets, browser uploads stay refused.

## Standing deviations

None. This iteration has no design input. The bucket's CORS is configuration owned by
clinozy-infra ([RC7](plans/decisions.md)).
