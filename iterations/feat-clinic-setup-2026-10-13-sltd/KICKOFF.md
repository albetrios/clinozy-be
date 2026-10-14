# KICKOFF — feat-clinic-setup-2026-10-13-sltd

## 1. Header

| Field | Value |
| --- | --- |
| Iteration | `feat-clinic-setup-2026-10-13-sltd` (clinozy-be; the same-named clinozy-fe iteration plans the screens) |
| Mode | incremental — Baseline `launch-2026-09-30-jxmr` (D8) |
| Intake mode | `brief` — `BRIEF.md` received, 22 files carried forward from the Baseline |
| Intake note | 1 received (BRIEF.md) · 22 carried forward from launch-2026-09-30-jxmr |
| Drop placed | 2026-10-13 (re-placed twice the same day: setup in the shell, D11; the quick setup, D26–D28) |
| Intake hash | `790d068ffc3b` |
| Schema-routes | `5f90325208e1` (unchanged from the Baseline) |
| Date | 2026-10-13 |
| Kickoff gate | the Baseline must be `done` or `frozen` first — the launch is `implementing` (D8) |

## 2. Goal and scope

**Goal:** a new clinic goes live in about a minute. Three answers in a drawer on whichever room the clinic opens on —
what kind of clinic, where it is, whether the owner sees patients — give it a main branch, a Consultation to book and
bill, and (usually) someone to book; a short guide behind the profile icon offers the next three things. The backend
serves the setup's status and progress and makes a clinic's first branch its main branch.

**In scope (this repository):**
- Sub-domain 1 — a clinic's first branch becomes main on `POST /branches` (routes-final §1).
- Sub-domain 2 — `onboarding-setup`: `GET` / `PATCH /onboarding-setup`, `POST /onboarding-setup/complete`; seven
  `setup_*` fields on `tenancy.organization_settings`; the one-time fill for clinics already live (routes-final §2).
- Tests, seeds, the route catalog, OpenAPI (en, es), i18n, `FLOWS.md`, and the frontend route map at close.

**Out of scope:** everything the frontend builds on routes that exist (the drawer, PIN autofill, the guide, Settings ›
Clinic, Places & days, the shortened /onboarding) — clinozy-fe's plan; background work and reminder emails (D21);
the cash-drawer float (D17); the ideas for later (D29); and `BRIEF.md` › Out of scope.

## 3. Locked decisions

All in [plans/decisions.md](plans/decisions.md):

- **D1, D11, D12 → D28** — setup is a drawer in the app shell on any room; the guide lives behind the profile icon (no header launcher).
- **D2** — "Explore first" is always allowed.
- **D3** — scope complete: Places & days and Settings › Clinic (frontend, on built routes).
- **D4** — /onboarding shortened (frontend).
- **D5** — setup progress is stored on `tenancy.organization_settings`.
- **D6, D18** — the starter services list (frontend data).
- **D7** — clinics already live when this ships are filled as live.
- **D8** — a brief on the launch; kickoff waits for the launch to be done.
- **D9** — the launch's route review is the truth for what exists; this route review is built ditto.
- **D10, D14** — step cards, unlocking in order.
- **D13 → D26** — the drawer is 560px; 3 taps; going live needs the clinic type, a main branch and a service.
- **D15** — someone to book = Doctor or Therapist (it words the invite item).
- **D16** — invitations carry the branch's days and hours.
- **D17** — no cash-drawer float.
- **D19** — managers only.
- **D20** — "all done" is stored once.
- **D21** — no reminder email.
- **D22** — the app domain's `onboarding-setup` sub-domain.
- **D23** — the safe defaults (some superseded by D26, D28).
- **D24, D25 → D30** — route review sub-domain 1 final (rev 1); sub-domain 2 final (rev 2).
- **D27** — PIN autofill from a bundled list (frontend).
- **D29** — no follow-ups planned.

## 4. Features and order

| Order | Feature | Kind | Depends on | Story |
| --- | --- | --- | --- | --- |
| 1 | First branch becomes main | screen | — | [features/first-branch-main](plans/features/first-branch-main/story.md) |
| 2 | Onboarding setup (status, answers, go live, the guide) | screen | 1 | [features/onboarding-setup](plans/features/onboarding-setup/story.md) |
| 3 | A clinic goes live, end to end | flow | 1, 2 | [features/flow-clinic-goes-live](plans/features/flow-clinic-goes-live/story.md) |

## 5. ROUTE

The ordered ledger — schema change first, then the changed and new sub-domains, then the flow, then acceptance. Each
`sub-domain` row's spec is its route-review section, built ditto (D9).

| # | Work item | Kind | Depends on | Skill/driver | Acceptance | Assignee | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `tenancy.organization_settings` — the seven `setup_*` columns, their checks, the member key, the one-time fill (OSC1, OSC2) | table | — | `/be-build-requirement` (CHANGE table) · be-db-migration-maintainer · be-sql-design-guard · be-rls-tenant-isolation-guard | migration lint + RLS-role lane green; the fill test (A11); settings routes unchanged (A12) | Claude | done |
| 2 | Sub-domain 1 — first branch becomes main (BRC1–BRC3; routes-final §1) | sub-domain | — | `/be-build-requirement` (CHANGE) · be-api-contract-guard · be-test-generator | A1, A2, A3 | Claude | done |
| 3 | Organization-settings service and repository — read, merge, complete, mark done (OSC3) | sub-domain | 1 | `/be-build-requirement` (CHANGE) · be-tsdoc-export-guard | unit tests for each method; A9 merge | Claude | done |
| 4 | Sub-domain 2 — `onboarding-setup` routes, controller, service, DTO, validator, serializer (OSC4, OSC5; routes-final §2) | sub-domain | 2, 3 | `/be-build-requirement` (NEW sub-domain, no table) · be-domain-generator · be-route-schema-doc-guard · be-openapi-multilingual · be-i18n-message-guard · be-route-catalog | A4–A10, A14 | Claude | done |
| 5 | Tests, seeds and docs (OSC6–OSC8) | flow | 4 | be-test-generator · be-seed-maintainer · be-system-narrative-maintainer | A15; `pnpm validate:route-success-coverage`; the demo seed is live | Claude | done |
| 6 | Flow — a clinic goes live end to end (branch → owner role → Consultation → complete → status) | flow | 4, 5 | `/be-build-requirement` (flow) · be-test-generator | A13 + an e2e flow test from a new clinic to `is_live` and a first appointment | Claude | done |
| 7 | Acceptance and close — gates, `/be-pre-merge-review`, `plans/acceptance.md`, `AS-BUILT.md` summary, `plans/frontend-route-map.md`, `pnpm iteration:status … done` | flow | 1–6 | be-kickoff-iteration › Close | every row of `plans/acceptance.md` filled | Claude | done |

## 6. Requirements index

| Identifier | File |
| --- | --- |
| `data.setup-progress`, `data.ticks-from-records`, `data.first-branch-main`, `data.existing-clinics-live`, `data.live-by-kept`, `data.no-day-float` | [requirements/data.md](plans/requirements/data.md) |
| `access.setup-managers-only`, `access.setup-team-only`, `access.writes-keep-own-gates`, `access.owner-extra-role` | [requirements/access.md](plans/requirements/access.md) |
| `operations.read-setup`, `operations.change-setup`, `operations.go-live`, `operations.guide-items`, `operations.guide-done-once`, `operations.first-branch-main` | [requirements/operations.md](plans/requirements/operations.md) |
| `background.none` | none — no background work (D21); its file was removed with the empty requirement files (AS-BUILT › Summary) |
| — (n/a) | notifications · realtime · integrations · files — none in this iteration (their empty files were removed) |
| `quality.safe-to-repeat`, `quality.no-lost-answers`, `quality.tenant-isolation`, `quality.status-read-cost`, `quality.errors-translated` | [requirements/quality.md](plans/requirements/quality.md) |

## 7. Open AMBER items

None — D10 and every safe default were confirmed (D23); the rest are RED answers.

## 8. Standing deviations

The Baseline's Standing deviations this change touches (coverage › Delta has the full table):

| Item | Design says | Built as | Since | This iteration |
| --- | --- | --- | --- | --- |
| Staff accounts | a user with a password | an invitation by email | launch (D4) | **keeps** — the guide invites |
| Roles | a fixed list of 9 | Owner + eight editable roles, several per person | launch (D5) | **keeps** — Doctor / Therapist as the owner's extra role |
| Rooms and machines | a fixed room list | per-branch records | launch (D28) | **keeps** — Places & days edits them (frontend) |
| Access model | role × section matrix | permission codes | launch | **keeps** — `organization:update` gates setup |
| Main branch (frontend) | a Main switch | read-only, "set when it opened" | launch (fe D157) | **resolves** — the backend now sets it (BR1); the deviation's "set when it opened" becomes true |
| Day close opening | a configured default float | carried or recounted cash | launch (B25, fe D156) | **keeps** — setup shows no float (D17) |
| Branch field names, access | camelCase, `branchIds` | snake_case, `branch_members` | launch | **keeps** |

New deviations from the drop this iteration adds: none on the backend — the setup routes are the brief's own.

## 9. Definition of done

- Every ROUTE row `done` (or `deferred` with the user's OK).
- `plans/acceptance.md` filled with results and evidence.
- `AS-BUILT.md` written: a row per ROUTE row, the summary (planned-not-built, built-not-planned, follow-ups), the
  Standing deviations.
- The repository's gates green: `pnpm validate`, `pnpm ci:local`, `pnpm tsdoc:check`, `pnpm routes:catalog:check`,
  `pnpm db:migrate:lint`.

## 10. Verification

- **Intake mode `brief`:** the `BRIEF.md` acceptance criteria this repository proves (`plans/acceptance.md` A1–A15) and
  the frontend's list for the rest.
- **MODE incremental:** the existing end-to-end tests for everything touched — branches, memberships, offerings,
  organization settings, the RLS-role lane, the route-success coverage.
- **Gates:** `pnpm validate`, `pnpm ci:local`, `/be-pre-merge-review` (review only).
