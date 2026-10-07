# launch-2026-09-30-jxmr — as built

Baseline: none · KICKOFF.md approved 2026-10-03 · implementing since 2026-10-07

## Rows

| # | Planned | Actually built | Difference | Why | Decision | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| #1 | `organization` — CHANGE table: 8 fields on the organization (specialties, timezone, currency, default day float, lead hold days, reminder hour, re-target days, purge days) | `tenancy.organizations` + `specialties` text[] (1–6 of 6 values, `{skin}`), `timezone` varchar(64) (`Asia/Kolkata`), `currency` varchar(3) (`INR`, CHECK fixed); `tenancy.organization_settings` + `default_day_float` numeric(12,2) (2000.00), `lead_hold_days` int (3), `reminder_hour` smallint 0–23 (16), `retarget_after_days` int (90), `deleted_record_purge_days` int (7); 8 CHECKs (`chk_organizations_*`, `chk_organization_settings_*`); constants `organization.constants.ts`, `organization-settings.constants.ts`; folded into the baseline `00000000000000_init.sql` (user 2026-10-07: scratch deployment, no new migration files — migrations.md › Before the first release); 13 integration tests | the 5 settings live on `organization_settings`, not `organizations`; money `numeric(12,2)` rupees, not paise; `reminder_hour` smallint, not text; specialty values lowercase (the drop's) | reuse: the settings table RC-201's route already owns (CLAUDE.md › Reuse before you create); be-sql-design-guard money rule; D34 "an hour" + prototype 16:00 (Clinozy.dc.html:6048); no repo rule on value casing — the drop's values need no frontend change | agent-os decides (be-kickoff-iteration); user 2026-10-07: backend patterns win, the frontend adapts | `93fe1a9` |
| #2 | `branch` — NEW table (Stage 1 approved 2026-10-07; spec v5) | `app.branches` + `app.branch_user_accesses` (new Postgres schema `app` for the clinic tables; code `src/domains/app/sub-domains/branches/` + nested `branch-user-accesses/`, every file named `branches.*` / `branch-user-accesses.*`); routes `GET /app/branches/my` (every member, `organization:read`; my branches, all for a `branch:read` holder), `GET /app/branches` (`branch:read`, `include_inactive`), `GET /app/branches/{branch_id}` (`branch:read`), `POST /app/branches` (`branch:create`, creator gets access), `PATCH /app/branches/{branch_id}` (`branch:update`), `GET`/`PUT /app/branches/{branch_id}/user-accesses` (`branch:update`); permission codes `branch:read|create|update|delete` (TEAM owners + Admin); 13 CHECKs, one live main + live unique name per organization (409s); default staff as `mem_` ids; `hasOrganizationPermission` (authorization.util) and `MembershipService.resolveMembershipIdsByPublicIds` added; `app` schema in the baseline, the maintenance and role-taxonomy migrations; OpenAPI tag, response/body maps, catalog, authz maps; seeds: demo-org Adajan (main) + Vesu, bulk two per organization | routes RC-12–15 and RC-149 built at the table row, not the feature row; `/my` added; RC-149 `PUT …/team` built as `GET`/`PUT …/user-accesses`; access as a link table, not a membership column; per-resource codes, not the section matrix (D10/D12); fields renamed (`address_line_one/two`, `postal_code`, `is_active`, `default_*_membership_id`); no DELETE route yet; no pagination on branch lists | user 2026-10-07: build routes with the table, `/my` for every user, `branch_user_accesses`, `branch:*` codes, `app` schema; repository rules (no digits, full names, `is_` booleans); spec "≤ 20, no pagination" | user 2026-10-07 + agent-os | COMMIT |

## Revisions to upcoming rows

- Feature 1 (team-and-access): the branch routes RC-12–15 and RC-149 are built at ROUTE #2 — the feature row keeps the rest (staff, roles, rooms, machines, holidays) — user 2026-10-07.
- #4 (`membership` CHANGE): a membership's branches are `app.branch_user_accesses` rows (built at #2), not a membership column; the staff invite and edit write that table — user 2026-10-07.
- #6/#7 (permission seed codes): branch access uses `branch:read|create|update|delete` (seeded at #2); the other clinic codes follow the same per-resource shape, not the section matrix — user 2026-10-07.

## Summary

Written at the close.

- Planned, not built (deferred — user OK): …
- Built, not planned: …
- Follow-ups for the next iteration: …
- Frontend adapts (user rule, 2026-10-07) — at the route rows that expose them: money as `numeric(12,2)` rupees (clinozy-fe contracts hold paise) · the clinic settings read and written through `/tenancy/organization/settings` (#1).

## Standing deviations

The complete list of where the code differs from the drop — the Baseline's list (empty: this is the
initial iteration), minus what this iteration resolved, plus its new ones. KICKOFF.md §8 lists the
deviations this iteration plans; each joins this table when the row that builds it is done.

| Item | Design says | Built as | Since iteration | Decision |
| --- | --- | --- | --- | --- |
| Branch field names | `addressLine1/2`, `pin`, `active`, `defaultDoctorId` … (schema-routes.md:154–180) | `address_line_one/two`, `postal_code`, `is_active`, `default_doctor_membership_id` … (snake_case, no digits, full names) | launch-2026-09-30-jxmr | repository rules; user 2026-10-07 (frontend adapts) |
| Branch access | a user's `branchIds` (schema-routes.md:199) | `app.branch_user_accesses` (branch ↔ membership) + `GET /app/branches/my` | launch-2026-09-30-jxmr | user 2026-10-07 |
| Access model | role × section matrix (schema-routes.md:211–225) | per-resource permission codes (`branch:*`) | launch-2026-09-30-jxmr | user 2026-10-07 |
