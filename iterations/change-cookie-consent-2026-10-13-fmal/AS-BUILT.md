# change-cookie-consent-2026-10-13-fmal — as built

Baseline: launch-2026-09-30-jxmr · KICKOFF.md approved 2026-10-13 ([CC9](plans/decisions.md))

## Rows

| # | Planned | Actually built | Difference | Why | Decision | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| #1 | ROUTE 1 — the consent receipt documented as such (routes-final § 1, USC1) | TSDoc of `user-settings.constants.ts`, `.schema.ts`, `.types.ts`, `.dto.ts`, `.validator.ts`, `.repository.ts` and `recordAnalyticsConsentAudit` (`user.controller.ts`) say **receipt of the last answer given while signed in; the browser's cookie decides**; the OpenAPI field descriptions (`tooling/openapi/enrichers/field-descriptions.ts`: `analytics_consent`, `_version`, `_at`); `user-settings.overview.md` (the invariant rewritten, naming the new test); `docs/reference/security/audit-logs.md` (the action's line). No route, body, status, table, migration or permission changed — `pnpm routes:catalog:check` and `pnpm docs:check` in sync, `pnpm tsdoc:check` 0/0. | none | — | CC1, CC2, CC8 | `987a588` |
| #2 | ROUTE 2 — sign-out keeps the receipt (USC2) | `src/domains/user/__tests__/integration/consent-receipt-survives-logout.integration.test.ts`: sign in (password) → `PATCH /users/me/settings` `{ analytics_consent: granted, analytics_consent_version: 2 }` → `POST /auth/logout` (200; no `Clear-Site-Data`; no `Set-Cookie` naming consent) → sign in again → `GET /users/me/settings` returns the same decision, version 2 and the same `analytics_consent_at`. Verified: this test 1/1; `user.integration.test.ts` 33/33; `pnpm exec vitest run --project unit src/domains/user` 286/286. | none — version 2 needed no change (the DTO takes 1–1000) | — | CC3, CC4 | `987a588` |
| #3 | ROUTE 3 — acceptance, the frontend route map, the gates | `plans/acceptance.md` A-1 – A-3 pass; `plans/frontend-route-map.md` (sections 1, 2, 4 by hand; section 3 generated, `--check` green, 439 routes); `plan` files synced (`route-changes.md` Built column). Gates: `pnpm validate` (Biome + `tsc` + markdownlint) ✓, `pnpm validate:domain` ✓, `pnpm validate:test-naming` ✓, `pnpm tsdoc:check` ✓, `pnpm routes:catalog:check` ✓, `pnpm docs:check` ✓, `pnpm tool:project-structure-tree:check` ✓ (regenerated). Pre-commit guard steps 1–21 ✓. | **Not run:** pre-commit step 22, the local SonarQube gate (`pnpm sonar:scan`), and `pnpm ci:local` (the full suite) — this session has no Docker daemon, so neither the SonarQube container nor the Compose stack can start. The integration tests above ran against a local Postgres 17.10 + Redis 7 instead. | the cloud container cannot run Docker; `binaries.sonarsource.com` is unreachable | — | (this commit) |

Integration tests ran on a Postgres 17 started from the `@embedded-postgres/linux-x64@17.10.0-beta.17`
binaries (the image's own Postgres is 16; migrations require 17+) with the Compose-equivalent
`clinozy` superuser, and the container's Redis 7.0.15.

## Revisions to upcoming rows

- none — no scope change.

## Summary

- Planned, not built (deferred — user OK): none.
- Built, not planned: none.
- After done (CC10 – CC12): the branch is renamed `feat/cookie-consent`; the folder keeps only what
  this fix produced — `intake-files/BRIEF.md`, the plan, the decisions and this record. The copied
  launch files, the empty requirement stubs, the empty background-work list and the copied Standing
  deviations are gone, and the route map's § 3 lists only the three routes this fix touches — so this
  iteration's intake gate and route-map check no longer pass by design.
- Follow-ups for the next iteration:
  - Run `pnpm sonar:scan` (and `pnpm ci:local`) on a machine with Docker before merging — the
    one gate this session could not run.
  - The launch iteration is still `implementing` although merged; closing it (`done` → `frozen`)
    makes it an eligible Baseline by the book ([CC7](plans/decisions.md)). Use the launch, not this
    iteration, as the next Baseline: this snapshot is trimmed ([CC12](plans/decisions.md)).

## Standing deviations

This iteration adds none and resolves none — the receipt it documents is what the launch built
(D85), and `BRIEF.md` keeps it. The complete list is unchanged in
[`launch-2026-09-30-jxmr/AS-BUILT.md` › Standing deviations](../launch-2026-09-30-jxmr/AS-BUILT.md#standing-deviations).
