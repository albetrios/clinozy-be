# Routes-final template — domains and nested sub-domains

The shape of an iteration's route review: `iterations/<iteration>/plans/routes-final.md`, written at
**be-iteration-planning Step 5** and confirmed by the user one sub-domain at a time
([iteration guide](iteration-guide.md) › Step 4). Copy the skeleton below, replace the two invented
sub-domains — **Lanterns** and **Voyages** — with the iteration's own, and keep every section, even
when it only says "None".

The two sub-domains mean nothing; they exist to show every handling once. The table below says where
each one is.

## How the file is built

| Rule | What it means |
| --- | --- |
| One folder per sub-domain | `src/domains/app/sub-domains/<sub-domain>/`; its main record sits at the folder root, each nested sub-domain is a folder directly inside it, `<sub-domain>/<nested-sub-domain>/` |
| Grouped by connection | what a record owns is a nested sub-domain of it (its table carries the parent's prefix and its routes nest under the parent); a sub-domain comes after every sub-domain it points at |
| Twelve sections per sub-domain | 1 Decisions (whole sub-domain) · 2 Open questions · 3 Tables and relations · 4 Permissions · 5 Common to every route · 6 Objects returned · 7 Routes · 8 Request details · 9 Errors · 10 Rules worth knowing · 11 Code changes (whole sub-domain) · 12 Nested sub-domains |
| Eleven sections per nested sub-domain | the first eleven, numbered `<sub-domain>.<letter>.<n>` |
| Status | `rev n — awaiting your OK` → **`final (rev n, confirmed <date>)`** only after the user confirms that sub-domain in chat; reopening a final sub-domain bumps its rev |
| Decisions | one id prefix per sub-domain (`LN`, `VY`), unique in the file; each decision states the recommendation and ends with "Other option: …" when there is a real alternative; "your call" marks one the user chose |
| Code changes | one id per change (`LNC1`), citing the decisions it lands |
| Today | every decision says what the code does today, so each one reads before → after |
| Agent-os checked up front | each sub-domain follows `be-api-contract-guard`, `be-sql-design-guard`, `be-rls-tenant-isolation-guard`, `be-workers-events` and the naming rules, so kickoff confirms the design rather than redesigning it — and where they still disagree at kickoff, agent-os wins and `AS-BUILT.md` records it |

## Every handling, and where the template shows it

| Handling | Shown in |
| --- | --- |
| Route naming — the plural table name on top, owned resources nested, path ids `{<table singular>_id}` | 1.7, 2.7 |
| An organization-wide list of a child (`/lantern-inspections`) beside its nested routes | 1.B.7 |
| One code set per sub-domain in its Roles-matrix row; `<resource>:export`; a field-level code `<resource>:<field>:read` | 1.4, 2.4 |
| A write gated by another sub-domain's code | 2.4 (`contact:read` to pick a traveller) |
| Soft delete with a reason, and restore | 1.A, 2.A |
| A child hard-deleted with its parent's rule instead, and why | 2.B (stops) |
| `X-Idempotency-Key` on every `POST`; `expected_updated_at` on `PATCH` | 1.5, 2.5 |
| Lowercase snake_case values (no digits) | 1.A.3 `kind`, 2.A.3 `status` |
| A number from a counter (`app.fn_assign_record_number`) | 1.A.3, 2.A.3 |
| Unique among live rows, any case (partial unique index on `lower(name)`) | 1.A.3 |
| Keyset indexes for each list sort | 1.A.3, 2.A.3 |
| A balance moved only by a guarded `UPDATE`, with an append-only log | 1.A (fuel) |
| A status machine with action routes and `409 transition_not_allowed` | 1.B, 2.A |
| A generated column | 2.A.3 (`due_amount`, `sailing_period`) |
| An exclusion constraint (`btree_gist`) | 2.A.3 (one lantern, one voyage at a time) |
| Typed nullable links with `num_nonnulls` instead of a type + id pair | 2.B.3 |
| A link table written through the parent's body (`branch_ids`) — no routes of its own | 1.A.3, the file's "Tables without routes" |
| Who did it: a membership pointer `ON DELETE RESTRICT` (members who leave) | 1.A.3, 1.B.3, 2.A.3 |
| Branch rules: organization-wide, or filtered by `branch:read` | 1.A.1 LN3, 2.A.1 VY3 |
| A file from the upload domain (`file_key`) | 1.A.3, 1.B.3 |
| A write into another sub-domain through its service, in the same transaction | 2.10 (arrive → lantern burn) |
| A `system` entry in the contact's activity | 2.1 VY5 |
| Background work: pull-based, one job per organization, safe to repeat | 1.B LN9, 2.1 VY6 |
| A task rule fed by this sub-domain | 1.B LN9 |
| Errors 400 · 403 · 404 · 409 · 422 with stable reasons | every .9 |
| Open questions, and a decision the user still has to take | 2.2 |
| i18n keys, seeds, tests, OpenAPI tags, the route catalog | 1.11, 2.11 |

## The skeleton

The file starts with a title (`# <Product> API — final routes, sub-domain by sub-domain`), a line on where
it started (branch, commit) and how to read its tables, then the parts below.

### File header — legend

How to read the tables: paths are under `/api/v1/app`; `{x_id}` is a public id; **Gate** is the
permission the caller needs; **Idem** `req` = `X-Idempotency-Key` header required; `*` = required.
Every paginated list also takes `limit` (1–100) and `after` (cursor), plus `created_from` / `created_to`.

### File header — sub-domains (in build order)

Each sub-domain builds on the ones above it.

| # | Sub-domain | Folder (`src/domains/app/sub-domains/…`) | Paths (`/app/…`) | Routes | Builds on | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Lanterns | `lanterns/` | `lanterns` (+ `exports`, `refuel`, `burn`, `inspections`), `lantern-inspections` | 17 | branches, team | **rev 1 — nested sub-domains 1.A–1.B, awaiting your OK** |
| 2 | Voyages | `voyages/` | `voyages` (+ `exports`, `depart`, `arrive`, `cancel`, `stops`) | 14 | 1, contacts, branches, team | **rev 1 — nested sub-domains 2.A–2.B, awaiting your OK** |

App total: **31 routes** — and, against today, what was added or dropped and why, one clause per sub-domain.

### File header — code layout and tables without routes

Every sub-domain is one folder, laid out like a domain; the app's shared kernel stays at `src/domains/app/`.
A table with no routes of its own is a persistence part of its parent: schema and repository (and a
service only when it holds logic) in the parent's folder, **no controller, no routes file**; the
parent's service writes it.

| Sub-domain | Table | Lives in | Written by |
| --- | --- | --- | --- |
| 1 | `app.lantern_branches` | `lanterns/` (folder root) | the lantern service (`branch_ids`) |
| 1 | `app.lantern_fuel_events` | `lanterns/` (folder root) | the lantern service (refuel, burn, a voyage's arrival) |
| 2 | `app.voyage_crew` | `voyages/` (folder root) | the voyage service (`crew_membership_ids`) |

### File header — rules for every sub-domain

Rules that hold across sub-domains get their own section with ids (`K1`, `K2`, …) — for example what
happens to every membership pointer when a member leaves — and a table of the pointers each
sub-domain holds:

| Sub-domain | Pointer | On delete | When the member leaves |
| --- | --- | --- | --- |
| 1 | `lanterns.keeper_membership_id`, `lantern_inspections.inspector_membership_id` | `RESTRICT` | the keeper is cleared (current link); inspections keep their inspector (history) |
| 2 | `voyages.captain_membership_id`, `voyage_crew.membership_id` | `RESTRICT` | planned voyages lose them (current); sailed ones keep them (history) |

### File header — connections

How the sub-domains connect, in three views: who points at whom, what each row points at, and what one
action sets off.

```text
1) WHO POINTS AT WHOM                      A ──► B = a column on A points at B

   tenancy.memberships ◄── keeper, inspector, captain, crew
   app.branches ◄──────── lantern_branches · voyages · voyage_stops
   app.contacts ◄──────── voyages (who travels) · voyage_stops

   1 LANTERNS ◄──────────── 2 VOYAGES (the lantern it carries)
      └──< lantern-inspections       └──< voyage-stops

2) THE GRAPH — each row points at the columns marked ●  (○ = writes there through its service)

                     Members  Branches  Contacts  1    2
   1  Lanterns       ●        ●
   2  Voyages        ●        ●         ●         ●○

3) WHAT ONE ACTION SETS OFF (same transaction unless marked worker)

   2 arrive ────────► 1 lantern burns fuel · contact activity entry
   2 depart ────────► contact activity entry
   1 inspection due ► task opened by the rules worker            [worker]
   2 reminder ──────► WhatsApp the day before departure           [worker]
```

---

## 1. Lanterns — rev 1 (YYYY-MM-DD) — nested sub-domains 1.A–1.B; awaiting your OK

Code: the **`lanterns` sub-domain folder** — `app/sub-domains/lanterns/` (the lantern at the folder root) with
`lantern-inspections/`.

1.1 Decisions (whole sub-domain) · 1.2 Open questions · 1.3 Tables and relations · 1.4 Permissions · 1.5 Common to every route ·
1.6 Objects returned · 1.7 Routes · 1.8 Request details · 1.9 Errors · 1.10 Rules worth knowing · 1.11 Code changes (whole sub-domain) ·
1.12 Nested sub-domains · then **1.A Lanterns · 1.B Lantern inspections** — each with the same eleven sections.

What the sub-domain is, in two or three lines, and the design files it reads (`<screen>.md`, `schema-routes.md` entities).
Route numbers run 1–17.

### 1.1 Decisions (whole sub-domain)

Taken on your standing answer "go with the recommendation" — change any of them before you confirm. A decision that
belongs to one table is in its nested sub-domain.

| # | Decision |
| --- | --- |
| LN1 | **Folder and names**: the sub-domain folder `lanterns/`; the inspections are the lantern's own — `app.inspections` → **`app.lantern_inspections`** (children carry the parent prefix), nested under `/lanterns/{lantern_id}/inspections`, with the organization-wide list at `/lantern-inspections` (the table's name). Public-id prefixes `lant_`, `linsp_`. |
| LN2 | **One code set, in the Lanterns row**: `lantern:read` · `create` · `update` · `delete` · `export`, covering inspections too; `lantern:fuel_cost:read` shows the cost field (no special codes); `list:export` goes here. Holders: Owner and Admin everything; Front desk read, create, update; Accountant read, export and the cost. |
| LN3 | **Branch rule**: a lantern belongs to one or more branches (`branch_ids`); callers see lanterns of their branches, everything with `branch:read`. Other option: organization-wide, no branch. |

### 1.2 Open questions

None — every decision follows the recommendation.

### 1.3 Tables and relations

| Table | Holds | Key rules |
| --- | --- | --- |
| `app.lanterns` | one lantern and how much fuel it holds | name unique among live (any case); `fuel_level` moves only with a fuel event (LN5); soft delete + restore |
| `app.lantern_branches` | lantern ↔ branch | key (`lantern_id`, `branch_id`); written with the lantern |
| `app.lantern_fuel_events` | every change to the fuel level | append-only (LN5) |
| `app.lantern_inspections` | one inspection of a lantern | status moves only by its actions (LN8); soft delete + restore |

```text
tenancy.organizations
   │
   └──< app.lanterns ──┬──< app.lantern_branches >── app.branches       where it is used (LN3)
                       ├──< app.lantern_fuel_events                     every fuel change (LN5)
                       ├──> tenancy.memberships (keeper)                who looks after it
                       └──< app.lantern_inspections ──┬──> tenancy.memberships (inspector)
                                                      └──> upload (report file)

A ──< B   one A has many B     A >── B   many A for one B     A ──> B   a column on A points at one B
```

Pointing at these from other sub-domains: `voyages.lantern_id` (2 — `ON DELETE RESTRICT`), the task source (tasks).

**PostgreSQL design**

Standard columns on every record table (not repeated below): `id bigint` (identity), `public_id varchar(28)` unique,
`organization_id bigint` → organizations `ON DELETE CASCADE`, `created_at` / `updated_at timestamptz`,
`created_by_user_id` / `updated_by_user_id`, and — where it soft-deletes — `deleted_at`, `delete_reason`,
`delete_note` with their three checks; RLS enabled and forced. Each table's design is in its nested sub-domain.

### 1.4 Permissions

All of the sub-domain's codes in one place; each nested sub-domain's routes repeat the gate.

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `lantern:read` | Lanterns · View | lanterns, fuel history, inspections | 1, 4, 10, 11, 13 | Owner, Admin, Front desk, Accountant |
| `lantern:create` | Lanterns · Create | add a lantern or an inspection | 3, 12 | Owner, Admin, Front desk |
| `lantern:update` | Lanterns · Edit | change, refuel, burn; change and close inspections | 5, 8, 9, 14–17 | Owner, Admin, Front desk |
| `lantern:delete` | Lanterns · Delete | delete and restore | 6, 7 | Owner, Admin |
| `lantern:export` | Lanterns · Export | the lanterns CSV | 2 | Owner, Admin, Accountant |
| `lantern:fuel_cost:read` | Lanterns · Fuel cost | see `fuel_cost` (else `null`) | 1, 2, 4 | Owner, Admin, Accountant |

### 1.5 Common to every route

| Item | Value |
| --- | --- |
| Base | `/api/v1/app` |
| Auth | `Authorization: Bearer <access token>`; the active organization comes from the token |
| Writes | every `POST` needs `X-Idempotency-Key`; `PATCH` takes an optional `expected_updated_at` (a stale save → `409 record_changed`) |
| Success | `200` with `{ data, meta }`; lists `{ data: [...], meta: { pagination: { per_page, next, has_more, estimated_total } } }`; `DELETE` → `204` |
| Lists | `limit` (1–100, default 25), `after`, `q` (1–200), `sort`, `order`, `created_from` / `created_to` (`to` exclusive) |
| Errors | `{ error: { type, code, reason?, detail, errors[] } }` — `400 invalid_field`, `401`, `403`, `404`, `409`, `422` idempotency key missing or reused |

### 1.6 Objects returned

| Object | Where |
| --- | --- |
| Lantern · Lantern fuel event · Lanterns export | 1.A.6 — Lanterns |
| Lantern inspection | 1.B.6 — Lantern inspections |

### 1.7 Routes

Every route of the sub-domain in one table; each nested sub-domain repeats its own with the details.

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | `/lanterns` | List lanterns | `lantern:read` | |
| 2 | GET | `/lanterns/exports` | The lanterns CSV **(new)** | `lantern:export` | |
| 3 | POST | `/lanterns` | Add a lantern | `lantern:create` | req |
| 4 | GET | `/lanterns/{lantern_id}` | Get one | `lantern:read` | |
| 5 | PATCH | `/lanterns/{lantern_id}` | Change it | `lantern:update` | |
| 6 | DELETE | `/lanterns/{lantern_id}` | Delete it with a reason | `lantern:delete` | |
| 7 | POST | `/lanterns/{lantern_id}/restore` | Undo a delete | `lantern:delete` | req |
| 8 | POST | `/lanterns/{lantern_id}/refuel` | Add fuel **(new)** | `lantern:update` | req |
| 9 | POST | `/lanterns/{lantern_id}/burn` | Use fuel **(new)** | `lantern:update` | req |
| 10 | GET | `/lantern-inspections` | Every inspection — the Inspections tab **(renamed)** | `lantern:read` | |
| 11 | GET | `/lanterns/{lantern_id}/inspections` | A lantern's inspections | `lantern:read` | |
| 12 | POST | `/lanterns/{lantern_id}/inspections` | Schedule one | `lantern:create` | req |
| 13 | GET | `/lanterns/{lantern_id}/inspections/{lantern_inspection_id}` | Get one **(moved)** | `lantern:read` | |
| 14 | PATCH | `/lanterns/{lantern_id}/inspections/{lantern_inspection_id}` | Change it while scheduled **(moved)** | `lantern:update` | |
| 15 | POST | `/lanterns/{lantern_id}/inspections/{lantern_inspection_id}/pass` | Passed | `lantern:update` | req |
| 16 | POST | `/lanterns/{lantern_id}/inspections/{lantern_inspection_id}/fail` | Failed, with a reason | `lantern:update` | req |
| 17 | POST | `/lanterns/{lantern_id}/inspections/{lantern_inspection_id}/cancel` | Cancelled | `lantern:update` | req |

### 1.8 Request details

In each nested sub-domain (1.A to 1.B, section .8).

### 1.9 Errors

Every route can answer the errors in 1.5; each route's own errors are in its nested sub-domain (1.A to 1.B, section .9).

### 1.10 Rules worth knowing

- A lantern's fuel moves only through routes 8 and 9 and a voyage's arrival (sub-domain 2) — each writes one fuel event.
- An inspection that is passed, failed or cancelled is final; a new one is scheduled instead.

### 1.11 Code changes (whole sub-domain)

| # | Change |
| --- | --- |
| LNC1 | LN1: rename `app.inspections` → `app.lantern_inspections` (init migration, Drizzle schema, indexes, constraints, RLS, the FORCE-RLS and purge lists); folders; nested routes; path ids in the param registry; prefixes `lant`, `linsp` |
| LNC2 | LN2: codes `lantern:read\|create\|update\|delete\|export` and `lantern:fuel_cost:read` (app permissions, catalog seed, role presets, the Roles matrix row with its Export column); drop `list:export` here; the hidden-field map in the lantern serializer |
| LNC3 | LN3: `branch_ids` and the branch filter in the base list |

### 1.12 Nested sub-domains

| Nested sub-domain | Folder (`src/domains/app/sub-domains/lanterns/…`) | Tables | Routes | Status |
| --- | --- | --- | --- | --- |
| 1.A Lanterns | folder root | `app.lanterns`, `app.lantern_branches`, `app.lantern_fuel_events` | 1–9 | awaiting your OK |
| 1.B Lantern inspections | `lantern-inspections/` | `app.lantern_inspections` | 10–17 | awaiting your OK |

---

### 1.A Lanterns — `lanterns/` (folder root) — awaiting your OK

#### 1.A.1 Decisions

| # | Decision |
| --- | --- |
| LN4 | **Fields**: `name` 1–80, unique among live lanterns in any case (`409 lantern_name_exists`); `kind` `oil` · `solar` · `electric`; `lantern_number` from the organization's counter, never reused ("L-1042"); `photo_file_key` a confirmed upload. Today a duplicate name is allowed and `kind` takes any text. |
| LN5 | **Fuel is a balance with a log**: `fuel_level` changes only by one guarded `UPDATE … SET fuel_level = fuel_level + $change WHERE fuel_level + $change BETWEEN 0 AND capacity`, in the same transaction as its `app.lantern_fuel_events` row — below zero → `409 not_enough_fuel`, above capacity → `409 over_capacity`. Events are never changed or deleted. Today `fuel_level` is a plain field any `PATCH` sets. |
| LN6 | **Delete** with a reason, then restore (`409 record_restore_conflict` when its name was reused meanwhile); a lantern a live voyage points at can't be deleted (`409 lantern_in_use`). |

#### 1.A.2 Open questions

None.

#### 1.A.3 Tables and relations

`app.lanterns`

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `lantern_number` | `integer` | no | counter | `> 0`; trigger `app.fn_assign_record_number` |
| `name` | `varchar(80)` | no | | trimmed, 1–80 |
| `kind` | `varchar(8)` | no | `'oil'` | `oil` · `solar` · `electric` |
| `capacity` | `numeric(8,3)` | no | | `> 0` |
| `fuel_level` | `numeric(8,3)` | no | `0` | `0 ≤ fuel_level ≤ capacity`; moved only with a fuel event (LN5) |
| `fuel_cost` | `numeric(12,2)` | yes | | `≥ 0`; shown only with `lantern:fuel_cost:read` |
| `keeper_membership_id` | `bigint` | yes | | → memberships `ON DELETE RESTRICT`; cleared when the keeper leaves |
| `photo_file_key` | `varchar(255)` | yes | | a confirmed upload |
| `is_active` | `boolean` | no | `true` | |

Indexes: unique `public_id`; unique `(organization_id, lantern_number)`; unique `(organization_id, lower(name)) WHERE deleted_at IS NULL`;
`WHERE deleted_at IS NULL`: `(organization_id, name, id)`, `(organization_id, created_at DESC, id)` — the two sorts; `(keeper_membership_id)`.
RLS: organization policy, enabled and forced. Branch: through `app.lantern_branches` (LN3).

`app.lantern_branches` (no public id): `lantern_id` → lanterns `ON DELETE CASCADE`, `branch_id` → branches `ON DELETE RESTRICT`,
`organization_id`; primary key `(lantern_id, branch_id)`; index `(branch_id, lantern_id)`. RLS: organization policy, enabled and forced.

`app.lantern_fuel_events` (append-only — no `updated_*` or soft-delete columns): `lantern_id` → lanterns `ON DELETE RESTRICT`;
`kind` `refuel` · `burn` · `voyage`; `quantity_change numeric(8,3)` `≠ 0`, `> 0` only for `refuel`; `fuel_level_after numeric(8,3)` `≥ 0`;
`voyage_id` → voyages `ON DELETE RESTRICT`, set exactly for `voyage`; `author_membership_id` → memberships `ON DELETE RESTRICT`.
Index `(lantern_id, created_at DESC, id)`. RLS: organization policy, enabled and forced.

#### 1.A.4 Permissions

| Code | Routes |
| --- | --- |
| `lantern:read` | 1, 4 |
| `lantern:export` | 2 |
| `lantern:create` | 3 |
| `lantern:update` | 5, 8, 9 |
| `lantern:delete` | 6, 7 |
| `lantern:fuel_cost:read` | the `fuel_cost` field on 1, 2, 4 |

#### 1.A.5 Common to every route

As 1.5.

#### 1.A.6 Objects returned

**Lantern**: `id` (`lant_…`), `lantern_number`, `name`, `kind`, `capacity`, `fuel_level`, `fuel_cost` (or null without the code), `keeper_membership_id`,
`branch_ids`, `photo_file_key`, `is_active`, `recent_fuel_events` (the last 5 Lantern fuel events), `created_at`, `updated_at`.

**Lantern fuel event**: `id`, `kind`, `quantity_change`, `fuel_level_after`, `voyage_id`, `author_membership_id`, `created_at`.

**Lanterns export** (route 2): `file_name` (`lanterns-YYYY-MM-DD.csv`), `content_type`, `row_count` (up to 5,000), `is_truncated`, `content`.

#### 1.A.7 Routes (1–9)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | `/lanterns` | List lanterns | `lantern:read` | |
| 2 | GET | `/lanterns/exports` | The lanterns CSV **(new)** | `lantern:export` | |
| 3 | POST | `/lanterns` | Add a lantern | `lantern:create` | req |
| 4 | GET | `/lanterns/{lantern_id}` | Get one | `lantern:read` | |
| 5 | PATCH | `/lanterns/{lantern_id}` | Change it | `lantern:update` | |
| 6 | DELETE | `/lanterns/{lantern_id}` | Delete it with a reason | `lantern:delete` | |
| 7 | POST | `/lanterns/{lantern_id}/restore` | Undo a delete | `lantern:delete` | req |
| 8 | POST | `/lanterns/{lantern_id}/refuel` | Add fuel **(new)** | `lantern:update` | req |
| 9 | POST | `/lanterns/{lantern_id}/burn` | Use fuel **(new)** | `lantern:update` | req |

#### 1.A.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 1 | `q` (name, number such as `L-1042`), `kind` (several), `branch_id` (several), `keeper_membership_id`, `is_active`, `sort` = `name` (default) \| `created_at`, `order`, `limit`, `after` | — | Lantern[] |
| 2 | as 1, without paging | — | Lanterns export |
| 3 | — | `name*`, `capacity*`; optional: `kind`, `fuel_cost`, `keeper_membership_id`, `photo_file_key`, `branch_ids` (up to 20, no repeats), `is_active` | Lantern |
| 4, 7 | — | — | Lantern |
| 5 | — | any field of 3 (never `fuel_level`); `expected_updated_at` | Lantern |
| 6 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |
| 8, 9 | — | `quantity*` (> 0); optional: `note` | Lantern |

#### 1.A.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 3, 5 | `400` · `name` / `capacity` / `branch_ids` | out of range, a repeat, or a branch not in the organization |
| 3, 5 | `409` · `lantern_name_exists` | a live lantern has the name (any case) |
| 5 | `400` · `capacity` | below the current `fuel_level` |
| 6 | `409` · `lantern_in_use` | a live voyage carries it |
| 7 | `409` · `record_not_deleted` / `record_restore_conflict` | it is live, or its name was reused |
| 8 | `409` · `over_capacity` | more than it holds |
| 9 | `409` · `not_enough_fuel` | more than is left |
| 4–9 | `404` | not in the organization, or not in your branches without `branch:read` |

#### 1.A.10 Rules worth knowing

None beyond 1.10.

#### 1.A.11 Code changes

| # | Change |
| --- | --- |
| LNC4 | LN4: the counter key `lanterns.lantern_number`; the live-name unique index (`409`); `kind` values in the DTO and a `CHECK`; `photo_file_key` confirmed through the upload service |
| LNC5 | LN5: new `app.lantern_fuel_events`; the guarded `UPDATE` in the lantern repository; routes 8–9; `fuel_level` out of the `PATCH` DTO; `recent_fuel_events` in the serializer |
| LNC6 | LN6: delete with a reason, restore, the in-use check; i18n keys for every new reason in `src/shared/locales/en/errors.json` |

---

### 1.B Lantern inspections — `lanterns/lantern-inspections/` — awaiting your OK

#### 1.B.1 Decisions

| # | Decision |
| --- | --- |
| LN7 | **Fields**: `inspection_date` (today or later when scheduled), `inspector_membership_id` (a live member), `report_file_key` (a confirmed upload, required to pass), `failure_reason` (1–280, required to fail). |
| LN8 | **Status by actions only**: `scheduled` → `passed` · `failed` · `cancelled` through routes 15–17, each final; anything else → `409 transition_not_allowed`. `PATCH` works only while `scheduled` (`409 inspection_closed`). Today `status` is a field `PATCH` sets to anything. |
| LN9 | **Due inspections become tasks**: the tasks sub-domain's rules worker (pull-based, one job per organization every 5 minutes, safe to repeat — one open task per inspection) opens an `inspection_due` task for the keeper when a scheduled inspection's date has passed, and closes it once the inspection is passed, failed or cancelled. Other option: a daily reminder message instead of a task. |

#### 1.B.2 Open questions

None.

#### 1.B.3 Tables and relations

`app.lantern_inspections`

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `lantern_id` | `bigint` | no | | → lanterns `ON DELETE RESTRICT` |
| `status` | `varchar(9)` | no | `'scheduled'` | `scheduled` · `passed` · `failed` · `cancelled` |
| `inspection_date` | `date` | no | | |
| `inspector_membership_id` | `bigint` | yes | | → memberships `ON DELETE RESTRICT` — a closed inspection keeps its inspector |
| `report_file_key` | `varchar(255)` | yes | | required when `passed` |
| `failure_reason` | `varchar(280)` | yes | | `(status = 'failed') = (failure_reason IS NOT NULL)` |
| `closed_at` | `timestamptz` | yes | | `(status = 'scheduled') = (closed_at IS NULL)` |

Indexes: unique `public_id`; `WHERE deleted_at IS NULL`: `(lantern_id, inspection_date DESC, id)` — a lantern's list;
`(organization_id, inspection_date DESC, id)` — the organization list; `(organization_id, inspection_date) WHERE status = 'scheduled'` — the rules worker.
RLS: organization policy, enabled and forced. Branch: through its lantern.

#### 1.B.4 Permissions

| Code | Routes |
| --- | --- |
| `lantern:read` | 10, 11, 13 |
| `lantern:create` | 12 |
| `lantern:update` | 14–17 |

#### 1.B.5 Common to every route

As 1.5.

#### 1.B.6 Objects returned

**Lantern inspection**: `id` (`linsp_…`), `lantern_id`, `status`, `inspection_date`, `inspector_membership_id`, `report_file_key`, `failure_reason`,
`closed_at`, `is_overdue` (derived), `created_at`, `updated_at`.

#### 1.B.7 Routes (10–17)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 10 | GET | `/lantern-inspections` | Every inspection — the Inspections tab **(renamed)** | `lantern:read` | |
| 11 | GET | `/lanterns/{lantern_id}/inspections` | A lantern's inspections | `lantern:read` | |
| 12 | POST | `/lanterns/{lantern_id}/inspections` | Schedule one | `lantern:create` | req |
| 13 | GET | `/lanterns/{lantern_id}/inspections/{lantern_inspection_id}` | Get one **(moved)** | `lantern:read` | |
| 14 | PATCH | `/lanterns/{lantern_id}/inspections/{lantern_inspection_id}` | Change it while scheduled **(moved)** | `lantern:update` | |
| 15 | POST | `/lanterns/{lantern_id}/inspections/{lantern_inspection_id}/pass` | Passed | `lantern:update` | req |
| 16 | POST | `/lanterns/{lantern_id}/inspections/{lantern_inspection_id}/fail` | Failed, with a reason | `lantern:update` | req |
| 17 | POST | `/lanterns/{lantern_id}/inspections/{lantern_inspection_id}/cancel` | Cancelled | `lantern:update` | req |

#### 1.B.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 10 | `lantern_id`, `status` (several), `inspector_membership_id`, `is_overdue`, `inspection_date_from` / `inspection_date_to` (inclusive), `sort` = `inspection_date` (default, newest first) \| `created_at`, `order`, `limit`, `after` | — | Lantern inspection[] |
| 11 | as 10, without `lantern_id` | — | Lantern inspection[] |
| 12 | — | `inspection_date*`; optional: `inspector_membership_id` | Lantern inspection |
| 13 | — | — | Lantern inspection |
| 14 | — | optional: `inspection_date`, `inspector_membership_id`; `expected_updated_at` | Lantern inspection |
| 15 | — | `report_file_key*` | Lantern inspection |
| 16 | — | `failure_reason*` | Lantern inspection |
| 17 | — | — | Lantern inspection |

#### 1.B.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 12, 14 | `400` · `inspection_date` | in the past |
| 12, 14 | `400` · `inspector_membership_id` | not a live member of the organization |
| 14 | `409` · `inspection_closed` | it is passed, failed or cancelled |
| 15–17 | `409` · `transition_not_allowed` | it is not scheduled |
| 15 | `400` · `report_file_key` | not a confirmed upload |
| 11–17 | `404` | the lantern or the inspection is not in the organization, or the inspection is another lantern's |

#### 1.B.10 Rules worth knowing

- The `inspection_due` rule (LN9) lives with the other task rules; this sub-domain only exposes what it reads (the scheduled-date index).

#### 1.B.11 Code changes

| # | Change |
| --- | --- |
| LNC7 | LN7, LN8: the action routes and their transition checks; `PATCH` only while scheduled; the two `CHECK`s; `is_overdue` in the serializer |
| LNC8 | LN9: the `inspection_due` rule in the tasks rules worker (one open task per inspection), its tests, and its row in the rule settings |

---

## 2. Voyages — rev 1 (YYYY-MM-DD) — nested sub-domains 2.A–2.B; awaiting your OK

Code: the **`voyages` sub-domain folder** — `app/sub-domains/voyages/` (the voyage at the folder root) with
`voyage-stops/`.

2.1 Decisions (whole sub-domain) · 2.2 Open questions · 2.3 Tables and relations · 2.4 Permissions · 2.5 Common to every route ·
2.6 Objects returned · 2.7 Routes · 2.8 Request details · 2.9 Errors · 2.10 Rules worth knowing · 2.11 Code changes (whole sub-domain) ·
2.12 Nested sub-domains · then **2.A Voyages · 2.B Voyage stops** — each with the same eleven sections.

A trip for one contact, on one branch, carrying one lantern. Route numbers run 1–14.

### 2.1 Decisions (whole sub-domain)

Taken on your standing answer "go with the recommendation" — change any of them before you confirm.

| # | Decision |
| --- | --- |
| VY1 | **Folder and names**: the sub-domain folder `voyages/`; stops are the voyage's own — `app.voyage_stops`, nested under `/voyages/{voyage_id}/stops`; the crew is a link table with no routes (`app.voyage_crew`). Prefixes `voy_`, `vstp_`. |
| VY2 | **One code set, in the Voyages row**: `voyage:read` · `create` · `update` · `delete` · `export`; `voyage:fare:read` shows `fare`, `paid_amount` and `due_amount`. Picking a traveller also needs `contact:read` (contacts). |
| VY3 | **Branch rule**: a voyage has one branch, fixed once created; lists filter to your branches, everything with `branch:read`. |
| VY4 | **Who travels is a contact** — `contact_id` → contacts `ON DELETE RESTRICT`, so a contact with a voyage can't be deleted. |
| VY5 | **Activity**: departing, arriving and cancelling each write a `system` entry in the contact's activity, linked to the voyage and shown only to callers who can read it. |
| VY6 | **Reminder**: a pull-based worker, one job per organization each hour, messages the contact on WhatsApp the day before departure at 09:00 organization time, through the mail-and-message outbox; `reminded_at` makes it safe to repeat. Other option: no reminder — the desk calls. |

### 2.2 Open questions

| # | Question | Options | Recommendation |
| --- | --- | --- | --- |
| VQ1 | May a voyage carry no lantern? | required · optional | required — the exclusion rule (VY8) needs it |

Until you answer, the plan follows the recommendation and every row that rests on it says so.

### 2.3 Tables and relations

| Table | Holds | Key rules |
| --- | --- | --- |
| `app.voyages` | one trip | number from a counter; status by actions (VY9); one lantern can't sail twice at once (VY8); soft delete + restore |
| `app.voyage_crew` | voyage ↔ membership | key (`voyage_id`, `membership_id`); written with the voyage |
| `app.voyage_stops` | the places a voyage calls at, in order | a branch or a contact's address, exactly one (VY11); changed only while planned |

```text
tenancy.organizations
   │
   └──< app.voyages ──┬──> app.branches · app.contacts (3.5) · app.lanterns (1)      where, who, what it carries
                      ├──> tenancy.memberships (captain)                            who leads it
                      ├──< app.voyage_crew >── tenancy.memberships                   who sails
                      └──< app.voyage_stops ──> app.branches | app.contacts           one of the two (VY11)
```

Pointing at these from other sub-domains: `lantern_fuel_events.voyage_id` (1), `contact_activities.voyage_id` (activity), the task source (tasks).

**PostgreSQL design**

The standard columns as 1.3. `CREATE EXTENSION IF NOT EXISTS btree_gist` for the exclusion constraint. Each table's design is in its nested sub-domain.

### 2.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `voyage:read` | Voyages · View | voyages and their stops | 1, 4, 11 | Owner, Admin, Front desk, Accountant |
| `voyage:create` | Voyages · Create | plan a voyage (+ `contact:read`) | 3 | Owner, Admin, Front desk |
| `voyage:update` | Voyages · Edit | change, depart, arrive, cancel; change the stops | 5, 8–10, 12–14 | Owner, Admin, Front desk |
| `voyage:delete` | Voyages · Delete | delete and restore | 6, 7 | Owner, Admin |
| `voyage:export` | Voyages · Export | the voyages CSV | 2 | Owner, Admin, Accountant |
| `voyage:fare:read` | Voyages · Fare | see the money fields (else `null`) | 1, 2, 4 | Owner, Admin, Accountant |

### 2.5 Common to every route

As 1.5.

### 2.6 Objects returned

| Object | Where |
| --- | --- |
| Voyage · Voyages export | 2.A.6 — Voyages |
| Voyage stop | 2.B.6 — Voyage stops |

### 2.7 Routes

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | `/voyages` | List voyages | `voyage:read` | |
| 2 | GET | `/voyages/exports` | The voyages CSV | `voyage:export` | |
| 3 | POST | `/voyages` | Plan a voyage | `voyage:create` | req |
| 4 | GET | `/voyages/{voyage_id}` | Get one | `voyage:read` | |
| 5 | PATCH | `/voyages/{voyage_id}` | Change it while planned | `voyage:update` | |
| 6 | DELETE | `/voyages/{voyage_id}` | Delete a planned or cancelled voyage | `voyage:delete` | |
| 7 | POST | `/voyages/{voyage_id}/restore` | Undo a delete | `voyage:delete` | req |
| 8 | POST | `/voyages/{voyage_id}/depart` | Sail **(new)** | `voyage:update` | req |
| 9 | POST | `/voyages/{voyage_id}/arrive` | Arrive — burns the lantern's fuel **(new)** | `voyage:update` | req |
| 10 | POST | `/voyages/{voyage_id}/cancel` | Cancel with a reason **(new)** | `voyage:update` | req |
| 11 | GET | `/voyages/{voyage_id}/stops` | Its stops, in order | `voyage:read` | |
| 12 | POST | `/voyages/{voyage_id}/stops` | Add a stop | `voyage:update` | req |
| 13 | PATCH | `/voyages/{voyage_id}/stops/{voyage_stop_id}` | Change or move a stop | `voyage:update` | |
| 14 | DELETE | `/voyages/{voyage_id}/stops/{voyage_stop_id}` | Remove a stop | `voyage:update` | |

### 2.8 Request details

In each nested sub-domain (2.A to 2.B, section .8).

### 2.9 Errors

Every route can answer the errors in 1.5; each route's own errors are in its nested sub-domain (2.A to 2.B, section .9).

### 2.10 Rules worth knowing

- **Arriving writes into sub-domain 1 through its service**, in the same transaction: the lanterns service burns `fuel_used` and writes a `voyage` fuel event (1.A, LN5) — never the voyage repository touching lantern tables. Not enough fuel → `409 not_enough_fuel` and nothing is saved.
- Money: `paid_amount` is kept by the payments sub-domain's writes (a payment may name the voyage), `due_amount` is generated.

### 2.11 Code changes (whole sub-domain)

| # | Change |
| --- | --- |
| VYC1 | VY1: new tables `app.voyages`, `app.voyage_crew`, `app.voyage_stops` in the init migration (scratch database — no new migration file); Drizzle schemas; RLS and FORCE-RLS lists; prefixes `voy`, `vstp`; path ids in the param registry; the OpenAPI tag `Voyage` |
| VYC2 | VY2: codes `voyage:*` and `voyage:fare:read` (app permissions, catalog seed, presets, the matrix row); the money fields hidden without it |
| VYC3 | VY3, VY4: branch filter and fixed branch; `contact:read` checked on create; `ON DELETE RESTRICT` from voyages to contacts |
| VYC4 | VY5: `system` activity entries for depart, arrive, cancel; `contact_activities.voyage_id` and its `num_nonnulls` check |
| VYC5 | VY6: the reminder worker under `voyages/workers/` (registered in the queue bootstrap and scheduler, DLQ, a test that a repeat sends nothing twice); `reminded_at`; the message template key in i18n |
| VYC6 | Seeds: reference — none; bulk — voyages per branch with stops (`voyages/seed/`); the route catalog, success statuses and OpenAPI examples regenerated |

### 2.12 Nested sub-domains

| Nested sub-domain | Folder (`src/domains/app/sub-domains/voyages/…`) | Tables | Routes | Status |
| --- | --- | --- | --- | --- |
| 2.A Voyages | folder root | `app.voyages`, `app.voyage_crew` | 1–10 | awaiting your OK |
| 2.B Voyage stops | `voyage-stops/` | `app.voyage_stops` | 11–14 | awaiting your OK |

---

### 2.A Voyages — `voyages/` (folder root) — awaiting your OK

#### 2.A.1 Decisions

| # | Decision |
| --- | --- |
| VY7 | **Fields**: `voyage_number` from the organization's counter ("V-1042"); `departs_at` < `arrives_at`; `fare` ≥ 0; `captain_membership_id` and `crew_membership_ids` (up to 10, live members); `fuel_used` (> 0, ≤ the lantern's capacity). |
| VY8 | **One lantern, one voyage at a time**: `sailing_period` is generated from `departs_at` and `arrives_at`; `EXCLUDE USING gist (lantern_id WITH =, sailing_period WITH &&) WHERE (deleted_at IS NULL AND status <> 'cancelled')` → `409 lantern_busy` naming the other voyage. |
| VY9 | **Status by actions only**: `planned` → `sailing` (depart) → `arrived` (arrive); `planned` or `sailing` → `cancelled` (cancel, with a reason); anything else → `409 transition_not_allowed`. `PATCH` only while `planned`. |
| VY10 | **Delete** a planned or cancelled voyage with a reason (`409 voyage_sailed` otherwise), then restore; its stops go and come back with it. |

#### 2.A.2 Open questions

VQ1 (2.2) — whether the lantern is required.

#### 2.A.3 Tables and relations

`app.voyages`

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `voyage_number` | `integer` | no | counter | `> 0`; trigger `app.fn_assign_record_number` |
| `branch_id` | `bigint` | no | | → branches `ON DELETE RESTRICT`; fixed |
| `contact_id` | `bigint` | no | | → contacts `ON DELETE RESTRICT` |
| `lantern_id` | `bigint` | no | | → lanterns `ON DELETE RESTRICT` (VQ1 pending) |
| `captain_membership_id` | `bigint` | yes | | → memberships `ON DELETE RESTRICT`; cleared from planned voyages when the captain leaves |
| `status` | `varchar(9)` | no | `'planned'` | `planned` · `sailing` · `arrived` · `cancelled` |
| `departs_at`, `arrives_at` | `timestamptz` | no | | `departs_at < arrives_at` |
| `sailing_period` | `tstzrange` | | generated | `tstzrange(departs_at, arrives_at)`, stored |
| `fuel_used` | `numeric(8,3)` | no | | `> 0` |
| `fare` | `numeric(12,2)` | no | `0` | `≥ 0` |
| `paid_amount` | `numeric(12,2)` | no | `0` | `0 ≤ paid_amount ≤ fare`; kept by the payment writes |
| `due_amount` | `numeric(12,2)` | | generated | `fare − paid_amount`, stored |
| `cancel_reason` | `varchar(280)` | yes | | `(status = 'cancelled') = (cancel_reason IS NOT NULL)` |
| `reminded_at` | `timestamptz` | yes | | set by the reminder worker (VY6) |

Constraints and indexes: unique `public_id`; unique `(organization_id, voyage_number)`; the exclusion constraint (VY8);
`WHERE deleted_at IS NULL`: `(organization_id, departs_at DESC, id)`, `(branch_id, departs_at)`, `(contact_id, departs_at DESC, id)`,
`(organization_id, departs_at) WHERE status = 'planned' AND reminded_at IS NULL` — the reminder worker.
RLS: organization policy, enabled and forced. Branch: application filter on `branch_id`.

`app.voyage_crew` (no public id): `voyage_id` → voyages `ON DELETE CASCADE`, `membership_id` → memberships `ON DELETE RESTRICT`,
`organization_id`, `created_at`; primary key `(voyage_id, membership_id)`; index `(membership_id, voyage_id)`. RLS: organization policy, enabled and forced.

#### 2.A.4 Permissions

| Code | Routes |
| --- | --- |
| `voyage:read` | 1, 4 |
| `voyage:export` | 2 |
| `voyage:create` (+ `contact:read`) | 3 |
| `voyage:update` | 5, 8–10 |
| `voyage:delete` | 6, 7 |
| `voyage:fare:read` | the money fields on 1, 2, 4 |

#### 2.A.5 Common to every route

As 1.5.

#### 2.A.6 Objects returned

**Voyage**: `id` (`voy_…`), `voyage_number`, `branch_id`, `contact` (`{ id, name, primary_phone }`), `lantern_id`, `captain_membership_id`,
`crew_membership_ids`, `status`, `departs_at`, `arrives_at`, `fuel_used`, `fare`, `paid_amount`, `due_amount` (the three money fields null without
`voyage:fare:read`), `cancel_reason`, `stop_count`, `created_at`, `updated_at`.

**Voyages export** (route 2): as the lanterns export (1.A.6), `voyages-YYYY-MM-DD.csv`.

#### 2.A.7 Routes (1–10)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | `/voyages` | List voyages | `voyage:read` | |
| 2 | GET | `/voyages/exports` | The voyages CSV | `voyage:export` | |
| 3 | POST | `/voyages` | Plan a voyage | `voyage:create` | req |
| 4 | GET | `/voyages/{voyage_id}` | Get one | `voyage:read` | |
| 5 | PATCH | `/voyages/{voyage_id}` | Change it while planned | `voyage:update` | |
| 6 | DELETE | `/voyages/{voyage_id}` | Delete a planned or cancelled voyage | `voyage:delete` | |
| 7 | POST | `/voyages/{voyage_id}/restore` | Undo a delete | `voyage:delete` | req |
| 8 | POST | `/voyages/{voyage_id}/depart` | Sail **(new)** | `voyage:update` | req |
| 9 | POST | `/voyages/{voyage_id}/arrive` | Arrive — burns the lantern's fuel **(new)** | `voyage:update` | req |
| 10 | POST | `/voyages/{voyage_id}/cancel` | Cancel with a reason **(new)** | `voyage:update` | req |

#### 2.A.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 1 | `q` (number such as `V-1042`, the contact's name), `status` (several), `branch_id` (several), `contact_id`, `lantern_id`, `captain_membership_id`, `has_due`, `departs_from` / `departs_to` (inclusive), `sort` = `departs_at` (default, newest first) \| `created_at` \| `due_amount`, `order`, `limit`, `after` | — | Voyage[] |
| 2 | as 1, without paging | — | Voyages export |
| 3 | — | `branch_id*` (one of yours), `contact_id*`, `lantern_id*`, `departs_at*`, `arrives_at*`, `fuel_used*`; optional: `fare`, `captain_membership_id`, `crew_membership_ids` | Voyage |
| 4, 7 | — | — | Voyage |
| 5 | — | any field of 3 except `branch_id`; `expected_updated_at` | Voyage |
| 6 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |
| 8, 9 | — | — | Voyage |
| 10 | — | `cancel_reason*` (1–280) | Voyage |

#### 2.A.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 3 | `403` | no `contact:read` |
| 3, 5 | `400` · `departs_at` / `arrives_at` | departure not before arrival |
| 3, 5 | `400` · `contact_id` / `lantern_id` / `crew_membership_ids` | not live in the organization, or more than 10 crew |
| 3, 5 | `409` · `lantern_busy` | the lantern sails on another voyage in that period (VY8) |
| 5 | `400` · `branch_id` | the branch changes |
| 5 | `409` · `voyage_not_planned` | it has sailed or was cancelled |
| 6 | `409` · `voyage_sailed` | it is sailing or arrived |
| 8–10 | `409` · `transition_not_allowed` | not allowed from its status |
| 9 | `409` · `not_enough_fuel` | the lantern holds less than `fuel_used` |
| 7 | `409` · `record_not_deleted` | it is live |
| 4–10 | `404` | not in the organization, or another branch without `branch:read` |

#### 2.A.10 Rules worth knowing

None beyond 2.10.

#### 2.A.11 Code changes

| # | Change |
| --- | --- |
| VYC7 | VY7, VY8: the counter key `voyages.voyage_number`; the generated `sailing_period` and the exclusion constraint mapped to `409 lantern_busy`; crew through `app.voyage_crew` |
| VYC8 | VY9, VY10: the action routes and transitions; delete and restore with the stops; arrive calling the lanterns service in one transaction |

---

### 2.B Voyage stops — `voyages/voyage-stops/` — awaiting your OK

#### 2.B.1 Decisions

| # | Decision |
| --- | --- |
| VY11 | **A stop is a branch or a contact's address — exactly one**: typed nullable links `branch_id` and `contact_id` with `CHECK (num_nonnulls(branch_id, contact_id) = 1)`, instead of a `place_type` + `place_id` pair the database can't check. |
| VY12 | **Order and lifecycle**: `stop_number` 1–20, unique per voyage, renumbered by the server on add, move and remove. Stops change only while the voyage is `planned` (`409 voyage_not_planned`). A removed stop is **deleted, not soft-deleted** — it is part of an unsailed plan with nothing pointing at it, and it goes with its voyage's own delete (VY10) — the one exception to soft delete in the sub-domain. |

#### 2.B.2 Open questions

None.

#### 2.B.3 Tables and relations

`app.voyage_stops` (no soft-delete columns — VY12)

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `voyage_id` | `bigint` | no | | → voyages `ON DELETE CASCADE` |
| `stop_number` | `smallint` | no | | 1–20; unique `(voyage_id, stop_number)` `DEFERRABLE INITIALLY DEFERRED` (renumbering) |
| `branch_id` | `bigint` | yes | | → branches `ON DELETE RESTRICT` |
| `contact_id` | `bigint` | yes | | → contacts `ON DELETE RESTRICT`; `num_nonnulls(branch_id, contact_id) = 1` |
| `arrives_at` | `timestamptz` | yes | | inside the voyage's period (checked in the service) |
| `note` | `varchar(280)` | yes | | |

Indexes: unique `public_id`; unique `(voyage_id, stop_number)`; `WHERE … IS NOT NULL`: `(branch_id)`, `(contact_id)`.
RLS: organization policy, enabled and forced. Branch: through its voyage.

#### 2.B.4 Permissions

| Code | Routes |
| --- | --- |
| `voyage:read` | 11 |
| `voyage:update` | 12–14 |

#### 2.B.5 Common to every route

As 1.5.

#### 2.B.6 Objects returned

**Voyage stop**: `id` (`vstp_…`), `voyage_id`, `stop_number`, `branch_id`, `contact_id`, `arrives_at`, `note`, `created_at`, `updated_at`.

#### 2.B.7 Routes (11–14)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 11 | GET | `/voyages/{voyage_id}/stops` | Its stops, in order | `voyage:read` | |
| 12 | POST | `/voyages/{voyage_id}/stops` | Add a stop | `voyage:update` | req |
| 13 | PATCH | `/voyages/{voyage_id}/stops/{voyage_stop_id}` | Change or move a stop | `voyage:update` | |
| 14 | DELETE | `/voyages/{voyage_id}/stops/{voyage_stop_id}` | Remove a stop | `voyage:update` | |

#### 2.B.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 11 | — (never more than 20, no paging) | — | Voyage stop[] |
| 12 | — | `branch_id` or `contact_id` (exactly one); optional: `stop_number` (default last), `arrives_at`, `note` | Voyage stop |
| 13 | — | optional: `stop_number`, `arrives_at`, `note` (the place can't change — remove and add); `expected_updated_at` | Voyage stop |
| 14 | — | — | 204 |

#### 2.B.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 12 | `400` · `branch_id` / `contact_id` | neither or both, or not live in the organization |
| 12 | `422` · `too_many_stops` | the voyage already has 20 |
| 12, 13 | `400` · `arrives_at` | outside the voyage's period |
| 12–14 | `409` · `voyage_not_planned` | the voyage has sailed or was cancelled |
| 11–14 | `404` | the voyage or the stop is not in the organization, or the stop is another voyage's |

#### 2.B.10 Rules worth knowing

None beyond 2.10.

#### 2.B.11 Code changes

| # | Change |
| --- | --- |
| VYC9 | VY11, VY12: the table with its `num_nonnulls` check and deferrable order key; renumbering in the stop service; hard delete with the planned-only guard; `stop_count` on the voyage |
| VYC10 | Tests: unit (validators, serializers, the renumbering), integration (every route's success and each error above), RLS (another organization's voyage is a `404`), the `test:rls-role` lane; `pnpm routes:catalog`, `validate:route-success-statuses`, `docs:generate` |

---

## Before you hand a sub-domain over for its OK

- Every table row has its header's number of columns; every sub-domain has sections 1–12 and every nested sub-domain 1–11.
- No decision or code-change id is used twice, and every id the text cites exists.
- The route numbers run without gaps; the sub-domain's count matches the sub-domains table and the app total.
- Every route has a gate and an Idem cell; every `POST` is `req`.
- Every table states its RLS, its branch rule and every membership pointer's `ON DELETE`.
- `plans/route-changes.md`, `plans/db-changes.md` and `plans/worker-changes.md` say the same as the sub-domain.
