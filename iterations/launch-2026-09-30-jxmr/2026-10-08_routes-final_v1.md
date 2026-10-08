# Clinozy API — final routes, module by module

Started 2026-10-08 from the code on `feat/clinic-launch-api` (commit `e15117b`). Each module is
finalized one at a time: **proposed** → your changes → **final** only after you confirm in chat. The earlier full dump stays in
`2026-10-07_routes-by-module_v1.md`.

How to read the tables: paths are under `/api/v1/app`; `{x_id}` is a public id; **Gate** is the
permission the caller needs; **Idem** `req` = `X-Idempotency-Key` header required; `*` = required.
Every paginated list also takes `limit` (1–100) and `after` (cursor), plus `created_from` / `created_to`.

## Modules (in build order — each builds on the ones above it)

| # | Module | Paths (`/app/…`) | Routes | Builds on | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Branches & places | `branches` (+ `my`, `rooms`, `machines`, `holidays`) | 25 | organization, team | **proposed (rev 3) — awaiting your OK** |
| 2 | Team | `users` (+ tenancy memberships, roles, invitations) | 19 | 1 | **proposed** |
| 3 | Offerings | `offering-groups`, `offerings`, `offers` | 19 | 1, 2 | pending |
| 4 | Leads & conversations | `leads`, `messages`, `message-templates`, `contacts` | 24 | 1, 2 | pending |
| 5 | Patients | `patients` (+ `timeline`), `searches` | 9 | 1, 2, 4 | pending |
| 6 | Appointments & visits | `appointments` (+ `slots`, `daily-counts`), `visits` | 20 | 1, 2, 3, 5 | pending |
| 7 | Patient file | `diagnoses`, `patient-clinical-notes`, `prescriptions`, `prescription-kits`, `patient-images`, `patient-reports`, `patient-notes`, `patient-ideas` | 43 | 5, 6 | pending |
| 8 | Treatments & feedback | `treatments`, `check-ins`, `reviews`, `feedback-actions` | 24 | 5, 6, 9 | pending |
| 9 | Packages & plan | `patient-packages`, `offering-suggestions` | 12 | 3, 5 | pending |
| 10 | Billing | `invoices`, `payments`, `payment-edits`, `credit-notes`, `pending-credits`, `day-closes`, `day-close-events` | 28 | 1, 3, 5, 9 | pending |
| 11 | Medical store | `manufacturers`, `suppliers`, `medical-reps`, `medical-rep-visits`, `medicines`, `medical-purchase-orders`, `medical-contacts`, `medical-sales`, `supplier-credits` | 58 | 5, 7, 10 | pending |
| 12 | Stock | `stock-vendors`, `stock-items`, `stock-movements`, `stock-counts`, `stock-purchases` | 28 | 1, 10 | pending |
| 13 | Tasks & rules | `tasks`, `task-owner-changes`, `task-rule-settings` | 11 | 2, 4, 5, 6 | pending |
| 14 | Personal | `user-preferences`, `saved-views` | 8 | 1 | pending |
| — | Platform (outside `/app`, already shipped) | auth 33 · users/me 20 · tenancy 41 · billing 13 · notify 14 · uploads 4 · audit 1 · mcp 2 | 128 | — | review last |

App total: **310 routes** (rows #68–#72 not built yet; their routes land in modules 6, 10, 11, 12, 13).

---

## 1. Branches & places — proposed (rev 3, 2026-10-08) — awaiting your OK

### Decisions (your answers so far)

| # | Decision |
| --- | --- |
| D1 | Two reads, as built: `GET /branches` — every branch, full details, needs `branch:read`; `GET /branches/my` — **every signed-in member**, right after login: the active branches they work in (a `branch:read` holder gets every active branch). No `scope` parameter. |
| D2 | Who works where stays writable from both sides — `PUT /branches/{branch_id}/user-accesses` (branch side) and `branch_ids` on the membership (staff side). Both write the one link table. |
| D3 | Branches are never deleted — `PATCH … { is_active: false }` retires one. Rooms, machines and holidays soft-delete and restore. |
| D4 | No cross-branch room / machine list — a picker covering several branches calls the per-branch list once per branch (clinics have few branches). |
| D5 | Read gates unchanged: rooms, machines and holidays readable by every member; the full branch list needs `branch:read`. |
| D6 | Holidays live only under their branch: `/branches/{branch_id}/holidays` and `/branches/{branch_id}/holidays/{branch_holiday_id}` — the top-level `/branch-holidays/…` paths go. Nothing else references a holiday, so it never needs its own top-level address. |
| D7 | Rooms and machines nest the same way: `/branches/{branch_id}/rooms/{room_id}` and `/branches/{branch_id}/machines/{machine_id}` — the top-level `/rooms/…` and `/machines/…` paths go. A room or machine never moves branch; an appointment carries `branch_id` next to `room_id` / `machine_id`, so the caller always has both ids. |

### Common to every route

| Item | Value |
| --- | --- |
| Base | `/api/v1/app` |
| Auth | `Authorization: Bearer <access token>`; the active organization comes from the token (no organization id in the path) |
| Writes | `POST` creates/actions need `X-Idempotency-Key` (column **Idem**); `PATCH` takes an optional `expected_updated_at` (a stale save → 409) |
| Success | `200` with `{ data, meta }`; lists `{ data: [...], meta: { pagination: { per_page, next, has_more, estimated_total } } }`; `DELETE` → `204` |
| Errors | `{ error: { type, code, reason?, detail, errors[] } }` — `400 invalid_field` (with `errors[].field`), `401` not signed in, `403` missing permission, `404` not found or not in the caller's branches, `409` conflict (`code` + `reason` below; a unique clash has no `reason`, its message names it), `422` idempotency key missing or reused |
| Branch visibility | a member without `branch:read` sees only the branches given to them (`user-accesses`); anything in another branch is a `404` |

### Objects returned

**Branch**

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | `brn_…` |
| `name` | string | unique in the organization |
| `tone` | string | chip colour (default `sage`) |
| `is_main` | boolean | at most one main branch |
| `address_line_one`, `address_line_two`, `area`, `city`, `state`, `postal_code` | string (`address_line_two` nullable) | `state` default `Gujarat`; `postal_code` six digits |
| `phone`, `email` | string | phone `+91` + 10 digits |
| `gst_number` | string \| null | GSTIN |
| `opens_at`, `closes_at` | string `HH:mm` | default `10:00` – `20:00`; closes after opens |
| `working_days` | string[] | `mon` … `sun`; default Monday–Saturday |
| `default_doctor_membership_id`, `default_front_desk_membership_id`, `default_therapist_membership_id`, `default_pharmacist_membership_id` | string \| null | team member ids |
| `is_active` | boolean | |
| `maps_link`, `review_link` | string \| null | HTTPS only |
| `created_at`, `updated_at` | ISO datetime | |

**Branch summary** (`/branches/my`): `id`, `name`, `tone`, `is_main`, `opens_at`, `closes_at`, `working_days` — what a picker and the booking rules need.

**Room** / **Machine**: `id` (`room_…` / `mach_…`), `branch_id`, `name` (1–60, unique in the branch), `is_active`, `created_at`, `updated_at`.

**Branch holiday**: `id` (`bhol_…`), `branch_id`, `holiday_date` (`YYYY-MM-DD`, one per branch per date), `label` (1–60), `created_at`, `updated_at`.

**Branch access**: `membership_id`, `created_at`.

### Routes (25)

Everything a branch owns sits under the branch.

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | `/branches` | List every branch (management) | `branch:read` | |
| 2 | GET | `/branches/my` | The caller's branches (after login, pickers) | any member | |
| 3 | POST | `/branches` | Create a branch | `branch:create` | req |
| 4 | GET | `/branches/{branch_id}` | Get a branch | `branch:read` | |
| 5 | PATCH | `/branches/{branch_id}` | Change a branch (or retire: `is_active=false`) | `branch:update` | |
| 6 | GET | `/branches/{branch_id}/user-accesses` | Who works at the branch | `branch:update` | |
| 7 | PUT | `/branches/{branch_id}/user-accesses` | Replace who works at the branch | `branch:update` | |
| 8 | GET | `/branches/{branch_id}/rooms` | List the branch's rooms | any member | |
| 9 | POST | `/branches/{branch_id}/rooms` | Add a room | `room:create` | req |
| 10 | GET | `/branches/{branch_id}/rooms/{room_id}` | Get a room **(moved)** | any member | |
| 11 | PATCH | `/branches/{branch_id}/rooms/{room_id}` | Change a room **(moved)** | `room:update` | |
| 12 | DELETE | `/branches/{branch_id}/rooms/{room_id}` | Delete a room **(moved)** | `room:delete` | |
| 13 | POST | `/branches/{branch_id}/rooms/{room_id}/restore` | Undo a delete **(moved)** | `room:delete` | req |
| 14 | GET | `/branches/{branch_id}/machines` | List the branch's machines | any member | |
| 15 | POST | `/branches/{branch_id}/machines` | Add a machine | `machine:create` | req |
| 16 | GET | `/branches/{branch_id}/machines/{machine_id}` | Get a machine **(moved)** | any member | |
| 17 | PATCH | `/branches/{branch_id}/machines/{machine_id}` | Change a machine **(moved)** | `machine:update` | |
| 18 | DELETE | `/branches/{branch_id}/machines/{machine_id}` | Delete a machine **(moved)** | `machine:delete` | |
| 19 | POST | `/branches/{branch_id}/machines/{machine_id}/restore` | Undo a delete **(moved)** | `machine:delete` | req |
| 20 | GET | `/branches/{branch_id}/holidays` | List the branch's holidays | any member | |
| 21 | POST | `/branches/{branch_id}/holidays` | Add a holiday | `branch_holiday:create` | req |
| 22 | GET | `/branches/{branch_id}/holidays/{branch_holiday_id}` | Get a holiday **(moved)** | any member | |
| 23 | PATCH | `/branches/{branch_id}/holidays/{branch_holiday_id}` | Change a holiday **(moved)** | `branch_holiday:update` | |
| 24 | DELETE | `/branches/{branch_id}/holidays/{branch_holiday_id}` | Delete a holiday **(moved)** | `branch_holiday:delete` | |
| 25 | POST | `/branches/{branch_id}/holidays/{branch_holiday_id}/restore` | Undo a delete **(moved)** | `branch_holiday:delete` | req |

"any member" = `organization:read`, which every role holds. A room, machine or holiday id under the
wrong branch is a `404`.

### Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 1 | `include_inactive` = `true` \| `false` (default `false`) | — | Branch[] — main first, then by name; not paginated |
| 2 | — | — | Branch summary[] — active only, main first, then by name; not paginated |
| 3 | — | `name*` (1–60), `address_line_one*` (1–120), `area*`, `city*` (1–60), `postal_code*` (6 digits), `phone*`, `email*`; optional: `tone`, `is_main`, `address_line_two`, `state`, `gst_number`, `opens_at`, `closes_at`, `working_days`, `default_*_membership_id` (×4), `is_active`, `maps_link`, `review_link` | Branch |
| 4 | — | — | Branch |
| 5 | — | any field of #3 (at least one) | Branch |
| 6 | — | — | Branch access[] |
| 7 | — | `membership_ids*` (0–500 team member ids; the full list) | Branch access[] |
| 8, 14 | `is_active`, `q` (name), `sort` = `created_at` \| `name`, `order`, `limit`, `after` | — | Room[] / Machine[] (paginated) |
| 9, 15 | — | `name*` (1–60), `is_active` (default `true`) | Room / Machine |
| 10, 16 | — | — | Room / Machine |
| 11, 17 | — | `name`, `is_active`, `expected_updated_at` | Room / Machine |
| 12, 18, 24 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |
| 13, 19, 25 | — | — | the restored record |
| 20 | `holiday_date_from`, `holiday_date_to`, `q` (label), `sort` = `holiday_date` (default, ascending) \| `created_at`, `order`, `limit`, `after` | — | Branch holiday[] (paginated) |
| 21 | — | `holiday_date*`, `label*` (1–60) | Branch holiday |
| 22 | — | — | Branch holiday |
| 23 | — | `holiday_date`, `label`, `expected_updated_at` | Branch holiday |

### Errors specific to this module

| Route | Status · reason | When |
| --- | --- | --- |
| 3, 5 | `409` · `conflict` (message: name taken) | another branch already has the name |
| 3, 5 | `409` · `conflict` (message: only one main branch) | `is_main=true` while another branch is main |
| 3, 5 | `400` · `closes_at` | closing time not after opening time |
| 3, 5 | `400` · `default_*_membership_id` | the team member is not in the organization |
| 7 | `400` · `membership_ids` | an id is not a team member of the organization |
| 9, 11, 15, 17 | `409` · `conflict` (message: record already exists) | the name is taken in that branch |
| 21, 23 | `409` · `conflict` (message: record already exists) | the branch already has a holiday on that date |
| 11, 17, 23 | `409` · `record_changed` | `expected_updated_at` is older than the record |
| 13, 19, 25 | `409` · `record_not_deleted` / `record_restore_conflict` | the record is live, or its name / date was reused meanwhile |
| any by-id | `404` | not in the organization, under another branch, or in a branch the caller cannot see |

### Rules worth knowing

- `/branches/my` returns the branches given to the caller; a caller holding `branch:read` gets every active branch (D9).
- Branch hours, working days and holidays drive appointment slots (module 6); a retired branch (`is_active=false`) takes no bookings.
- Deleting a room or machine does not touch past appointments that named it.

### Code changes this would need (not built — the code is frozen)

| # | Change |
| --- | --- |
| C1 | `GET /branches` and `GET /branches/my` stay as built — no change |
| C2 | Move room get / change / delete / restore from `/rooms/{room_id}` to `/branches/{branch_id}/rooms/{room_id}` |
| C3 | Move machine get / change / delete / restore from `/machines/{machine_id}` to `/branches/{branch_id}/machines/{machine_id}` |
| C4 | Move holiday get / change / delete / restore from `/branch-holidays/{branch_holiday_id}` to `/branches/{branch_id}/holidays/{branch_holiday_id}` |
| C5 | The by-id routes check the record belongs to the branch in the path (else `404`) |
| C6 | Drop the redundant `branch_ids` filter from the per-branch room, machine and holiday lists |
| C7 | Show `include_inactive` on `GET /branches` in OpenAPI |

---

## 2. Team — proposed

The team lives in the tenancy domain (shared by every product built on this backend); the app adds
one picker list. A team member's id everywhere in the app (`doctor_membership_id`,
`owner_membership_id`, …) is the **membership id** (`mbr_…`).

### Tables

| Table | Holds |
| --- | --- |
| `tenancy.memberships` | one person in the organization: `status` (`INVITED` · `ACTIVE` · `SUSPENDED`), staff number, phone, tone, working days, work hours, commission % |
| `tenancy.member_roles` + role permissions | roles (system or custom, `tone`, `is_locked`) and their permission codes |
| membership roles | a member holds one or more roles |
| `app.branch_user_accesses` | which branches a member works at (module 1) |
| invitations | the pending invite of an `INVITED` member (expiry, resend) |

### Connected to

Every `*_membership_id` column in the app (appointments, leads, tasks, treatments, prescriptions,
branches' default staff, offerings' default doctor, messages' author). Roles decide every
permission gate in every module. Working days feed appointment slots (module 6).

### Routes (19)

| # | Method | Path (`/api/v1/…`) | Purpose | Gate | Idem | Query / body |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | GET | `/app/users` | Team picker (doctors, therapists, staff) — active members only | any member | | `q` (name / email), `role_id`, `branch_id` |
| 2 | GET | `/tenancy/organization/memberships` | Team management list (all statuses) | `membership:read` | | `q`, `sort`, `order`, `limit`, `after` |
| 3 | POST | `/tenancy/organization/memberships` | Add a member by email (sends the invite) | `membership:manage` | req | `email*`, `role_ids*`, `expires_in_days*`, `phone`, `tone`, `branch_ids`, `working_days`, `work_starts_at`, `work_ends_at`, `commission_percent` |
| 4 | GET | `/tenancy/organization/memberships/{membership_id}` | Get a member | `membership:read` | | — |
| 5 | PATCH | `/tenancy/organization/memberships/{membership_id}` | Change roles, branches, hours, status | `membership:manage` | | `status`, `role_ids`, `phone`, `tone`, `branch_ids`, `working_days`, `work_starts_at`, `work_ends_at`, `commission_percent` |
| 6 | DELETE | `/tenancy/organization/memberships/{membership_id}` | Remove a member | `membership:manage` | | — |
| 7 | POST | `/tenancy/organization/memberships/{membership_id}/restore` | Undo a removal | `membership:manage` | | — |
| 8 | GET | `/tenancy/organization/memberships/{membership_id}/permissions` | A member's effective permission codes | `membership:read` | | — |
| 9 | DELETE | `/tenancy/organization/invitations/{invitation_id}` | Revoke a pending invite | `invitation:manage` | | — |
| 10 | POST | `/tenancy/organization/invitations/{invitation_id}/resend` | Resend an invite | `invitation:manage` | | `expires_in_days*` |
| 11 | POST | `/tenancy/invitations/{invitation_id}/accept` | The invitee accepts | signed in | | `token*` |
| 12 | GET | `/tenancy/organization/roles` | List roles (with member counts) | `role:read` | | `q`, `sort`, `order`, `limit`, `after` |
| 13 | POST | `/tenancy/organization/roles` | Create a role (optionally copy another) | `role:manage` | req | `name*`, `description`, `tone`, `permission_codes`, `copy_from_role_id` |
| 14 | GET | `/tenancy/organization/roles/{role_id}` | Get a role | `role:read` | | — |
| 15 | PATCH | `/tenancy/organization/roles/{role_id}` | Rename / recolour a role | `role:manage` | | `name`, `description`, `tone` |
| 16 | DELETE | `/tenancy/organization/roles/{role_id}` | Delete a custom role | `role:manage` | | — |
| 17 | GET | `/tenancy/organization/roles/{role_id}/permissions` | A role's permission codes | `role:read` | | — |
| 18 | PUT | `/tenancy/organization/roles/{role_id}/permissions` | Replace a role's codes (the access matrix) | `role:manage` | | `permission_codes*` |
| 19 | GET | `/tenancy/permissions` | The permission catalog (sections, special codes) | signed in | | — |

**Team picker entry** (route 1): `id` (membership id), `user_id`, `name`, `avatar_url`, `staff_number`, `tone`, `role_ids`, `branch_ids`.
**Membership** (routes 2–7): `id`, `user_id`, `organization_id`, `role_id` (primary role), `role_ids` (every role held), `status`, `joined_at`, `invitation` (`id`, `expires_at`) or null, `staff_number`, `phone`, `tone`, `branch_ids`, `working_days`, `work_starts_at`, `work_ends_at`, `commission_percent`, `user` (name, email, avatar), `created_at`, `updated_at`.
**Role**: `id`, `name`, `description`, `is_system`, `tone`, `is_locked`, `member_count`, `created_at`, `updated_at`.

### Decisions for you

| # | Question | Options | Recommendation |
| --- | --- | --- | --- |
| T1 | Two team lists: `/app/users` (picker, every member, active only) and `/tenancy/organization/memberships` (management, `membership:read`, every status) | A keep both · B one list | **A** — pickers need every member to read names; managing the team stays permission-gated |
| T2 | The management list has no filters | A as is · B add `status`, `role_id`, `branch_id` | **B** — "invited", "suspended", "doctors in Adajan" are everyday filters |
| T3 | Locked role (Admin) and system roles: name fixed, cannot be deleted; only custom roles delete | A as is · B allow renaming system roles | **A** |
| T4 | Pending invites show only inside the membership list (`status=INVITED`, `invitation` object) | A as is · B add `GET /tenancy/organization/invitations` | **A** — with T2's `status` filter one list is enough |

Small fix found while preparing (no decision needed): `/app/users` reads the first 100 members and
then keeps the active ones — a team over 100 would lose people from the picker. It should filter
in the query and page past 100.
