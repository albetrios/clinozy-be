# feat-bill-line-description-2026-10-31-rjxx — kickoff

## 1. Header

| Field | Value |
| --- | --- |
| Iteration | `feat-bill-line-description-2026-10-31-rjxx` (type `feat`, topic `bill-line-description`) |
| Mode | from scratch (Baseline none) |
| Intake mode | `brief` |
| Intake hash | `d29f88f1e0d5` |
| Date | 2026-10-31 |
| Sibling | clinozy-fe `iterations/feat-bill-line-description-2026-10-31-rjxx/` — the drawer field, the bill view and print |

## 2. Goal and scope

**Goal.** A bill line carries an optional free-text description (≤ 280), so clinics stop packing line
notes into the bill's remark, and a later backfill can move the Cresence ones back onto their lines.

**In scope:** the column, the four bill writes taking it, every response listing bill lines (bills,
previews, medical sales) returning it, tests, docs, seeds. **Out of scope:** the backfill, a
description on `POST /app/medical-sales` (BD5), credit-note lines (BD6).

## 3. Locked decisions

BD1 (280) · BD2 (process) · BD8 (route review) · BD9 (approval). AMBER: BD3, BD4, BD5, BD6, BD7.

## 4. ROUTE

| # | Work item | Kind | Depends on | Skill/driver | Acceptance | Assignee | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Bills — a line's description: [`routes-final.md` § 1](plans/routes-final.md), BLD1–BLD4 | sub-domain (CHANGE table) | — | `/be-build-requirement` (be-schema-generator → be-sql-design-guard → be-db-migration-maintainer → be-rls-tenant-isolation-guard; be-api-contract-guard, be-test-generator, be-seed-maintainer, be-tsdoc-export-guard, be-overview-doc-maintainer) | A-1 – A-6 | Claude | planned |
| 2 | Acceptance, the frontend route map and the gates | flow | 1 | `be-kickoff-iteration` › Close | A-1 – A-7 | Claude | planned |

## 5. Open AMBER items

BD3, BD4, BD5, BD6, BD7 — [decisions](plans/decisions.md).

## 6. Definition of done

Every ROUTE row `done`; `plans/acceptance.md` filled; `AS-BUILT.md` written; `pnpm validate`,
`pnpm tsdoc:check`, `pnpm routes:catalog:check`, `pnpm docs:check`, `pnpm db:migrate:lint`, the touched
suites, `pnpm test:global` and `pnpm test:unit` green.
