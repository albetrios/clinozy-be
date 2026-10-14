# fix-upload-storage-cors-2026-10-13-lnab — kickoff

## 1. Header

| Field     | Value                                                                                     |
| --------- | ----------------------------------------------------------------------------------------- |
| Iteration | `fix-upload-storage-cors-2026-10-13-lnab`                                                 |
| Type      | fix                                                                                       |
| Baseline  | none ([UC3](plans/decisions.md))                                                          |
| Intake    | none — a fix with no design input ([UC3](plans/decisions.md))                             |
| Branch    | `fix/upload-storage-cors`                                                                 |
| Sibling   | clinozy-fe's same-named iteration — the upload errors in words and the PUT headers it sends |

## 2. Goal and scope

Profile avatar and organization logo uploads fail in the browser. Every API step works; the
browser's write to S3 is refused by the bucket's CORS rule, which admits only the API's own origin
and never the `POST` clinozy-be presigns ([UC1](plans/decisions.md)). The bucket's configuration
lives in AWS and the app's credentials cannot change it, so the fix makes the required policy code
and gives an operator one command to check it and one to apply it.

In scope:

- The bucket CORS policy, built from `ALLOWED_ORIGINS` ([UC5](plans/decisions.md)).
- `pnpm ops:storage:cors` — check the live bucket by preflight (no AWS permission,
  [UC6](plans/decisions.md)); `--print` the configuration; `--apply` it with admin credentials
  ([UC7](plans/decisions.md)).
- The presigned-PUT fallback returns the headers it signs ([UC8](plans/decisions.md)).
- The upload runbook and storage overview say what the bucket needs and how to check it.

Out of scope: changing the bucket's CORS from this session ([UC7](plans/decisions.md)); sending
upload bytes through the API ([UC1](plans/decisions.md)); the production bucket's settings beyond
the same command.

## 3. Evidence (2026-10-13, development bucket `clinozy-be-development-uploads`)

- From Node, with the API on `:3000`: `POST /uploads` 200 → storage write 204 → confirm 200
  `UPLOADED` → `PUT /users/me/avatar` 200 → signed read 200 `image/png`; the same for
  `organization-logo` → `PUT /tenancy/organization/logo` 200.
- From Chromium on `http://localhost:5173`, the web app's own Settings: `POST /uploads` 200, then
  `Access to XMLHttpRequest at 'https://clinozy-be-development-uploads.s3.us-east-1.amazonaws.com/'
  from origin 'http://localhost:5173' has been blocked by CORS policy`; toast "Network request
  failed". Same for the organization logo.
- Preflight probe: `http://localhost:3000` → 200, `Access-Control-Allow-Methods: PUT, GET, HEAD`,
  `Access-Control-Allow-Headers: content-type, x-amz-server-side-encryption`; `POST` from it → 403;
  every other origin tried (`localhost:5173`, `localhost:4173`, `127.0.0.1:5173`, the Netlify site)
  → 403 for every method.

## 4. ROUTE

| #   | Work item                                                                                                                                     | Kind    | Depends on | Skill/driver                                              | Acceptance                                            | Assignee | Status |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------- | --------------------------------------------------------- | ----------------------------------------------------- | -------- | ------ |
| 1   | Bucket CORS policy as code: rules from `ALLOWED_ORIGINS`, and a pure reading of a preflight answer (`src/infrastructure/storage/`)            | code    | —          | `/be-build-requirement`, be-test-generator                 | unit tests: rules, refusals, the PUT headers ⊆ allowed | Claude   | done   |
| 2   | `pnpm ops:storage:cors` — check (default), `--print`, `--apply` (`src/scripts/ops/storage-cors.ts`)                                           | code    | 1          | `/be-build-requirement`                                    | § 5 lines 1–2                                         | Claude   | done   |
| 3   | Presigned PUT returns its signed headers: port `createPresignedUploadUrl` → `{ url, headers }`; presign response `headers` beside `upload_method: 'PUT'` | code    | 1          | `/be-build-requirement`, be-api-contract-guard             | § 5 line 3                                            | Claude   | done   |
| 4   | Docs: upload-storage runbook (bucket CORS, troubleshooting), storage overview, command lists                                                  | docs    | 2, 3       | be-docs-maintainer, be-overview-doc-maintainer             | § 5 line 4                                            | Claude   | done   |

No database, route, or background-work changes ([plans/route-changes.md](plans/route-changes.md)
records the one additive response field).

## 5. Definition of done

1. `pnpm ops:storage:cors` against the development bucket lists each origin × method it refuses
   and exits 1 today; `--print` prints the configuration `--apply` would write.
2. After an AWS admin runs `pnpm ops:storage:cors --apply`, the check exits 0 and an avatar and a
   logo upload from the web app on `http://localhost:5173` succeed (verified by the operator).
3. With `UPLOAD_USE_PRESIGNED_POST=false`, the presign response carries `headers`, and a PUT that
   sends them is accepted by the development bucket (from Node).
4. The runbook's bucket section names the origins, methods and headers and both commands; its
   troubleshooting names the browser symptom.
5. `pnpm validate`, `pnpm typecheck`, the touched unit and integration suites, `pnpm tsdoc:check`
   and `pnpm routes:catalog:check` pass.
