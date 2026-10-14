# feat-bug-report-2026-10-13-dgnx — kickoff

## 1. Header

| Field | Value |
| --- | --- |
| Iteration | `feat-bug-report-2026-10-13-dgnx` (type `feat`, topic `bug-report`) |
| Mode | initial — Baseline `none` ([BR1](plans/decisions.md)) |
| Intake mode | — (no intake files; the requirement is § 2, [BR1](plans/decisions.md)) |
| Date | 2026-10-13 |
| Branch | `feat/bug-report` ([BR2](plans/decisions.md)) |
| Sibling | clinozy-fe `iterations/feat-bug-report-2026-10-13-dgnx/` — the trigger, the textbox, the voice button and the animation ([BR12](plans/decisions.md)) |

## 2. Goal and scope

**The request (2026-10-13).** The "Report a Bug" form (today Sentry's feedback widget: Name, Email,
Description, Add a screenshot) becomes one textbox with a native voice (speech-to-text) button and
an animation, and the signed-in person's name and user id are sent with it and stored in the
backend.

**Goal.** The backend keeps every bug report as a row: what the person wrote (typed or dictated),
where they were, which release they ran, and **who they are — taken from the verified session, not
from the body** ([BR4](plans/decisions.md)).

**In scope:** the `user-bug-report` sub-domain (`auth.user_bug_reports`, forced row-level security
on the owner); `POST /api/v1/users/me/bug-reports`; the report in the person's data export; the
mirrors (route catalog, OpenAPI, success-status and organization-scope maps, i18n, seed, docs,
`CLAUDE.md`'s mapping); unit, integration and RLS tests; acceptance and the frontend route map.

**Out of scope:** a screenshot or attachment; listing, reading or triaging reports through the API;
notifying anyone; an audit row ([BR6](plans/decisions.md), [BR9](plans/decisions.md)); everything
on screen (clinozy-fe, [BR12](plans/decisions.md)).

## 3. Locked decisions

- [BR3](plans/decisions.md) — `user/sub-domains/user-bug-report/`, `auth.user_bug_reports`, `POST /users/me/bug-reports`.
- [BR4](plans/decisions.md) — `user_id`, `reporter_name`, `reporter_email` stamped from the session; the body refuses them.
- [BR5](plans/decisions.md) — the name is `null` when the account has none; the email is always kept.
- [BR6](plans/decisions.md) — `description` · `input_method` · `page_path` · `app_version`; the server adds workspace, user agent, time.
- [BR7](plans/decisions.md) — any signed-in person, `O` = `both`, 10 a minute.
- [BR8](plans/decisions.md) — ENABLE + FORCE RLS, owner policy only.
- [BR9](plans/decisions.md) — no audit row, event, notification or worker.
- [BR10](plans/decisions.md) — cascade with the account; the workspace is a public-id snapshot.
- [BR11](plans/decisions.md) — reports are part of the data export.
- [BR13](plans/decisions.md) — route review sub-domain 1 final.

## 4. Features and order

1. `bug-report` (NEW table + route) — [story](plans/features/bug-report/story.md).

## 5. ROUTE

| # | Work item | Kind | Depends on | Skill/driver | Acceptance | Assignee | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | User bug report — table, migration, RLS, route, service, tests: [`routes-final.md` § 1](plans/routes-final.md#1-user-bug-report--final-rev-1-confirmed-2026-10-13), [`db-changes.md`](plans/db-changes.md) | NEW table | — | `docs/getting-started/staged-build-prompt.md` (`be-schema-generator`, `be-db-migration-maintainer`, `be-rls-tenant-isolation-guard`, `be-api-contract-guard`, `be-test-generator`, `be-route-catalog`, `be-route-schema-doc-guard`, `be-seed-maintainer`) | A-1 – A-5 | Claude | done |
| 2 | The report in the data export | flow | 1 | `/be-build-requirement` (`be-test-generator`, `be-docs-maintainer`) | A-6 | Claude | done |
| 3 | Acceptance, the frontend route map and the gates | flow | 1, 2 | `be-kickoff-iteration` › Close | A-1 – A-6 | Claude | done |

## 6. Requirements index

| Identifier | File |
| --- | --- |
| `data.bug-report` | [requirements/data.md](plans/requirements/data.md) |
| `access.own-reports-only` | [requirements/access.md](plans/requirements/access.md) |
| `operations.file-report` | [requirements/operations.md](plans/requirements/operations.md) |
| `operations.export-reports` | [requirements/operations.md](plans/requirements/operations.md) |
| `quality.identity-from-session` | [requirements/quality.md](plans/requirements/quality.md) |
| `quality.errors-translated` | [requirements/quality.md](plans/requirements/quality.md) |
| `quality.bounded` | [requirements/quality.md](plans/requirements/quality.md) |

## 7. Open AMBER items

None.

## 8. Standing deviations

Baseline `none`: there is no earlier list to carry. This iteration has no design drop to deviate
from; it adds none.

## 9. Definition of done

Every ROUTE row `done`; `plans/acceptance.md` filled; the `AS-BUILT.md` summary written;
`pnpm validate`, `pnpm validate:domain`, `pnpm routes:catalog:check`, `pnpm docs:check`,
`pnpm tsdoc:check`, `pnpm db:migrate:lint` and the touched tests green.

## 10. Verification

Initial mode, no intake → the acceptance criteria A-1 – A-6 in `plans/acceptance.md`, each proven by
a test: the validator's unit suite, the route's integration suite (happy path, the stamped identity,
a spoofed `user_id` refused, an empty description, an API key refused, unauthenticated), the RLS
matrix (one person cannot read another's report), and the data export's payload suite.
