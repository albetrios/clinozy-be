# feat-default-clinic-at-login-2026-10-14-cpjx — kickoff

## 1. Header

| Field | Value |
| --- | --- |
| Iteration | `feat-default-clinic-at-login-2026-10-14-cpjx` (type `feat`, topic `default-clinic-at-login`) |
| Mode | initial — Baseline `none` ([DC1](plans/decisions.md)) |
| Intake mode | — (no intake files; the requirement is § 2, [DC1](plans/decisions.md)) |
| Date | 2026-10-14 |
| Branch | `feat/default-clinic-at-login` ([DC2](plans/decisions.md)) |
| Sibling | clinozy-fe `iterations/feat-default-clinic-at-login-2026-10-14-cpjx/` — the screen-level check and the recordings ([DC10](plans/decisions.md)) |

## 2. Goal and scope

**The request (2026-10-14).** "After login every time it's asking for clinic selection — can we
have default for user? Please go ahead with your recommendation."

**Why it happens** ([DC3](plans/decisions.md)). The login's default organization puts the
personal workspace first whenever personal workspaces are enabled (the default), and a personal
workspace sends the app to the clinic picker. Without one, the login picks the most recently
joined clinic, never the one last used. `auth.users.last_active_organization_id` was meant to fix
this but nothing writes or reads it.

**Goal.** Signing in opens the clinic the person last worked in. The picker appears only when
there is no clinic to open (no membership yet, or every remembered and joined clinic is gone).

**In scope:**

- Remember the clinic on every successful `POST /auth/switch-to-organization`
  ([DC5](plans/decisions.md)), best-effort ([DC7](plans/decisions.md)).
- The login default — every login path and the refresh fallback — becomes: remembered clinic →
  newest clinic → personal workspace → none, when team organizations are enabled
  ([DC6](plans/decisions.md)).
- Tests (database, unit, integration), the `switch-to-organization` route description, docs
  (`personal-vs-team-organizations.md`, the tenancy and auth overviews, `src/FLOWS.md`), TSDoc,
  acceptance and the frontend route map.

**Out of scope:** an explicit "default clinic" setting ([DC11](plans/decisions.md)); any new
route, column, migration or background job ([DC8](plans/decisions.md)); the data export
([DC9](plans/decisions.md)); frontend code ([DC10](plans/decisions.md)).

## 3. Locked decisions

- [DC4](plans/decisions.md) — automatic: the clinic last worked in.
- [DC5](plans/decisions.md) — remembered on `switch-to-organization`, only when it changes.
- [DC6](plans/decisions.md) — remembered → newest clinic → personal → none (team organizations enabled); B2C unchanged.
- [DC7](plans/decisions.md) — a failed remember is logged, never fails the switch.
- [DC8](plans/decisions.md) — `auth.users.last_active_organization_id`, no migration, no new policy.

## 4. Features and order

1. `default-clinic-at-login` (CHANGE: one write, one read) — [db-changes](plans/db-changes.md),
   [route-changes](plans/route-changes.md).

## 5. ROUTE

| # | Work item | Kind | Depends on | Skill/driver | Acceptance | Assignee | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Remember the clinic on `switch-to-organization` (`UserRepository`/`UserService` write, `AuthService` call, best-effort) and restore it in the login default (`OrganizationRepository.findDefaultActiveOrganizationPublicId`): [`db-changes.md`](plans/db-changes.md), [`route-changes.md`](plans/route-changes.md) | CHANGE flow | — | `/be-build-requirement` (`be-rls-tenant-isolation-guard`, `be-test-generator`, `be-tsdoc-export-guard`, `be-route-schema-doc-guard`) | A-1 – A-5 | Claude | done |
| 2 | Docs, acceptance, the frontend route map and the gates | flow | 1 | `be-kickoff-iteration` › Close (`be-docs-maintainer`, `be-overview-doc-maintainer`, `be-system-narrative-maintainer`) | A-1 – A-6 | Claude | done |

Background work: none.

## 6. Acceptance criteria

- **A-1** After `switch-to-organization` to clinic B, the next login's token carries B, even when
  a clinic A was joined later and the person has a personal workspace.
- **A-2** With nothing remembered, the login opens the most recently joined clinic, not the
  personal workspace (team organizations enabled).
- **A-3** A remembered clinic the person no longer belongs to (membership suspended or removed, or
  the clinic suspended) is skipped: the login falls back to the next clinic, else the personal
  workspace.
- **A-4** With team organizations disabled, the personal workspace stays first.
- **A-5** A failure to remember never fails the switch; re-switching to the remembered clinic
  writes nothing.
- **A-6** Docs and mirrors describe the new default: `personal-vs-team-organizations.md`
  (login-default column, token model), the tenancy/auth overviews, `src/FLOWS.md`, the route
  description; `lint`, `typecheck`, `tsdoc:check`, `test:unit`, the auth and tenancy suites (also
  under `test:rls-role`), `routes:catalog:check`, `docs:check`, `validate:route-schema-docs` and
  `validate:domain` pass.

## 7. Definition of done

Every acceptance criterion passes with evidence in [`plans/acceptance.md`](plans/acceptance.md);
`AS-BUILT.md` records each ROUTE row; the frontend route map is written; Status `done`
([DC13](plans/decisions.md)).
