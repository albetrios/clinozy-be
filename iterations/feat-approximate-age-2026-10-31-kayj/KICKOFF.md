# feat-approximate-age-2026-10-31-kayj — kickoff

## 1. Header

| Field | Value |
| --- | --- |
| Iteration | `feat-approximate-age-2026-10-31-kayj` (type `feat`, topic `approximate-age`) |
| Mode | initial — Baseline `none` ([AA1](plans/decisions.md)) |
| Baseline | `none` |
| Intake mode | `brief` |
| Intake note | 1 received (BRIEF.md) · from scratch |
| Intake hash | `1ece1c50c902` |
| Date | 2026-10-31 |
| Branch | `feat/approximate-age` |
| Sibling | none in this session — clinozy-fe could not be attached ([AA10](plans/decisions.md)) |

## 2. Goal and scope

**Goal.** The desk can register a person by age; the age counts up by itself, shows on every
Contact with an "approximate" mark, and the people lists filter by age.

**In scope:** `app.contacts.date_of_birth_is_approximate` (migration); `age` on contact create/update;
`age` + `date_of_birth_is_approximate` on every Contact response; `age_from`/`age_to` on the contacts,
patients and leads lists (and exports); OpenAPI, i18n, tests, overviews, demo seed.

**Out of scope:** the Cresence notes backfill; the clinozy-fe screens ([AA10](plans/decisions.md)); any new route.

## 3. Locked decisions

AA1–AA3, AA11, AA12 (RED); AA4–AA10 (AMBER) — [plans/decisions.md](plans/decisions.md).

## 4. Features and order

1. `approximate-age` (sub-domain change) — [routes-final § 1](plans/routes-final.md).

## 5. ROUTE

| # | Work item | Kind | Depends on | Skill/driver | Acceptance | Assignee | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Contacts schema: `date_of_birth_is_approximate` + CHECK + migration (AGC1) | table change | — | schema chain: `be-schema-generator` → `be-sql-design-guard` → `be-db-migration-maintainer` → `be-rls-tenant-isolation-guard` | A-1, A-2 | Claude | done |
| 2 | Contacts write + read: `age` in, `age` + flag out (AGC2, AGC3) | route change | 1 | `/be-build-requirement` (route-change chain, `be-i18n-message-guard`, `be-test-generator`) | A-1 – A-4 | Claude | done |
| 3 | Age filters on contacts, patients, leads lists (AGC2, AGC4) | route change | 1 | `/be-build-requirement` (route-change chain, `be-test-generator`) | A-5 | Claude | done |
| 4 | Acceptance, the frontend route map and the gates | flow | 1–3 | `be-kickoff-iteration` › Close | A-1 – A-6 | Claude | done (A-6 not built — AA10) |

## 7. Open AMBER items

AA4 – AA10 — [plans/decisions.md](plans/decisions.md).

## 8. Standing deviations

n/a — Baseline `none`.

## 9. Definition of done

Every ROUTE row `done`; `plans/acceptance.md` filled; `AS-BUILT.md` written; `pnpm validate`,
`pnpm tsdoc:check`, `pnpm routes:catalog:check`, `pnpm docs:check`, `pnpm db:migrate:lint`, the
touched suites, `pnpm test:global`, `pnpm test:unit` green; `plans/frontend-route-map.md` written.

## 10. Verification

Intake mode `brief` → each `BRIEF.md` acceptance line traced in `plans/acceptance.md` with its test.
