# feat-bug-report-2026-10-13-dgnx — as built

Baseline: none · KICKOFF.md approved 2026-10-13 ([BR14](plans/decisions.md))

## Rows

| # | Planned | Actually built | Difference | Why | Decision | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| #1 | ROUTE 1 — the user bug report: table, migration, RLS, route, service, tests (routes-final § 1, db-changes) | `src/domains/user/sub-domains/user-bug-report/` (constants, schema, dto, validator, types, serializer, repository, service, controller, overview, seed); `migrations/20261013172750_user_bug_reports.sql` (table, FK cascade, two CHECKs, `idx_user_bug_reports_user_id`, `OWNER TO clinozy_be_owner`, grants, ENABLE + FORCE RLS, `user_bug_reports_owner_access`); `POST /api/v1/users/me/bug-reports` (`STRICT_AUTHED_RATE_LIMIT`, strict body, tag `User`) in `user.routes.ts`; `userBugReportService` on the user container (and the worker composition); public-id prefix `bug`; mirrors — `force-rls-tables.constants.ts`, the RLS matrix helper and suite, the RLS scope map, the role-taxonomy drift lock (new table owned by `clinozy_be_owner`), the sub-domain integration list, the container-trim policy, `docs/routes.txt` (440 routes), the success-status and organization-scope maps, OpenAPI (schema map, response map, entity label), the structure tree, `CLAUDE.md` / architecture docs / data lifecycle; `.gitignore` re-includes domain sources named `*-report.*` (BR18). Verified: the sub-domain's suites 20/20 (5 integration on Postgres 17.10); the same integration suites under `pnpm test:rls-role` (app role) 15/15 with the export's; RLS matrix, scope map, role taxonomy, policy and global suites 362/362. | none in behavior. The reporter is read by the sub-domain's own repository (`findReporterByPublicId`, under the person's context) rather than through `UserService`: its by-public-id lookups open a separate context or a context-free checkout, and the plan asked for one checkout | one pooled checkout for the read and the insert (routes-final § 1.10) | BR3 – BR10, BR13 | (this commit) |
| #2 | ROUTE 2 — the report in the data export | `UserDataExportService` takes the `UserBugReportRepository` and adds `bug_reports` (description, input method, page, version, time — newest first, capped at `GDPR_EXPORT_MAX_ROWS_PER_TABLE` and named in `truncation` when cut); `UserDataExport.bug_reports`; `docs/reference/data/user-data-export.md` and the export overview. Verified: `user-data-export.service.payload.unit.test.ts` (mapping, exact fields, cap) and the export's other unit suites; the export integration suite under the app role. | the export reads the repository itself, not a new service method | same domain; the file is already on the verified-scope ledger | BR11, BR17 | (this commit) |
| #3 | ROUTE 3 — acceptance, the frontend route map, the gates | `plans/acceptance.md` A-1 – A-6 pass; `plans/frontend-route-map.md` (sections 1, 2, 4 by hand; § 3 trimmed to the three touched routes, BR16). Gates: `pnpm lint` ✓, `pnpm typecheck` ✓, `pnpm docs:lint` ✓, `pnpm validate:domain` ✓, `pnpm validate:test-naming` ✓, `pnpm tsdoc:check` ✓ (0/0), `pnpm db:migrate:lint` ✓, `pnpm db:migrate` on Postgres 17.10 ✓, `pnpm routes:catalog:check` ✓, `pnpm validate:route-success-statuses` ✓, `pnpm validate:route-organization-scope` ✓, `pnpm validate:route-schema-docs` ✓, `pnpm docs:check` ✓, `pnpm tool:project-structure-tree:check` ✓. | none — the local SonarQube gate ran: `pnpm sonar:scan` ✓ (0 issues, 0 hotspots), and the full pre-commit guard (22 steps) on the commit. Postgres 17 came from the `@embedded-postgres/linux-x64@17.10.0-beta.17` binaries (the image's own is 16), Redis 7 from the container. To start SonarQube here, the session's restarted Docker daemon ran it with Elasticsearch's disk watermark lifted at runtime (`cluster.routing.allocation.disk.threshold_enabled=false` — the session's disk allowance reads 8.9% free); no repository change | — | — | (this commit) |

## Revisions to upcoming rows

- none — no scope change.

## Summary

- Planned, not built (deferred — user OK): none.
- Built, not planned: none.
- Follow-ups for the next iteration:
  - `pnpm ci:local` (the full suite) was not run end to end; the touched domain, RLS, policy and
    global suites were.
  - Triage has no screen: reports are read through the operator connection
    (`SELECT … FROM auth.user_bug_reports ORDER BY created_at DESC`). A triage list (a platform-admin
    route with a maintenance-scope read) is the natural next step once someone owns the inbox
    ([BR8](plans/decisions.md), [BR9](plans/decisions.md)).
  - `pnpm iteration:status feat-bug-report-2026-10-13-dgnx frozen` in the last commit before the
    merge ([BR15](plans/decisions.md)).

## Standing deviations

Baseline `none` and no design drop: there is nothing to deviate from, and none are added.
