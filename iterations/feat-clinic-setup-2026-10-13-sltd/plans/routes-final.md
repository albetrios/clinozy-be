# Clinozy API — final routes for feat-clinic-setup, sub-domain by sub-domain

Started 2026-10-13 from the code on `feat/clinic-setup` (= `main` at `c3822a0`). This file is the iteration's route review
(`be-iteration-planning` Step 5), shaped by [`routes-final-template.md`](../../../docs/design-workflow/process/routes-final-template.md).
Each sub-domain is finalized one at a time: **rev n — awaiting your OK** → **final** only after you confirm it in chat. It
is the binding design (D9): kickoff builds it ditto, and where agent-os cannot, the row stops and asks first.

What exists is the launch as built — its route review (`launch-2026-09-30-jxmr/plans/routes-final.md` §1–§12) and
`docs/routes.txt` — and this file only describes what this iteration adds or changes on top of it.

How to read the tables: paths are under `/api/v1/app`; `{x_id}` is a public id; **Gate** is the permission the caller
needs; **Idem** `req` = `X-Idempotency-Key` header required; `*` = required.

## Sub-domains (in build order — each builds on the ones above it)

| # | Sub-domain | Folder (`src/domains/app/sub-domains/…`) | Paths (`/app/…`) | Routes | Builds on | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Branches & places — **CHANGED** | `branches/` (as built) | `branches` — route 3 only | 1 changed (of the launch's 25) | organization, team | **final (rev 1, confirmed 2026-10-13)** |
| 2 | Onboarding setup — **NEW** | `onboarding-setup/` (D22) | `onboarding-setup` (+ `complete`) | 3 new | 1, team, offerings, appointments; tenancy organization settings | **rev 2 — reopened for the quick setup (D26–D28), awaiting your OK** |

App total: **+3 routes, 1 changed, none removed** against the launch — sub-domain 1 changes one behaviour of
`POST /branches` (a clinic's first branch becomes main); sub-domain 2 is new (the setup status, its answers, going
live).

## Code layout and tables without routes

Every sub-domain is one folder, laid out like a domain; the app's shared kernel stays at `src/domains/app/`. A table with
no routes of its own is a persistence part of the sub-domain that writes it.

| Sub-domain | Table | Lives in | Written by |
| --- | --- | --- | --- |
| 2 | `tenancy.organization_settings` — the seven `setup_*` fields only (D5, D20) | `tenancy/sub-domains/organization/organization-settings/` (as built — a platform table) | the onboarding-setup service, **through** the organization-settings service (new methods); tenancy never reads app records (D22) |

`onboarding-setup/` has **no table of its own**: it reads branches, memberships, offerings, rooms, machines, holidays and
appointments through their services, and stores progress in the clinic's settings.

## Rules for every sub-domain

The launch's rules hold unchanged (its K2–K8: a pointer that records what someone *did* is `ON DELETE RESTRICT`; every
app pointer stays inside its organization by a composite key). The pointers this iteration adds:

| Sub-domain | Pointer | On delete | When the member leaves |
| --- | --- | --- | --- |
| 2 | `organization_settings.setup_completed_by_membership_id` | `RESTRICT` (K2), composite `(organization_id, setup_completed_by_membership_id)` → memberships `(organization_id, id)` (K8) | kept — who completed the setup is history |

## Connections

```text
1) WHO POINTS AT WHOM                      A ──► B = a column on A points at B

   tenancy.organizations ◄── tenancy.organization_settings (1:1, as built)
   tenancy.memberships ◄──── organization_settings.setup_completed_by_membership_id   (NEW)

   1 BRANCHES (as built)         2 ONBOARDING SETUP — no table; reads ▼, stores in organization_settings
      └──< rooms · machines · holidays · members

2) THE GRAPH — each row reads the columns marked ●  (○ = writes there through its service)

                          Settings  Organization  Branches  Members  Offerings  Appointments
   1  Branches                          ●
   2  Onboarding setup    ●○         ●            ●         ●        ●          ●

3) WHAT ONE ACTION SETS OFF (same transaction; no background work — D21)

   1 POST /branches, the clinic has no main ────► the new branch is main
   2 PATCH  answer · skip · defer · hide ────────► organization_settings.setup_* (through the settings service)
   2 POST   complete (Go live) ─────────────────► checks clinic type · main branch · a service → setup_completed_at, _by
   2 GET    (3 guide items done, first time) ───► setup_guide_done_at (written once, D20)
```

---

## 1. Branches & places — final (rev 1, confirmed 2026-10-13) — nested sub-domain 1.A only

Code: the **`branches` sub-domain folder** — `app/sub-domains/branches/` (the branch at the folder root), as built by the
launch (its §1, final rev 9). Only the branch itself changes; its rooms, machines, holidays and members (1.B–1.E) are
untouched — setup and the new "Places & days" step use their routes as built.

1.1 Decisions · 1.2 Open questions · 1.3 Tables and relations · 1.4 Permissions · 1.5 Common to every route ·
1.6 Objects returned · 1.7 Routes · 1.8 Request details · 1.9 Errors · 1.10 Rules worth knowing · 1.11 Code changes ·
1.12 Nested sub-domains · then **1.A Branches** with the same eleven sections.

What changes: a clinic's **first** branch becomes its main branch even when the request does not send `is_main` — the
design's rule ("if none is left main, the first branch becomes main", users.md:132), never built. Sources: BRIEF.md:181–185,
324; coverage F2, F24; the frontend's Standing deviation "Main branch" (read-only, "set when it opened").

### 1.1 Decisions (whole sub-domain)

| # | Decision |
| --- | --- |
| BR1 | **A clinic's first branch is its main branch.** `POST /branches` saves the new branch as main whenever the organization has **no main branch yet**, whatever the body says about `is_main` (absent or `false`). Today a branch is main only when the request sends `is_main: true`, and the frontend never sends it — so a clinic created through Users › Branches has no main branch at all, and nothing marks one later. Other option: refuse (`400`) a branch without `is_main: true` while the clinic has none — rejected: every client would carry the rule. |
| BR2 | **One main, as built.** An explicit `is_main: true` while another branch is main stays `409` (`conflict`, "only one main branch"); setup reads the existing main back and counts its step done (coverage F2). Unchanged. |
| BR3 | **Two first branches at the same time** (two admins, a double submit with two keys): the one-main unique index decides. The request that did **not** ask for main is saved as not main instead of failing; one that sent `is_main: true` still gets the `409`. Today both would race and the loser would get a `409` it never asked for. |
| BR4 | **`PATCH /branches/{branch_id}` unchanged** — moving or clearing main, and retiring a branch, keep their built rules; this iteration does not touch them. |

### 1.2 Open questions

None.

### 1.3 Tables and relations

| Table | Holds | Key rules |
| --- | --- | --- |
| `app.branches` | one clinic location (as built) | **no column change**; at most one main branch (the partial unique index on `is_main`, as built); the first branch of a clinic is main (BR1) |

Rooms, machines, holidays and members: as built (launch §1.3).

**PostgreSQL design**: no change — no migration for this sub-domain.

### 1.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `branch:create` | Users · Create | create a branch (now main when it is the first) | 3 | Owner, Admin |

Every other code as built (launch §1.4).

### 1.5 Common to every route

As built (launch §1.5): base `/api/v1/app`; `Authorization: Bearer`; every `POST` needs `X-Idempotency-Key`; `200` with
`{ data, meta }`; errors `{ error: { type, code, reason?, detail, errors[] } }`.

### 1.6 Objects returned

| Object | Where |
| --- | --- |
| Branch | 1.A.6 — unchanged (`is_main` now `true` on a clinic's first branch) |

### 1.7 Routes

Only the changed route; the other 24 are as built (launch §1.7).

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 3 | POST | `/branches` | Create a branch — **the first one becomes main (changed)** | `branch:create` | req |

### 1.8 Request details

In 1.A.8.

### 1.9 Errors

In 1.A.9 — no new error.

### 1.10 Rules worth knowing

- A clinic always has a main branch once it has any branch (BR1); setup's step 3 and Users › Branches both rely on it.
- Patients default their home branch to the main branch and every one-branch screen hides its branch field (as built) — a
  clinic with a branch but no main is no longer possible through `POST`.

### 1.11 Code changes (whole sub-domain)

| # | Change |
| --- | --- |
| BRC1 | BR1, BR3: in `branches.service.ts` `create`, inside the existing transaction — read whether the organization has a main branch; when it has none, write the new branch with `is_main = true`; when that write hits the one-main unique index **and** the body did not send `is_main: true`, write it again as not main (BR3); an explicit `is_main: true` keeps today's `409` (BR2) |
| BRC2 | Tests (`be-test-generator`): the first branch without `is_main` is main; a second one is not; an explicit `true` while a main exists is `409`; two first creates at once leave exactly one main and no error for the one that did not ask |
| BRC3 | Route 3's OpenAPI `description` says the first branch becomes main (`be-route-schema-doc-guard`); `pnpm routes:catalog` unchanged (same method, path, gate) |

### 1.12 Nested sub-domains

| Nested sub-domain | Folder (`src/domains/app/sub-domains/branches/…`) | Tables | Routes | Status |
| --- | --- | --- | --- | --- |
| 1.A Branches | folder root | `app.branches` | 3 (changed) | final |
| 1.B–1.E Members, rooms, machines, holidays | as built | as built | as built | unchanged |

---

### 1.A Branches — `branches/` (folder root) — final

#### 1.A.1 Decisions

BR1–BR4 (1.1) — all four are this nested sub-domain's.

#### 1.A.2 Open questions

None.

#### 1.A.3 Tables and relations

`app.branches` — no column, index or constraint changes. The rule is in the service (BRC1); the one-main partial unique
index (as built) is what makes BR3 safe.

#### 1.A.4 Permissions

| Code | Routes |
| --- | --- |
| `branch:create` | 3 |

#### 1.A.5 Common to every route

As 1.5.

#### 1.A.6 Objects returned

**Branch** — unchanged (launch 1.A.6): `id` (`brn_…`), `name`, `tone`, `is_main`, the address fields, `phone`, `email`,
`gst_number`, `opens_at`, `closes_at`, `working_days`, the four `default_*_membership_id`, `is_active`, `maps_link`,
`review_link`, `created_at`, `updated_at`.

#### 1.A.7 Routes (3)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 3 | POST | `/branches` | Create a branch — the first one becomes main **(changed)** | `branch:create` | req |

#### 1.A.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 3 | — | as built: `name*` (1–60), `address_line_one*` (1–120), `area*`, `city*` (1–60), `postal_code*` (6 digits), `phone*`, `email*`; optional: `tone`, `is_main`, `address_line_two`, `state`, `gst_number`, `opens_at`, `closes_at`, `working_days`, `membership_ids`, `default_*_membership_id` (×4), `is_active`, `maps_link`, `review_link`. **`is_main` absent or `false` while the clinic has no main → saved as main (BR1)** | Branch |

#### 1.A.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 3 | `409` · `conflict` (message: only one main branch) | `is_main: true` while another branch is main — unchanged (BR2); **no longer** when the body did not ask for main (BR3) |
| 3 | as built | name taken (`409`), `closes_at` not after `opens_at`, default staff not among the members, an unknown member (`400`) |

#### 1.A.10 Rules worth knowing

None beyond 1.10.

#### 1.A.11 Code changes

BRC1–BRC3 (1.11).

---

## 2. Onboarding setup — rev 2 (2026-10-13, reopened for the quick setup D26–D28) — nested sub-domain 2.A; awaiting your OK

Code: the **`onboarding-setup` sub-domain folder** — `app/sub-domains/onboarding-setup/` (D22), the setup at the folder
root; **no table of its own** — it reads the clinic's records and stores progress in `tenancy.organization_settings`
through the organization-settings service.

2.1 Decisions · 2.2 Open questions · 2.3 Tables and relations · 2.4 Permissions · 2.5 Common to every route ·
2.6 Objects returned · 2.7 Routes · 2.8 Request details · 2.9 Errors · 2.10 Rules worth knowing · 2.11 Code changes ·
2.12 Nested sub-domains · then **2.A Onboarding setup** with the same eleven sections.

What it is: the server side of the 3-tap setup drawer and the short guide behind the profile icon (D11, D26, D28) — one
status read, one write for the answers, skips, "Explore first" and "Hide", and one action that takes the clinic live.
Every tick is read from the clinic's real records (BRIEF.md:104); only what has no record of its own is stored. Sources:
BRIEF.md:36–181, 215–247; decisions D5, D7, D19–D22, D26–D28. Route numbers run 1–3.

### 2.1 Decisions (whole sub-domain)

| # | Decision |
| --- | --- |
| OS1 | **Folder and paths** (D22): `app/sub-domains/onboarding-setup/`; one resource, singular per clinic — `GET` and `PATCH /onboarding-setup`, the action `POST /onboarding-setup/complete` ("Go live"). No path id: the clinic is the token's organization. Today nothing serves a clinic's setup. |
| OS2 | **No table of its own** (D5): progress lives in seven `setup_*` fields of `tenancy.organization_settings` (2.A.3), written only through new methods of the organization-settings service — the app reads tenancy through its service, tenancy never reads app records. `GET`/`PATCH /tenancy/organization/settings` do **not** show or take the setup fields. |
| OS3 | **Ticks are read, not stored**: going live needs 3 checks and the guide has 3 items (D26, D28), each worked out on every read from the records (2.A.10); only two answers are stored (`clinic_type`, `you` — step 2 is read back from the main branch), the guide's skips, and the times. |
| OS4 | **Managers only, team clinics only**: every route needs `organization:update` (D19); a personal workspace is refused with `422` (`team_organization_required`, catalog scope `team`) — it has no branches (launch D44), and its owner holds `organization:update`, so the code alone would let it in. |
| OS5 | **Changes merge, never overwrite**: `PATCH` adds or removes single values (`answered_steps_add`, `skipped_items_add`, `skipped_items_remove`) in one SQL statement, so two admins answering at once never lose each other's answers; `deferred` and `guide_hidden` set or clear a time. |
| OS6 | **Going live is checked by the server** (BRIEF.md:222–224): `POST …/complete` sets `setup_completed_at` and `setup_completed_by_membership_id` only when the clinic type is answered, an active main branch exists and at least one service is active; otherwise `409 onboarding_setup_incomplete` naming the missing ones in `errors[]`. "Someone to book" is **not** required (D26). Completing again is a no-op that returns the same object (the first completer stays). The Consultations are created by the client through the built offerings route before it calls this one (BRIEF.md:69–76) — the server knows no starter list. |
| OS7 | **"All three done" is stored once** (D20): the read that first finds the 3 guide items done or skipped writes `setup_guide_done_at` (a conditional `UPDATE … WHERE setup_guide_done_at IS NULL`) — the same first-read write the settings row already does (it is created on first read, as built). It never clears, so the ring does not come back. |
| OS8 | **Existing clinics** (D7): the migration fills `setup_completed_at` (and creates the settings row when missing) for every clinic that has an active main branch and an active service; `setup_completed_by_membership_id` stays empty for them. |
| OS9 | **rev 2 — what changed from rev 1** (D26, D28): 13 items → live checks 3 + guide items 3; answered steps `clinic_type`, `opening_hours`, `you`, `team` → `clinic_type`, `you`; skippable items → `treatments`, `invite_team`; "someone to book" leaves the essentials and only words the invite item; `next_step` follows the 3 steps. The routes, gates, storage and fill are unchanged. |

### 2.2 Open questions

None — every decision follows an answer (D5, D7, D19–D22, D26–D28).

### 2.3 Tables and relations

| Table | Holds | Key rules |
| --- | --- | --- |
| `tenancy.organization_settings` (CHANGED — 7 fields) | the clinic's setup progress, on its settings row (one per clinic) | written only by this sub-domain through the settings service (OS2); `setup_completed_by_membership_id` `RESTRICT` (K2) inside the organization (K8) |

```text
tenancy.organizations ──1:1── tenancy.organization_settings ──> tenancy.memberships (who went live, K2)
                                  ▲ setup_* written through the settings service
app ONBOARDING SETUP ─────────────┘   reads ▼ (each through its own service or repository, never stored)
   app.branches (the main branch) · app.offerings (count) · app.appointments (any)
   tenancy.memberships + roles (others in the team; someone holding Doctor / Therapist)
```

**PostgreSQL design**: in 2.A.3 — seven columns on an existing table; no new table, no new index beyond the composite
key for the member pointer.

### 2.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `organization:update` | — (Owner, Admin) | read the setup, answer, skip, defer, hide, go live | 1, 2, 3 | Owner, Admin |

No new permission code. Each record a setup step creates keeps its own gate on its own route (`branch:create`,
`offering:create`, `membership:create`, `membership:update`, `organization:update`) — this sub-domain writes none of them.

### 2.5 Common to every route

| Item | Value |
| --- | --- |
| Base | `/api/v1/app` |
| Auth | `Authorization: Bearer <access token>`; the active organization comes from the token |
| Organization scope | `team` — a personal workspace gets `422 team_organization_required` (OS4) |
| Writes | `POST` needs `X-Idempotency-Key`; `PATCH` takes an optional `expected_updated_at` (a stale save → `409 record_changed`) |
| Success | `200` with `{ data, meta }` |
| Errors | `{ error: { type, code, reason?, detail, errors[] } }` — `400 invalid_field`, `401`, `403`, `409`, `422` |

### 2.6 Objects returned

| Object | Where |
| --- | --- |
| Onboarding setup | 2.A.6 |

### 2.7 Routes

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | `/onboarding-setup` | The clinic's setup: answered steps, live checks, the 3 guide items, the ring's count **(new)** | `organization:update` | |
| 2 | PATCH | `/onboarding-setup` | Answer a step, skip or un-skip a guide item, "Explore first", hide or reopen the guide **(new)** | `organization:update` | |
| 3 | POST | `/onboarding-setup/complete` | Go live — refused while the clinic type, the main branch or a service is missing **(new)** | `organization:update` | req |

### 2.8 Request details

In 2.A.8.

### 2.9 Errors

Every route can answer the errors in 2.5; each route's own are in 2.A.9.

### 2.10 Rules worth knowing

- Nothing here creates a branch, a service, a role or an invitation: the drawer calls the built routes for those (route
  review 1; launch §2, §3) and then reads this status again.
- "Someone to book" (D15) — a live, active membership holding the **system** role named Doctor or Therapist, as main or
  extra role (system role names are fixed, `app-role-presets.ts`) — only words the invite item; going live does not need
  it (D26).
- A guide item a later edit undoes (a service deleted, the only other member removed) reads not done again;
  `setup_guide_done_at` stays (OS7).

### 2.11 Code changes (whole sub-domain)

| # | Change |
| --- | --- |
| OSC1 | Migration (`be-db-migration-maintainer`, `be-sql-design-guard`): the seven columns on `tenancy.organization_settings` (2.A.3) with their checks and the composite key for the member pointer; the one-time fill for existing clinics (OS8) |
| OSC2 | `organization-settings.schema.ts` and types; the settings serializer and DTO keep the setup fields out of `GET`/`PATCH /tenancy/organization/settings` (OS2) |
| OSC3 | Organization-settings service and repository — new methods: read the setup fields; merge a change (OS5, one statement with array add / remove); complete (conditional on `setup_completed_at IS NULL`); mark the guide done (conditional, OS7) |
| OSC4 | New sub-domain `app/sub-domains/onboarding-setup/` (`be-domain-generator`): routes, controller, service, DTO, validator, serializer, types, constants, `onboarding-setup.overview.md` — no schema or repository; the service reads branches, offerings and appointments through the app's repositories and members, roles and the organization through the tenancy services; wired in `app.container.ts` with the organization-settings service it already receives |
| OSC5 | The route catalog (`docs/routes.txt`, scope `team`), route success statuses, organization-scope list, OpenAPI tag "Onboarding setup" with summaries in en and es (`be-route-schema-doc-guard`, `be-openapi-multilingual`), i18n keys for `onboarding_setup_incomplete` and the field errors |
| OSC6 | Tests (`be-test-generator`): validator and status-composition unit tests (each check and item, done and not); route e2e — managers only, personal `422`, the merge under two concurrent `PATCH`es, complete `409` naming what is missing, complete twice, the first-read `setup_guide_done_at`; the RLS-role lane; the one-time fill |
| OSC7 | Seeds (`be-seed-maintainer`): the demo clinics are live (`setup_completed_at` set), so the demo never opens the drawer; a fresh-clinic seed path stays unset for trying the flow |
| OSC8 | Docs: `src/FLOWS.md` (the clinic setup flow), the frontend route map at close |

### 2.12 Nested sub-domains

| Nested sub-domain | Folder (`src/domains/app/sub-domains/onboarding-setup/…`) | Tables | Routes | Status |
| --- | --- | --- | --- | --- |
| 2.A Onboarding setup | folder root | `tenancy.organization_settings` (7 fields, through its service) | 1–3 | awaiting your OK |

---

### 2.A Onboarding setup — `onboarding-setup/` (folder root) — awaiting your OK

#### 2.A.1 Decisions

OS1–OS9 (2.1) — all are this nested sub-domain's.

#### 2.A.2 Open questions

None.

#### 2.A.3 Tables and relations

`tenancy.organization_settings` — seven columns added (the two lists not null, empty by default; the times and the
member pointer nullable):

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `setup_answered_steps` | `text[]` | no | `'{}'` | each value one of `clinic_type` · `you`; no repeats |
| `setup_skipped_items` | `text[]` | no | `'{}'` | each value one of `treatments` · `invite_team`; no repeats |
| `setup_deferred_at` | `timestamptz` | yes | | set once by "Explore first"; never cleared |
| `setup_completed_at` | `timestamptz` | yes | | set once by route 3 (OS6) or the one-time fill (OS8) |
| `setup_completed_by_membership_id` | `bigint` | yes | | composite `(organization_id, setup_completed_by_membership_id)` → `tenancy.memberships (organization_id, id)` `ON DELETE RESTRICT` (K2, K8); empty for the filled clinics |
| `setup_guide_hidden_at` | `timestamptz` | yes | | set by "Hide this guide", cleared by reopening |
| `setup_guide_done_at` | `timestamptz` | yes | | set once, never cleared (OS7) |

Checks: the two arrays `<@` their allowed values (`text`, not an enum type — `be-sql-design-guard`);
`setup_completed_by_membership_id IS NULL OR setup_completed_at IS NOT NULL`. Index: `(setup_completed_by_membership_id)`
for the foreign key. RLS: the table's `organization_settings_tenant_isolation` policy, as built (enabled and forced).

#### 2.A.4 Permissions

| Code | Routes |
| --- | --- |
| `organization:update` | 1, 2, 3 |

#### 2.A.5 Common to every route

As 2.5.

#### 2.A.6 Objects returned

**Onboarding setup** — routes 1, 2, 3:

| Field | Type | Notes |
| --- | --- | --- |
| `answered_steps` | string[] | `clinic_type` · `you` |
| `skipped_items` | string[] | `treatments` · `invite_team` |
| `main_branch_id` | string \| null | `brn_…` — the clinic's main branch (step 2 is done when it is set) |
| `next_step` | string \| null | the first unanswered step: `clinic_type` · `location` · `you` · `go_live`; `null` once live |
| `live_checks` | object | `clinic_type`, `main_branch`, `services` — each a boolean; all three true = can go live |
| `is_live` | boolean | `setup_completed_at` is set |
| `has_someone_to_book` | boolean | a member holds Doctor or Therapist — words the invite item ("your team" / "your doctor") |
| `guide_items` | object[] | the 3 items in order — `key` (`treatments` · `invite_team` · `first_appointment`), `is_done`, `is_skipped`, `can_skip` |
| `guide_done_count`, `guide_total_count` | integer | done or skipped · 3 — the ring's "1 of 3" |
| `deferred_at`, `completed_at`, `guide_hidden_at`, `guide_done_at` | ISO datetime \| null | |
| `completed_by_membership_id` | string \| null | `mem_…` |
| `updated_at` | ISO datetime | the settings row's — for `expected_updated_at` |

#### 2.A.7 Routes (1–3)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | `/onboarding-setup` | The clinic's setup **(new)** | `organization:update` | |
| 2 | PATCH | `/onboarding-setup` | Answer, skip, defer, hide **(new)** | `organization:update` | |
| 3 | POST | `/onboarding-setup/complete` | Go live **(new)** | `organization:update` | req |

#### 2.A.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 1 | — | — | Onboarding setup |
| 2 | — | at least one of: `answered_steps_add` (1–2 values, no repeats), `skipped_items_add`, `skipped_items_remove` (1–2 each, skippable keys only), `deferred` (`true` only), `guide_hidden` (`true` \| `false`); optional `expected_updated_at` | Onboarding setup |
| 3 | — | — | Onboarding setup (`completed_at` set) |

#### 2.A.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 2 | `400` · `answered_steps_add` / `skipped_items_add` / `skipped_items_remove` | an unknown value, a repeat, or `first_appointment` (cannot be skipped) |
| 2 | `400` · `invalid_field` | an empty body, or `deferred: false` |
| 2 | `409` · `record_changed` | `expected_updated_at` is older than the settings row |
| 3 | `409` · `onboarding_setup_incomplete` | a live check fails — `errors[]` names each (`field` = `clinic_type` · `main_branch` · `services`) |
| 1–3 | `403` | without `organization:update` |
| 1–3 | `422` · `team_organization_required` | a personal workspace (OS4) |

#### 2.A.10 Rules worth knowing

How each check and item reads (every read, from the records — BRIEF.md:104–110, 222–226; D26, D28):

| Check / item | Done when |
| --- | --- |
| live: `clinic_type` | `answered_steps` ∋ `clinic_type` |
| live: `main_branch` | an active branch with `is_main` |
| live: `services` | ≥ 1 active offering |
| guide: `treatments` | ≥ 2 active offerings |
| guide: `invite_team` | ≥ 1 membership other than the owner's, invited or active |
| guide: `first_appointment` | ≥ 1 appointment, any status |

`next_step` follows the drawer's order (D14, D26): `clinic_type` → `location` (done when a main branch exists) → `you`
(answered) → `go_live` (all three live checks true, not yet completed) → `null` once live.

#### 2.A.11 Code changes

OSC1–OSC8 (2.11).
