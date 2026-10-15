# change-branches-in-navbar-2026-10-14-zrml — kickoff

## 1. Header

| Field     | Value                                                                                       |
| --------- | ------------------------------------------------------------------------------------------- |
| Iteration | `change-branches-in-navbar-2026-10-14-zrml`                                                 |
| Type      | change                                                                                      |
| Baseline  | none ([BN3](plans/decisions.md))                                                            |
| Intake    | none here; the frontend sibling holds `BRIEF.md` ([BN3](plans/decisions.md))               |
| Branch    | `feat/branches-in-navbar` ([BN4](plans/decisions.md))                                       |
| Sibling   | `clinozy-fe/iterations/change-branches-in-navbar-2026-10-14-zrml` — the Branches room      |

## 2. Goal and scope

In the frontend, Branches leaves the Users room for a room of its own: a header tab in the main
navbar, pinned by default after Payments, and its own row in Users › Roles & access
([BN1](plans/decisions.md), [BN2](plans/decisions.md)). The backend names the clinic's sections in
one place (`APP_ACCESS_SECTION_RESOURCES` / `APP_MATRIX_SECTIONS`), which decides the values a
member may pin and the permission catalog's categories — so it gains a `branches` section.

In scope:

- `src/domains/app/app-access-sections.ts`: `branches: ['branch']` after `users`, which keeps
  `membership` and `role`; `APP_MATRIX_SECTIONS` gains `branches` ([BN5](plans/decisions.md)).
- `membership-preferences.constants.ts`: the starting pins end with `branches`; the allowed values
  follow `APP_MATRIX_SECTIONS`.
- The permission reference seed files the four `branch:*` codes under `branches`.
- Two migrations ([plans/db-changes.md](plans/db-changes.md), [BN6](plans/decisions.md)).
- The OpenAPI response map's `pinned_sections` enum and example
  ([plans/route-changes.md](plans/route-changes.md)).
- Tests: the memberships integration suite's defaults and a pin of `branches`; a policy test tying
  sections to catalog categories ([BN7](plans/decisions.md)).
- Docs: `branches.overview.md` names the Branches room.

Out of scope:

- New permission codes, role presets, routes or background work
  ([plans/worker-changes.md](plans/worker-changes.md)).
- Frozen iterations (the launch's `schema-routes.md` still lists ten sections; the frontend's
  schema generator records the amendment).

## 3. ROUTE

| #   | Work item                                                                                                  | Kind  | Depends on | Skill/driver                                                    | Acceptance    | Assignee | Status |
| --- | ---------------------------------------------------------------------------------------------------------- | ----- | ---------- | --------------------------------------------------------------- | ------------- | -------- | ------ |
| 1   | The `branches` section: access map, matrix order, starting pins, seed categories                           | code  | —          | `/be-build-requirement`, be-change-completeness-guard           | § 4 lines 1–2 | Claude   | done   |
| 2   | Migrations: the pinned-sections CHECK and default; the branch codes' category                              | db    | 1          | be-db-migration-maintainer, be-rls-tenant-isolation-guard       | § 4 line 3    | Claude   | done   |
| 3   | OpenAPI response map; tests (integration defaults + pin, the policy test); `branches.overview.md`          | docs  | 1, 2       | be-route-schema-doc-guard, be-test-generator, be-docs-maintainer | § 4 lines 4–5 | Claude   | done   |

## 4. Definition of done

1. `APP_MATRIX_SECTIONS` ends `… offerings, users, branches`; `APP_ACCESS_SECTION_RESOURCES.users`
   no longer holds `branch`.
2. `MEMBERSHIP_PREFERENCE_DEFAULTS.pinned_sections` is `appointments, leads, patients, payments,
   branches`; the seed files every `branch:*` code under `branches`.
3. On a migrated database the CHECK allows `branches`, the column default ends with it, and the
   four branch codes read `category = 'branches'`; `pnpm db:migrate:lint` passes.
4. `GET /app/memberships/me/preferences` starts a member with `branches` pinned and `PATCH` accepts
   it (memberships integration suite); the policy test passes.
5. `pnpm lint`, `typecheck`, `validate:domain`, `tsdoc:check`, `routes:catalog:check`,
   `docs:check`, `agent-os:check`, `knip`, `test:unit`, `test:global` pass.
