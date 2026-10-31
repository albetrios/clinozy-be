# feat-patient-image-thumbnails-2026-10-31-tibz — kickoff

## 1. Header

| Field | Value |
| --- | --- |
| Iteration | `feat-patient-image-thumbnails-2026-10-31-tibz` (type `feat`, topic `patient-image-thumbnails`) |
| Mode | initial — Baseline `none` ([PT1](plans/decisions.md)) |
| Intake mode | `brief` (`BRIEF.md`, Intake hash `11e6cc3b770e`) |
| Date | 2026-10-31 |
| Branch | `feat/patient-image-thumbnails` |
| Sibling | clinozy-fe — not attached in this session ([PT6](plans/decisions.md)) |

## 2. Goal and scope

**Goal.** Photo grids load a 320 px WebP thumbnail; an opened photo stays full size.

**In scope:** the upload domain's thumbnail capability ([PT4](plans/decisions.md)); `thumbnail_key`
([db-changes](plans/db-changes.md)); the thumbnail queue, worker and sweep
([worker-changes](plans/worker-changes.md)); `thumbnail_url` on the six image routes
([route-changes](plans/route-changes.md)); the backfill script; `sharp` in both images; tests,
docs, overviews, OpenAPI.

**Out of scope:** deleting the full photo; any other purpose or record opting in; running the
backfill on a hosted database; the frontend grids ([PT6](plans/decisions.md)).

## 3. Locked decisions

PT1–PT5, PT16, PT17 (RED); PT6–PT14 AMBER (below).

## 4. Features and order

1. `thumbnail-capability` (upload) → 2. `thumbnail-job` (schema, queue, worker, sweep, rules) →
3. `thumbnail-url` (responses) → 4. `backfill` → 5. close.

## 5. ROUTE

| # | Work item | Kind | Depends on | Skill/driver | Acceptance | Assignee | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Upload thumbnail capability + `sharp` (dependency, Docker) | feature | — | `be-dependency-security`, `be-test-generator`, `be-tsdoc-export-guard` | A-7 | Claude | done |
| 2 | `thumbnail_key` + the thumbnail queue, worker, sweep and the rules' enqueue | flow | 1 | schema chain (`be-schema-generator` → `be-sql-design-guard` → `be-db-migration-maintainer` → `be-rls-tenant-isolation-guard`), `be-workers-events` | A-1, A-2, A-4, A-5 | Claude | done |
| 3 | `thumbnail_url` on the image routes | sub-domain | 1, 2 | route chain (`be-api-contract-guard`, `be-route-schema-doc-guard`, `be-route-catalog`) | A-3 | Claude | done |
| 4 | The backfill script | feature | 2 | `be-workers-events` | A-6 | Claude | done |
| 5 | Acceptance, frontend route map, gates | flow | 1–4 | `be-kickoff-iteration` › Close | A-1 – A-7 | Claude | done |

## 6. Open AMBER items

PT6 – PT14 ([decisions](plans/decisions.md)).

## 7. Standing deviations

n/a — Baseline `none`.

## 8. Definition of done

Every ROUTE row `done`; `plans/acceptance.md` filled; `AS-BUILT.md` written; `pnpm validate`,
`pnpm tsdoc:check`, `pnpm routes:catalog:check`, `pnpm docs:check`, `pnpm db:migrate:lint`, the
touched suites, `pnpm test:global`, `pnpm test:unit` green; both images load `sharp`.
