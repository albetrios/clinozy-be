# change-branches-in-navbar-2026-10-14-zrml — as built

Baseline: none · KICKOFF.md approved 2026-10-14 ([BN8](plans/decisions.md))

## Rows

| #   | Planned | Actually built | Difference | Why | Decision | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| #1  | ROUTE 1 — the `branches` section | `app-access-sections.ts`: `users: ['membership', 'role']`, `branches: ['branch']`; `APP_MATRIX_SECTIONS` ends `… offerings, users, branches`. `MEMBERSHIP_PREFERENCE_DEFAULTS.pinned_sections` ends with `branches` (the allowed values follow `APP_MATRIX_SECTIONS`, so the DTO's enum and the Drizzle CHECK follow too). `permission.reference.seed.ts` files `branch:read|create|update|delete` under `branches` | `branches` sits after `users`, not before | The frontend keeps its ten shortcut keys on Today … Users | BN1, BN2, BN5 | (this commit) |
| #2  | ROUTE 2 — migrations | `20261014185437_membership_preferences_branches_section.sql` (CHECK dropped and re-added NOT VALID, then VALIDATE; default `{appointments,leads,patients,payments,branches}`) and `20261014185440_permissions_branches_category.sql` (the four rows' `category`, in the NO FORCE / FORCE bracket). Applied to the local database: the constraint and default read back as planned, the four codes read `branches` | none | — | BN6 | (this commit) |
| #3  | ROUTE 3 — OpenAPI, tests, docs | The response map's `pinned_sections` enum gains `branches` and its example the new default. The memberships integration suite expects the new default and pins `branches`. New `app-access-sections.policy.unit.test.ts` (sections ⇄ matrix rows, catalog category per resource, Branches pinned). `branches.overview.md` names the Branches room | none | — | BN7 | (this commit) |

## Summary

- **Built:** a `branches` section for the frontend's new Branches room — allowed and pinned by
  default in a member's preferences, its own row in the permission catalog. No code changes, so no
  role, membership or API key gains or loses access.
- **Planned, not built:** none. **Built, not planned:** none.
- **Definition of done (`KICKOFF.md` § 4):**
  1. ✓
  2. ✓
  3. ✓ `pnpm db:migrate` on the local database; `db:migrate:lint` 0 violations.
  4. ✓ `memberships.integration.test.ts` › 2.F my preferences; the policy test.
  5. ✓ `lint`, `typecheck`, `validate:domain`, `tsdoc:check`, `routes:catalog:check`,
     `docs:check`, `agent-os:check`, `knip`, `test:unit` (5395), `test:global` (142), the
     memberships, permission and branches integration suites (115); also
     `tool:project-structure-tree:check`, `docs:links:check`, `validate:route-schema-docs`,
     `validate:test-naming`, `validate:route-success-statuses`, `docs:lint`.
- **Deploy order:** ship clinozy-fe first, or both together. The frontend in production today reads
  `pinned_sections` with a strict enum, so a member who never saved their pins would get a failed
  preferences read (and the starting pins) between a backend-only deploy and the frontend's. The new
  frontend drops a section it does not know instead, so later additions need no order.
- **Seen while verifying, not this change:** the hourly `subscription-seat-reconcile` job suspends
  the demo user's membership in the seeded demo clinic (`billing.suspend_excess`, the clinic's seat
  count) — the local playground's data, not a defect of this iteration.

## Standing deviations

None. This iteration has no design input of its own; the frontend sibling's `BRIEF.md` is the design.
