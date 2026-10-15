# feat-choose-default-clinic-2026-10-15-yizz — kickoff

## 1. Header

| Field | Value |
| --- | --- |
| Iteration | `feat-choose-default-clinic-2026-10-15-yizz` (type `feat`, topic `choose-default-clinic`) |
| Mode | initial — Baseline `none` ([CD1](plans/decisions.md)); follows `feat-default-clinic-at-login-2026-10-14-cpjx` on the same branch |
| Intake mode | — (no intake files; the requirement is § 2) |
| Date | 2026-10-15 |
| Branch | `feat/default-clinic-at-login` ([CD2](plans/decisions.md)) |
| Sibling | clinozy-fe `iterations/feat-choose-default-clinic-2026-10-15-yizz/` — the Settings card, the account-menu shortcut and the "Default" label |

## 2. Goal and scope

**The request (2026-10-15).** "After default — they can change their default if they want somehow
in a better way — please implement that as well."

**Goal.** A person decides which clinic opens at sign-in: the automatic default from the iteration
before ("the clinic I used last"), or one clinic they pin. The choice lives on the server, so it
follows them to every device.

**In scope:** `auth.user_settings.default_organization_id` (migration, schema, DBML); `GET` /
`PATCH /users/me/settings` carrying it ([CD5](plans/decisions.md), [CD6](plans/decisions.md),
[CD7](plans/decisions.md)); the login order with the pin first ([CD8](plans/decisions.md)); the
error key in every locale and the `reason` slug in `response-codes.md`; tests (validator, service,
database, integration, RLS lane); docs; acceptance and the frontend route map.

**Out of scope:** a new route ([CD5](plans/decisions.md)); the data export
([CD11](plans/decisions.md)); everything on screen (clinozy-fe).

## 3. Locked decisions

- [CD3](plans/decisions.md) — a pinned clinic, automatic stays the default choice.
- [CD4](plans/decisions.md) — `auth.user_settings.default_organization_id`, soft pointer, additive migration.
- [CD6](plans/decisions.md) — only an active clinic the caller actively belongs to; else `422 default_organization_unavailable`.
- [CD8](plans/decisions.md) — pinned → remembered → newest → personal → none.

## 4. ROUTE

| # | Work item | Kind | Depends on | Skill/driver | Acceptance | Assignee | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | The column: migration + Drizzle schema + DBML ([`db-changes.md`](plans/db-changes.md)) | CHANGE table | — | `be-db-migration-maintainer`, `be-schema-generator`, `be-rls-tenant-isolation-guard` | B-1 | Claude | done |
| 2 | The setting: DTO, validator, service (membership check), serializer, types, route description, error key + `reason` ([`route-changes.md`](plans/route-changes.md)) | CHANGE route | 1 | `/be-build-requirement` (`be-api-contract-guard`, `be-i18n-message-guard`, `be-test-generator`, `be-tsdoc-export-guard`) | B-2 – B-4 | Claude | done |
| 3 | The login order: the pinned clinic first in `findDefaultActiveOrganizationPublicId` | CHANGE flow | 1 | `/be-build-requirement` (`be-test-generator`) | B-5, B-6 | Claude | done |
| 4 | Docs, acceptance, the frontend route map and the gates | flow | 1 – 3 | `be-kickoff-iteration` › Close | B-1 – B-7 | Claude | done |

Background work: none.

## 5. Acceptance criteria

- **B-1** The migration adds `default_organization_id` to `auth.user_settings` (nullable, no
  default), passes `db:migrate:lint`, and the schema, DBML and migration agree.
- **B-2** `PATCH /users/me/settings { default_organization_id: "org_…" }` for a clinic the caller
  actively belongs to answers `200` with it; `GET` returns it; `null` clears it.
- **B-3** An unknown id, another user's clinic, a suspended membership or a personal workspace is
  `422` with `reason: default_organization_unavailable`, and nothing is stored; a malformed id is
  `400`.
- **B-4** `GET` reports `null` once the pinned membership is no longer active.
- **B-5** The next login opens the pinned clinic — ahead of the remembered clinic, a newer clinic
  and the personal workspace; with the pin cleared the remembered clinic opens again.
- **B-6** A pinned clinic the person no longer actively belongs to is skipped at login; with team
  organizations disabled the personal workspace stays first.
- **B-7** Docs and mirrors (`personal-vs-team-organizations.md`, `frontend-auth-guide.md`,
  `src/FLOWS.md`, the user-settings overview, `response-codes.md`) describe it; the gates pass.

## 6. Definition of done

Every criterion passes with evidence in [`plans/acceptance.md`](plans/acceptance.md);
`AS-BUILT.md` records each ROUTE row; the frontend route map is written; Status `done`
([CD13](plans/decisions.md)).
