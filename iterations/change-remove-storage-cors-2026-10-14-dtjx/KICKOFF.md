# change-remove-storage-cors-2026-10-14-dtjx — kickoff

## 1. Header

| Field     | Value                                                               |
| --------- | ------------------------------------------------------------------- |
| Iteration | `change-remove-storage-cors-2026-10-14-dtjx`                        |
| Type      | change                                                              |
| Baseline  | none ([RC2](plans/decisions.md))                                    |
| Intake    | none, no comparison ([RC2](plans/decisions.md))                     |
| Branch    | `refactor/remove-storage-cors` ([RC3](plans/decisions.md))          |
| Sibling   | none: backend only ([RC3](plans/decisions.md))                      |

## 2. Goal and scope

The upload bucket's CORS belongs to clinozy-infra, which provisions the bucket. clinozy-be carries
an operator command, `pnpm ops:storage:cors`, that checks and writes that same configuration, so
two repositories would each own it. This iteration removes the command and every piece of code
that exists only for it ([RC1](plans/decisions.md)).

In scope:

- Delete `src/scripts/ops/storage-cors.ts` and its `package.json` script.
- Delete `src/infrastructure/storage/bucket-cors.util.ts` and its unit test.
- Delete `putUploadBucketCorsRules` from `s3-adapter.ts`, along with its `PutBucketCorsCommand`
  import, its test mock and its tests.
- Remove the command's name from the `POST /uploads` route description
  ([plans/route-changes.md](plans/route-changes.md)).
- Docs: the upload-storage runbook names clinozy-infra as the owner of the bucket's CORS and keeps
  what the rule must admit ([RC6](plans/decisions.md)). The storage overview, `CLAUDE.md`,
  `be-structure-maintainer` (re-locked), `scripts-layout.md` and the generated structure tree
  follow.

Out of scope:

- The presigned-PUT `headers`, which stay ([RC5](plans/decisions.md)).
- clinozy-infra's rule itself, reported in [RC7](plans/decisions.md).
- The frozen `fix-upload-storage-cors` iteration, which is never edited.

## 3. ROUTE

| #   | Work item                                                                                                                                        | Kind | Depends on | Skill/driver                                         | Acceptance       | Assignee | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | ---------- | ---------------------------------------------------- | ---------------- | -------- | ------ |
| 1   | Remove the command and its code: script + `package.json` entry, `bucket-cors.util.ts` + test, `putUploadBucketCorsRules` + its import, mock and tests | code | —          | `/be-build-requirement`, be-change-completeness-guard | § 4 lines 1–3    | Claude   | done   |
| 2   | Docs: route description, upload-storage runbook, storage overview, `CLAUDE.md`, `be-structure-maintainer` (re-lock), `scripts-layout.md`, structure tree | docs | 1          | be-docs-maintainer, be-structure-maintainer           | § 4 lines 4–5    | Claude   | done   |

No database, route-shape or background-work changes.

## 4. Definition of done

1. `git grep` for `ops:storage:cors`, `storage-cors`, `bucket-cors`, `BUCKET_CORS`,
   `putUploadBucketCorsRules` and `PutBucketCors` finds nothing outside `iterations/`.
2. `s3-adapter.ts` and its unit test differ from their state before `fix-upload-storage-cors` only
   by the presigned-PUT `headers` ([RC5](plans/decisions.md)).
3. `pnpm lint`, `typecheck`, `knip`, `test:unit`, `test:global`, `test:contract` and the storage
   and upload integration suites pass.
4. The runbook's **Bucket CORS** section names clinozy-infra as the owner, lists the origins,
   methods and headers the upload flow needs (`POST` included) and shows how to preflight the
   bucket.
5. `tsdoc:check`, `routes:catalog:check`, `docs:check`, `docs:links:check`, `agent-os:check`,
   `validate:scripts-layout`, `validate:route-schema-docs` and
   `tool:project-structure-tree:check` pass.
