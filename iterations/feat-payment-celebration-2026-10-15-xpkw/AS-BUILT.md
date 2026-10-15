# feat-payment-celebration-2026-10-15-xpkw — as built

Baseline: none · KICKOFF.md approved 2026-10-15 ([PC9](plans/decisions.md)) · branch `feat/payment-celebration` ([PC2](plans/decisions.md))

## Rows

| # | Planned | Actually built | Difference | Why | Decision | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| #1 | ROUTE 1 — `GET /app/branches/my` returns `review_link` (routes-final § 1, BRC1–BRC3) | **BRC1:** `branches.repository.ts` `branchSummaryColumns` and `branches.serializer.ts` `BranchSummaryRecord` / `serializeSummary` gain `review_link` after `working_days`, their TSDoc naming it. **BRC2:** the `/my` route description (`branches.routes.ts`); the OpenAPI response map's `branchSummarySchema` (`review_link`: string or null, with its description) and `branchSummaryExample` (`tooling/openapi/response-map/schemas/app.ts`); the captured `/my` example (`"review_link": null`, [PC11](plans/decisions.md)); `branches.overview.md` (the `/my` row, the repository's allow-list). The OpenAPI locale files hold no operation copy (operation text is English-only, on the route), so no locale changed. **BRC3:** `branches.integration.test.ts` — the `/my` field list gains `review_link`; a new case: a member without `branch:read` reads `null`, the link an admin saved with `PATCH`, then `null` once cleared; `__tests__/unit/branches.serializer.unit.test.ts` (3) pins the summary's allow-list (the review link in; email, default staff, maps link, status and timestamps out). **Verified:** the branches integration suite 29/29, and 29/29 again as the RLS-subject application role (`pnpm test:rls-role …`); the branches unit tests 20/20; the OpenAPI tooling unit tests 54/54; the generated OpenAPI document shows `review_link` on `/my`. No route, status, permission, idempotency rule, table or migration changed | the captured example edited by hand instead of a capture run | a capture run re-samples all 449 routes for one field | BR1–BR4; PC4–PC6, PC11 | `8dcb2f1` |
| #2 | ROUTE 2 — the demo clinic's review link (BRC4) | `demo-clinic.catalog.ts` `DEMO_REVIEW_LINK = 'https://g.page/r/CQdemoclinicEAE/review'` (a made-up place code); `demo-clinic.plan.ts` `DemoBranchPlan.reviewLink` — the main branch's link, the second branch `null`, with no Faker draw so the rest of the plan is unchanged; `demo-clinic.ts` passes it to `seedBranch` (whose `details` already took `review_link`). **Tests:** `demo-clinic-plan.unit.test.ts` (the main branch's link has the `g.page/r/…/review` shape, the second none — 108/108); `demo-clinic-seed.integration.test.ts` (the seeded rows: the main branch carries `DEMO_REVIEW_LINK`, the second `null` — 2/2). `docs/getting-started/seeded-fixtures.md` names the link | a clinic seeded before keeps no link (a re-run keeps an existing clinic) | the seed's idempotency rule | BR5; PC7, PC14 | `3bd23cb` |
| #3 | ROUTE 3 — acceptance, the frontend route map, the gates | `plans/acceptance.md` A-1 – A-3 pass; `plans/frontend-route-map.md` (sections 1, 2, 4 by hand; section 3 generated, 449 routes, `--check` green, [PC12](plans/decisions.md)); `plans/route-changes.md` Built column. **Gates:** `pnpm validate` (Biome, `tsc`, markdownlint) ✓; `pnpm validate:domain` ✓; `pnpm validate:test-naming` ✓; `pnpm tsdoc:check` 0/0 ✓; `pnpm docs:check` ✓; `pnpm routes:catalog:check` ✓ (449 routes, unchanged); `pnpm db:migrate:lint` ✓ (0 violations, no migration in the diff); `pnpm test:unit` 690 files / 5409 tests ✓; every commit's pre-commit guard (22 steps, the architecture policy tests 142/142 and the local SonarQube gate `0 issues / 0 hotspots` included) ✓. **Review** (`/be-pre-merge-review`, read-only, against `REVIEW.md`): no table or worker touched (no RLS, SQL-design or worker finding); no money or state write touched (no idempotency finding); the field is snake_case, the route stays `200`; the repository owns the select, the serializer the allow-list; no user-facing message added. No blocking finding | **Not run:** `pnpm ci:local` and the full `e2e` / `integration` lanes — the touched suites ran instead (above) | the full serial suite is long; nothing outside the branches summary and the demo seed changed | PC13 (the local SonarQube needed its Elasticsearch disk threshold off on this machine) | (this commit) |

## Revisions to upcoming rows

- none — no scope change.

## Summary

- Planned, not built (deferred — user OK): none.
- Built, not planned: none.
- Follow-ups for the next iteration:
  - Run `pnpm ci:local` (the full suite) before merging, or let the pull request's CI run it.
  - The demo clinic in an existing local database has no review link until
    `pnpm db:seed:demo-clinic --fresh` or a save in the Branch drawer ([PC14](plans/decisions.md)).
  - Freeze (`pnpm iteration:status feat-payment-celebration-2026-10-15-xpkw frozen`) in the branch's
    last commit, once the user confirms the pull request ([PC10](plans/decisions.md)).

## Standing deviations

The complete list of where the code differs from the drop — Baseline `none`, so no list to carry.
This iteration builds what the drop asks of the backend and adds none.

| Item | Design says | Built as | Since iteration | Decision |
| --- | --- | --- | --- | --- |
| — | — | — | — | — |
