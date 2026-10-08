# Clinozy API — final routes, sub-domain by sub-domain

Started 2026-10-08 from the code on `feat/clinic-launch-api` (commit `e15117b`). Each sub-domain is
finalized one at a time: **proposed** → your changes → **final** only after you confirm in chat. The earlier full dump stays in the iteration folder,
`2026-10-07_routes-by-module_v1.md`. This file is the iteration's route review (`be-iteration-planning` Step 5).

How to read the tables: paths are under `/api/v1/app`; `{x_id}` is a public id; **Gate** is the
permission the caller needs; **Idem** `req` = `X-Idempotency-Key` header required; `*` = required.
Every paginated list also takes `limit` (1–100) and `after` (cursor), plus `created_from` / `created_to`.

## Sub-domains (in build order — each builds on the ones above it)

| # | Sub-domain | Folder (`src/domains/app/sub-domains/…`) | Paths (`/app/…`) | Routes | Builds on | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Branches & places | `branches/` | `branches` (+ `my`, `members`, `rooms`, `machines`, `holidays`) | 25 | organization, team | **final (rev 9, confirmed 2026-10-08)** |
| 2 | Team | `memberships/` (picker, preferences, saved views) · platform `tenancy` domain | `memberships` (picker, `me/preferences`, `me/saved-views`) + tenancy `memberships` (+ `invitation`), `roles`, `membership-invitations`, `permissions` | 27 | 1 | **final (confirmed 2026-10-08)** · old 2 + 14 |
| 3 | Offerings | `offerings/` | `offering-groups`, `offerings` (+ `exports`), `offers` | 19 | 1, 2 | **final (rev 4, confirmed 2026-10-08)** |
| 4 | Contacts | `contacts/` | `contacts` (+ `preview`, `members`, `activities` with `send-message`, `log-call`, `add-note`, `resend`), `contact-activities/message-batches`, `contact-message-templates` | 22 | 1, 2 — an activity's record links reach 5–10 as they are built | **final (confirmed 2026-10-08)** · old 3.5 + 4.5 |
| 5 | Leads | `leads/` | `leads` (+ `exports`, `claim`, `release`) | 9 | 1, 2, 4 | **final (rev 6, confirmed 2026-10-08)** · old 4 |
| 6 | Appointments | `appointments/` | `appointments` (+ `exports`, `slots`, `daily-counts`, status actions, `copy`, `stage`, `pause`, `resume`) | 20 | 1, 2, 3, 4 — check-in opens the patient file through 7's service | **final (rev 4, confirmed 2026-10-08)** |
| 7 | Patients | `patients/` | `patients` (+ `exports`, `clinical-notes`, `prescriptions`, `images`, `reports`, `treatments`, `check-ins`, `reviews`, `offerings`, `offering-suggestions`), `patient-prescriptions`, `prescription-kits`, `patient-diagnoses`, `patient-treatments` | 73 | 1, 2, 3, 4, 6 — what was bought links to 8's invoice lines | **final (confirmed 2026-10-08)** · old 5 + 8 + 9 |
| 8 | Billing | `billing/` (your call) | `invoices` (+ `exports`, `credit-notes`), `invoice-credit-notes`, `payments` (+ `exports`, `edits`, `reverse`), `pending-credits` (+ `settle`), `day-closes` (+ `close`, `reopen`) | 32 | 1, 3, 4, 7 | **final (rev 2, confirmed 2026-10-08)** · old 10 |
| 9 | Stock | `stock/` | `stock-items` (+ `exports`, `movements`, `revert`), `stock-item-movements`, `stock-counts`, `stock-purchases` (+ `exports`), `stock-vendors` | 28 | 1, 7, 8 | **final (rev 2, confirmed 2026-10-08)** · old 12 |
| 10 | Tasks & rules | `tasks/` | `tasks` (+ `exports`, `snooze`, `resolve`, `reassign`), `task-rule-settings` | 12 | 2, 4, 5, 6, 7, 8 | **final (rev 1, confirmed 2026-10-08)** · old 13 |
| 11 | Medical store | `medical/` | `manufacturers`, `suppliers` (+ `payments`), `supplier-credits`, `medicines` (+ `exports`, `near-expiry-discount`), `medical-purchase-orders` (+ `exports`, `receive`), `medical-reps` (+ `visits`), `medical-sales` (+ `exports`, `returns`), `medical-payments` | 51 | 4, 7, 8, 10 | **final (rev 1, recommendation — D75, 2026-10-08)** · old 11 |
| — | Platform (outside `/app`, already shipped) | `src/domains/<platform>/` | auth 33 · users/me 20 · tenancy 41 · billing 13 · notify 14 · uploads 4 · audit 1 · mcp 2 | 128 | — | review last |

**Restructured 2026-10-08 (your call): one folder per sub-domain, grouped by connection** — what a record owns is
a nested sub-domain of it, and a sub-domain comes after every sub-domain it points at
([template](../../../docs/design-workflow/process/routes-final-template.md)). Layout only: no decision changed, and every
decision and code-change id (P…, TR…, PK…, B…, S…) keeps its name.

| Old sub-domain | 1 | 2 + 14 | 3 | 3.5 + 4.5 | 4 | 6 | 5 + 8 + 9 | 10 | 12 | 13 | 11 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **New sub-domain** | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 (medical store, later) |

App total: **248 routes** without the medical store (sub-domain 2's 19 tenancy routes count with the platform) — was 310 with it at the start: contacts with their activity, and leads +7 — convert is automatic, activity has one route per action; patients drop the timeline and search −2 and patient notes −6 (the old patient-file sub-domain merged in); appointments merge the visit in −3 and name their status moves +3; feedback actions nest under their check-in or review −4; patient offerings are bought only by invoicing −3; billing adds refunds, payment history, reversal and settling and drops "checked" +4; saved views lose restore −1; tasks add reassign +1. Rows #68–#72 and the messaging worker are not built yet — their routes land in sub-domains 4, 6, 8, 9, 10 and the medical store.

**Sub-domain 11 (Medical store) is back in this file** (D75 — your call, 2026-10-08: "continue with medical plan … go ahead with your recommendings"): §11, decided by recommendation. Where another sub-domain mentions sub-domain 11, medicines or the medical store, §11 now says how it connects. App total with it: **299 routes** (248 + 51).

**Code layout** (your rule, 2026-10-08; names D54): the plan uses the code's words — a **domain** is
`src/domains/<domain>/` (the platform's `auth`, `tenancy`, `billing`, … and the app's `app`); each numbered section here is a
**sub-domain** of the app domain, one folder `src/domains/app/sub-domains/<sub-domain>/`, its main record at the folder root
(`<sub-domain>.routes.ts`, controller, service, repository, schema, …); and what it owns is a **nested sub-domain**, a folder
directly inside it, `<sub-domain>/<nested-sub-domain>/` (e.g. `patients/patient-clinical-notes/`) — the layout `CLAUDE.md`
already gives nested sub-domains (`webhook/webhook-event/`). Folder names follow the table: what the main record owns
carries its prefix; a table that only lives in the sub-domain keeps its own name (P22). The app's shared kernel
(`base-record.*`, `app.permissions.ts`, `app-role-presets.ts`, `app-access-sections.ts`, `app-record-tables.ts`) stays at
`src/domains/app/`. Platform domains outside `/app` keep their own layout — `src/domains/billing/` is the Stripe
subscription (Postgres schema `billing`), so sub-domain 8's `app/sub-domains/billing/` does not clash with it. **K1** (code
change): `CLAUDE.md`'s domain table lists the app's sub-domains with their nested sub-domains, and the be-domain-generator
skill and `validate:domain` accept a nested sub-domain folder inside an app sub-domain (the validator only warns past
depth 6).

**Tables without routes** (K1, as `CLAUDE.md`'s "flatten if a nested folder has no distinct routes"): a table with no routes of
its own is a persistence part of its parent — its schema and repository (and a service only when it holds logic) sit in the
parent's folder, with **no controller and no routes file**, and its parent's service writes it. It gets a folder of its own only
when other sub-domains share it or it is large — and that folder holds only schema, repository and service, like
`auth/…/verification-token/`, `tenancy/…/membership-additional-roles/` and `app/sub-domains/record-counters/` today. Every
nested sub-domain folder below has routes; these tables have none:

| Sub-domain | Table | Lives in | Written by |
| --- | --- | --- | --- |
| 2 | `tenancy.membership_additional_roles` | `tenancy/sub-domains/membership/membership-additional-roles/` (as today) | the membership service (`role_ids`) |
| 2 | `app.membership_preference_branches` | `memberships/membership-preferences/` | the preferences service |
| 3 | `app.offering_branches` | `offerings/` (folder root) | the offering service (`branch_ids`) |
| 3 | `app.offer_offerings`, `app.offer_branches` | `offerings/offers/` | the offer service |
| 4 | `app.contact_phones` | `contacts/` (folder root) | the contact service (`phones`) |
| 5 | `app.lead_involved_memberships` | `leads/` | the lead service |
| 8 | `app.invoice_items`, `app.invoice_members` | `billing/invoices/` | the invoice service |
| 8 | `app.payment_edits` | `billing/payments/` | the payment service (route 17 is the payments controller's) |
| 8 | `app.day_close_events` | `billing/day-closes/` | the day-close service and its worker |
| 9 | `app.stock_count_lines` | `stock/stock-counts/` | the count service |
| 9 | `app.stock_purchase_items` | `stock/stock-purchases/` | the purchase service |
| 10 | `app.task_owner_changes` | `tasks/` (folder root) | the task service (reassign, a member leaving) |
| 11 | `app.supplier_manufacturers` | `medical/suppliers/` | the supplier and manufacturer services (`manufacturer_ids`, `supplier_ids`) |
| 11 | `app.medicine_batches`, `app.medicine_supplier_prices` | `medical/medicines/` | the medicine service (`batches`, `supplier_prices`), the sale, receive and credit writes |
| 11 | `app.medical_purchase_order_items` | `medical/medical-purchase-orders/` | the order service (`items`, receive) |
| 11 | `app.medical_rep_manufacturers` | `medical/medical-reps/` | the MR and manufacturer services (`manufacturer_ids`, `medical_rep_ids`) |
| 11 | `app.medical_sale_returns`, `app.medical_sale_return_items` | `medical/medical-sales/` | the sale service (route 50 is the sales controller's) |
| shared | `app.record_counters` | `app/sub-domains/record-counters/` (schema only) | the numbering triggers |

## Members who leave — one rule for every sub-domain (K2–K8) — final (confirmed 2026-10-08)

Your question: a membership id sits on doctors, owners, authors and "by" fields across the sub-domains — what happens
when that person leaves the clinic, deletes their account, or turns up again, here or in another clinic? What the
code does today:

| Event | Today |
| --- | --- |
| Removed, or leaves | the membership is soft-deleted (same row, restorable) — then **hard-deleted 90 days later** by the purge: treatments lose their doctor and therapist, messages their author, leads their owner (`SET NULL`), invoices their credited staff and leads their involved members (`CASCADE`); a doctor's appointments and prescriptions block the purge instead |
| Deletes the account | the login is soft-deleted, its name and email kept as they are; **its memberships stay live** — a deleted user still shows as an active member; 90 days later the login purge tries a hard delete (cascading to the memberships), usually blocked by the audit columns |
| Their name | read live from the login (`auth.users`) — one name for every clinic; no record keeps a copy |
| Comes back to the same clinic | always a **new** membership (new id, new staff number); the old one is purged with its links |
| Signs up again after deleting the account | a new login, then a new membership |
| Works in another clinic too | one login, one membership per clinic; app rows are kept apart only by the app's lookup |
| A record's member lists | a removed member silently drops out (an invoice's credited staff, a lead's involved members) |

| # | Decision |
| --- | --- |
| K2 | **A member who has done anything stays.** Removal and leaving stay soft (same row, restorable), and every pointer that records what someone *did* becomes `ON DELETE RESTRICT` — the 90-day purge already skips rows a foreign key holds, so it only ever clears memberships nothing points at (an invite never accepted, a member who did nothing). Memberships' `delete_reason` gains `left` (they left) and `account_deleted` (K6); a removal keeps choosing `mistake` · `duplicate` · `not_needed` · `other`. |
| K3 | **The organization keeps the name, in sync with the profile**: `tenancy.memberships.display_name` (new) is copied from the profile when they join, and **every profile update writes it** — when the person changes their name (`PATCH /users/me`), the same transaction updates `display_name` on every live membership of that login, in every clinic, so a membership always matches the profile while it lasts. It freezes only when the membership ends (K4, K6): a clinic they left keeps the name it knew. Every screen names a member from the membership, never from the login, so "Dr. Drashti Shah · left" still reads right years later. The avatar stays the profile's (it goes when the account is deleted). |
| K4 | **Leaving does three things, in one transaction** — the same for removal, leaving and account deletion: what they *do now* is cleared (the branches' default staff — C15; their branch access rows stay, hidden from every branch list while the membership is ended and back with a restore — D57; contact members; lead ownership and hold — the lead returns to the pool; open tasks — back to their role, sub-domain 10); what is *theirs alone* goes (preferences and saved views; prescription kits soft-deleted with the membership and back on restore); what they *did* stays (the table below). Their future appointments keep them, shown as left, until someone reassigns them. Pickers offer active members only, and every write refuses an ended membership (`400`, as today). |
| K5 | **One member directory**: `GET /app/memberships` (sub-domain 2, route 1) takes `include_ended=true` and `ids`, and returns `display_name`, `is_active`, `ended_at` and `tone` — the one place the app turns a membership id into a name. Records keep returning ids (a clinic has tens of members; the screens cache the directory). A record's member lists keep ended members instead of dropping them. |
| K6 | **Deleting an account** ends every membership of that login (`delete_reason = account_deleted`) — today they stay live. The login itself is anonymised rather than deleted — email, names and avatar scrubbed; the row stays because the audit columns point at it (a platform change, reviewed with the platform). The clinic's records keep the frozen membership name: clinical and tax records must say who treated, prescribed and billed. If a former member must disappear from the clinic's records too, an Owner or Admin renames the ended membership (e.g. "Former member") — the only change an ended membership accepts. |
| K7 | **Coming back**: the same login invited again **restores** their old membership — same id, staff number and history, status `invited` — instead of inserting a new row. A different login (a deleted account signed up again, even with the same email) is a new member, never merged automatically: an email can pass to another person. The team list shows both — the old one left, the new one active. |
| K8 | **Another clinic**: one login, one membership per organization, each with its own name, roles, branches and preferences; a profile update reaches its live memberships in every clinic (K3). The database keeps every app pointer inside its organization: unique `(organization_id, id)` on memberships and composite foreign keys `(organization_id, <x>_membership_id)` on every pointer below — today only the app's lookup stops another clinic's member. |

Every pointer to a member, and what happens when they leave (bold = changes here; the sub-domains' table designs say `(K2)`):

| Sub-domain | Column | Records | Foreign key | When they leave |
| --- | --- | --- | --- | --- |
| 1 | `branch_members.membership_id` | branch access | `CASCADE` (as is) | rows kept, hidden while ended, back on restore (D57) |
| 1 | `branches.default_doctor_membership_id` and the other three | default staff | `SET NULL` (as is) | cleared (C15) |
| 2 | `membership_preferences`, `membership_saved_views` | their own settings | `CASCADE` (as is) | deleted |
| 4 | `contact_members.membership_id` | who handles the person now | `CASCADE` (as is) | rows removed |
| 4 | `contact_activities.author_membership_id` | who wrote or sent it | **`SET NULL` → `RESTRICT`** | kept |
| 5 | `leads.owner_membership_id` | who holds the lead now | `SET NULL` (as is) | released with its hold |
| 5 | `lead_involved_memberships.membership_id` | who worked the lead | **`CASCADE` → `RESTRICT`** | kept |
| 6 | `appointments.doctor_membership_id` · `therapist_membership_id` | who sees them | `RESTRICT` · **`SET NULL` → `RESTRICT`** | kept; future bookings until reassigned |
| 7 | `patients.doctor_membership_id` | the usual doctor | **`SET NULL` → `RESTRICT`** | kept, shown as left — the desk picks a new one |
| 7 | `patient_prescriptions.doctor_membership_id` · `approved_by_membership_id` | who prescribed · approved | `RESTRICT` · **`SET NULL` → `RESTRICT`** | kept |
| 7 | `prescription_kits.owner_membership_id` | a doctor's own kits | `CASCADE` (as is) | soft-deleted with the membership |
| 7 | `patient_treatments.doctor_membership_id` · `therapist_membership_id` | who treated | **`SET NULL` → `RESTRICT`** | kept |
| 7 | `patient_feedback_actions.author_membership_id` | who acted | **`SET NULL` → `RESTRICT`** | kept |
| 7 | `patient_offering_suggestions.suggested_by_membership_id` | who suggested | **`SET NULL` → `RESTRICT`** | kept |
| 8 | `invoice_members.membership_id` | who is credited | **`CASCADE` → `RESTRICT`** | kept, still listed |
| 8 | `payment_edits.author_membership_id`, `day_closes.opening_accepted_by_membership_id` · `closed_by_membership_id`, `day_close_events.membership_id` | who changed, accepted, closed | **`SET NULL` → `RESTRICT`** | kept |
| 9 | `stock_item_movements.author_membership_id`, `stock_counts.author_membership_id` | who moved or counted stock | **new — `RESTRICT`** | kept |
| 10 | `tasks.owner_membership_id` | who has an open task | `SET NULL` (as is) | open tasks back to their role queue (TK8) |
| 10 | `task_owner_changes` (from, to, by), `tasks.resolved_by_membership_id` | who it moved between, who resolved it | **`SET NULL` → `RESTRICT`** | kept |
| 11 | `medical_rep_visits.logged_by_membership_id`, `supplier_credits.created_by_membership_id`, `medical_sale_returns.returned_by_membership_id` | who logged, returned or refunded | **new — `RESTRICT`** | kept |

| # | Change |
| --- | --- |
| KC1 | K2: `ON DELETE RESTRICT` on every "kept" pointer above (init migration, schemas); memberships' `delete_reason` gains `left` and `account_deleted` |
| KC2 | K3: `memberships.display_name varchar(120) NOT NULL`, set at join (no backfill — scratch deployment, user 2026-10-08); `PATCH /users/me` (platform `user` domain) updates every live membership of that login in the same transaction; frozen when the membership ends; the picker's `name` becomes `display_name` |
| KC3 | K4: one leave step that removal, leaving and account deletion all call — clear the current links, delete the personal rows, soft-delete the kits |
| KC4 | K5: route 1 (sub-domain 2) takes `include_ended` and `ids` and returns `display_name`, `is_active`, `ended_at`; `listLinkedPublicIds` keeps ended members |
| KC5 | K6: account deletion ends the login's memberships; the login purge anonymises instead of deleting (platform — deferred to the platform review, D56); an Owner or Admin may rename an ended membership (sub-domain 2, route 5) |
| KC6 | K7: adding a member (sub-domain 2, route 3) restores the same login's ended membership instead of inserting |
| KC7 | K8: unique `(organization_id, id)` on memberships; composite foreign keys on every app pointer |

These change sub-domain 2's routes 1, 3 and 5 — confirmed with this section and recorded there as TC17.

---

## 1. Branches & places — final (rev 9, confirmed 2026-10-08)

1.1 Decisions · 1.2 Open questions · 1.3 Tables and relations · 1.4 Permissions · 1.5 Common to every route ·
1.6 Objects returned · 1.7 Routes · 1.8 Request details · 1.9 Errors · 1.10 Rules worth knowing · 1.11 Code changes ·
1.12 Nested sub-domains · then **1.A Branches · 1.B Branch members · 1.C Branch rooms · 1.D Branch machines · 1.E Branch holidays** — each with the same eleven sections: .1 Decisions ·
.2 Open questions · .3 Tables and relations · .4 Permissions · .5 Common to every route · .6 Objects returned · .7 Routes ·
.8 Request details · .9 Errors · .10 Rules worth knowing · .11 Code changes

### 1.1 Decisions (your answers so far)

| # | Decision |
| --- | --- |
| D3 | Branches are never deleted — `PATCH … { is_active: false }` retires one. Branch rooms, machines and holidays soft-delete and restore. |
| D4 | No cross-branch room / machine list — a picker covering several branches calls the per-branch list once per branch (clinics have few branches). |
| D5 | Read gates unchanged: rooms, machines and holidays readable by every member; the full branch list needs `branch:read`. |
| D7 | Rooms and machines nest the same way: `/branches/{branch_id}/rooms/{branch_room_id}` and `/branches/{branch_id}/machines/{branch_machine_id}` — the top-level `/rooms/…` and `/machines/…` paths go. A room or machine never moves branch; an appointment carries `branch_id` next to `branch_room_id` / `branch_machine_id`, so the caller always has both ids. |
| D9 | Tables a branch owns carry the `branch_` prefix: `app.branch_user_accesses` → `app.branch_members`, `app.rooms` → `app.branch_rooms`, `app.machines` → `app.branch_machines` (with `app.branch_holidays` as is). Under `/branches/{branch_id}/` the path drops the prefix: `members`, `rooms`, `machines`, `holidays`. |
| D11 | (Q2 → B) Every name follows the table, as holidays already do: path ids `{branch_room_id}` / `{branch_machine_id}`; columns `appointments.branch_room_id` / `branch_machine_id` (sub-domain 6 uses these field names). Id prefixes stay `room_` / `mach_`. |
| D12 | One set of permission codes for the whole sub-domain — `branch:read`, `branch:create`, `branch:update`, `branch:delete`; no per-room / machine / holiday codes. `branch:read` = the full branch list and details; `branch:create` = create a branch, add a room / machine / holiday; `branch:update` = change a branch, its members, a room / machine / holiday; `branch:delete` = delete and restore a room / machine / holiday (a branch itself is never deleted, D3). The pickers stay open to every member (D5): `/branches/my` and the room, machine and holiday reads — booking needs them without the full branch list. |

Decisions that belong to one nested sub-domain are in it (1.A to 1.E, section .1).

### 1.2 Open questions

None — Q1–Q6 are answered (D10, D11, D13–D16).

### 1.3 Tables and relations

| Table | Holds | Key rules |
| --- | --- | --- |
| `app.branches` | one clinic location: address, hours, working days, default staff | name unique in the organization (any case); at most one main branch; never deleted — retired with `is_active=false` |
| `app.branch_members` | branch ↔ membership link: who works at which branch | key is (`branch_id`, `membership_id`) — a member is listed once per branch; served as `/branches/{branch_id}/members` |
| `app.branch_rooms` | a branch's rooms | name unique in the branch (any case); soft delete + restore |
| `app.branch_machines` | a branch's machines | name unique in the branch (any case); soft delete + restore |
| `app.branch_holidays` | a branch's closed dates | one per branch per date; soft delete + restore |

```text
tenancy.organizations
   │
   └──< app.branches ──┬──< app.branch_rooms     name unique per branch
                       ├──< app.branch_machines  name unique per branch
                       └──< app.branch_holidays  one per branch per date

app.branches ── default staff ×4 (optional; each a branch member, D10) ──> tenancy.memberships
     │         default_doctor_membership_id                                         │
     │         default_front_desk_membership_id                                     │
     │         default_therapist_membership_id                                      │
     │         default_pharmacist_membership_id                                     │
     │                                                                              │
     └──< app.branch_members >──────────────────────────────────────────────────────┘
          key: branch_id + membership_id
          API: /branches/{branch_id}/members · branch_ids on the membership (sub-domain 2)

A ──< B   one A has many B     A >── B   many A for one B     A ──> B   a column on A points at one B
```

Branch ↔ membership is two separate links:

| Link | Shape | Column(s) | Written by | When the member is removed from the team (sub-domain 2 — a soft delete) |
| --- | --- | --- | --- | --- |
| Works at | many-to-many | `app.branch_members` (`branch_id`, `membership_id`) | `POST /branches` (`membership_ids`, D13), `PUT /branches/{branch_id}/members` and `branch_ids` on the membership (D2) | the row stays, but they drop out of the branch's members and `/branches/my`; a restore brings them back |
| Default staff | four many-to-one | `branches.default_doctor_membership_id`, `…_front_desk_…`, `…_therapist_…`, `…_pharmacist_…` | `POST` / `PATCH /branches` | the field is cleared (D14) — also when they stop working at that branch |

Used by later sub-domains (each row points at the branch; nothing points back):

| Sub-domain | Column → table |
| --- | --- |
| 3 Offerings | `offering_branches.branch_id`, `offer_branches.branch_id` → branches |
| 5 Leads | `leads.branch_id` → branches |
| 7 Patients | `patients.home_branch_id` → branches |
| 6 Appointments | `appointments.branch_id` → branches; `appointments.branch_room_id` → branch_rooms; `appointments.branch_machine_id` → branch_machines |
| 8 Billing | `invoices.branch_id`, `payments.branch_id`, `day_closes.branch_id` → branches |
| 2 Personal | `user_preference_branches.branch_filter_id` → branches |

### 1.4 Permissions

The sub-domain has one set of codes (D12). "Any member" means `organization:read`, which every role holds.

| Code | Roles matrix (Users row) | Allows | Routes (1.7) | Held by default |
| --- | --- | --- | --- | --- |
| `organization:read` | — (always on) | the caller's own branches; read a branch's rooms, machines and holidays (pickers, booking) | 2, 8, 10, 14, 16, 20, 22 | every role |
| `branch:read` | View | every branch, with full details | 1, 4 | Owner, Admin |
| `branch:create` | Create | create a branch; add a room, machine or holiday | 3, 9, 15, 21 | Owner, Admin |
| `branch:update` | Edit | change a branch; who works there; change a room, machine or holiday | 5, 6, 7, 11, 17, 23 | Owner, Admin |
| `branch:delete` | Delete | delete or restore a room, machine or holiday — a branch itself is never deleted (D3) | 12, 13, 18, 19, 24, 25 | Owner, Admin |

**Branch visibility** — on top of the code:

| Caller | Sees |
| --- | --- |
| holds `branch:read` | every branch, and every branch's rooms, machines and holidays |
| no `branch:read` | only the branches they work at (`/branches/{branch_id}/members`); anything under another branch is a `404` |

A missing code is a `403`; a branch the caller cannot see is a `404` (its existence is not revealed).

### 1.5 Common to every route

| Item | Value |
| --- | --- |
| Base | `/api/v1/app` |
| Auth | `Authorization: Bearer <access token>`; the active organization comes from the token (no organization id in the path) |
| Writes | `POST` creates/actions need `X-Idempotency-Key` (column **Idem**); `PATCH` takes an optional `expected_updated_at` (a stale save → 409) |
| Success | `200` with `{ data, meta }`; lists `{ data: [...], meta: { pagination: { per_page, next, has_more, estimated_total } } }`; `DELETE` → `204` |
| Errors | `{ error: { type, code, reason?, detail, errors[] } }` — `400 invalid_field` (with `errors[].field`), `401` not signed in, `403` missing permission, `404` not found or not in the caller's branches, `409` conflict (`code` + `reason` below; a unique clash has no `reason`, its message names it), `422` idempotency key missing or reused |

### 1.6 Objects returned

One object per table (1.3), in the same order. Every id is a public id; internal ids, the organization
and audit columns never leave the API.

Each nested sub-domain lists its own objects (1.A to 1.E, section .6):

| Object | Where |
| --- | --- |
| Branch · Branch summary | 1.A.6 — Branches |
| Branch member | 1.B.6 — Branch members |
| Branch room | 1.C.6 — Branch rooms |
| Branch machine | 1.D.6 — Branch machines |
| Branch holiday | 1.E.6 — Branch holidays |

### 1.7 Routes (25)

Everything a branch owns sits under the branch.

| # | Method | Path | Purpose | Gate | Idem | Nested sub-domain |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | GET | `/branches` | List every branch (management) | `branch:read` | | 1.A Branches |
| 2 | GET | `/branches/my` | The caller's branches (after login, pickers) | any member | | 1.A Branches |
| 3 | POST | `/branches` | Create a branch | `branch:create` | req | 1.A Branches |
| 4 | GET | `/branches/{branch_id}` | Get a branch | `branch:read` | | 1.A Branches |
| 5 | PATCH | `/branches/{branch_id}` | Change a branch (or retire: `is_active=false`) | `branch:update` | | 1.A Branches |
| 6 | GET | `/branches/{branch_id}/members` | Who works at the branch **(renamed)** | `branch:update` | | 1.B Branch members |
| 7 | PUT | `/branches/{branch_id}/members` | Replace who works at the branch **(renamed)** | `branch:update` | | 1.B Branch members |
| 8 | GET | `/branches/{branch_id}/rooms` | List the branch's rooms | any member | | 1.C Branch rooms |
| 9 | POST | `/branches/{branch_id}/rooms` | Add a room | `branch:create` | req | 1.C Branch rooms |
| 10 | GET | `/branches/{branch_id}/rooms/{branch_room_id}` | Get a room **(moved)** | any member | | 1.C Branch rooms |
| 11 | PATCH | `/branches/{branch_id}/rooms/{branch_room_id}` | Change a room **(moved)** | `branch:update` | | 1.C Branch rooms |
| 12 | DELETE | `/branches/{branch_id}/rooms/{branch_room_id}` | Delete a room **(moved)** | `branch:delete` | | 1.C Branch rooms |
| 13 | POST | `/branches/{branch_id}/rooms/{branch_room_id}/restore` | Undo a delete **(moved)** | `branch:delete` | req | 1.C Branch rooms |
| 14 | GET | `/branches/{branch_id}/machines` | List the branch's machines | any member | | 1.D Branch machines |
| 15 | POST | `/branches/{branch_id}/machines` | Add a machine | `branch:create` | req | 1.D Branch machines |
| 16 | GET | `/branches/{branch_id}/machines/{branch_machine_id}` | Get a machine **(moved)** | any member | | 1.D Branch machines |
| 17 | PATCH | `/branches/{branch_id}/machines/{branch_machine_id}` | Change a machine **(moved)** | `branch:update` | | 1.D Branch machines |
| 18 | DELETE | `/branches/{branch_id}/machines/{branch_machine_id}` | Delete a machine **(moved)** | `branch:delete` | | 1.D Branch machines |
| 19 | POST | `/branches/{branch_id}/machines/{branch_machine_id}/restore` | Undo a delete **(moved)** | `branch:delete` | req | 1.D Branch machines |
| 20 | GET | `/branches/{branch_id}/holidays` | List the branch's holidays | any member | | 1.E Branch holidays |
| 21 | POST | `/branches/{branch_id}/holidays` | Add a holiday | `branch:create` | req | 1.E Branch holidays |
| 22 | GET | `/branches/{branch_id}/holidays/{branch_holiday_id}` | Get a holiday **(moved)** | any member | | 1.E Branch holidays |
| 23 | PATCH | `/branches/{branch_id}/holidays/{branch_holiday_id}` | Change a holiday **(moved)** | `branch:update` | | 1.E Branch holidays |
| 24 | DELETE | `/branches/{branch_id}/holidays/{branch_holiday_id}` | Delete a holiday **(moved)** | `branch:delete` | | 1.E Branch holidays |
| 25 | POST | `/branches/{branch_id}/holidays/{branch_holiday_id}/restore` | Undo a delete **(moved)** | `branch:delete` | req | 1.E Branch holidays |

Gates are explained in 1.4. A room, machine or holiday id under the wrong branch is a `404`.

### 1.8 Request details

In each nested sub-domain (1.A to 1.E, section .8).

### 1.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| any by-id | `404` | not in the organization, under another branch, or in a branch the caller cannot see |

Each route's own errors are in its nested sub-domain (1.A to 1.E, section .9).

### 1.10 Rules worth knowing

- `/branches/my` returns the branches given to the caller; a caller holding `branch:read` gets every active branch (D1).
- Branch hours, working days and holidays drive appointment slots (sub-domain 6); a retired branch (`is_active=false`) takes no bookings.
- Deleting a room or machine does not touch past appointments that named it.
- A default-staff field is always one of the branch's members: set only from them (D10, D13) and cleared when they leave (D14).

### 1.11 Code changes (not built — the code is frozen)

| # | Change |
| --- | --- |
| C5 | The by-id routes check the record belongs to the branch in the path (else `404`) |
| C6 | Drop the redundant `branch_ids` filter from the per-branch room, machine and holiday lists |
| C9 | Rename the tables (D9) in `migrations/00000000000000_init.sql` and the Drizzle schemas — `branch_members`, `branch_rooms`, `branch_machines`, with their indexes, constraints and RLS policies — and the code folders to match: `branches/branch-user-accesses/` → `branches/branch-members/`, `rooms/` → `branch-rooms/`, `machines/` → `branch-machines/` |
| C11 | D11: rename the path ids in the param registry (`branch_room_id`, `branch_machine_id`) and the columns `appointments.branch_room_id` / `branch_machine_id` with their body and response fields (sub-domains 3 and 6) |
| C13 | D12: gate the room, machine and holiday writes with `branch:create` / `branch:update` / `branch:delete`; drop the 12 `room:*`, `machine:*`, `branch_holiday:*` codes from the app permissions, the permission catalog seed, the role presets' booking lookups and the `settings` access section (left empty — it goes) |
| C17 | Layout (1.12 — confirmed 2026-10-08): move `branch-members/` (today `branches/branch-user-accesses/`), `branch-rooms/` (today the top-level `rooms/`), `branch-machines/` (today `machines/`) and `branch-holidays/` (today top-level) into `app/sub-domains/branches/` — what a branch owns lives in its folder, as its routes already nest |

Changes that belong to one nested sub-domain are in it (1.A to 1.E, section .11).

### 1.12 Nested sub-domains

One folder per sub-domain, and what it owns are its nested sub-domains, each a folder inside it (your rule, D54). Code: the **`branches` sub-domain folder** — `src/domains/app/sub-domains/branches/` (the branch itself at the folder root) with a nested sub-domain folder for each thing a branch owns.

| Nested sub-domain | Folder (`src/domains/app/sub-domains/branches/…`) | Table | Routes (1.7) |
| --- | --- | --- | --- |
| 1.A Branches | folder root | `app.branches` | 1–5 |
| 1.B Branch members | `branch-members/` | `app.branch_members` | 6–7 |
| 1.C Branch rooms | `branch-rooms/` | `app.branch_rooms` | 8–13 |
| 1.D Branch machines | `branch-machines/` | `app.branch_machines` | 14–19 |
| 1.E Branch holidays | `branch-holidays/` | `app.branch_holidays` | 20–25 |

The moves are code change C17.

Each nested sub-domain below has the same eleven sections as the sub-domain (2026-10-08 — layout only: the confirmed content is unchanged, only moved; rows that covered several nested sub-domains appear in each with its own route numbers).

---

### 1.A Branches — `app/sub-domains/branches/` (folder root) — final

#### 1.A.1 Decisions

| # | Decision |
| --- | --- |
| D1 | Two reads, as built: `GET /branches` — every branch, full details, needs `branch:read`; `GET /branches/my` — **every signed-in member**, right after login: the active branches they work in (a `branch:read` holder gets every active branch). No `scope` parameter. |
| D10 | (Q1 → B) A branch's default doctor / front desk / therapist / pharmacist must be one of the branch's members — else `400`. |
| D13 | (Q3 → A) `POST /branches` also takes `membership_ids` — who works there from day one; the default staff must be among them. One call creates a ready branch. |
| D16 | (Q6 → B) `app.branches` drops `deleted_at`, `delete_reason`, `delete_note` — a branch is never deleted (D3). |

#### 1.A.2 Open questions

None.

#### 1.A.3 Tables and relations

| Table | Holds | Key rules |
| --- | --- | --- |
| `app.branches` | one clinic location: address, hours, working days, default staff | name unique in the organization (any case); at most one main branch; never deleted — retired with `is_active=false` |

#### 1.A.4 Permissions

| Code | Roles matrix (Users row) | Allows | Routes (1.7) | Held by default |
| --- | --- | --- | --- | --- |
| `organization:read` | — (always on) | the caller's own branches; read a branch's rooms, machines and holidays (pickers, booking) | 2 | every role |
| `branch:read` | View | every branch, with full details | 1, 4 | Owner, Admin |
| `branch:create` | Create | create a branch; add a room, machine or holiday | 3 | Owner, Admin |
| `branch:update` | Edit | change a branch; who works there; change a room, machine or holiday | 5 | Owner, Admin |

The codes as a whole, with their notes: 1.4.

#### 1.A.5 Common to every route

As 1.5.

#### 1.A.6 Objects returned

**Branch** — `app.branches`; routes 1, 3, 4, 5

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
| `default_doctor_membership_id`, `default_front_desk_membership_id`, `default_therapist_membership_id`, `default_pharmacist_membership_id` | string \| null | `mem_…`; each one of the branch's members (D10), cleared when they leave (D14) |
| `is_active` | boolean | |
| `maps_link`, `review_link` | string \| null | HTTPS only |
| `created_at`, `updated_at` | ISO datetime | |

**Branch summary** — the short form of a branch; route 2 (`/branches/my`)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | `brn_…` |
| `name` | string | |
| `tone` | string | chip colour |
| `is_main` | boolean | |
| `opens_at`, `closes_at` | string `HH:mm` | |
| `working_days` | string[] | `mon` … `sun` |

What a picker and the booking rules need — no address, contacts or default staff.

#### 1.A.7 Routes (1–5)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | `/branches` | List every branch (management) | `branch:read` | |
| 2 | GET | `/branches/my` | The caller's branches (after login, pickers) | any member | |
| 3 | POST | `/branches` | Create a branch | `branch:create` | req |
| 4 | GET | `/branches/{branch_id}` | Get a branch | `branch:read` | |
| 5 | PATCH | `/branches/{branch_id}` | Change a branch (or retire: `is_active=false`) | `branch:update` | |

#### 1.A.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 1 | `include_inactive` = `true` \| `false` (default `false`) | — | Branch[] — main first, then by name; not paginated |
| 2 | — | — | Branch summary[] — active only, main first, then by name; not paginated |
| 3 | — | `name*` (1–60), `address_line_one*` (1–120), `area*`, `city*` (1–60), `postal_code*` (6 digits), `phone*`, `email*`; optional: `tone`, `is_main`, `address_line_two`, `state`, `gst_number`, `opens_at`, `closes_at`, `working_days`, `membership_ids` (0–500 team member ids — who works there, D13), `default_*_membership_id` (×4; each must be in `membership_ids`), `is_active`, `maps_link`, `review_link` | Branch |
| 4 | — | — | Branch |
| 5 | — | any field of #3 (at least one), `expected_updated_at` | Branch |

#### 1.A.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 3, 5 | `409` · `conflict` (message: name taken) | another branch already has the name |
| 3, 5 | `409` · `conflict` (message: only one main branch) | `is_main=true` while another branch is main |
| 3, 5 | `400` · `closes_at` | closing time not after opening time |
| 3, 5 | `400` · `default_*_membership_id` | the team member is not one of the branch's members (D10) |
| 3 | `400` · `membership_ids` | an id is not a team member of the organization |
| 5 | `409` · `record_changed` | `expected_updated_at` is older than the record |

#### 1.A.10 Rules worth knowing

None beyond 1.10.

#### 1.A.11 Code changes

| # | Change |
| --- | --- |
| C1 | `GET /branches` and `GET /branches/my` stay as built — no change |
| C7 | Show `include_inactive` on `GET /branches` in OpenAPI |
| C10 | D10: `POST` / `PATCH /branches` check each default-staff member is one of the branch's members (else `400`) |
| C12 | `PATCH /branches` takes `expected_updated_at` like every other `PATCH` (a stale save → `409 record_changed`) |
| C14 | D13: `POST /branches` accepts `membership_ids` and writes `app.branch_members` in the same transaction as the branch; the default-staff check (C10) runs against that list |
| C16 | D16: drop `deleted_at`, `delete_reason`, `delete_note` and their checks from `app.branches` (init migration + Drizzle schema); the name-unique and one-main indexes lose their `deleted_at IS NULL` filter; the repository's live-row filter goes |

---

### 1.B Branch members — `branches/branch-members/` — final

#### 1.B.1 Decisions

| # | Decision |
| --- | --- |
| D2 | Who works where stays writable from both sides — `PUT /branches/{branch_id}/members` (branch side) and `branch_ids` on the membership (staff side). Both write the one link table. |
| D8 | Who works at a branch is `/branches/{branch_id}/members` (was `/user-accesses`) — "member" is the team's own term (a membership); the body stays `membership_ids`. |
| D14 | (Q4 → B) When a member stops working at a branch (`PUT …/members` without them, or the branch dropped from their `branch_ids`) or is removed from the team, any default-staff field of that branch naming them is cleared in the same save. A later restore of the member does not bring the default back. |
| D15 | (Q5 → A) `GET /branches/{branch_id}/members` stays `branch:update` — the members screen belongs to whoever manages the branch. |

#### 1.B.2 Open questions

None.

#### 1.B.3 Tables and relations

| Table | Holds | Key rules |
| --- | --- | --- |
| `app.branch_members` | branch ↔ membership link: who works at which branch | key is (`branch_id`, `membership_id`) — a member is listed once per branch; served as `/branches/{branch_id}/members` |

#### 1.B.4 Permissions

| Code | Roles matrix (Users row) | Allows | Routes (1.7) | Held by default |
| --- | --- | --- | --- | --- |
| `branch:update` | Edit | change a branch; who works there; change a room, machine or holiday | 6, 7 | Owner, Admin |

The codes as a whole, with their notes: 1.4.

#### 1.B.5 Common to every route

As 1.5.

#### 1.B.6 Objects returned

**Branch member** — `app.branch_members`; routes 6, 7

| Field | Type | Notes |
| --- | --- | --- |
| `membership_id` | string | `mem_…` — the team member (names come from the team picker, sub-domain 2) |
| `created_at` | ISO datetime | when they were added to the branch |

#### 1.B.7 Routes (6–7)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 6 | GET | `/branches/{branch_id}/members` | Who works at the branch **(renamed)** | `branch:update` | |
| 7 | PUT | `/branches/{branch_id}/members` | Replace who works at the branch **(renamed)** | `branch:update` | |

#### 1.B.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 6 | — | — | Branch member[] |
| 7 | — | `membership_ids*` (0–500 team member ids; the full list) | Branch member[] |

#### 1.B.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 7 | `400` · `membership_ids` | an id is not a team member of the organization |

#### 1.B.10 Rules worth knowing

None beyond 1.10.

#### 1.B.11 Code changes

| # | Change |
| --- | --- |
| C8 | Rename `GET`/`PUT /branches/{branch_id}/user-accesses` to `/branches/{branch_id}/members` — body and response unchanged |
| C15 | D14: clear a branch's default-staff fields naming a member who leaves the branch (`PUT …/members`, the membership's `branch_ids`) or is removed from the team — in the same transaction as that save |

---

### 1.C Branch rooms — `branches/branch-rooms/` — final

#### 1.C.1 Decisions

None of its own — 1.1.

#### 1.C.2 Open questions

None.

#### 1.C.3 Tables and relations

| Table | Holds | Key rules |
| --- | --- | --- |
| `app.branch_rooms` | a branch's rooms | name unique in the branch (any case); soft delete + restore |

#### 1.C.4 Permissions

| Code | Roles matrix (Users row) | Allows | Routes (1.7) | Held by default |
| --- | --- | --- | --- | --- |
| `organization:read` | — (always on) | the caller's own branches; read a branch's rooms, machines and holidays (pickers, booking) | 8, 10 | every role |
| `branch:create` | Create | create a branch; add a room, machine or holiday | 9 | Owner, Admin |
| `branch:update` | Edit | change a branch; who works there; change a room, machine or holiday | 11 | Owner, Admin |
| `branch:delete` | Delete | delete or restore a room, machine or holiday — a branch itself is never deleted (D3) | 12, 13 | Owner, Admin |

The codes as a whole, with their notes: 1.4.

#### 1.C.5 Common to every route

As 1.5.

#### 1.C.6 Objects returned

**Branch room** — `app.branch_rooms`; routes 8–13

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | `room_…` |
| `branch_id` | string | `brn_…` — never changes |
| `name` | string | 1–60, unique in the branch (any case) |
| `is_active` | boolean | default `true`; `false` = out of use for now (a delete = should not exist) |
| `created_at`, `updated_at` | ISO datetime | |

#### 1.C.7 Routes (8–13)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 8 | GET | `/branches/{branch_id}/rooms` | List the branch's rooms | any member | |
| 9 | POST | `/branches/{branch_id}/rooms` | Add a room | `branch:create` | req |
| 10 | GET | `/branches/{branch_id}/rooms/{branch_room_id}` | Get a room **(moved)** | any member | |
| 11 | PATCH | `/branches/{branch_id}/rooms/{branch_room_id}` | Change a room **(moved)** | `branch:update` | |
| 12 | DELETE | `/branches/{branch_id}/rooms/{branch_room_id}` | Delete a room **(moved)** | `branch:delete` | |
| 13 | POST | `/branches/{branch_id}/rooms/{branch_room_id}/restore` | Undo a delete **(moved)** | `branch:delete` | req |

#### 1.C.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 8 | `is_active`, `q` (name), `sort` = `created_at` (default, newest first) \| `name`, `order`, `limit`, `after` | — | Branch room[] / Branch machine[] (paginated) |
| 9 | — | `name*` (1–60), `is_active` (default `true`) | Branch room / Branch machine |
| 10 | — | — | Branch room / Branch machine |
| 11 | — | `name`, `is_active`, `expected_updated_at` | Branch room / Branch machine |
| 12 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |
| 13 | — | — | the restored record |

#### 1.C.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 9, 11 | `409` · `conflict` (message: record already exists) | the name is taken in that branch |
| 11 | `409` · `record_changed` | `expected_updated_at` is older than the record |
| 13 | `409` · `record_not_deleted` / `record_restore_conflict` | the record is live, or its name / date was reused meanwhile |

#### 1.C.10 Rules worth knowing

None beyond 1.10.

#### 1.C.11 Code changes

| # | Change |
| --- | --- |
| C2 | Move room get / change / delete / restore from `/rooms/{room_id}` to `/branches/{branch_id}/rooms/{branch_room_id}` |

---

### 1.D Branch machines — `branches/branch-machines/` — final

#### 1.D.1 Decisions

None of its own — 1.1.

#### 1.D.2 Open questions

None.

#### 1.D.3 Tables and relations

| Table | Holds | Key rules |
| --- | --- | --- |
| `app.branch_machines` | a branch's machines | name unique in the branch (any case); soft delete + restore |

#### 1.D.4 Permissions

| Code | Roles matrix (Users row) | Allows | Routes (1.7) | Held by default |
| --- | --- | --- | --- | --- |
| `organization:read` | — (always on) | the caller's own branches; read a branch's rooms, machines and holidays (pickers, booking) | 14, 16 | every role |
| `branch:create` | Create | create a branch; add a room, machine or holiday | 15 | Owner, Admin |
| `branch:update` | Edit | change a branch; who works there; change a room, machine or holiday | 17 | Owner, Admin |
| `branch:delete` | Delete | delete or restore a room, machine or holiday — a branch itself is never deleted (D3) | 18, 19 | Owner, Admin |

The codes as a whole, with their notes: 1.4.

#### 1.D.5 Common to every route

As 1.5.

#### 1.D.6 Objects returned

**Branch machine** — `app.branch_machines`; routes 14–19 (e.g. a laser)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | `mach_…` |
| `branch_id` | string | `brn_…` — never changes |
| `name` | string | 1–60, unique in the branch (any case) |
| `is_active` | boolean | default `true`; `false` = out of use for now, e.g. under repair |
| `created_at`, `updated_at` | ISO datetime | |

#### 1.D.7 Routes (14–19)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 14 | GET | `/branches/{branch_id}/machines` | List the branch's machines | any member | |
| 15 | POST | `/branches/{branch_id}/machines` | Add a machine | `branch:create` | req |
| 16 | GET | `/branches/{branch_id}/machines/{branch_machine_id}` | Get a machine **(moved)** | any member | |
| 17 | PATCH | `/branches/{branch_id}/machines/{branch_machine_id}` | Change a machine **(moved)** | `branch:update` | |
| 18 | DELETE | `/branches/{branch_id}/machines/{branch_machine_id}` | Delete a machine **(moved)** | `branch:delete` | |
| 19 | POST | `/branches/{branch_id}/machines/{branch_machine_id}/restore` | Undo a delete **(moved)** | `branch:delete` | req |

#### 1.D.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 14 | `is_active`, `q` (name), `sort` = `created_at` (default, newest first) \| `name`, `order`, `limit`, `after` | — | Branch room[] / Branch machine[] (paginated) |
| 15 | — | `name*` (1–60), `is_active` (default `true`) | Branch room / Branch machine |
| 16 | — | — | Branch room / Branch machine |
| 17 | — | `name`, `is_active`, `expected_updated_at` | Branch room / Branch machine |
| 18 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |
| 19 | — | — | the restored record |

#### 1.D.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 15, 17 | `409` · `conflict` (message: record already exists) | the name is taken in that branch |
| 17 | `409` · `record_changed` | `expected_updated_at` is older than the record |
| 19 | `409` · `record_not_deleted` / `record_restore_conflict` | the record is live, or its name / date was reused meanwhile |

#### 1.D.10 Rules worth knowing

None beyond 1.10.

#### 1.D.11 Code changes

| # | Change |
| --- | --- |
| C3 | Move machine get / change / delete / restore from `/machines/{machine_id}` to `/branches/{branch_id}/machines/{branch_machine_id}` |

---

### 1.E Branch holidays — `branches/branch-holidays/` — final

#### 1.E.1 Decisions

| # | Decision |
| --- | --- |
| D6 | Holidays live only under their branch: `/branches/{branch_id}/holidays` and `/branches/{branch_id}/holidays/{branch_holiday_id}` — the top-level `/branch-holidays/…` paths go. Nothing else references a holiday, so it never needs its own top-level address. |

#### 1.E.2 Open questions

None.

#### 1.E.3 Tables and relations

| Table | Holds | Key rules |
| --- | --- | --- |
| `app.branch_holidays` | a branch's closed dates | one per branch per date; soft delete + restore |

#### 1.E.4 Permissions

| Code | Roles matrix (Users row) | Allows | Routes (1.7) | Held by default |
| --- | --- | --- | --- | --- |
| `organization:read` | — (always on) | the caller's own branches; read a branch's rooms, machines and holidays (pickers, booking) | 20, 22 | every role |
| `branch:create` | Create | create a branch; add a room, machine or holiday | 21 | Owner, Admin |
| `branch:update` | Edit | change a branch; who works there; change a room, machine or holiday | 23 | Owner, Admin |
| `branch:delete` | Delete | delete or restore a room, machine or holiday — a branch itself is never deleted (D3) | 24, 25 | Owner, Admin |

The codes as a whole, with their notes: 1.4.

#### 1.E.5 Common to every route

As 1.5.

#### 1.E.6 Objects returned

**Branch holiday** — `app.branch_holidays`; routes 20–25 (a closed day — no slots offered)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | `bhol_…` |
| `branch_id` | string | `brn_…` — never changes |
| `holiday_date` | string `YYYY-MM-DD` | one per branch per date |
| `label` | string | 1–60, e.g. "Diwali" |
| `created_at`, `updated_at` | ISO datetime | |

A deleted room, machine or holiday drops out of lists and reads (`404`) until restored; its delete
reason and note are kept but never returned.

#### 1.E.7 Routes (20–25)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 20 | GET | `/branches/{branch_id}/holidays` | List the branch's holidays | any member | |
| 21 | POST | `/branches/{branch_id}/holidays` | Add a holiday | `branch:create` | req |
| 22 | GET | `/branches/{branch_id}/holidays/{branch_holiday_id}` | Get a holiday **(moved)** | any member | |
| 23 | PATCH | `/branches/{branch_id}/holidays/{branch_holiday_id}` | Change a holiday **(moved)** | `branch:update` | |
| 24 | DELETE | `/branches/{branch_id}/holidays/{branch_holiday_id}` | Delete a holiday **(moved)** | `branch:delete` | |
| 25 | POST | `/branches/{branch_id}/holidays/{branch_holiday_id}/restore` | Undo a delete **(moved)** | `branch:delete` | req |

#### 1.E.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 24 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |
| 25 | — | — | the restored record |
| 20 | `holiday_date_from`, `holiday_date_to`, `q` (label), `sort` = `holiday_date` (default, ascending) \| `created_at`, `order`, `limit`, `after` | — | Branch holiday[] (paginated) |
| 21 | — | `holiday_date*`, `label*` (1–60) | Branch holiday |
| 22 | — | — | Branch holiday |
| 23 | — | `holiday_date`, `label`, `expected_updated_at` | Branch holiday |

#### 1.E.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 21, 23 | `409` · `conflict` (message: record already exists) | the branch already has a holiday on that date |
| 23 | `409` · `record_changed` | `expected_updated_at` is older than the record |
| 25 | `409` · `record_not_deleted` / `record_restore_conflict` | the record is live, or its name / date was reused meanwhile |

#### 1.E.10 Rules worth knowing

None beyond 1.10.

#### 1.E.11 Code changes

| # | Change |
| --- | --- |
| C4 | Move holiday get / change / delete / restore from `/branch-holidays/{branch_holiday_id}` to `/branches/{branch_id}/holidays/{branch_holiday_id}` |

---

## 2. Team — final (confirmed 2026-10-08) — nested sub-domains 2.A–2.G

*Restructured 2026-10-08: old sub-domains 2 (rev 1) and 14 (rev 1) in one section — layout only, no decision changed.*

Code: the **`memberships` sub-domain folder** — `src/domains/app/sub-domains/memberships/` (the team picker at the folder root) with `membership-preferences/` and `membership-saved-views/`; the team itself is the platform `tenancy` domain (2.B–2.E).

2.1 Decisions (whole sub-domain) · 2.2 Open questions · 2.3 Tables and relations · 2.4 Permissions · 2.5 Common to every route ·
2.6 Objects returned · 2.7 Routes · 2.8 Request details · 2.9 Errors · 2.10 Rules worth knowing · 2.11 Code changes (whole sub-domain) ·
2.12 Nested sub-domains · then **2.A Team picker · 2.B Memberships · 2.C Membership invitations · 2.D Roles · 2.E Permission catalog · 2.F Preferences · 2.G Saved views** — each with the same eleven sections: .1 Decisions ·
.2 Open questions · .3 Tables and relations · .4 Permissions · .5 Common to every route · .6 Objects returned · .7 Routes ·
.8 Request details · .9 Errors · .10 Rules worth knowing · .11 Code changes

The team, and each member's own settings in this organization.

**Team.** The team lives in the tenancy domain (shared by every product built on this backend); the app adds the
picker list. A team member's id everywhere in the app (`doctor_membership_id`, `owner_membership_id`, …)
is the **membership id** (`mem_…`). Sub-domain 1's rules carry over: names follow the table (D9, D11), what
a parent owns nests under it, one code set per sub-domain (D12), soft delete with a reason plus restore
(D3), `X-Idempotency-Key` on every `POST`, `expected_updated_at` on every `PATCH`.

**Personal settings.** A team member's own settings in this organization — pinned sections, theme, branch filter, patient-file pins,
recent picks — and the list filters they saved as views. Nobody else sees them. Design:
`shell.md` (pins, branch picker, appearance), `patient-file.md` (pins), `_patterns.md` (recent picks, saved views),
`schema-routes.md` (UserPreference; there is no SavedView entity). Route numbers run 1–27.

### 2.1 Decisions (whole sub-domain)

All taken on your standing answer "go with the recommendation" — confirmed 2026-10-08.

| # | Decision |
| --- | --- |
| T1 | Two team lists: the **picker** (route 1 — every member, active members only, names / roles / branches) and the **management list** (route 2 — `membership:read`, every status, phone and commission). |
| T7 | `membership:read` leaves every role's defaults. Today every role holds it, so any member can open the management list with everyone's phone and commission %. Pickers use route 1 (`organization:read`). |
| T8 | One code set for the sub-domain, as D12: `membership:read`, `membership:create`, `membership:update`, `membership:delete` and `role:read`, `role:create`, `role:update`, `role:delete`. They replace `membership:manage`, `invitation:manage` and `role:manage` (invite = create, resend = update, revoke = delete) and join `branch:*` in the **Users** row of the Roles matrix — so a role other than Owner / Admin can be given team management. |
| T13 | Every `POST` takes `X-Idempotency-Key` — today restore, resend and accept do not. |
| T14 | Every `PATCH` takes `expected_updated_at` (memberships, roles) — a stale save → `409 record_changed`. |
| U1 | **Owned by the membership** — one person in one organization: `app.user_preferences` → `app.membership_preferences`, `app.saved_views` → `app.membership_saved_views`, each with `membership_id` → memberships `ON DELETE CASCADE`; the leave step deletes them when the member leaves (K4). Today the owner is `created_by_user_id`: an API key (no user) shares one owner-less row, and the rows outlive the membership. `schema-routes.md` keys preferences by user across organizations, but the branch filter and pins belong to one organization. Routes nest under the caller's membership — `/memberships/me/preferences`, `/memberships/me/saved-views` — like the platform's `/users/me/…`; an API key gets `403`. |
| U2 | **Gate**: any member (`organization:read`); a member only ever reaches their own rows (another member's view → `404`). The `saved_view:*` codes (seeded and in every preset, never checked) and the `personal` access section go. Public-id prefixes stay (`upref_`, `svw_`). |
| U3 | Not branch-scoped; RLS (organization policy, enabled and forced) on every table. |

Taken on your standing answer "go with the recommendation" — confirmed 2026-10-08. A decision that belongs to one table is in its nested sub-domain.

Decisions that belong to one nested sub-domain are in it (2.A to 2.E, section .1).

### 2.2 Open questions

None — every decision follows the recommendation.

### 2.3 Tables and relations

**Team**

| Table | Holds | Key rules |
| --- | --- | --- |
| `tenancy.memberships` | one person in the organization: status, staff number, phone, tone, working days and hours, commission % | one live membership per user per organization; `staff_number` set by the database (next in the organization, never changes); soft delete with reason + restore |
| `tenancy.membership_additional_roles` | the roles a member holds beyond the main one | key (`membership_id`, `role_id`); positions 1–9 → at most 10 roles in all |
| `tenancy.membership_invitations` | the invite of an invited member (T9) | token stored hashed; expiry 1–365 days; accepted or revoked, never both |
| `tenancy.roles` | the organization's roles | name unique among live roles; at most 50 per organization; system roles fixed (T3); soft delete with reason + restore (T12), purged after 90 days |
| `tenancy.role_permissions` | a role's permission codes | key (`role_id`, `permission_code`); the code must exist in the catalog |
| `tenancy.permissions` | the code catalog — shared, not per organization | `code` is the key; `category` groups the Roles matrix |
| `app.branch_members` | where a member works — sub-domain 1 | written from both sides (D2) |

```text
tenancy.organizations
   │
   ├──< tenancy.roles ──< tenancy.role_permissions >── tenancy.permissions    catalog, shared by every organization
   │
   └──< tenancy.memberships >── auth.users                      one live membership per user per organization
            │
            ├──> tenancy.roles                                           main role (role_id)
            ├──< tenancy.membership_additional_roles >── tenancy.roles   extra roles, positions 1–9
            ├──< tenancy.membership_invitations                          the invite, while invited
            └──< app.branch_members >── app.branches                     where they work (sub-domain 1)

A ──< B   one A has many B     A >── B   many A for one B     A ──> B   a column on A points at one B
```

Pointing at a membership from the app (each keeps pointing after a member is removed — removal is a soft delete, so history keeps its names):

| Sub-domain | Column(s) |
| --- | --- |
| 1 Branches | `branch_members.membership_id`; `branches.default_doctor_membership_id`, `…_front_desk_…`, `…_therapist_…`, `…_pharmacist_…` (cleared when the member leaves, D14) |
| 5 Leads | `leads.owner_membership_id`, `lead_involved_memberships.membership_id` |
| 4 Contact activity | `contact_activities.author_membership_id` |
| 7 Patients | `patients.doctor_membership_id` |
| 6 Appointments | `appointments.doctor_membership_id`, `appointments.therapist_membership_id` |
| 7 Patient file | `prescriptions.doctor_membership_id` |
| 7 Treatments | `treatments.doctor_membership_id`, `treatments.therapist_membership_id` |
| 8 Billing | `invoice_team_memberships.team_membership_id` |
| 10 Tasks | `tasks.owner_membership_id`, `task_owner_changes.from_membership_id`, `task_owner_changes.to_membership_id` |

Roles decide every permission gate in every sub-domain; working days and hours feed appointment slots (sub-domain 6).

**Personal settings**

| Table | Holds | Key rules |
| --- | --- | --- |
| `app.membership_preferences` | one member's settings | one row per membership, upserted (U4) |
| `app.membership_preference_branches` | preference ↔ branch: the branch filter | key (`membership_preference_id`, `branch_id`); up to 20; none = every branch |
| `app.membership_saved_views` | one saved filter set on one list | label unique per member and list; hard delete (U6) |

```text
tenancy.organizations
   │
   └──< tenancy.memberships ──┬─── app.membership_preferences ──< app.membership_preference_branches >── app.branches   2.F  — one row per member
                              └──< app.membership_saved_views                                                           2.G  — saved filters per list

A ──< B   one A has many B     A >── B   many A for one B     A ──> B   a column on A points at one B     A ─── B   at most one B per A
```

**PostgreSQL design**

Standard columns as above.

### 2.4 Permissions

One code set (T8). "Any member" = `organization:read`, which every role holds.

| Code | Roles matrix (Users row) | Allows | Routes (2.7) | Held by default |
| --- | --- | --- | --- | --- |
| `organization:read` | — (always on) | the team picker; the caller's own preferences and saved views | 1, 21–27 | every role |
| signed in, no code | — | accept an invite; the permission catalog | 11, 20 | anyone signed in |
| `membership:read` | View | the team list, a member, a member's effective codes | 2, 4, 8 | Owner, Admin (T7) |
| `membership:create` | Create | add a member (sends the invite) | 3 | Owner, Admin |
| `membership:update` | Edit | change a member — roles, branches, hours, status; resend an invite | 5, 10 | Owner, Admin |
| `membership:delete` | Delete | remove or restore a member; revoke an invite | 6, 7, 9 | Owner, Admin |
| `role:read` | View | roles and their codes | 12, 14, 18 | Owner, Admin |
| `role:create` | Create | create a role | 13 | Owner, Admin |
| `role:update` | Edit | rename / recolour a role; set its codes (the matrix) | 15, 19 | Owner, Admin |
| `role:delete` | Delete | delete or restore a custom role | 16, 17 | Owner, Admin |

Guards on top of the code:

| Guard | Routes | Result |
| --- | --- | --- |
| You can only hand out codes you hold — giving a member a role, creating a role, changing a role's codes (removing a code needs it too); an unknown code fails the same way | 3, 5, 13, 19 | `403` |
| The owner's membership: status and roles are fixed, it cannot be removed (its profile stays editable) | 5, 6 | `403` |
| The Admin role (locked) and the Owner role: codes never change | 19 | `403` |
| System roles: name fixed, never deleted (T3) | 15, 16 | `403` |

A missing code is a `403`; a member, invite or role of another organization is a `404`.

### 2.5 Common to every route

| Item | Value |
| --- | --- |
| Base | `/api/v1` — routes 1 and 21–27 under `/app` (D60), the rest under `/tenancy` |
| Auth | `Authorization: Bearer <access token>`; the active organization comes from the token (no organization id in the path) |
| Writes | every `POST` needs `X-Idempotency-Key` (T13); `PATCH` takes an optional `expected_updated_at` (T14) |
| Success | `200` with `{ data, meta }`; lists `{ data: [...], meta: { pagination: { per_page, next, has_more, estimated_total } } }`; `DELETE` → `204` |
| Errors | `{ error: { type, code, reason?, detail, errors[] } }` — `400 invalid_field` (with `errors[].field`), `401` not signed in, `403` missing permission or a guard (2.4), `404` not found, `409` conflict, `422` idempotency key missing or reused |

### 2.6 Objects returned

Each nested sub-domain lists its own objects (2.A to 2.G, section .6):

| Object | Where |
| --- | --- |
| Team picker entry | 2.A.6 — Team picker |
| Membership · Member permissions | 2.B.6 — Memberships |
| Membership invitation | 2.C.6 — Membership invitations |
| Role · Role permission | 2.D.6 — Roles |
| Permission | 2.E.6 — Permission catalog |
| Preferences | 2.F.6 — Preferences |
| Saved view | 2.G.6 — Saved views |

### 2.7 Routes

Every route of the sub-domain in one table; each nested sub-domain repeats its own with the details.

| # | Method | Path (`/api/v1/…`) | Purpose | Gate | Idem | Nested sub-domain |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | GET | `/app/memberships` | Team picker — active members **(renamed, T5)** | any member | | 2.A Team picker |
| 2 | GET | `/tenancy/organization/memberships` | Team list (every status) | `membership:read` | | 2.B Memberships |
| 3 | POST | `/tenancy/organization/memberships` | Add a member by email (sends the invite) | `membership:create` | req | 2.B Memberships |
| 4 | GET | `/tenancy/organization/memberships/{membership_id}` | Get a member | `membership:read` | | 2.B Memberships |
| 5 | PATCH | `/tenancy/organization/memberships/{membership_id}` | Change roles, branches, hours, status | `membership:update` | | 2.B Memberships |
| 6 | DELETE | `/tenancy/organization/memberships/{membership_id}` | Remove a member | `membership:delete` | | 2.B Memberships |
| 7 | POST | `/tenancy/organization/memberships/{membership_id}/restore` | Undo a removal | `membership:delete` | req | 2.B Memberships |
| 8 | GET | `/tenancy/organization/memberships/{membership_id}/permissions` | A member's effective codes | `membership:read` | | 2.B Memberships |
| 9 | DELETE | `/tenancy/organization/memberships/{membership_id}/invitation` | Revoke the pending invite **(moved, T9)** | `membership:delete` | | 2.C Membership invitations |
| 10 | POST | `/tenancy/organization/memberships/{membership_id}/invitation/resend` | Resend the invite **(moved, T9)** | `membership:update` | req | 2.C Membership invitations |
| 11 | POST | `/tenancy/membership-invitations/{membership_invitation_id}/accept` | The invitee accepts **(renamed, T9)** | signed in | req | 2.C Membership invitations |
| 12 | GET | `/tenancy/organization/roles` | List roles (with member counts) | `role:read` | | 2.D Roles |
| 13 | POST | `/tenancy/organization/roles` | Create a role (optionally copy another) | `role:create` | req | 2.D Roles |
| 14 | GET | `/tenancy/organization/roles/{role_id}` | Get a role | `role:read` | | 2.D Roles |
| 15 | PATCH | `/tenancy/organization/roles/{role_id}` | Rename / recolour a role | `role:update` | | 2.D Roles |
| 16 | DELETE | `/tenancy/organization/roles/{role_id}` | Delete a custom role | `role:delete` | | 2.D Roles |
| 17 | POST | `/tenancy/organization/roles/{role_id}/restore` | Undo a delete **(new, T12)** | `role:delete` | req | 2.D Roles |
| 18 | GET | `/tenancy/organization/roles/{role_id}/permissions` | A role's codes | `role:read` | | 2.D Roles |
| 19 | PUT | `/tenancy/organization/roles/{role_id}/permissions` | Replace a role's codes (the matrix) | `role:update` | | 2.D Roles |
| 20 | GET | `/tenancy/permissions` | The permission catalog | signed in | | 2.E Permission catalog |
| 21 | GET | `/app/memberships/me/preferences` | My preferences (the defaults before the first save) **(renamed)** | `organization:read` | | 2.F Preferences |
| 22 | PATCH | `/app/memberships/me/preferences` | Save them **(renamed)** | `organization:read` | | 2.F Preferences |
| 23 | GET | `/app/memberships/me/saved-views` | My saved views **(renamed)** | `organization:read` | | 2.G Saved views |
| 24 | POST | `/app/memberships/me/saved-views` | Save a view **(renamed)** | `organization:read` | req | 2.G Saved views |
| 25 | GET | `/app/memberships/me/saved-views/{membership_saved_view_id}` | Get one **(renamed)** | `organization:read` | | 2.G Saved views |
| 26 | PATCH | `/app/memberships/me/saved-views/{membership_saved_view_id}` | Rename it or change its filters **(renamed)** | `organization:read` | | 2.G Saved views |
| 27 | DELETE | `/app/memberships/me/saved-views/{membership_saved_view_id}` | Remove it — for good (U6) **(renamed)** | `organization:read` | | 2.G Saved views |

### 2.8 Request details

In each nested sub-domain (2.A to 2.G, section .8).

### 2.9 Errors

Every route can answer the errors in 2.5; each route's own errors are in its nested sub-domain (2.A to 2.G, section .9).

Sub-domain-wide:

| Route | Status · reason | When |
| --- | --- | --- |
| any by-id | `404` | not in the organization (or removed — except routes 4, 5 and 7, which reach an ended member, D58) |

### 2.10 Rules worth knowing

- Adding a member always creates an **invited** membership and emails the invite; they become **active** when they accept — signed in with the invited, verified email.
- `active` and `invited` members count toward the plan's seats; `suspended` and removed do not.
- Removing a member is a soft delete: API keys they created are revoked (a restore does not bring them back); they drop out of the picker and of branch members; a branch default naming them is cleared (D14); history rows keep pointing at them.
- Suspending keeps roles and branches; only the status changes.
- Role and code changes take effect at once (the permission cache is refreshed).
- Seeded roles: Owner, Admin (locked), Doctor, Therapist, Front desk, Counsellor, Pharmacist, Accountant, Marketing.

- The screens save preferences silently and retry, so `expected_updated_at` stays optional here.
- Density is worked out from the window size and is not a preference (`shell.md`); language and a default list sort are not designed.
- A saved view holds filters only — the sort stays in the URL (`schema-routes.md`).

### 2.11 Code changes (whole sub-domain)

| # | Change |
| --- | --- |
| TC3 | T7: drop `membership:read` from every role's defaults (`app-role-presets.ts`) |
| TC4 | T8: replace `membership:manage`, `invitation:manage`, `role:manage` with `membership:read\|create\|update\|delete` and `role:read\|create\|update\|delete` — tenancy permissions, catalog seed (category `users`), Owner / Admin provisioning, API-key scopes, and the Users matrix section (`users: ['branch', 'membership', 'role']`) |
| TC9 | T13: `idempotencyRequired` on member restore, resend, accept and role restore |
| TC10 | T14: `expected_updated_at` on `PATCH` memberships and roles |
| TC11 | T15: one Role permission shape for `GET` / `PUT`; `permission_codes` on route 8; resend returns the invitation itself |
| TC16 | Layout (2.12 — confirmed 2026-10-08): the picker's app folder `users/` → `memberships/` (T5); tenancy `membership/member-invitation/` → `membership/membership-invitation/` (T9) |
| TC17 | K5–K7 (members who leave — confirmed 2026-10-08): route 1 takes `include_ended` and `ids` and returns `display_name`, `is_active`, `ended_at` (KC4); route 3 restores the same login's ended membership instead of inserting (KC6); route 5 renames only an ended membership — a live one follows the profile (K3, KC5) |
| UC1 | U1: rename both tables (init migration, schemas, indexes, RLS, the FORCE-RLS and purge lists); `membership_id` replaces the `created_by_user_id` ownership; move the two folders into `app/sub-domains/memberships/`; the `/memberships/me/…` routes; `403` without a membership |
| UC2 | U2: drop `saved_view:*` (app permissions, catalog seed, presets) and the `personal` section (`app-access-sections.ts`) |

Changes that belong to one nested sub-domain are in it (2.A to 2.E, section .11).

### 2.12 Nested sub-domains

| Nested sub-domain | Folder | Tables | Routes | Status |
| --- | --- | --- | --- | --- |
| 2.A Team picker | `app/sub-domains/memberships/` (today `users/`) | reads `tenancy.memberships` | 1 | final |
| 2.B Memberships | `tenancy/sub-domains/membership/` (+ nested `membership-additional-roles/`) | `tenancy.memberships`, `tenancy.membership_additional_roles` | 2–8 | final |
| 2.C Membership invitations | `tenancy/sub-domains/membership/membership-invitation/` (nested; today `member-invitation/`) | `tenancy.membership_invitations` | 9–11 | final |
| 2.D Roles | `tenancy/sub-domains/member-roles/` (+ nested `member-role-permission/`) | `tenancy.roles`, `tenancy.role_permissions` | 12–19 | final |
| 2.E Permission catalog | `tenancy/sub-domains/permission/` | `tenancy.permissions` | 20 | final |
| 2.F Preferences | `membership-preferences/` | `app.membership_preferences`, `app.membership_preference_branches` | 21–22 | final |
| 2.G Saved views | `membership-saved-views/` | `app.membership_saved_views` | 23–27 | final |

The renames are code change TC16.

Each nested sub-domain below has the same eleven sections as the sub-domain (2026-10-08 — layout only: the confirmed content is unchanged, only moved; rows that covered several nested sub-domains appear in each with its own route numbers).

---

### 2.A Team picker — `app/sub-domains/memberships/` (folder root; today `users/`) — final

#### 2.A.1 Decisions

| # | Decision |
| --- | --- |
| T5 | The picker is `GET /app/memberships` (was `/app/users`) — it returns memberships (`mem_…` ids) from `tenancy.memberships`; the top-level segment is the table name. |
| T6 | The picker is a normal paginated list (`limit`, `after`) with its filters in the query. Today it reads up to 5 × 100 members, filters in memory and silently drops anyone past the 500th. |

#### 2.A.2 Open questions

None.

#### 2.A.3 Tables and relations

No table of its own — it reads `tenancy.memberships` (2.B).

#### 2.A.4 Permissions

| Code | Roles matrix (Users row) | Allows | Routes (2.7) | Held by default |
| --- | --- | --- | --- | --- |
| `organization:read` | — (always on) | the team picker; the caller's own preferences and saved views | 1 | every role |

The codes as a whole, with their notes: 2.4.

#### 2.A.5 Common to every route

As 2.5.

#### 2.A.6 Objects returned

**Team picker entry** — a short form of a membership; route 1

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | `mem_…` |
| `user_id` | string | `usr_…` |
| `name` | string | first and last name, else the email |
| `avatar_url` | string \| null | |
| `staff_number` | integer | |
| `tone` | string | chip colour |
| `role_ids` | string[] | `rol_…`, main role first |
| `branch_ids` | string[] | `brn_…` — where they work |

#### 2.A.7 Routes (1)

| # | Method | Path (`/api/v1/…`) | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | `/app/memberships` | Team picker — active members **(renamed, T5)** | any member | |

#### 2.A.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 1 | `q` (name / email, 1–200), `role_id`, `branch_id`, `limit`, `after` | — | Team picker entry[] — active members, by name (paginated, T6) |

#### 2.A.9 Errors

None beyond 2.9.

#### 2.A.10 Rules worth knowing

None beyond 2.10.

#### 2.A.11 Code changes

| # | Change |
| --- | --- |
| TC1 | T5, T6: rename `/app/users` → `/app/memberships`; filter status, role, branch and `q` in the query and page with `limit` / `after` (no 5 × 100 read, no in-memory filter); `q` up to 200 like every list; fix the stale `mbr_` comment in `users.types.ts` |

---

### 2.B Memberships — `tenancy/sub-domains/membership/` (+ nested `membership-additional-roles/`) — final

#### 2.B.1 Decisions

| # | Decision |
| --- | --- |
| T2 | The management list filters by `status`, `role_id` and `branch_id` ("invited", "suspended", "doctors in Adajan"). |
| T10 | Status moves by `PATCH` only between `active` and `suspended`; `invited` → `active` happens only by accepting the invite. `joined_at` is kept on reactivation (today any `PATCH` to active resets it). |
| T16 | The Membership object drops `role_id` and `role` — `role_ids[0]` is the main role (the picker already works this way). |
| T17 | Status values are lowercase — `invited`, `active`, `suspended` — like every other enum in the API. |
| D58 | Ended members (found at ROUTE #126): route 2 lists them with `include_ended=true` (default `false`); route 4 opens one; route 5 renames one — `display_name` only, the one change an ended member accepts (K6); routes 6 and 8 answer `404` for one. |

#### 2.B.2 Open questions

None.

#### 2.B.3 Tables and relations

| Table | Holds | Key rules |
| --- | --- | --- |
| `tenancy.memberships` | one person in the organization: status, staff number, phone, tone, working days and hours, commission % | one live membership per user per organization; `staff_number` set by the database (next in the organization, never changes); soft delete with reason + restore |
| `tenancy.membership_additional_roles` | the roles a member holds beyond the main one | key (`membership_id`, `role_id`); positions 1–9 → at most 10 roles in all |
| `app.branch_members` | where a member works — sub-domain 1 | written from both sides (D2) |

#### 2.B.4 Permissions

| Code | Roles matrix (Users row) | Allows | Routes (2.7) | Held by default |
| --- | --- | --- | --- | --- |
| `membership:read` | View | the team list, a member, a member's effective codes | 2, 4, 8 | Owner, Admin (T7) |
| `membership:create` | Create | add a member (sends the invite) | 3 | Owner, Admin |
| `membership:update` | Edit | change a member — roles, branches, hours, status; resend an invite | 5 | Owner, Admin |
| `membership:delete` | Delete | remove or restore a member; revoke an invite | 6, 7 | Owner, Admin |

The codes as a whole, with their notes: 2.4.

#### 2.B.5 Common to every route

As 2.5.

#### 2.B.6 Objects returned

**Membership** — `tenancy.memberships`; routes 2–7

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | `mem_…` |
| `user_id` | string | `usr_…` |
| `organization_id` | string | `org_…` |
| `status` | string | `invited` · `active` · `suspended` (T17) |
| `joined_at` | ISO datetime \| null | set when the invite is accepted; kept on reactivation (T10) |
| `invitation` | object \| null | `id`, `expires_at` — only while `invited` |
| `staff_number` | integer | set by the database, never changes |
| `phone` | string \| null | `+91` + 10 digits |
| `tone` | string | chip colour (default `sky`) |
| `role_ids` | string[] | `rol_…`, 1–10, main role first (T16) |
| `branch_ids` | string[] | `brn_…`, up to 100 — sub-domain 1 `branch_members` |
| `working_days` | string[] | `mon` … `sun`; default Monday–Saturday |
| `work_starts_at`, `work_ends_at` | string `HH:mm` | default `10:00` – `19:00`; ends after it starts |
| `commission_percent` | number | 0–100, two decimals; default 0 |
| `user` | object | `id`, `email`, `first_name`, `last_name`, `avatar_url` |
| `display_name` | string | the name the organization keeps (K3) — follows the profile while live, frozen when ended (D58) |
| `ended_at` | ISO datetime \| null | when the membership ended; `null` while live (D58) |
| `end_reason` | string \| null | `mistake` · `duplicate` · `not_needed` · `other` · `left` · `account_deleted` (K2); `null` while live (D58) |
| `created_at`, `updated_at` | ISO datetime | |

**Member permissions** — route 8: `permission_codes` (string[]) — every code from the member's roles, main and extra (T15).

#### 2.B.7 Routes (2–8)

| # | Method | Path (`/api/v1/…`) | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 2 | GET | `/tenancy/organization/memberships` | Team list (every status) | `membership:read` | |
| 3 | POST | `/tenancy/organization/memberships` | Add a member by email (sends the invite) | `membership:create` | req |
| 4 | GET | `/tenancy/organization/memberships/{membership_id}` | Get a member | `membership:read` | |
| 5 | PATCH | `/tenancy/organization/memberships/{membership_id}` | Change roles, branches, hours, status | `membership:update` | |
| 6 | DELETE | `/tenancy/organization/memberships/{membership_id}` | Remove a member | `membership:delete` | |
| 7 | POST | `/tenancy/organization/memberships/{membership_id}/restore` | Undo a removal | `membership:delete` | req |
| 8 | GET | `/tenancy/organization/memberships/{membership_id}/permissions` | A member's effective codes | `membership:read` | |

#### 2.B.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 2 | `q` (email / first / last name, 1–200), `status`, `role_id`, `branch_id` (T2), `include_ended` (default `false`, D58), `sort` = `created_at` (default) \| `name`, `order` (default `asc`), `limit`, `after` | — | Membership[] (paginated) |
| 3 | — | `email*` (up to 255; no throw-away domains), `role_ids*` (1–10, no repeats; first = main role), `expires_in_days` (1–365, default 7), `phone`, `tone`, `branch_ids` (up to 100), `working_days`, `work_starts_at`, `work_ends_at`, `commission_percent` | Membership (`status=invited`) |
| 4 | — | — | Membership — an ended one too (D58) |
| 5 | — | an ended member: `display_name` (1–120) only (K6, D58); a live member: any of `status` (`active` \| `suspended`, T10), `role_ids`, `phone`, `tone`, `branch_ids`, `working_days`, `work_starts_at`, `work_ends_at`, `commission_percent` (at least one), `expected_updated_at` | Membership |
| 6 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |
| 7 | — | — | Membership — back with its earlier status |
| 8 | — | — | Member permissions |

#### 2.B.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 3 | `400` · `disposable_email` | a throw-away email domain |
| 3, 5 | `400` · `role_ids` | a role is not in the organization |
| 3, 5 | `400` · `branch_ids` | a branch is not in the organization |
| 3, 5 | `400` · `work_ends_at` | work ends before it starts |
| 5 | `400` · `status` | a move other than `active` ↔ `suspended` (T10) |
| 3, 5 | `403` (message: cannot grant a code you do not hold) | the caller would hand out a code they lack, or an unknown code |
| 3, 5, 7 | `409` · `seat_limit_reached` | the plan's seats are used up (adding, activating, restoring) |
| 3, 7 | `409` · `membership_already_exists` | the person is already in the team (any status) |
| 3 | `409` (message: too many pending invites) | 100 invites already pending |
| 5 | `403` (message: the owner's status and roles cannot change) | status or roles of the owner |
| 6 | `403` (message: the owner cannot be removed) | |
| 5 | `409` · `record_changed` | `expected_updated_at` is older than the record (T14) |
| 5 | `400` · `display_name` | `display_name` on a live member — the name follows the profile (K3, D58) |
| 5 | `400` · `membership_ended` | any field but `display_name` on an ended member (D58) |
| 6, 8 | `404` | the member has ended (D58) |
| 7 | `409` · `membership_not_deleted` | the member is not removed |

#### 2.B.10 Rules worth knowing

None beyond 2.10.

#### 2.B.11 Code changes

| # | Change |
| --- | --- |
| TC2 | T2: the team list takes `status`, `role_id`, `branch_id`; send `estimated_total` (today never sent) |
| TC6 | T10: `PATCH` status allows only `active` ↔ `suspended`; keep `joined_at` on reactivation |
| TC12 | T16: drop `role_id` and `role` from the Membership object |
| TC13 | T17: lowercase status values — column check, DTOs, serializers and every reader |
| TC15 | Removing a member clears branch default staff — already sub-domain 1 C15 (D14) |

---

### 2.C Membership invitations — `tenancy/sub-domains/membership/membership-invitation/` (nested; today `member-invitation/`) — final

#### 2.C.1 Decisions

| # | Decision |
| --- | --- |
| T4 | No separate invitations list — an invited member is in the management list (`status=invited`) with its `invitation`. |
| T9 | The invitation belongs to its membership: table `tenancy.member_invitations` → `tenancy.membership_invitations` (D9). Revoke and resend nest under the membership (`…/memberships/{membership_id}/invitation`); accept stays top level — the invitee has no organization yet — as `/tenancy/membership-invitations/{membership_invitation_id}/accept` (D11). The id prefix stays `inv_`. |
| T11 | An expired invitation can be resent (new token, new expiry). Today it is refused, so the only way out is revoke and add again. |

#### 2.C.2 Open questions

None.

#### 2.C.3 Tables and relations

| Table | Holds | Key rules |
| --- | --- | --- |
| `tenancy.membership_invitations` | the invite of an invited member (T9) | token stored hashed; expiry 1–365 days; accepted or revoked, never both |

#### 2.C.4 Permissions

| Code | Roles matrix (Users row) | Allows | Routes (2.7) | Held by default |
| --- | --- | --- | --- | --- |
| signed in, no code | — | accept an invite; the permission catalog | 11 | anyone signed in |
| `membership:update` | Edit | change a member — roles, branches, hours, status; resend an invite | 10 | Owner, Admin |
| `membership:delete` | Delete | remove or restore a member; revoke an invite | 9 | Owner, Admin |

The codes as a whole, with their notes: 2.4.

#### 2.C.5 Common to every route

As 2.5.

#### 2.C.6 Objects returned

**Membership invitation** — `tenancy.membership_invitations`; routes 10, 11

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | `inv_…` |
| `membership_id` | string | `mem_…` |
| `email` | string | where the invite went |
| `expires_at` | ISO datetime | |
| `accepted_at`, `revoked_at` | ISO datetime \| null | at most one is set |
| `created_at` | ISO datetime | |

Route 11 adds `organization_id` (`org_…`) — the organization just joined.

#### 2.C.7 Routes (9–11)

| # | Method | Path (`/api/v1/…`) | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 9 | DELETE | `/tenancy/organization/memberships/{membership_id}/invitation` | Revoke the pending invite **(moved, T9)** | `membership:delete` | |
| 10 | POST | `/tenancy/organization/memberships/{membership_id}/invitation/resend` | Resend the invite **(moved, T9)** | `membership:update` | req |
| 11 | POST | `/tenancy/membership-invitations/{membership_invitation_id}/accept` | The invitee accepts **(renamed, T9)** | signed in | req |

#### 2.C.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 9 | — | — | 204 — the invite is revoked and the invited membership removed |
| 10 | — | `expires_in_days` (1–365, default 7) | Membership invitation |
| 11 | — | `token*` (1–512, from the invite email) | Membership invitation + `organization_id` |

#### 2.C.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 9 | `404` | no pending invite — accepted, revoked, or the member removed |
| 10 | `400` · `invitation_already_accepted` / `invitation_revoked` | (an expired invite can be resent, T11) |
| 11 | `403` (message: email mismatch / verify your email first) | signed in as another email, or the email is not verified |
| 11 | `400` · `invitation_revoked` / `invitation_already_accepted` / `invitation_expired`; `400` (message: invalid token) | |
| 11 | `404` | the member is no longer invited (suspended or removed) |

#### 2.C.10 Rules worth knowing

None beyond 2.10.

#### 2.C.11 Code changes

| # | Change |
| --- | --- |
| TC5 | T9: rename `tenancy.member_invitations` → `tenancy.membership_invitations` (init migration, schema, indexes, RLS); nest revoke and resend under the membership; accept at `/tenancy/membership-invitations/{membership_invitation_id}/accept`; param registry; the invite email's link |
| TC7 | T11: resend accepts an expired invitation |

---

### 2.D Roles — `tenancy/sub-domains/member-roles/` (+ nested `member-role-permission/`) — final

#### 2.D.1 Decisions

| # | Decision |
| --- | --- |
| T3 | System roles (Owner and the 8 seeded roles) keep a fixed name and are never deleted; their tone and description stay editable. Admin is locked — its codes never change; the Owner role's codes never change either. Only custom roles are deleted. |
| T12 | Roles soft-delete with a reason and restore, like everything else (D3): `DELETE` takes `reason` / `note`; new `POST …/roles/{role_id}/restore`. A deleted role is purged after 90 days, so that is the restore window. |
| T15 | One shape per thing: role permissions `GET` and `PUT` both return Role permission[] (today `GET` echoes `role_id` per row, `PUT` differs); a member's effective codes come back as `{ permission_codes }` (was `{ permissions }`); resend returns the invitation itself (was `{ invitation: … }`). |

#### 2.D.2 Open questions

None.

#### 2.D.3 Tables and relations

| Table | Holds | Key rules |
| --- | --- | --- |
| `tenancy.roles` | the organization's roles | name unique among live roles; at most 50 per organization; system roles fixed (T3); soft delete with reason + restore (T12), purged after 90 days |
| `tenancy.role_permissions` | a role's permission codes | key (`role_id`, `permission_code`); the code must exist in the catalog |

#### 2.D.4 Permissions

| Code | Roles matrix (Users row) | Allows | Routes (2.7) | Held by default |
| --- | --- | --- | --- | --- |
| `role:read` | View | roles and their codes | 12, 14, 18 | Owner, Admin |
| `role:create` | Create | create a role | 13 | Owner, Admin |
| `role:update` | Edit | rename / recolour a role; set its codes (the matrix) | 15, 19 | Owner, Admin |
| `role:delete` | Delete | delete or restore a custom role | 16, 17 | Owner, Admin |

The codes as a whole, with their notes: 2.4.

#### 2.D.5 Common to every route

As 2.5.

#### 2.D.6 Objects returned

**Role** — `tenancy.roles`; routes 12–17

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | `rol_…` |
| `name` | string | 1–100, unique among live roles |
| `description` | string \| null | up to 500 |
| `is_system` | boolean | seeded — name fixed, never deleted (T3) |
| `tone` | string | chip colour (default `sky`) |
| `is_locked` | boolean | `true` for Admin — its codes never change |
| `member_count` | integer | active and invited members holding it, as main or extra role |
| `created_at`, `updated_at` | ISO datetime | |

**Role permission** — `tenancy.role_permissions`; routes 18, 19

| Field | Type | Notes |
| --- | --- | --- |
| `permission_code` | string | e.g. `branch:update` |
| `created_at` | ISO datetime | when the role got it |

#### 2.D.7 Routes (12–19)

| # | Method | Path (`/api/v1/…`) | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 12 | GET | `/tenancy/organization/roles` | List roles (with member counts) | `role:read` | |
| 13 | POST | `/tenancy/organization/roles` | Create a role (optionally copy another) | `role:create` | req |
| 14 | GET | `/tenancy/organization/roles/{role_id}` | Get a role | `role:read` | |
| 15 | PATCH | `/tenancy/organization/roles/{role_id}` | Rename / recolour a role | `role:update` | |
| 16 | DELETE | `/tenancy/organization/roles/{role_id}` | Delete a custom role | `role:delete` | |
| 17 | POST | `/tenancy/organization/roles/{role_id}/restore` | Undo a delete **(new, T12)** | `role:delete` | req |
| 18 | GET | `/tenancy/organization/roles/{role_id}/permissions` | A role's codes | `role:read` | |
| 19 | PUT | `/tenancy/organization/roles/{role_id}/permissions` | Replace a role's codes (the matrix) | `role:update` | |

#### 2.D.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 16 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |
| 12 | `q` (name, 1–200), `sort` = `name` (default) \| `created_at`, `order`, `limit`, `after` | — | Role[] (paginated) |
| 13 | — | `name*` (1–100), `description` (up to 500), `tone`, `permission_codes` (up to 200), `copy_from_role_id` (its codes are added) | Role (`member_count` 0) |
| 14 | — | — | Role |
| 15 | — | any of `name`, `description`, `tone`, `expected_updated_at` | Role |
| 17 | — | — | Role |
| 18 | — | — | Role permission[] |
| 19 | — | `permission_codes*` (0–200, no repeats; the full set) | Role permission[] |

#### 2.D.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 13, 19 | `403` (message: cannot grant a code you do not hold) | the caller would hand out a code they lack, or an unknown code |
| 15 | `409` · `record_changed` | `expected_updated_at` is older than the record (T14) |
| 13, 15 | `409` (message: role name taken) | another live role has the name |
| 13 | `409` (message: role limit reached) | 50 roles already |
| 13 | `400` · `copy_from_role_id` | not a live role of the organization |
| 15 | `403` (message: a system role cannot be renamed) | |
| 16 | `403` (message: a system role cannot be deleted) | |
| 16 | `409` (message: the role has members) | someone holds it, in any status |
| 17 | `409` · `record_not_deleted` / `record_restore_conflict` | the role is live, or its name was reused meanwhile |
| 19 | `403` · `role_locked` | the Admin role |
| 19 | `403` (message: the owner role's codes cannot change) | the Owner role |
| 19 | `400` · `permission_codes` | a code repeated |

#### 2.D.10 Rules worth knowing

None beyond 2.10.

#### 2.D.11 Code changes

| # | Change |
| --- | --- |
| TC8 | T12: `tenancy.roles` gains `delete_reason`, `delete_note`; `DELETE` takes `reason` / `note`; new restore route |
| TC14 | `PUT …/permissions`: a repeated code is a `400` (today a database error); routes 18–19 check the `role_id` format like the other role routes |

---

### 2.E Permission catalog — `tenancy/sub-domains/permission/` — final

#### 2.E.1 Decisions

None of its own — 2.1.

#### 2.E.2 Open questions

None.

#### 2.E.3 Tables and relations

| Table | Holds | Key rules |
| --- | --- | --- |
| `tenancy.permissions` | the code catalog — shared, not per organization | `code` is the key; `category` groups the Roles matrix |

#### 2.E.4 Permissions

| Code | Roles matrix (Users row) | Allows | Routes (2.7) | Held by default |
| --- | --- | --- | --- | --- |
| signed in, no code | — | accept an invite; the permission catalog | 20 | anyone signed in |

The codes as a whole, with their notes: 2.4.

#### 2.E.5 Common to every route

As 2.5.

#### 2.E.6 Objects returned

**Permission** — `tenancy.permissions` (the catalog); route 20

| Field | Type | Notes |
| --- | --- | --- |
| `code` | string | e.g. `membership:create` |
| `name` | string | e.g. "Create Members" |
| `description` | string \| null | |
| `category` | string | the matrix row (`leads` … `users`), or `special`, `tenancy`, `billing`, … |
| `created_at` | ISO datetime | |

`tenancy.membership_additional_roles` has no object of its own — it is `role_ids[1…]` on the Membership.

#### 2.E.7 Routes (20)

| # | Method | Path (`/api/v1/…`) | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 20 | GET | `/tenancy/permissions` | The permission catalog | signed in | |

#### 2.E.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 20 | — | — | Permission[] — by category, then code; cacheable (`ETag`, `304`) |

#### 2.E.9 Errors

None beyond 2.9.

#### 2.E.10 Rules worth knowing

None beyond 2.10.

#### 2.E.11 Code changes

None of its own — 2.11.

---
### 2.F Preferences — `memberships/membership-preferences/` — final

#### 2.F.1 Decisions

| # | Decision |
| --- | --- |
| U4 | **One row per membership, upserted** (`INSERT … ON CONFLICT (membership_id) DO UPDATE`) — today two first saves at once are a `500`. Before the first save `GET` returns the defaults with `id`, `created_at` and `updated_at` null (as today). `PATCH` replaces each array it sends. Fields: `pinned_sections` (up to 10, distinct, in bar order — `today` and the matrix sections); `theme` (`light` · `dark` · `system`); `branch_ids` (renamed from `branch_filter_ids`; up to 20 of the branches the member can see; empty = every branch — "keep at least one" is the screen's rule); `patient_file_pins` (up to 11, distinct, from the patient file's sections as sub-domains 7 and 8 left them — `overview` · `activity` · `clinical_notes` · `appointments` · `prescriptions` · `treatments` · `images` · `reports` · `packages` · `invoices` · `payments`; `timeline`, `notes` and `team` go with P8, P20 and 4); `recent_picks` (up to 60 `room:field:value` entries — the server keeps the newest 3 per `room:field`, the design's rule that nothing enforces today). The soft-delete columns go (there is no delete). |

#### 2.F.2 Open questions

None.

#### 2.F.3 Tables and relations

`app.membership_preferences` (no soft-delete columns)

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `membership_id` | `bigint` | no | | → memberships `ON DELETE CASCADE`; unique |
| `pinned_sections` | `text[]` | no | `'{appointments,leads,patients,payments}'` | `<@` the sections, `cardinality ≤ 10` |
| `theme` | `varchar(6)` | no | `'light'` | `light` · `dark` · `system` |
| `patient_file_pins` | `text[]` | no | `'{clinical_notes,appointments,prescriptions,invoices}'` | `<@` the 11 sections, `cardinality ≤ 11` (the default is `patient-file.md`'s) |
| `recent_picks` | `text[]` | no | `'{}'` | `cardinality ≤ 60` |

Indexes: unique `public_id`; unique `(membership_id)`.
`app.membership_preference_branches` (no public id): `membership_preference_id` → membership_preferences `ON DELETE CASCADE`, `branch_id` → branches `ON DELETE CASCADE`, `organization_id`, `created_at`; primary key `(membership_preference_id, branch_id)`; index `(branch_id)`. RLS: organization policy, enabled and forced, on both.

#### 2.F.4 Permissions

| Code | Roles matrix (Users row) | Allows | Routes (2.7) | Held by default |
| --- | --- | --- | --- | --- |
| `organization:read` | — (always on) | the team picker; the caller's own preferences and saved views | 21, 22 | every role |

The codes as a whole, with their notes: 2.4.

#### 2.F.5 Common to every route

As 2.5.

#### 2.F.6 Objects returned

**Preferences**: `id` (`upref_…`, null before the first save), `pinned_sections`, `theme`, `branch_ids`, `patient_file_pins`, `recent_picks`, `created_at`, `updated_at` (both null before the first save).

#### 2.F.7 Routes (21–22)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 21 | GET | `/app/memberships/me/preferences` | My preferences (the defaults before the first save) **(renamed)** | `organization:read` | |
| 22 | PATCH | `/app/memberships/me/preferences` | Save them **(renamed)** | `organization:read` | |

#### 2.F.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 21 | — | — | Preferences |
| 22 | — | at least one of: `pinned_sections`, `theme`, `branch_ids`, `patient_file_pins`, `recent_picks`; optional `expected_updated_at` | Preferences |

#### 2.F.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 22 | `400` · `branch_ids` | a branch the member can't see |
| 22 | `400` · `pinned_sections` / `patient_file_pins` | an unknown section, a repeat, or over the cap |
| 21, 22 | `403` | an API key — no membership |

#### 2.F.10 Rules worth knowing

None beyond 2.10.

#### 2.F.11 Code changes

| # | Change |
| --- | --- |
| UC3 | U4: the upsert; drop the soft-delete columns and the unused id-params and create DTOs; `branch_filter_ids` → `branch_ids` (the link table renamed with `branch_id`) and the can-see check; the new `patient_file_pins` values and default; trim `recent_picks` to 3 per `room:field` |

---

### 2.G Saved views — `memberships/membership-saved-views/` — final

#### 2.G.1 Decisions

| # | Decision |
| --- | --- |
| U5 | **A saved view is a list's filters under a label** (design: "Save as view"; filters only). `list_key` names the list — `patients`, `leads`, `appointments`, `invoices`, `payments`, `offerings`, `memberships`, and the medical and stock lists when the medical store (11) and stock (9) are built; the app keeps that registry with each list's filters, and `filters` are checked against the list's own query parameters (today any JSON is stored). `hidden_columns` stays (up to 40; the design's column picker). `label` 1–60 (the screen names it from the filters), unique per member and list among their views (`409 view_exists`); up to 20 views per list (`409 view_limit` — the design sets none). |
| U6 | **Remove = hard delete**: a personal shortcut, re-made in one click (design: pressing "Save as view" again removes it — "View removed", no undo). An exception to your soft-delete rule, so the restore route and the soft-delete columns go. Other option: soft delete with a reason + restore, as everywhere else. |

#### 2.G.2 Open questions

None.

#### 2.G.3 Tables and relations

`app.membership_saved_views` (no soft-delete columns — U6)

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `membership_id` | `bigint` | no | | → memberships `ON DELETE CASCADE` |
| `list_key` | `varchar(40)` | no | | `~ '^[a-z_]+$'`; one of the registry's lists (app) |
| `label` | `varchar(60)` | no | | 1–60 |
| `filters` | `jsonb` | no | `'{}'` | `jsonb_typeof = 'object'`; that list's filters (app) |
| `hidden_columns` | `text[]` | no | `'{}'` | `cardinality ≤ 40` |

Indexes: unique `public_id`; unique `(membership_id, list_key, lower(label))`; `(membership_id, list_key, created_at)` — today's label index leaves the owner out although every read filters by it. RLS: organization policy, enabled and forced.

#### 2.G.4 Permissions

| Code | Roles matrix (Users row) | Allows | Routes (2.7) | Held by default |
| --- | --- | --- | --- | --- |
| `organization:read` | — (always on) | the team picker; the caller's own preferences and saved views | 23–27 | every role |

The codes as a whole, with their notes: 2.4.

#### 2.G.5 Common to every route

As 2.5.

#### 2.G.6 Objects returned

**Saved view**: `id` (`svw_…`), `list_key`, `label`, `filters`, `hidden_columns`, `created_at`, `updated_at`.

#### 2.G.7 Routes (23–27)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 23 | GET | `/app/memberships/me/saved-views` | My saved views **(renamed)** | `organization:read` | |
| 24 | POST | `/app/memberships/me/saved-views` | Save a view **(renamed)** | `organization:read` | req |
| 25 | GET | `/app/memberships/me/saved-views/{membership_saved_view_id}` | Get one **(renamed)** | `organization:read` | |
| 26 | PATCH | `/app/memberships/me/saved-views/{membership_saved_view_id}` | Rename it or change its filters **(renamed)** | `organization:read` | |
| 27 | DELETE | `/app/memberships/me/saved-views/{membership_saved_view_id}` | Remove it — for good (U6) **(renamed)** | `organization:read` | |

`POST /saved-views/{saved_view_id}/restore` goes (U6).

#### 2.G.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 23 | `list_key`, `q` (label), `sort` = `created_at` (default, oldest first — the chips' order) \| `label`, `order`, `limit`, `after` | — | Saved view[] |
| 24 | — | `list_key*`, `label*`, `filters*`; optional `hidden_columns` | Saved view |
| 25 | — | — | Saved view |
| 26 | — | optional: `label`, `filters`, `hidden_columns`; `expected_updated_at` (`list_key` can't change) | Saved view |
| 27 | — | — | 204 |

#### 2.G.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 24 | `400` · `list_key` | not a list with views |
| 24, 26 | `400` · `filters` | a filter that list doesn't take |
| 24, 26 | `409` · `view_exists` | the label is taken on that list |
| 24 | `409` · `view_limit` | 20 views on that list already |
| 23–27 | `403` | an API key — no membership |
| 25–27 | `404` | not the caller's |

#### 2.G.10 Rules worth knowing

None beyond 2.10.

#### 2.G.11 Code changes

| # | Change |
| --- | --- |
| UC4 | U5: the list registry and the `filters` check; the label uniqueness and the cap; the owner-first index; drop the unused list-limit constant |
| UC5 | U6: hard `DELETE`; drop the restore route and the soft-delete columns |

## 3. Offerings — final (rev 4, confirmed 2026-10-08)

3.1 Decisions · 3.2 Open questions · 3.3 Tables and relations · 3.4 Permissions · 3.5 Common to every route ·
3.6 Objects returned · 3.7 Routes · 3.8 Request details · 3.9 Errors · 3.10 Rules worth knowing · 3.11 Code changes ·
3.12 Nested sub-domains · then **3.A Offering groups · 3.B Offerings · 3.C Offers** — each with the same eleven sections: .1 Decisions ·
.2 Open questions · .3 Tables and relations · .4 Permissions · .5 Common to every route · .6 Objects returned · .7 Routes ·
.8 Request details · .9 Errors · .10 Rules worth knowing · .11 Code changes

What the clinic sells (offerings, sorted into groups) and the time-boxed deals on them (offers). Bookings
(sub-domain 6), the patient's plan (7) and bills (8) all pick from here. Sub-domains 1–2's rules carry over.

### 3.1 Decisions

Taken on your standing answer "go with the recommendation" — confirmed 2026-10-08.

| # | Decision |
| --- | --- |
| O2 | One code set for the sub-domain (D12): `offering:create`, `offering:update`, `offering:delete` cover groups, offerings — prices included — and offers. Reads are open to every member — booking and billing pick from them. `offering_group:*`, `offering:read`, `offer:*` and the special `price:manage` all go. |
| O3 | Prices need no code of their own: `offering:create` sets them, `offering:update` changes them (`price:manage` is gone, O2). Counsellor holds `offering:create` / `offering:update` by default, so it now also changes prices and runs offers. |
| O5 | No branches = every branch, for offerings and offers (the design's "All branches"). An offering not offered at a branch is hidden from that branch's bookings and bills. The offering and offer lists filter by `branch_id` (offered there, every-branch ones included). |

Decisions that belong to one nested sub-domain are in it (3.A to 3.C, section .1).

### 3.2 Open questions

None — every decision above follows the recommendation.

### 3.3 Tables and relations

| Table | Holds | Key rules |
| --- | --- | --- |
| `app.offering_groups` | the menu's sections, e.g. "Laser", "Facials" | name unique in the organization (any case); `sort_order` 0–9999; soft delete + restore |
| `app.offerings` | one thing the clinic sells: price, offer price, lowest price, duration, sessions, validity, GST | name unique (any case); `offering_number` set by the database (next in the organization, never reused); `min_price` ≤ `offer_price` ≤ `price` (O4); soft delete + restore |
| `app.offering_branches` | offering ↔ branch: where it is offered | key (`offering_id`, `branch_id`); none = every branch (O5) |
| `app.offers` | a time-boxed deal: % off, ₹ off, fixed price or extra sessions | `code` unique among live offers (O11); `ends_on` ≥ `starts_on`; soft delete + restore |
| `app.offer_offerings` | offer ↔ offering: what it applies to | key (`offer_id`, `offering_id`); 1–50 per offer |
| `app.offer_branches` | offer ↔ branch: where the desk can use it | key (`offer_id`, `branch_id`); none = every branch (O5) |

```text
tenancy.organizations
   │
   ├──< app.offering_groups ──< app.offerings                      an offering is in at most one group
   │
   ├──< app.offerings ──< app.offering_branches >── app.branches   where it is offered (none = every branch)
   │
   └──< app.offers ──┬──< app.offer_offerings >── app.offerings    what the offer applies to (1–50)
                     └──< app.offer_branches >── app.branches      where it runs (none = every branch)

A ──< B   one A has many B     A >── B   many A for one B
```

Pointing at an offering from later sub-domains (deleting an offering is a soft delete — these keep it):

| Sub-domain | Column |
| --- | --- |
| 6 Appointments | `appointments.offering_id` |
| 7 Treatments & feedback | `treatments.offering_id`, `check_in_next_offerings.next_offering_id` |
| 7 Patient offerings & plan | `patient_offerings.offering_id`, `patient_offering_suggestions.offering_id` — an offering a patient bought is never purged |
| 8 Billing | invoice lines keep the `offering_id` and their own rate in a snapshot (no link) |

### 3.4 Permissions

"Any member" = `organization:read`, which every role holds. Every code of the sub-domain sits in the Offerings row of the Roles matrix.

| Code | Roles matrix | Allows | Routes (3.7) | Held by default |
| --- | --- | --- | --- | --- |
| `organization:read` | — (always on) | read groups, offerings and offers | 1, 3, 7, 10, 14, 16 | every role |
| `offering:create` | Offerings · Create | add a group, an offering (with its prices) or an offer | 2, 9, 15 | Owner, Admin, Counsellor |
| `offering:update` | Offerings · Edit | change a group, an offering (prices included) or an offer — pause and resume too | 4, 11, 17 | Owner, Admin, Counsellor |
| `offering:delete` | Offerings · Delete | delete or restore a group, an offering or an offer | 5, 6, 12, 13, 18, 19 | Owner, Admin |
| `offering:lower_price:read` | Offerings · Lowest price | see `min_price` — without it every offering response carries `null` (O15) | 7–11 | Owner, Admin, Accountant |
| `offering:export` | Offerings · Export | download the offerings CSV (O14) | 8 | Owner, Admin, Doctor, Pharmacist, Accountant |

A missing code is a `403`. Nothing in this sub-domain is branch-scoped for reading (O5 filters, it does not hide).

### 3.5 Common to every route

| Item | Value |
| --- | --- |
| Base | `/api/v1/app` |
| Auth | `Authorization: Bearer <access token>`; the active organization comes from the token |
| Writes | every `POST` needs `X-Idempotency-Key`; `PATCH` takes an optional `expected_updated_at` (a stale save → `409 record_changed`) |
| Success | `200` with `{ data, meta }`; lists `{ data: [...], meta: { pagination: { per_page, next, has_more, estimated_total } } }` (`estimated_total` on the first page, up to 10,000); `DELETE` → `204` |
| Lists | `limit` (1–100, default 25), `after`, `q` (1–200), `sort`, `order`, `created_from` / `created_to` (`to` exclusive) |
| Errors | `{ error: { type, code, reason?, detail, errors[] } }` — `400 invalid_field`, `401`, `403`, `404`, `409`, `422` idempotency key missing or reused |
| Money | rupees with two decimals, as numbers (schema-routes writes paise; the API uses rupees throughout) |

### 3.6 Objects returned

One object per table (3.3); the three link tables show up as id lists on their owner.

Each nested sub-domain lists its own objects (3.A to 3.C, section .6):

| Object | Where |
| --- | --- |
| Offering group | 3.A.6 — Offering groups |
| Offering · Offerings export | 3.B.6 — Offerings |
| Offer | 3.C.6 — Offers |

### 3.7 Routes (19)

| # | Method | Path | Purpose | Gate | Idem | Nested sub-domain |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | GET | `/offering-groups` | List groups (menu order) | any member | | 3.A Offering groups |
| 2 | POST | `/offering-groups` | Add a group | `offering:create` | req | 3.A Offering groups |
| 3 | GET | `/offering-groups/{offering_group_id}` | Get a group | any member | | 3.A Offering groups |
| 4 | PATCH | `/offering-groups/{offering_group_id}` | Rename / reorder a group | `offering:update` | | 3.A Offering groups |
| 5 | DELETE | `/offering-groups/{offering_group_id}` | Delete an empty group (O7) | `offering:delete` | | 3.A Offering groups |
| 6 | POST | `/offering-groups/{offering_group_id}/restore` | Undo a delete | `offering:delete` | req | 3.A Offering groups |
| 7 | GET | `/offerings` | List offerings | any member | | 3.B Offerings |
| 8 | GET | `/offerings/exports` | Download the list as CSV | `offering:export` | | 3.B Offerings |
| 9 | POST | `/offerings` | Add an offering | `offering:create` | req | 3.B Offerings |
| 10 | GET | `/offerings/{offering_id}` | Get an offering | any member | | 3.B Offerings |
| 11 | PATCH | `/offerings/{offering_id}` | Change an offering (prices included) | `offering:update` | | 3.B Offerings |
| 12 | DELETE | `/offerings/{offering_id}` | Delete an offering | `offering:delete` | | 3.B Offerings |
| 13 | POST | `/offerings/{offering_id}/restore` | Undo a delete | `offering:delete` | req | 3.B Offerings |
| 14 | GET | `/offers` | List offers (Live → Scheduled → Paused → Ended) | any member | | 3.C Offers |
| 15 | POST | `/offers` | Add an offer | `offering:create` | req | 3.C Offers |
| 16 | GET | `/offers/{offer_id}` | Get an offer | any member | | 3.C Offers |
| 17 | PATCH | `/offers/{offer_id}` | Change, pause or resume an offer | `offering:update` | | 3.C Offers |
| 18 | DELETE | `/offers/{offer_id}` | Delete an offer | `offering:delete` | | 3.C Offers |
| 19 | POST | `/offers/{offer_id}/restore` | Undo a delete | `offering:delete` | req | 3.C Offers |

Gates are explained in 3.4.

### 3.8 Request details

In each nested sub-domain (3.A to 3.C, section .8).

### 3.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| any by-id | `404` | not in the organization, or deleted |

Each route's own errors are in its nested sub-domain (3.A to 3.C, section .9).

### 3.10 Rules worth knowing

- An offering's GST defaults on create — 0 for a consultation, 18 otherwise; changing the category later does not change it.
- `offer_price` is what the desk bills (empty = the list price). The desk may bill lower, down to `min_price`, with no extra code — never below `min_price`; checked in sub-domain 8 (O16).
- "Billed today" on the offerings list (the best live offer for the branch applied to the offer price, never below the lowest price) is worked out by the screen from the offers; billing applies the same rule.
- Changing a price never changes past invoices — each invoice line keeps its own rate.
- Deleting an offering hides it from new use; past appointments, treatments and patient offerings keep it. Restore works until the purge (organization setting `deleted_record_purge_days`).

### 3.11 Code changes (not built — the code is frozen)

| # | Change |
| --- | --- |
| OC2 | O2: reads gated by `organization:read` (offers today `offer:read`); groups and offers gated by `offering:create` / `offering:update` / `offering:delete`; drop `offering_group:*`, `offering:read`, `offer:*` and `price:manage` from the app permissions, catalog seed, role presets and the Offerings matrix section (the row keeps `offering` only) |
| OC5 | O5: `branch_id` filter on the offering and offer lists (every-branch rows included); sub-domain 6 / 10 enforce "not offered here" when they are built |
| OC17 | Layout (3.12 — confirmed 2026-10-08): move the top-level `offering-groups/` and `offers/` into `app/sub-domains/offerings/` |

Changes that belong to one nested sub-domain are in it (3.A to 3.C, section .11).

### 3.12 Nested sub-domains

One folder per sub-domain, and what it owns are its nested sub-domains, each a folder inside it (your rule, D54). Code: the **`offerings` sub-domain folder** — `src/domains/app/sub-domains/offerings/` (the offering itself at the folder root, with `app.offering_branches`) with `offering-groups/` and `offers/`. Folder names follow the table (P22): `offers` keeps its own name — an offer is not owned by one offering.

| Nested sub-domain | Folder (`src/domains/app/sub-domains/offerings/…`) | Table | Routes (3.7) |
| --- | --- | --- | --- |
| 3.A Offering groups | `offering-groups/` | `app.offering_groups` | 1–6 |
| 3.B Offerings | folder root | `app.offerings`, `app.offering_branches` | 7–13 |
| 3.C Offers | `offers/` | `app.offers`, `app.offer_offerings`, `app.offer_branches` | 14–19 |

The moves are code change OC17.

Each nested sub-domain below has the same eleven sections as the sub-domain (2026-10-08 — layout only: the confirmed content is unchanged, only moved; rows that covered several nested sub-domains appear in each with its own route numbers).

---

### 3.A Offering groups — `offerings/offering-groups/` — final

#### 3.A.1 Decisions

| # | Decision |
| --- | --- |
| O7 | A group with live offerings cannot be deleted (`409` — move or ungroup them first), like a role with members (sub-domain 2). Today it deletes and its offerings keep pointing at a deleted group. |
| O8 | The group list's default order is `sort_order`, then name — that is what `sort_order` is for. Today it is newest first. |

#### 3.A.2 Open questions

None.

#### 3.A.3 Tables and relations

| Table | Holds | Key rules |
| --- | --- | --- |
| `app.offering_groups` | the menu's sections, e.g. "Laser", "Facials" | name unique in the organization (any case); `sort_order` 0–9999; soft delete + restore |

#### 3.A.4 Permissions

| Code | Roles matrix | Allows | Routes (3.7) | Held by default |
| --- | --- | --- | --- | --- |
| `organization:read` | — (always on) | read groups, offerings and offers | 1, 3 | every role |
| `offering:create` | Offerings · Create | add a group, an offering (with its prices) or an offer | 2 | Owner, Admin, Counsellor |
| `offering:update` | Offerings · Edit | change a group, an offering (prices included) or an offer — pause and resume too | 4 | Owner, Admin, Counsellor |
| `offering:delete` | Offerings · Delete | delete or restore a group, an offering or an offer | 5, 6 | Owner, Admin |

The codes as a whole, with their notes: 3.4.

#### 3.A.5 Common to every route

As 3.5.

#### 3.A.6 Objects returned

**Offering group** — `app.offering_groups`; routes 1–6

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | `ogr_…` |
| `name` | string | 1–60, unique in the organization (any case) |
| `sort_order` | integer | 0–9999, default 0 — the menu order (O8) |
| `created_at`, `updated_at` | ISO datetime | |

#### 3.A.7 Routes (1–6)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | `/offering-groups` | List groups (menu order) | any member | |
| 2 | POST | `/offering-groups` | Add a group | `offering:create` | req |
| 3 | GET | `/offering-groups/{offering_group_id}` | Get a group | any member | |
| 4 | PATCH | `/offering-groups/{offering_group_id}` | Rename / reorder a group | `offering:update` | |
| 5 | DELETE | `/offering-groups/{offering_group_id}` | Delete an empty group (O7) | `offering:delete` | |
| 6 | POST | `/offering-groups/{offering_group_id}/restore` | Undo a delete | `offering:delete` | req |

#### 3.A.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 1 | `q` (name), `sort` = `sort_order` (default, then name) \| `name` \| `created_at`, `order`, `limit`, `after` | — | Offering group[] (paginated) |
| 2 | — | `name*` (1–60), `sort_order` (0–9999, default 0) | Offering group |
| 3 | — | — | the record |
| 4 | — | any of `name`, `sort_order`; `expected_updated_at` | Offering group |
| 5 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |
| 6 | — | — | the restored record |

#### 3.A.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 2, 4 | `409` (message: record already exists) | another group has the name |
| 5 | `409` (message: the group has offerings) | live offerings are in it (O7) |
| 4 | `409` · `record_changed` | `expected_updated_at` is older than the record |
| 6 | `409` · `record_not_deleted` / `record_restore_conflict` | the record is live, or its name / code was reused meanwhile |

#### 3.A.10 Rules worth knowing

None beyond 3.10.

#### 3.A.11 Code changes

| # | Change |
| --- | --- |
| OC7 | O7: group delete → `409` while live offerings use it |
| OC8 | O8: group list default order `sort_order`, then name |

---

### 3.B Offerings — `app/sub-domains/offerings/` (folder root) — final

#### 3.B.1 Decisions

| # | Decision |
| --- | --- |
| O1 | Names follow the table (D11): `offerings.group_id` → `offering_group_id` (column, body, filter, response). |
| O4 | Prices: `min_price` ≤ `offer_price` ≤ `price` (the design's "Offer price can't be above the price", "Lowest price can't be above the offer price") — a `400` naming the field. Today `offer_price` above `price` is a `500` and `offer_price` below `min_price` is not checked. |
| O6 | Offerings carry no default room and no default doctor: `default_room_id` and `default_doctor_membership_id` go — an offering links only to its group, branches and offers. |
| O9 | `q` on offerings also searches `search_terms` (aliases such as "laser"). Today they are stored and never searched. |
| O13 | An inactive offering (`is_active=false`) cannot be newly booked, sold or suggested (sub-domains 6, 7, 8); past records keep it. Today only a deleted offering is refused. |
| O14 | Exporting offerings has its own code, `offering:export` (was the shared special `list:export`), shown in the Offerings row of the Roles matrix as **Export**. Default holders unchanged: Owner, Admin, Doctor, Pharmacist, Accountant. The other 11 exports keep `list:export` until their sub-domains move them the same way; `list:export` goes once the last one has moved. |
| O15 | `lowest_price:read` → `offering:lower_price:read` — the sub-domain's code for seeing `min_price` (the design's "Lowest price"), in the Offerings row of the Roles matrix. Default holders unchanged: Owner, Admin, Accountant. |
| O16 | `offer_price:bill_below` goes, with its rule: the desk may bill below an offering's offer price, down to `min_price`, with no extra code. Nobody bills below `min_price` (sub-domain 8). |

#### 3.B.2 Open questions

None.

#### 3.B.3 Tables and relations

| Table | Holds | Key rules |
| --- | --- | --- |
| `app.offerings` | one thing the clinic sells: price, offer price, lowest price, duration, sessions, validity, GST | name unique (any case); `offering_number` set by the database (next in the organization, never reused); `min_price` ≤ `offer_price` ≤ `price` (O4); soft delete + restore |
| `app.offering_branches` | offering ↔ branch: where it is offered | key (`offering_id`, `branch_id`); none = every branch (O5) |

#### 3.B.4 Permissions

| Code | Roles matrix | Allows | Routes (3.7) | Held by default |
| --- | --- | --- | --- | --- |
| `organization:read` | — (always on) | read groups, offerings and offers | 7, 10 | every role |
| `offering:create` | Offerings · Create | add a group, an offering (with its prices) or an offer | 9 | Owner, Admin, Counsellor |
| `offering:update` | Offerings · Edit | change a group, an offering (prices included) or an offer — pause and resume too | 11 | Owner, Admin, Counsellor |
| `offering:delete` | Offerings · Delete | delete or restore a group, an offering or an offer | 12, 13 | Owner, Admin |
| `offering:lower_price:read` | Offerings · Lowest price | see `min_price` — without it every offering response carries `null` (O15) | 7–11 | Owner, Admin, Accountant |
| `offering:export` | Offerings · Export | download the offerings CSV (O14) | 8 | Owner, Admin, Doctor, Pharmacist, Accountant |

The codes as a whole, with their notes: 3.4.

#### 3.B.5 Common to every route

As 3.5.

#### 3.B.6 Objects returned

**Offering** — `app.offerings`; routes 7, 9–13

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | `off_…` |
| `offering_number` | integer | set by the database, never reused — shown as "#274" |
| `name` | string | 1–120, unique in the organization (any case) |
| `category` | string | `consultation` · `treatment` (default) · `package` · `lhr` · `product` |
| `specialty` | string | `skin` (default) · `hair` · `dental` · `gynac` · `physio` · `general` |
| `tone` | string | chip colour (default `sage`) |
| `price` | number | the list price |
| `offer_price` | number \| null | what is billed; `null` = the list price (O4) |
| `min_price` | number \| null | the lowest the desk may bill (default 0); `null` without `offering:lower_price:read` (O15) |
| `duration_minutes` | integer | 5–480, default 30 |
| `sessions` | integer | 1–99, default 1 |
| `validity_days` | integer | 0–1095, default 0 = no expiry |
| `gst_percent` | integer | 0 · 5 · 12 · 18 · 28 — default 0 for a consultation, else 18 |
| `is_gst_inclusive` | boolean | default `false` |
| `offering_group_id` | string \| null | `ogr_…` (O1) |
| `branch_ids` | string[] | `brn_…`, up to 20; empty = every branch (O5) |
| `is_active` | boolean | default `true`; `false` = not offered now (O13) |
| `search_terms` | string[] | up to 20, each 1–60 — searched by `q` (O9) |
| `description` | string \| null | up to 1000 |
| `created_at`, `updated_at` | ISO datetime | |

**Offerings export** — route 8

| Field | Type | Notes |
| --- | --- | --- |
| `file_name` | string | `offerings-YYYY-MM-DD.csv` |
| `content_type` | string | `text/csv` |
| `row_count` | integer | up to 5,000 |
| `is_truncated` | boolean | `true` when more than 5,000 matched |
| `content` | string | the CSV — the Offering fields as columns; lists joined with `\|` |

#### 3.B.7 Routes (7–13)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 7 | GET | `/offerings` | List offerings | any member | |
| 8 | GET | `/offerings/exports` | Download the list as CSV | `offering:export` | |
| 9 | POST | `/offerings` | Add an offering | `offering:create` | req |
| 10 | GET | `/offerings/{offering_id}` | Get an offering | any member | |
| 11 | PATCH | `/offerings/{offering_id}` | Change an offering (prices included) | `offering:update` | |
| 12 | DELETE | `/offerings/{offering_id}` | Delete an offering | `offering:delete` | |
| 13 | POST | `/offerings/{offering_id}/restore` | Undo a delete | `offering:delete` | req |

#### 3.B.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 10 | — | — | the record |
| 12 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |
| 13 | — | — | the restored record |
| 7, 8 | `q` (name, number such as `274` / `#274`, search terms), `category`, `specialty`, `is_active`, `offering_group_id`, `branch_id` (O5), `sort` = `created_at` (default, newest first) \| `name`, `order`, `limit`, `after` (8 ignores `limit` / `after`) | — | 7: Offering[] (paginated) · 8: Offerings export |
| 9 | — | `name*` (1–120), `price*`; optional: `category`, `specialty`, `tone`, `offer_price`, `min_price`, `duration_minutes`, `sessions`, `validity_days`, `gst_percent`, `is_gst_inclusive`, `offering_group_id`, `branch_ids` (up to 20, no repeats), `is_active`, `search_terms`, `description` | Offering |
| 11 | — | any field of #9 (at least one); `branch_ids` replaces the set, `[]` = every branch; `expected_updated_at` | Offering |

#### 3.B.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 9, 11 | `409` (message: record already exists) | another offering has the name |
| 9, 11 | `400` · `offer_price` / `min_price` | breaks `min_price` ≤ `offer_price` ≤ `price` (O4) |
| 9, 11 | `400` · `offering_group_id` / `branch_ids` | not a live record of the organization |
| 8 | `403` | missing `offering:export` |
| 11 | `409` · `record_changed` | `expected_updated_at` is older than the record |
| 13 | `409` · `record_not_deleted` / `record_restore_conflict` | the record is live, or its name / code was reused meanwhile |

#### 3.B.10 Rules worth knowing

None beyond 3.10.

#### 3.B.11 Code changes

| # | Change |
| --- | --- |
| OC1 | O1: rename `offerings.group_id` → `offering_group_id` (init migration, schema, DTO, list filter, serializer) |
| OC3 | O3: drop the guarded-field check on `price`, `offer_price` and `min_price` (`offerings.controller.ts`) and its mention in `base-record.controller.ts` / `offerings.rules.ts` |
| OC4 | O4: check `min_price` ≤ `offer_price` ≤ `price` in the service (`400`), on create and on the merged row for a `PATCH` |
| OC6 | O6: drop `offerings.default_room_id` and `default_doctor_membership_id` with their foreign keys (init migration, schema, DTO, serializer, the reference checks) |
| OC9 | O9: `q` on offerings also matches `search_terms` |
| OC13 | O13: appointments, invoice lines and offering suggestions refuse an inactive offering — lands with sub-domains 6, 7 and 8 |
| OC14 | O14: new code `offering:export` (app permissions, catalog seed — category `offerings`, role presets for today's `list:export` holders, the matrix's Export column for the Offerings row); route 8 gated by it |
| OC15 | O15: rename `lowest_price:read` → `offering:lower_price:read` (app permissions, catalog seed — category `offerings`, Accountant's preset, the hidden-field map in `offerings.controller.ts`, the matrix) |
| OC16 | O16: drop `offer_price:bill_below` (app permissions, catalog seed, Doctor and Counsellor presets); sub-domain 8 checks only `min_price` |

---

### 3.C Offers — `offerings/offers/` — final

#### 3.C.1 Decisions

| # | Decision |
| --- | --- |
| O10 | Offers: `is_paused` → `is_active` (default `true`) — one word for "switched off" across the API (branches, rooms, offerings). The response adds a derived `status` — `live` · `scheduled` · `paused` · `ended` (schema-routes). The list's default order is the design's Live → Scheduled → Paused → Ended, newest first inside each; filters `status`, `offering_id`, `branch_id`. |
| O11 | Offer `value` by kind: `percent` 1–100; `amount` (₹ off) and `fixed` (fixed price) in rupees; `extra` whole sessions 1–99. Offer `code` is stored uppercase (A–Z, 0–9; any case accepted) and unique among live offers — `409` (schema-routes "code exists"). Today any percent passes, a lowercase code is a `500` and duplicates are allowed. |
| O12 | An offer's offerings must be active (the design lists "active offerings only") — `400` otherwise. |

#### 3.C.2 Open questions

None.

#### 3.C.3 Tables and relations

| Table | Holds | Key rules |
| --- | --- | --- |
| `app.offers` | a time-boxed deal: % off, ₹ off, fixed price or extra sessions | `code` unique among live offers (O11); `ends_on` ≥ `starts_on`; soft delete + restore |
| `app.offer_offerings` | offer ↔ offering: what it applies to | key (`offer_id`, `offering_id`); 1–50 per offer |
| `app.offer_branches` | offer ↔ branch: where the desk can use it | key (`offer_id`, `branch_id`); none = every branch (O5) |

#### 3.C.4 Permissions

| Code | Roles matrix | Allows | Routes (3.7) | Held by default |
| --- | --- | --- | --- | --- |
| `organization:read` | — (always on) | read groups, offerings and offers | 14, 16 | every role |
| `offering:create` | Offerings · Create | add a group, an offering (with its prices) or an offer | 15 | Owner, Admin, Counsellor |
| `offering:update` | Offerings · Edit | change a group, an offering (prices included) or an offer — pause and resume too | 17 | Owner, Admin, Counsellor |
| `offering:delete` | Offerings · Delete | delete or restore a group, an offering or an offer | 18, 19 | Owner, Admin |

The codes as a whole, with their notes: 3.4.

#### 3.C.5 Common to every route

As 3.5.

#### 3.C.6 Objects returned

**Offer** — `app.offers`; routes 14–19

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | `ofr_…` |
| `name` | string | 1–80 |
| `code` | string \| null | 1–16, uppercase A–Z 0–9, unique among live offers (O11) |
| `kind` | string | `percent` (default) · `amount` · `fixed` · `extra` |
| `value` | number | `percent` 1–100 · `amount` / `fixed` rupees · `extra` sessions 1–99 (O11) |
| `offering_ids` | string[] | `off_…`, 1–50, active offerings (O12) |
| `branch_ids` | string[] | `brn_…`, up to 20; empty = every branch (O5) |
| `starts_on`, `ends_on` | `YYYY-MM-DD` \| null | empty start = now, empty end = open; ends on or after it starts |
| `is_active` | boolean | default `true`; `false` = paused (O10) |
| `status` | string | derived: `live` · `scheduled` · `paused` · `ended` (O10) |
| `tone` | string | chip colour (default `blush`) |
| `note` | string \| null | up to 280 |
| `created_at`, `updated_at` | ISO datetime | |

#### 3.C.7 Routes (14–19)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 14 | GET | `/offers` | List offers (Live → Scheduled → Paused → Ended) | any member | |
| 15 | POST | `/offers` | Add an offer | `offering:create` | req |
| 16 | GET | `/offers/{offer_id}` | Get an offer | any member | |
| 17 | PATCH | `/offers/{offer_id}` | Change, pause or resume an offer | `offering:update` | |
| 18 | DELETE | `/offers/{offer_id}` | Delete an offer | `offering:delete` | |
| 19 | POST | `/offers/{offer_id}/restore` | Undo a delete | `offering:delete` | req |

#### 3.C.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 16 | — | — | the record |
| 18 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |
| 19 | — | — | the restored record |
| 14 | `q` (name, code), `status` (O10), `kind`, `offering_id`, `branch_id`, `starts_on_from` / `starts_on_to`, `sort` = `status` (default) \| `created_at` \| `name` \| `starts_on`, `order`, `limit`, `after` | — | Offer[] (paginated) |
| 15 | — | `name*` (1–80), `value*`, `offering_ids*` (1–50, no repeats); optional: `code`, `kind`, `branch_ids` (up to 20), `starts_on`, `ends_on`, `is_active`, `tone`, `note` | Offer |
| 17 | — | any field of #15 (at least one); `expected_updated_at` | Offer |

#### 3.C.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 15, 17 | `400` · `value` | outside the range for its kind (O11) |
| 15, 17 | `400` · `code` | not A–Z / 0–9, or longer than 16 |
| 15, 17 | `409` (message: the code is in use) | another live offer has the code (O11) |
| 15, 17 | `400` · `offering_ids` | an offering is deleted, inactive or not in the organization (O12) |
| 15, 17 | `400` · `branch_ids` | a branch is not in the organization |
| 15, 17 | `400` · `ends_on` | ends before it starts |
| 17 | `409` · `record_changed` | `expected_updated_at` is older than the record |
| 19 | `409` · `record_not_deleted` / `record_restore_conflict` | the record is live, or its name / code was reused meanwhile |

#### 3.C.10 Rules worth knowing

None beyond 3.10.

#### 3.C.11 Code changes

| # | Change |
| --- | --- |
| OC10 | O10: offers `is_paused` → `is_active` (column, DTO, serializer); derived `status`; default order by status; filters `status`, `offering_id`, `branch_id`; `sort=starts_on` keeps offers without a start date (today dropped) |
| OC11 | O11: per-kind `value` checks; `code` uppercased and checked in the DTO; unique index on live offers (`organization_id`, `code`) → `409` |
| OC12 | O12: an offer's offerings must be active |

---

## Sub-domains 4–7 — one connected design (2026-10-08)

Rebuilt together on your direction: **one person = one contact**, and the lead, the conversation, the
patient file and the appointments all hang off it. The four sub-domains below — contacts with their activity, leads, appointments, patients — are written against each other
and against the design files (`leads.md`, `patients.md`, `appointments.md`, `today.md`, `schema-routes.md`).

```text
app.contacts (4)   ─┬──< app.contact_phones (4)                              its numbers; a number belongs to one household
                    ├──< app.leads (5)                                       many over time, at most one open
                    ├──< app.contact_activities (4)                          the one activity stream — messages, calls, notes, system events
                    ├─── app.patients (7)                                    at most one patient file
                    ├──< app.contact_members (4)   >── tenancy.memberships   the team members who handle them
                    └──< app.appointments (6)                                bookings — and, once checked in, the visit

A ──< B   one A has many B     A >── B   many A for one B     A ──> B   a column on A points at one B     A ─── B   at most one B per A
```

What moves, compared with the code today:

| Today | After |
| --- | --- |
| a person's name, numbers, email, Instagram, default channel, preferences, household — copied on `app.leads` **and** `app.patients` | once, on `app.contacts` + `app.contact_phones` (4) |
| `app.messages` with exactly one of `lead_id` / `patient_id` / `medical_contact_id` | `app.contact_activities` with one `contact_id` — messages, call logs, notes and system events (4) |
| `app.appointments` with exactly one of `patient_id` / `lead_id` | one `contact_id` (6) — anyone can be booked |
| hidden "contact-thread" leads for appointments of non-leads (`kind = contact_thread`, `is_contact_thread`) | gone — the contact is enough |
| `app.lead_reads` (per lead, reader kept in an audit column) | gone — "awaiting reply" comes from the contact's last sent and received times (4) |
| a manual `POST /leads/{lead_id}/convert` that copies the person and moves the messages | automatic at check-in: the open lead becomes `clinic_visited` (its last status) and the contact gets a patient file if it has none — nothing is copied or moved (5, 6) |
| no double-booking check in the database (JavaScript + an advisory lock) | exclusion constraints on doctor, room and machine (6) |
| a patient's gender, birth date and referral on `app.patients` | on the contact (4) |
| `app.visits` beside `app.appointments` (one-to-one) | merged: the floor stage is on the appointment; consult notes go to the patient file (6, 7) |
| `GET /patients/{patient_id}/timeline`, `GET /searches` | the contact's activity (4) and the contacts search (4) |
| nobody records who looks after a person across leads, visits and the patient file | `app.contact_members` (4) |

**Database rules shared by the five sub-domains** (PostgreSQL; the existing conventions, plus what is new here):

| Rule | How |
| --- | --- |
| Tenant isolation (RLS) | `organization_id` on **every** table, link tables included; RLS enabled **and forced** with the organization policy; API ids resolve inside the caller's organization — each table's design below says so again |
| Branch visibility | an application filter, not RLS — it depends on the caller's branches and `branch:read`: leads and appointments (with their floor stage) are filtered by branch; contacts, contact activity and patients are not (a person may visit any branch) |
| Record columns | `id bigint`, `public_id varchar(28)` unique, `timestamptz` audit columns; soft delete (`deleted_at`, `delete_reason`, `delete_note`); every unique index is partial `WHERE deleted_at IS NULL` |
| Enums | `varchar` + `CHECK` — a new value is one constraint change, no `ALTER TYPE` |
| Running numbers | `BEFORE INSERT` trigger `app.fn_assign_record_number` + `app.record_counters` — per organization, never reused |
| Links a guarded delete depends on | `ON DELETE RESTRICT` (contact ← lead / patient / appointment; patient ← clinical records); optional links `ON DELETE SET NULL` |
| One-of rules | partial unique indexes: one open lead per contact, one patient file per contact, one primary number |
| Overlap rules | exclusion constraints with **`btree_gist` (new extension)**: a number in one household only; no double-booked doctor, room or machine |
| Lists and search | keyset index `(organization_id, <sort column>, id) WHERE deleted_at IS NULL` per default sort; trigram GIN on `search_text` for `q` |
| Values | phone `varchar(13)` `CHECK (~ '^\+91\d{10}$')`; money `numeric(12,2)`; clinic dates and times as local `date` + `time` (organization time zone) |
| Denormalised on purpose | on `app.contacts`: `primary_phone` (lists never join the numbers), `search_text` (one index for names, email, Instagram, every number, contact number), `last_activity_at` / `last_sent_at` / `last_received_at` (sorting and "awaiting reply" without scanning the activity) — each written in the same transaction as its source, by trigger or by the service |

---

## 4. Contacts — final (confirmed 2026-10-08) — nested sub-domains 4.A–4.D

*Restructured 2026-10-08: old sub-domains 3.5 (rev 7) and 4.5 (rev 8) in one section — layout only, no decision changed.*

Code: the **`contacts` sub-domain folder** — `src/domains/app/sub-domains/contacts/` (the contact itself at the folder root) with `contact-members/`, `contact-activities/` and `contact-message-templates/`.

4.1 Decisions (whole sub-domain) · 4.2 Open questions · 4.3 Tables and relations · 4.4 Permissions · 4.5 Common to every route ·
4.6 Objects returned · 4.7 Routes · 4.8 Request details · 4.9 Errors · 4.10 Rules worth knowing · 4.11 Code changes (whole sub-domain) ·
4.12 Nested sub-domains · then **4.A Contacts · 4.B Contact members · 4.C Contact activities · 4.D Contact message templates** — each with the same eleven sections: .1 Decisions ·
.2 Open questions · .3 Tables and relations · .4 Permissions · .5 Common to every route · .6 Objects returned · .7 Routes ·
.8 Request details · .9 Errors · .10 Rules worth knowing · .11 Code changes

One person, one record — and everything that happens with them in one stream.

**Contacts.** One person — name, numbers, Instagram, preferences — saved once and shared by their lead (5), activity
(4.C–4.D), patient file (7) and appointments (6). Design: the contact editor ("One contact · shared by leads,
patients and chats", "C-<5 digits>"). Walk-in buyers (sub-domain 11's `medical_contacts`) are not part of it —
sub-domain 11 removes that table.

**Contact activity.** Everything that happens with a contact (4.A–4.B) in one stream — WhatsApp and Instagram messages, call logs, the
team's notes and system events ("Moved to Clinic visited at check-in") — one stream per person, lead, patient
or neither. The design calls it "Contact activity"; the lead drawer and appointment form show it as "Chat".
Plus the reusable templates for outgoing messages. Route numbers run 1–22.

### 4.1 Decisions (whole sub-domain)

Taken on your standing answer "go with the recommendation" — confirmed 2026-10-08. A decision that belongs to one table is in its nested sub-domain.

| # | Decision |
| --- | --- |
| CT5 | One code set, in a new **Contacts** row of the Roles matrix: `contact:read`, `contact:create`, `contact:update`, `contact:delete`. |
| CT6 | Contacts are not branch-scoped — a person may visit any branch; their lead and appointments keep their own branch rules. |
| M4 | One code set, in a new **Activity** row of the Roles matrix (names follow the table): `contact_activity:read` (read the stream), `contact_activity:create` (send a message, log a call, add a note, a batch; add a template), `contact_activity:update` (resend a failed message; change a template), `contact_activity:delete` (delete or restore a template — entries are never deleted). Templates are readable by every member. `message_template:*` goes. |
| M10 | **The stream is the person's timeline** (the patient timeline goes, sub-domain 7 P8): every sub-domain writes a `system` entry linked to its record when something happens — check-in (which also opens the patient file) and completion (6), a prescription approved, a clinical note, an image or report added (7), a treatment session, a check-in score, a review (7), a patient offering bought (7), an invoice or payment (8), a task done (10). **An entry linked to a record shows only to callers who can read that record** (`patient_prescription:read`, `invoice:read`, `patient:clinical_record:read`, …), so the stream keeps the timeline's privacy; the `group` filter (`messages` · `clinical` · `money` · `tasks`) narrows it. |

### 4.2 Open questions

None — every decision follows the recommendation.

### 4.3 Tables and relations

**Contacts**

| Table | Holds | Key rules |
| --- | --- | --- |
| `app.contacts` | one person | `contact_number` from the counter, never reused; soft delete + restore, blocked while in use (CT7) |
| `app.contact_phones` | a contact's numbers | 1–5, exactly one primary; a number in one household only (CT3); follows the contact's soft delete |
| `app.contact_members` | contact ↔ membership: who handles this person | key (`contact_id`, `membership_id`) (CT11) |

```text
tenancy.organizations
   │
   └──< app.contacts ──┬──< app.contact_phones                            its numbers — one primary; a number lives in one household
                       ├──< app.contact_members >── tenancy.memberships   the team members who handle them (CT11)
                       ├──> app.contacts (referred_by_contact_id)         who sent them
                       └──> app.contacts (household_contact_id)           the household it belongs to (itself when first)

A ──< B   one A has many B     A >── B   many A for one B     A ──> B   a column on A points at one B     A ─── B   at most one B per A
```

Pointing at a contact (all `ON DELETE RESTRICT` except the activity, which goes with the contact):

| Sub-domain | Column |
| --- | --- |
| 5 Leads | `leads.contact_id` — many over time, one open |
| 4.C Contact activity | `contact_activities.contact_id` (`ON DELETE CASCADE`) |
| 7 Patients | `patients.contact_id` — one patient file |
| 6 Appointments | `appointments.contact_id` — who is booked |
| 8 Billing | `invoices.contact_id` — who is billed; `payments.contact_id`, `pending_credits.contact_id` (B3) |
| 10 Tasks | `tasks.contact_id` — whom a task is about (`ON DELETE CASCADE`, goes with the contact) |

Standard columns on every record table (not repeated below): `id bigint` (identity), `public_id varchar(28)` unique, `organization_id bigint` → organizations `ON DELETE CASCADE`, `created_at` / `updated_at timestamptz`, `created_by_user_id` / `updated_by_user_id`, and — where it soft-deletes — `deleted_at`, `delete_reason`, `delete_note` with their three checks; RLS enabled and forced. Each table's design is in its nested sub-domain.

**Contact activity**

| Table | Holds | Key rules |
| --- | --- | --- |
| `app.contact_activities` | one entry — a WhatsApp or Instagram message, a call log, a note or a system event | append-only (M7); at most one record link (M5) |
| `app.contact_message_templates` | reusable texts for outgoing messages | name unique in the organization (any case); soft delete + restore |

```text
tenancy.organizations
   │
   ├──< app.contact_activities ──┬──> app.contacts                                       whose activity      
   │                             ├──> app.contact_message_templates                      the template used
   │                             ├──> app.contact_activities                             the entry it answers
   │                             ├──> tenancy.memberships                                who wrote it (null when received / system)
   │                             └──> appointment · invoice · payment · prescription ·   at most one: what the entry is about
   │                                  patient offering · review · check-in · task · treatment ·
   │                                  clinical note · image · report
   │
   └──< app.contact_message_templates                                                    reusable texts for outgoing messages

A ──< B   one A has many B     A >── B   many A for one B     A ──> B   a column on A points at one B     A ─── B   at most one B per A
```

Standard columns as above.

### 4.4 Permissions

One code set (CT5), in the new **Contacts** row of the Roles matrix.

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `contact:read` | Contacts · View | contacts, the preview, who handles them | 1, 3, 7, 8 | Owner, Admin, Doctor, Therapist, Front desk, Counsellor, Pharmacist, Accountant, Marketing |
| `contact:create` | Contacts · Create | add a contact | 2 | all but Accountant |
| `contact:update` | Contacts · Edit | change a contact — "applies everywhere"; set who handles them | 4, 9 | all but Accountant |
| `contact:delete` | Contacts · Delete | delete or restore a contact | 5, 6 | Owner, Admin |
| `organization:read` | — (always on) | templates | 17, 19 | every role |
| `contact_activity:read` | Activity · View | a contact's stream | 10, 14 | Owner, Admin, Doctor, Therapist, Front desk, Counsellor, Pharmacist, Marketing |
| `contact_activity:create` | Activity · Create | send a message, log a call, add a note, a bulk send; add a template | 11, 12, 13, 16, 18 | same |
| `contact_activity:update` | Activity · Edit | resend a failed message; change a template | 15, 20 | same |
| `contact_activity:delete` | Activity · Delete | delete or restore a template | 21, 22 | Owner, Admin |

One code set (M4), in the new **Activity** row of the Roles matrix. "Any member" = `organization:read`.

Contacts are open to every holder of `contact:read` (CT6). The preview's appointments also need `appointment:read`.

A stream is open to every holder of `contact_activity:read` — like contacts, it is not branch-scoped. An entry linked to a record shows only to callers who can read that record (M10).

### 4.5 Common to every route

| Item | Value |
| --- | --- |
| Base | `/api/v1/app` |
| Auth | `Authorization: Bearer <access token>`; the active organization comes from the token |
| Writes | every `POST` needs `X-Idempotency-Key`; `PATCH` takes an optional `expected_updated_at` (a stale save → `409 record_changed`) |
| Success | `200` with `{ data, meta }`; lists `{ data: [...], meta: { pagination: { per_page, next, has_more, estimated_total } } }` (`estimated_total` on the first page, up to 10,000); `DELETE` → `204` |
| Lists | `limit` (1–100, default 25), `after`, `q` (1–200), `sort`, `order`, `created_from` / `created_to` (`to` exclusive) |
| Errors | `{ error: { type, code, reason?, detail, errors[] } }` — `400 invalid_field`, `401`, `403`, `404`, `409`, `422` idempotency key missing or reused |

### 4.6 Objects returned

Each nested sub-domain lists its own objects (4.A to 4.D, section .6):

| Object | Where |
| --- | --- |
| Contact · Contact phone · Contact preview | 4.A.6 — Contacts |
| Contact member | 4.B.6 — Contact members |
| Contact activity | 4.C.6 — Contact activities |
| Contact message template | 4.D.6 — Contact message templates |

### 4.7 Routes

Every route of the sub-domain in one table; each nested sub-domain repeats its own with the details.

| # | Method | Path | Purpose | Gate | Idem | Nested sub-domain |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | GET | `/contacts` | List / find contacts **(rebuilt)** | `contact:read` | | 4.A Contacts |
| 2 | POST | `/contacts` | Add a contact **(new)** | `contact:create` | req | 4.A Contacts |
| 3 | GET | `/contacts/{contact_id}` | Get a contact **(new)** | `contact:read` | | 4.A Contacts |
| 4 | PATCH | `/contacts/{contact_id}` | Change a contact **(new)** | `contact:update` | | 4.A Contacts |
| 5 | DELETE | `/contacts/{contact_id}` | Delete a contact not in use **(new)** | `contact:delete` | | 4.A Contacts |
| 6 | POST | `/contacts/{contact_id}/restore` | Undo a delete **(new)** | `contact:delete` | req | 4.A Contacts |
| 7 | GET | `/contacts/{contact_id}/preview` | The hover card | `contact:read` | | 4.A Contacts |
| 8 | GET | `/contacts/{contact_id}/members` | Who handles this person **(new, CT11)** | `contact:read` | | 4.B Contact members |
| 9 | PUT | `/contacts/{contact_id}/members` | Replace who handles them **(new, CT11)** | `contact:update` | | 4.B Contact members |
| 10 | GET | `/contacts/{contact_id}/activities` | The contact's stream **(moved, M1)** | `contact_activity:read` | | 4.C Contact activities |
| 11 | POST | `/contacts/{contact_id}/activities/send-message` | Send a WhatsApp or Instagram message **(new, M12)** | `contact_activity:create` | req | 4.C Contact activities |
| 12 | POST | `/contacts/{contact_id}/activities/log-call` | Log a call that happened **(new, M12)** | `contact_activity:create` | req | 4.C Contact activities |
| 13 | POST | `/contacts/{contact_id}/activities/add-note` | Add an internal note **(new, M12)** | `contact_activity:create` | req | 4.C Contact activities |
| 14 | GET | `/contacts/{contact_id}/activities/{contact_activity_id}` | Get an entry | `contact_activity:read` | | 4.C Contact activities |
| 15 | POST | `/contacts/{contact_id}/activities/{contact_activity_id}/resend` | Re-queue a failed message | `contact_activity:update` | req | 4.C Contact activities |
| 16 | POST | `/contact-activities/message-batches` | One message to many contacts **(renamed, M12)** | `contact_activity:create` | req | 4.C Contact activities |
| 17 | GET | `/contact-message-templates` | List templates | any member | | 4.D Contact message templates |
| 18 | POST | `/contact-message-templates` | Add a template | `contact_activity:create` | req | 4.D Contact message templates |
| 19 | GET | `/contact-message-templates/{contact_message_template_id}` | Get a template | any member | | 4.D Contact message templates |
| 20 | PATCH | `/contact-message-templates/{contact_message_template_id}` | Change a template | `contact_activity:update` | | 4.D Contact message templates |
| 21 | DELETE | `/contact-message-templates/{contact_message_template_id}` | Delete a template | `contact_activity:delete` | | 4.D Contact message templates |
| 22 | POST | `/contact-message-templates/{contact_message_template_id}/restore` | Undo a delete | `contact_activity:delete` | req | 4.D Contact message templates |

### 4.8 Request details

In each nested sub-domain (4.A to 4.D, section .8).

### 4.9 Errors

Every route can answer the errors in 4.5; each route's own errors are in its nested sub-domain (4.A to 4.D, section .9).

### 4.10 Rules worth knowing

- One search serves every picker: type a name, part of a name, any number or a contact number (CT9).
- Searching by phone finds every contact with that number — one person, or a household sharing it.
- Changing a contact changes it everywhere: lead, patient file, appointments and conversation read the one record.
- Restore works until the purge (organization setting `deleted_record_purge_days`); a contact in use is never purged.

- A sent whatsapp, instagram or outgoing call moves the contact's open lead from `new` to `contacted` (sub-domain 5) and clears "awaiting reply"; a received one sets it.
- The server writes `system` entries for the moments the team should see in the stream — e.g. check-in (sub-domain 6), lead convert (sub-domain 5).
- A note is internal — never sent; a call log records a call that happened, either way.
- Until the messaging worker exists (M8), whatsapp and instagram messages are stored, not sent.

### 4.11 Code changes (whole sub-domain)

| # | Change |
| --- | --- |
| CTC10 | Layout: the contact at the root of `src/domains/app/sub-domains/contacts/` (today that folder holds only the union search, which goes) with `contact-members/` |
| CTC4 | CT7: `ON DELETE RESTRICT` from leads, patients and appointments; soft delete → `409 contact_in_use` while in use |
| MC2 | M3: drop `app.lead_reads` and `POST /leads/{lead_id}/reads`; "awaiting reply" from `last_received_at` / `last_sent_at` |
| MC3 | M4: codes `contact_activity:*`, an Activity matrix section, the role presets; templates gated by them; drop `message_template:*` |
| MC8 | M10: each sub-domain writes its `system` entries; the list hides entries whose linked record the caller cannot read; the `group` filter |
| MC11 | Layout: both nested sub-domains move into the contacts folder (`app/sub-domains/contacts/…`) — today the top-level `app/sub-domains/messages/` and `message-templates/` |

### 4.12 Nested sub-domains

| Nested sub-domain | Folder | Tables | Routes | Status |
| --- | --- | --- | --- | --- |
| 4.A Contacts | folder root | `app.contacts`, `app.contact_phones` (no routes of its own — part of the contact) | 1–7 | final |
| 4.B Contact members | `contact-members/` | `app.contact_members` | 8–9 | final |
| 4.C Contact activities | `contact-activities/` | `app.contact_activities` | 10–16 | final |
| 4.D Contact message templates | `contact-message-templates/` | `app.contact_message_templates` | 17–22 | final |

---

### 4.A Contacts — `app/sub-domains/contacts/` (folder root) — final

#### 4.A.1 Decisions

| # | Decision |
| --- | --- |
| CT1 | New table `app.contacts` holds the person: `contact_number` ("C-12345"), `first_name`, `last_name`, `gender`, `date_of_birth`, `email`, `address`, `instagram_handles`, `default_channel`, `preference_tags` (CT14), `has_marketing_consent`, `referral_source`, `referred_by_contact_id` / `referred_by_name` (who sent them — any contact, not only a patient), household. These leave `app.leads` and `app.patients` (sub-domain 7, P2). The name is split as the patient design has it; the contact editor's single "Name" box splits on the first space. |
| CT2 | Numbers live in `app.contact_phones` (`phone`, `is_primary`, `is_on_whatsapp`) — the design's rows with "★ Primary" and a "WhatsApp" box; 1–5 per contact, exactly one primary (partial unique index). The contact keeps a copy of its primary number, `primary_phone`, written in the same transaction as its numbers, so lead, patient and appointment lists read one table and never join the numbers; the full set is read only when a contact is opened (≤ 5 rows by primary key). |
| CT3 | Household: every contact has `household_contact_id` — itself when it is the first, else the household's first contact ("New contact in the household of <name>"). A number may sit on several contacts **only inside one household**: an exclusion constraint on `contact_phones` (`organization_id =`, `phone =`, `household_contact_id <>`) holds it, and the phones carry the household through a composite foreign key with `ON UPDATE CASCADE`, so moving a contact to another household re-checks its numbers. A clash → `409 contact_phone_exists` naming the contact ("Using existing contact <name>"). |
| CT4 | `default_channel` is `whatsapp` · `call` · `instagram` (SMS goes with 4.C–4.D's line types) and follows the last channel used — the contact activity (4.C–4.D) sets it on each sent line. |
| CT7 | A contact that a live lead, patient file or appointment points at cannot be deleted — `409 contact_in_use`; those three foreign keys are `ON DELETE RESTRICT`, so even the purge cannot remove it. Its activity is never deleted. |
| CT8 | `GET /contacts` is a real paginated list (today: up to 5 patients, leads and walk-in buyers, no paging); the hover-card preview stays. |
| CT9 | One fast search for every picker (lead, patient, appointment forms): `GET /contacts?q=`. `search_text` holds the first and last name, email, Instagram handles, **every number's 10 digits** and the contact number, kept current by a trigger on `contacts` and `contact_phones`, behind one trigram GIN index — so a name, part of a name, any number or "C-12345" all hit it. `q` needs 3+ characters for a name, 4+ digits for a number, or a whole contact number. An exact number (caller ID, "already exists") uses the `(organization_id, phone)` index. Each result carries what a picker shows: name, primary phone, contact number, patient number, open lead status, last visit. |
| CT10 | `last_activity_at`, `last_sent_at` and `last_received_at` live on the contact, written in the same transaction as each activity entry (4.C–4.D) — lists sort by recency and show "awaiting reply" without scanning the activity. |
| CT12 | `GET /contacts?ids=…` (up to 100) loads many contacts in one call — how a patient list shows names now that the Patient object carries only `contact_id` (sub-domain 7, P3). |
| CT14 | **Preferences are tags** (your call): `preferences` → `preference_tags`, each a lowercase key in snake_case like every other value in the API — `no_calls`, `sundays_only` — up to 12, no repeats. The design's twelve chips are the known tags: `no_calls` · `text_before_calling` · `mornings` · `evenings` · `after_six_pm` · `weekdays_only` · `weekends_only` · `sundays_only` · `gujarati` · `hindi` · `english` · `female_doctor`, labelled through i18n. "Type a preference" adds a custom tag: the typed words joined by `_` ("Prefers WhatsApp" → `prefers_whatsapp`), 2–40 characters, `a–z`, `0–9` and `_`, starting with a letter; its label is the key with spaces. `language` goes — the design has no language field, only the language chips, which are tags now. The list filters by tag (any of) behind a GIN index, and the tags travel in the task's contact summary (10) and the preview, so screens warn ("Prefers no calls · message instead", "Prefers contact after 6 pm"); the server never refuses a call or a booking over a tag. Other options: kebab-case keys (`no-calls`), or free text as today. |
| CT13 | `date_of_birth` not in the future and `referred_by_contact_id` only with `referral_source = patient` are checked in the app (`400`) as well as by the database — today a `500` on the patient. |

#### 4.A.2 Open questions

None.

#### 4.A.3 Tables and relations

`app.contacts`

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `contact_number` | `integer` | no | counter | `> 0`; trigger `app.fn_assign_record_number` |
| `first_name` | `varchar(60)` | no | | trimmed, 1–60 |
| `last_name` | `varchar(60)` | yes | | |
| `gender` | `varchar(6)` | yes | | `IN ('female','male','other')` |
| `date_of_birth` | `date` | yes | | `≤ CURRENT_DATE` (CT13) |
| `email` | `varchar(120)` | yes | | |
| `address` | `varchar(240)` | yes | | "Area, city" |
| `instagram_handles` | `text[]` | no | `'{}'` | `cardinality ≤ 5` |
| `default_channel` | `varchar(9)` | no | `'whatsapp'` | `IN ('whatsapp','call','instagram')` |
| `preference_tags` | `text[]` | no | `'{}'` | `cardinality ≤ 12`; every key `^[a-z][a-z0-9_]{1,39}$` — one `CHECK` on `array_to_string(preference_tags, ',')` (CT14) |
| `has_marketing_consent` | `boolean` | no | `false` | |
| `referral_source` | `varchar(9)` | yes | | `patient` · `doctor` · `instagram` · `google` · `walk_in` · `other` |
| `referred_by_contact_id` | `bigint` | yes | | → contacts `ON DELETE SET NULL`; only when `referral_source = 'patient'` |
| `referred_by_name` | `varchar(120)` | yes | | |
| `household_contact_id` | `bigint` | no | itself (`BEFORE INSERT`) | → `app.contacts(id)` `ON DELETE RESTRICT` |
| `primary_phone` | `varchar(13)` | no | | copy of the primary number (CT2) — set with the numbers |
| `last_activity_at`, `last_sent_at`, `last_received_at` | `timestamptz` | yes | | written with each activity entry (CT10) |
| `search_text` | `text` | no | `''` | names, email, Instagram, every number's 10 digits, contact number — trigger on `contacts` and `contact_phones` (CT9) |

Indexes: unique `public_id`; unique `(organization_id, contact_number)`; unique `(id, household_contact_id)` (target of the phones' composite key); GIN trigram on `search_text` `WHERE deleted_at IS NULL`; `(organization_id, first_name, last_name, id)` and `(organization_id, last_activity_at DESC, id)` `WHERE deleted_at IS NULL`; GIN on `preference_tags` `WHERE deleted_at IS NULL` — the tag filter; `(household_contact_id)`.
RLS: organization policy, enabled and forced. Branch: none (CT6).

`app.contact_phones` (no public id)

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `contact_id`, `household_contact_id` | `bigint` | no | | composite FK → `app.contacts(id, household_contact_id)` `ON UPDATE CASCADE ON DELETE CASCADE` |
| `organization_id` | `bigint` | no | | |
| `phone` | `varchar(13)` | no | | `~ '^\+91\d{10}$'` |
| `is_primary` | `boolean` | no | `false` | |
| `is_on_whatsapp` | `boolean` | no | `true` | |
| `deleted_at` | `timestamptz` | yes | | set and cleared with the contact's soft delete |

Constraints: primary key `(contact_id, phone)`; unique `(contact_id) WHERE is_primary`; `EXCLUDE USING gist (organization_id WITH =, phone WITH =, household_contact_id WITH <>) WHERE (deleted_at IS NULL)`; index `(organization_id, phone) WHERE deleted_at IS NULL`.
RLS: organization policy, enabled and forced (it carries `organization_id`). Branch: none.

#### 4.A.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `contact:read` | Contacts · View | contacts, the preview, who handles them | 1, 3, 7 | Owner, Admin, Doctor, Therapist, Front desk, Counsellor, Pharmacist, Accountant, Marketing |
| `contact:create` | Contacts · Create | add a contact | 2 | all but Accountant |
| `contact:update` | Contacts · Edit | change a contact — "applies everywhere"; set who handles them | 4 | all but Accountant |
| `contact:delete` | Contacts · Delete | delete or restore a contact | 5, 6 | Owner, Admin |

The codes as a whole, with their notes: 4.4.

#### 4.A.5 Common to every route

As 4.5.

#### 4.A.6 Objects returned

**Contact** — `app.contacts` + `app.contact_phones`; routes 1–6

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | `con_…` |
| `contact_number` | integer | shown as "C-12345" |
| `first_name` | string | 1–60 |
| `last_name` | string \| null | |
| `gender` | string \| null | `female` · `male` · `other` |
| `date_of_birth` | `YYYY-MM-DD` \| null | not in the future |
| `primary_phone` | string | `+91` + 10 digits — the primary number (CT2) |
| `phones` | object[] | 1–5 Contact phones, exactly one primary — on routes 2–6 (the list returns `primary_phone` only) |
| `email`, `address` | string \| null | |
| `instagram_handles` | string[] | up to 5, each 1–30 |
| `default_channel` | string | `whatsapp` · `call` · `instagram` (CT4) |
| `preference_tags` | string[] | up to 12 keys (CT14) — `no_calls`, `sundays_only`, `gujarati`, custom |
| `has_marketing_consent` | boolean | |
| `referral_source` | string \| null | `patient` · `doctor` · `instagram` · `google` · `walk_in` · `other` |
| `referred_by_contact_id` | string \| null | `con_…` — only for `patient` |
| `referred_by_name` | string \| null | up to 120 |
| `household_contact_id` | string | `con_…` — itself when first (CT3) |
| `member_membership_ids` | string[] | `mem_…` — who handles them (CT11) |
| `patient_id`, `patient_number` | string, integer \| null | their patient file (read-only) — the picker's badge |
| `open_lead_id`, `open_lead_status` | string \| null | their open lead (read-only) |
| `last_visit_on`, `next_visit_on` | `YYYY-MM-DD` \| null | latest checked-in / completed and next scheduled / confirmed appointment (sub-domain 6) |
| `last_activity_at`, `last_sent_at`, `last_received_at` | ISO datetime \| null | (CT10) |
| `is_awaiting_reply` | boolean | a received entry newer than the team's last sent one (4.C–4.D) |
| `created_at`, `updated_at` | ISO datetime | |

**Contact phone** (inside the Contact): `phone` (`+91` + 10 digits), `is_primary`, `is_on_whatsapp` (default `true`).

**Contact preview** — route 7: the Contact plus `open_lead` (`id`, `status`, `owner_membership_id`) or null, `patient` (`id`, `patient_number`) or null, `next_appointment` / `last_appointment` (`id`, `appointment_date`, `start_time`, `service_label`, `status` — only with `appointment:read`).

#### 4.A.7 Routes (1–7)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | `/contacts` | List / find contacts **(rebuilt)** | `contact:read` | |
| 2 | POST | `/contacts` | Add a contact **(new)** | `contact:create` | req |
| 3 | GET | `/contacts/{contact_id}` | Get a contact **(new)** | `contact:read` | |
| 4 | PATCH | `/contacts/{contact_id}` | Change a contact **(new)** | `contact:update` | |
| 5 | DELETE | `/contacts/{contact_id}` | Delete a contact not in use **(new)** | `contact:delete` | |
| 6 | POST | `/contacts/{contact_id}/restore` | Undo a delete **(new)** | `contact:delete` | req |
| 7 | GET | `/contacts/{contact_id}/preview` | The hover card | `contact:read` | |

#### 4.A.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 1 | `q` (names, email, Instagram, any number, contact number such as `C-12345` — 3+ characters, 4+ digits), `phone` (`+91` + 10 digits — every contact with it, household included), `ids` (up to 100, CT12), `is_patient`, `has_open_lead`, `is_awaiting_reply`, `member_membership_id`, `household_contact_id`, `preference_tags` (several — any of), `sort` = `name` (default; best match first while `q` is set) \| `created_at` \| `last_activity_at`, `order`, `limit`, `after` | — | Contact[] (paginated) |
| 2 | — | `first_name*`, `phones*` (1–5 of `phone*`, `is_primary`, `is_on_whatsapp`; exactly one primary); optional: `last_name`, `gender`, `date_of_birth`, `referral_source`, `referred_by_contact_id`, `referred_by_name`, `email`, `address`, `instagram_handles`, `default_channel`, `preference_tags`, `has_marketing_consent`, `household_contact_id` | Contact |
| 3 | — | — | Contact |
| 4 | — | any field of #2 (at least one); `phones` replaces the set; `expected_updated_at` | Contact |
| 5 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |
| 6 | — | — | Contact |
| 7 | — | — | Contact preview |

#### 4.A.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 2, 4 | `400` · `phones` | none, more than 5, not `+91` + 10 digits, or not exactly one primary |
| 2, 4 | `409` · `contact_phone_exists` | a number is on a live contact of another household — the error names it (CT3) |
| 2, 4 | `400` · `household_contact_id` | not a live contact of the organization |
| 2, 4 | `400` · `preference_tags` | more than 12, a repeat, or not a lowercase key (CT14) |
| 2, 4 | `400` · `date_of_birth` / `referred_by_contact_id` | in the future / set while `referral_source` is not `patient` (CT13) |
| 5 | `409` · `contact_in_use` | a live lead, patient file or appointment points at it (CT7) |
| 4 | `409` · `record_changed` | `expected_updated_at` is older than the record |
| 6 | `409` · `record_not_deleted` / `contact_phone_exists` | the contact is live, or one of its numbers was taken meanwhile |
| any by-id | `404` | not in the organization, or deleted |

#### 4.A.10 Rules worth knowing

None beyond 4.10.

#### 4.A.11 Code changes

| # | Change |
| --- | --- |
| CTC1 | CT1–CT3: tables `app.contacts` (with the `contacts.contact_number` counter and the household trigger) and `app.contact_phones` (composite FK, exclusion constraint), `CREATE EXTENSION btree_gist`; the `contacts` nested sub-domain (routes, service, repository, validator, serializer, seed); RLS on both |
| CTC2 | CT1: move the person columns off `app.leads` (sub-domain 5) and `app.patients` (sub-domain 7) — built with those sub-domains: leads at ROUTE #131 (LC1), patients at #133 (PC1); #129 builds the contact (D61, 2026-10-08) |
| CTC3 | CT5: codes `contact:read` / `create` / `update` / `delete`, a Contacts matrix section, the role presets |
| CTC5 | CT8, CT9: the paginated list (trigram on `search_text`, phone lookup, picker fields) and the preview replace today's union search; the `search_text` trigger on `contacts` and `contact_phones` |
| CTC6 | CT2: `primary_phone` kept with the numbers |
| CTC7 | CT10: `last_activity_at` / `last_sent_at` / `last_received_at` written by the contact activity (4.C–4.D) in the entry's transaction |
| CTC11 | CT14: `preferences` → `preference_tags` (init migration, schema, the `CHECK`, GIN index, DTO, filter, serializer); drop `language`; the known keys and their labels in `src/shared/locales/en/` |
| CTC9 | CT1, CT12, CT13: the person columns from `app.patients` (gender, date of birth, referral); `ids` filter; the two checks — the contact's columns, `ids` and the checks at #129; their removal from `app.patients` at #133 (D61) |

---

### 4.B Contact members — `app/sub-domains/contacts/contact-members/` — final

#### 4.B.1 Decisions

| # | Decision |
| --- | --- |
| CT11 | **The team who handle a person** (your point 6): `app.contact_members` (contact ↔ membership), at `/contacts/{contact_id}/members` (as sub-domain 1's branch members). The server adds the lead's owner and involved members (5), the patient's usual doctor (7) and each appointment's doctor and therapist (6); the desk can add or remove anyone with `PUT`. Lists filter by `member_membership_id` ("my people"). |

#### 4.B.2 Open questions

None.

#### 4.B.3 Tables and relations

`app.contact_members` (no public id): `contact_id` → contacts `ON DELETE CASCADE`, `membership_id` → memberships `ON DELETE CASCADE`, `organization_id`, `created_at`, `created_by_user_id`; primary key `(contact_id, membership_id)`; index `(membership_id, contact_id)` ("my people"). RLS: organization policy, enabled and forced. Branch: none.

#### 4.B.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `contact:read` | Contacts · View | contacts, the preview, who handles them | 8 | Owner, Admin, Doctor, Therapist, Front desk, Counsellor, Pharmacist, Accountant, Marketing |
| `contact:update` | Contacts · Edit | change a contact — "applies everywhere"; set who handles them | 9 | all but Accountant |

The codes as a whole, with their notes: 4.4.

#### 4.B.5 Common to every route

As 4.5.

#### 4.B.6 Objects returned

**Contact member**: `membership_id` (`mem_…`), `created_at`. The contact also lists them as `member_membership_ids` (4.A).

#### 4.B.7 Routes (8–9)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 8 | GET | `/contacts/{contact_id}/members` | Who handles this person **(new, CT11)** | `contact:read` | |
| 9 | PUT | `/contacts/{contact_id}/members` | Replace who handles them **(new, CT11)** | `contact:update` | |

#### 4.B.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 8 | — | — | Contact member[] — `membership_id`, `created_at` |
| 9 | — | `membership_ids*` (0–50 team member ids; the full list) | Contact member[] |

#### 4.B.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 9 | `400` · `membership_ids` | an id is not a team member of the organization |
| any by-id | `404` | not in the organization, or deleted |

#### 4.B.10 Rules worth knowing

None beyond 4.10.

#### 4.B.11 Code changes

| # | Change |
| --- | --- |
| CTC8 | CT11: table `app.contact_members`, routes 8–9, the automatic adds from sub-domains 5, 7 and 6, the `member_membership_id` filter |

---
### 4.C Contact activities — `app/sub-domains/contacts/contact-activities/` — final

#### 4.C.1 Decisions

| # | Decision |
| --- | --- |
| M1 | The stream belongs to the contact: `app.messages` → **`app.contact_activities`**, routes under `/contacts/{contact_id}/activities`; one `contact_id` replaces `lead_id` / `patient_id` / `medical_contact_id`. A lead and the patient file of the same person show one stream. |
| M2 | An entry's `type` is `whatsapp` · `instagram` · `call_log` · `note` · `system` — your list plus `system`; it replaces `channel` + `kind` + the `is_system` flag; SMS and email go. `direction` (`sent` / `received`) on whatsapp, instagram and call_log only; a `system` entry has no author and no direction and is written by the server alone; `delivery_status` only on a **sent** whatsapp or instagram entry — all held by `CHECK`s. A template message keeps `contact_message_template_id`, media keeps `attachment_keys`. The time is `occurred_at` (a note or a system event is not "sent"). |
| M3 | No read markers — **"awaiting reply"** instead: a contact awaits a reply when its `last_received_at` is newer than its `last_sent_at` (both on the contact, CT10). It is the team's, not one member's: anyone replying clears it — the design's "Unreplied" view. The count shown on the Chat tab = received entries after `last_sent_at`. `app.lead_reads` goes and no `contact_reads` table or mark-read route is needed. |
| M5 | What an entry is about is a real foreign key, not `record_type` + `record_id` text: nullable `appointment_id`, `invoice_id`, `payment_id`, `patient_prescription_id`, `patient_offering_id`, `patient_review_id`, `patient_check_in_id`, `task_id`, `patient_treatment_id`, `patient_clinical_note_id`, `patient_image_id`, `patient_report_id` with `CHECK (num_nonnulls(…) <= 1)` — the database keeps the link valid (today a typo or a deleted record goes unseen, and one of the pair without the other is a `500`). |
| M6 | Entry checks: `body` 1–1000 (schema-routes); the template's type must match the entry's; attachments must be the caller's uploads; `reply_to_contact_activity_id` in the same stream; a received entry is accepted only for `call_log` (whatsapp / instagram replies arrive through the messaging worker); `type = system` is refused from the API; a batch may not repeat a contact. |
| M7 | Entries are a log — never edited or deleted, no soft-delete columns; oldest first (schema-routes `sentAt asc`). Each entry writes the contact's `last_activity_at`, and `last_sent_at` / `last_received_at` and `default_channel` when it is a message or call, in the same transaction. |
| M8 | Delivery is not built: the messaging worker (launch D32) does not exist, so whatsapp / instagram messages stay `queued` and resend only re-queues a `failed` one. It joins the not-built list as its own row, next to #68–#72. `provider_message_id` is unique per organization, so a repeated delivery callback cannot double-apply. |
| M12 | **One route per action** (your call), instead of one create taking any `type`: `…/activities/send-message` (WhatsApp or Instagram), `…/activities/log-call` (a call that happened, `direction` required), `…/activities/add-note` (internal). Each has its own body and errors, so a note cannot carry a template and a message cannot be logged as received. The bulk send is `POST /contact-activities/message-batches` (was `batches`). `system` entries have no route — the server writes them. |

#### 4.C.2 Open questions

None.

#### 4.C.3 Tables and relations

`app.contact_activities` (append-only — no soft-delete columns)

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `contact_id` | `bigint` | no | | → contacts `ON DELETE CASCADE` |
| `type` | `varchar(9)` | no | | `IN ('whatsapp','instagram','call_log','note','system')` — 9 characters for `instagram` (D62) |
| `direction` | `varchar(8)` | yes | | `IN ('sent','received')`; `(type IN ('note','system')) = (direction IS NULL)` |
| `body` | `varchar(1000)` | no | | `char_length(btrim(body)) ≥ 1` |
| `contact_message_template_id` | `bigint` | yes | | → templates `ON DELETE SET NULL` |
| `attachment_keys` | `text[]` | no | `'{}'` | `cardinality ≤ 5` |
| `reply_to_contact_activity_id` | `bigint` | yes | | → itself `ON DELETE SET NULL` |
| `delivery_status` | `varchar(9)` | yes | | the 5 statuses; set exactly when `type IN ('whatsapp','instagram') AND direction = 'sent'` |
| `provider_message_id` | `varchar(128)` | yes | | |
| `failure_reason` | `varchar(280)` | yes | | required when `delivery_status = 'failed'` |
| `occurred_at` | `timestamptz` | no | `now()` | when it happened (M2) |
| `delivered_at`, `read_at`, `failed_at` | `timestamptz` | yes | | written by the messaging worker |
| `author_membership_id` | `bigint` | yes | | → memberships `ON DELETE RESTRICT` (K2); null for `system` and received entries |
| `appointment_id` … `patient_report_id` (12 columns) | `bigint` | yes | | each → its table `ON DELETE SET NULL`; `num_nonnulls(…) ≤ 1` (M5) |

Indexes: unique `public_id`; `(contact_id, occurred_at, id)` — the stream, the newest page by a backward scan, and the Chat-tab count; unique `(organization_id, provider_message_id) WHERE provider_message_id IS NOT NULL`; `(organization_id, occurred_at) WHERE delivery_status IN ('queued','failed')` — the worker's queue; `(appointment_id)`, `(task_id)` and each other link `WHERE … IS NOT NULL`. A clinic writes thousands of entries a month, which one table and these indexes carry for years; past tens of millions of rows, range-partition by `occurred_at` month.
RLS: organization policy, enabled and forced. Branch: none — the stream is the person's (CT6).

#### 4.C.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `contact_activity:read` | Activity · View | a contact's stream | 10, 14 | Owner, Admin, Doctor, Therapist, Front desk, Counsellor, Pharmacist, Marketing |
| `contact_activity:create` | Activity · Create | send a message, log a call, add a note, a bulk send; add a template | 11–13, 16 | same |
| `contact_activity:update` | Activity · Edit | resend a failed message; change a template | 15 | same |

The codes as a whole, with their notes: 4.4.

#### 4.C.5 Common to every route

As 4.5.

#### 4.C.6 Objects returned

**Contact activity** — `app.contact_activities`; routes 10–16

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | `msg_…` |
| `contact_id` | string | `con_…` |
| `type` | string | `whatsapp` · `instagram` · `call_log` · `note` · `system` (M2) |
| `direction` | string \| null | `sent` · `received`; null for a note or a system entry |
| `body` | string | 1–1000 |
| `contact_message_template_id` | string \| null | `mtpl_…` |
| `attachment_keys` | string[] | up to 5 uploads |
| `reply_to_contact_activity_id` | string \| null | `msg_…`, same stream |
| `delivery_status` | string \| null | `queued` · `sent` · `delivered` · `read` · `failed` — sent whatsapp / instagram only |
| `provider_message_id`, `failure_reason` | string \| null | written by the messaging worker (M8) |
| `occurred_at` | ISO datetime | |
| `delivered_at`, `read_at`, `failed_at` | ISO datetime \| null | written by the messaging worker |
| `author_membership_id` | string \| null | `mem_…`; null for a received or system entry |
| `appointment_id`, `invoice_id`, `payment_id`, `patient_prescription_id`, `patient_offering_id`, `patient_review_id`, `patient_check_in_id`, `task_id`, `patient_treatment_id`, `patient_clinical_note_id`, `patient_image_id`, `patient_report_id` | string \| null | at most one is set (M5) |
| `group` | string | derived from the type and link: `messages` · `clinical` · `money` · `tasks` (M10) |
| `created_at`, `updated_at` | ISO datetime | |

#### 4.C.7 Routes (10–16)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 10 | GET | `/contacts/{contact_id}/activities` | The contact's stream **(moved, M1)** | `contact_activity:read` | |
| 11 | POST | `/contacts/{contact_id}/activities/send-message` | Send a WhatsApp or Instagram message **(new, M12)** | `contact_activity:create` | req |
| 12 | POST | `/contacts/{contact_id}/activities/log-call` | Log a call that happened **(new, M12)** | `contact_activity:create` | req |
| 13 | POST | `/contacts/{contact_id}/activities/add-note` | Add an internal note **(new, M12)** | `contact_activity:create` | req |
| 14 | GET | `/contacts/{contact_id}/activities/{contact_activity_id}` | Get an entry | `contact_activity:read` | |
| 15 | POST | `/contacts/{contact_id}/activities/{contact_activity_id}/resend` | Re-queue a failed message | `contact_activity:update` | req |
| 16 | POST | `/contact-activities/message-batches` | One message to many contacts **(renamed, M12)** | `contact_activity:create` | req |

#### 4.C.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 10 | `group` (several, M10), `type` (several), `direction`, `delivery_status`, `task_id`, `appointment_id`, `occurred_at_from` / `occurred_at_to`, `q` (text), `sort` = `occurred_at` (default, oldest first) \| `created_at`, `order`, `limit`, `after` | — | Contact activity[] (paginated) |
| 11 | — | `type*` (`whatsapp` \| `instagram`), `body*` (1–1000); optional: `contact_message_template_id` (same type), `attachment_keys` (up to 5 confirmed uploads), `reply_to_contact_activity_id`, one record link (M5) | Contact activity — `direction=sent`, `delivery_status=queued` |
| 12 | — | `direction*` (`sent` = outgoing \| `received` = incoming), `body*` (1–1000 — "What happened on the call?"); optional: `reply_to_contact_activity_id`, one record link | Contact activity — `type=call_log` |
| 13 | — | `body*` (1–1000 — "Note for the team, not sent"); optional: `attachment_keys` (up to 5), one record link | Contact activity — `type=note`, no direction |
| 14 | — | — | Contact activity |
| 15 | — | — | Contact activity (`queued` again) |
| 16 | — | `contact_ids*` (1–200 `con_…`, no repeats), `type*` (`whatsapp` \| `instagram`), `body*` (1–1000), `contact_message_template_id` | Contact activity[] — one per contact, placeholders filled (M9) |

#### 4.C.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 11, 12, 13, 16 | `400` · `body` | empty or over 1000 |
| 11, 16 | `400` · `type` | not `whatsapp` or `instagram` |
| 11, 16 | `400` · `contact_message_template_id` | the template's type differs from the message's |
| 12 | `400` · `direction` | missing |
| 11, 13 | `400` · `attachment_keys` | not a confirmed upload of the organization |
| 11, 12 | `400` · `reply_to_contact_activity_id` | an entry of another contact |
| 11, 12, 13 | `400` · the record link | more than one, or not a live record of the organization (M5) |
| 16 | `400` · `contact_ids` | an unknown, deleted or repeated contact |
| 15 | `409` · `transition_not_allowed` | the message has not failed (or it is not a message) |
| any by-id | `404` | not in the organization, deleted, or (5–6) an entry of another contact |

#### 4.C.10 Rules worth knowing

None beyond 4.10.

#### 4.C.11 Code changes

| # | Change |
| --- | --- |
| MC1 | M1, M2: `app.messages` → `app.contact_activities` with `contact_id`, `type` (incl. `system`) and `occurred_at`; drop `lead_id`, `patient_id`, `medical_contact_id`, `channel`, `kind`, `is_system`, `sent_at`, the soft-delete columns; `reply_to_contact_activity_id`; the `CHECK`s on direction, author and delivery status; routes under `/contacts/{contact_id}/activities` |
| MC4 | M5: twelve typed record links with `num_nonnulls ≤ 1` replace `record_type` / `record_id` (and the duplicate `task` type) |
| MC10 | M12: the three action routes (`send-message`, `log-call`, `add-note`) with their own DTOs and checks replace the generic create; `POST /contact-activities/message-batches` replaces `/messages/batches` |
| MC5 | M6, M7: entry checks; the contact's `last_activity_at` / `last_sent_at` / `last_received_at` / `default_channel` in the entry's transaction; fix the "newest first" route text |
| MC6 | M8: new not-built row — the messaging worker (send, delivery status, failures, received replies, resend); unique `provider_message_id` |

---

### 4.D Contact message templates — `app/sub-domains/contacts/contact-message-templates/` — final

#### 4.D.1 Decisions

| # | Decision |
| --- | --- |
| M9 | Templates are `whatsapp` or `instagram` (text that goes out); `<first>` and `<interest>` are filled by the server for each contact, on a single send and in a batch. |
| M11 | Templates are the contact messages' own: `app.message_templates` → **`app.contact_message_templates`** (your call; names follow the table), routes `/contact-message-templates`, path id `{contact_message_template_id}`, and the entry's link `contact_message_template_id`. The id prefix stays `mtpl_`. |

#### 4.D.2 Open questions

None.

#### 4.D.3 Tables and relations

`app.contact_message_templates`: `name varchar(60)`, `body varchar(1000)` (1–1000), `type varchar(9)` default `'whatsapp'` `IN ('whatsapp','instagram')`; unique `(organization_id, lower(name)) WHERE deleted_at IS NULL`; `(organization_id, created_at DESC, id) WHERE deleted_at IS NULL`. RLS: organization policy, enabled and forced. Branch: none.

#### 4.D.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `organization:read` | — (always on) | templates | 17, 19 | every role |
| `contact_activity:create` | Activity · Create | send a message, log a call, add a note, a bulk send; add a template | 18 | same |
| `contact_activity:update` | Activity · Edit | resend a failed message; change a template | 20 | same |
| `contact_activity:delete` | Activity · Delete | delete or restore a template | 21, 22 | Owner, Admin |

The codes as a whole, with their notes: 4.4.

#### 4.D.5 Common to every route

As 4.5.

#### 4.D.6 Objects returned

**Contact message template** — `app.contact_message_templates`; routes 17–22: `id` (`mtpl_…`), `name` (1–60, unique, any case), `body` (1–1000; may hold `<first>`, `<interest>`), `type` (`whatsapp` default · `instagram`), `created_at`, `updated_at`.

#### 4.D.7 Routes (17–22)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 17 | GET | `/contact-message-templates` | List templates | any member | |
| 18 | POST | `/contact-message-templates` | Add a template | `contact_activity:create` | req |
| 19 | GET | `/contact-message-templates/{contact_message_template_id}` | Get a template | any member | |
| 20 | PATCH | `/contact-message-templates/{contact_message_template_id}` | Change a template | `contact_activity:update` | |
| 21 | DELETE | `/contact-message-templates/{contact_message_template_id}` | Delete a template | `contact_activity:delete` | |
| 22 | POST | `/contact-message-templates/{contact_message_template_id}/restore` | Undo a delete | `contact_activity:delete` | req |

#### 4.D.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 17 | `q` (name), `type`, `sort` = `created_at` (default, newest first) \| `name`, `order`, `limit`, `after` | — | Contact message template[] (paginated) |
| 18 | — | `name*` (1–60), `body*` (1–1000), `type` | Contact message template |
| 19 | — | — | Contact message template |
| 20 | — | any of `name`, `body`, `type`; `expected_updated_at` | Contact message template |
| 21 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |
| 22 | — | — | Contact message template |

#### 4.D.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 18, 20 | `409` (message: record already exists) | another template has the name |
| 20 | `409` · `record_changed` | `expected_updated_at` is older than the record |
| 22 | `409` · `record_not_deleted` / `record_restore_conflict` | the template is live, or its name was reused meanwhile |
| any by-id | `404` | not in the organization, deleted, or (5–6) an entry of another contact |

#### 4.D.10 Rules worth knowing

None beyond 4.10.

#### 4.D.11 Code changes

| # | Change |
| --- | --- |
| MC9 | M11: rename `app.message_templates` → `app.contact_message_templates` (table, schema, indexes, RLS, the nested sub-domain folder), the routes and path id, and the activity column `contact_message_template_id` |
| MC7 | M9: template `type` `whatsapp` \| `instagram`; fill `<first>` / `<interest>` per contact |

---

## 5. Leads — final (rev 6, confirmed 2026-10-08)

*Was sub-domain 4 before the restructure (2026-10-08) — layout only, no decision changed.*

5.1 Decisions · 5.2 Open questions · 5.3 Tables and relations · 5.4 Permissions · 5.5 Common to every route ·
5.6 Objects returned · 5.7 Routes · 5.8 Request details · 5.9 Errors · 5.10 Rules worth knowing · 5.11 Code changes · 5.12 Nested sub-domains

An enquiry and its working state — status, source, interests, owner and hold, follow-up — for one contact.
The person lives on the contact (4); its activity and the message templates are sub-domain 4.
Design: `leads.md`, `schema-routes.md` (Lead).

Code: `src/domains/app/sub-domains/leads/` — one folder, no nested sub-domains (5.12).

### 5.1 Decisions

Taken on your standing answer "go with the recommendation" — confirmed 2026-10-08.

| # | Decision |
| --- | --- |
| L1 | A lead points at one contact (`contact_id`, required, `ON DELETE RESTRICT`); its person columns move to the contact (CT1). `POST /leads` takes a `contact_id` **or** an inline `contact` and writes both in one transaction ("Creates or updates one contact"). Every lead carries a small `contact` summary for lists. |
| L2 | Names follow the table: `lead_involved_memberships.involved_membership_id` → `membership_id` (the lead keeps its `involved_membership_ids` field). |
| L3 | One code set: `lead:read`, `lead:create`, `lead:update`, `lead:delete` — leads only (templates are sub-domain 4). |
| L4 | Exporting has its own code, `lead:export` (O14). Default holders: Owner, Admin, Doctor — today's `list:export` holders who can read leads. |
| L5 | `kind` is `enquiry` · `retarget`; `is_contact_thread` and `kind = contact_thread` go — an appointment points at a contact (sub-domain 6), so no hidden lead is needed. `retarget_reason` is server-set (sub-domain 10's automation) and only on a re-target lead (`CHECK`). |
| L6 | One open lead per contact — open = `new`, `contacted`, `follow_up`, `no_response` — held by a partial unique index; another → `409 lead_open_exists` naming it ("phone already a lead → offer open existing"). A closed lead does not block a new one ("Re-create lead"). |
| L7 | The list filters as the design's views do: `status`, `source`, `interests` take several values; `is_awaiting_reply` ("Unreplied" = mine + awaiting reply); `ownership` = `open` · `held` · `releasing_today`; `team_membership_id` (owner or involved). `q` searches the contact's names, numbers and contact number, and the lead number. Sorting by a column that can be empty keeps those rows, last — today they drop out. |
| L8 | **Conversion is automatic — no convert route** (your direction): checking in at an appointment (sub-domain 6) moves the contact's open lead to `clinic_visited`, **its last status**, and creates the contact's patient file if it has none (home branch and usual doctor from the appointment, `lead_id` = this lead) through the patient service. `clinic_visited` is set only by check-in and is final — a `PATCH` cannot set it or move a lead out of it (`409 lead_closed`); its other fields stay editable. Nothing is copied or moved — the patient file points at the same contact. `POST /leads/{lead_id}/convert` goes. |
| L9 | Claim: taking a lead over from another owner (their hold ran out, or they left the team) keeps them as involved (the design). Claim and release work on open leads only (`409 lead_closed` otherwise) — today the route text promises a status `409` the code never sends. |
| L10 | "Awaiting reply" comes from the contact (sub-domain 4, M3) — there are no read markers: `POST /leads/{lead_id}/reads` and `app.lead_reads` go. `held_until` needs an owner (`CHECK`). |

### 5.2 Open questions

None — every decision above follows the recommendation.

### 5.3 Tables and relations

| Table | Holds | Key rules |
| --- | --- | --- |
| `app.leads` | one enquiry for a contact | `lead_number` from the counter, never reused; one open lead per contact (L6); soft delete + restore |
| `app.lead_involved_memberships` | lead ↔ membership: who else works it | key (`lead_id`, `membership_id`); up to 10 |

```text
tenancy.organizations
   │
   └──< app.leads ──┬──> app.contacts                                            the person (4)   — one open lead per contact
                    ├──< app.lead_involved_memberships >── tenancy.memberships   who else works the lead (up to 10)
                    ├──> tenancy.memberships (owner_membership_id)               the owner, while they hold it
                    └──> app.branches                                            where it is handled (none = every branch)

A ──< B   one A has many B     A >── B   many A for one B     A ──> B   a column on A points at one B     A ─── B   at most one B per A
```

Pointing at a lead from later sub-domains: `patients.lead_id` (7 — the lead it came from), `medical_sales.lead_id` (11), `tasks.lead_id` (10).

**PostgreSQL design**

Standard columns on every record table (not repeated below): `id bigint` (identity), `public_id varchar(28)` unique, `organization_id bigint` → organizations `ON DELETE CASCADE`, `created_at` / `updated_at timestamptz`, `created_by_user_id` / `updated_by_user_id`, and — where it soft-deletes — `deleted_at`, `delete_reason`, `delete_note` with their three checks; RLS enabled and forced.

`app.leads`

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `lead_number` | `integer` | no | counter | `> 0` |
| `contact_id` | `bigint` | no | | → `app.contacts` `ON DELETE RESTRICT` |
| `status` | `varchar(14)` | no | `'new'` | the 8 statuses |
| `source` | `varchar(9)` | yes | | the 7 sources |
| `interests` | `text[]` | no | `'{}'` | `<@` the 6 interests, `cardinality ≤ 6` |
| `kind` | `varchar(8)` | no | `'enquiry'` | `IN ('enquiry','retarget')` |
| `retarget_reason` | `varchar(160)` | yes | | `kind = 'retarget' OR retarget_reason IS NULL` |
| `owner_membership_id` | `bigint` | yes | | → memberships `ON DELETE SET NULL` |
| `held_until` | `timestamptz` | yes | | `held_until IS NULL OR owner_membership_id IS NOT NULL` |
| `follow_up_at` | `timestamptz` | yes | | |
| `branch_id` | `bigint` | yes | | → branches |
| `notes` | `text` | yes | | `char_length ≤ 2000` |

Indexes: unique `public_id`; unique `(organization_id, lead_number)`; unique `(organization_id, contact_id) WHERE deleted_at IS NULL AND status IN ('new','contacted','follow_up','no_response')` (L6); `WHERE deleted_at IS NULL`: `(organization_id, created_at DESC, id)`, `(organization_id, owner_membership_id, created_at DESC, id)` ("Mine"), `(organization_id, follow_up_at, id) WHERE follow_up_at IS NOT NULL`, `(organization_id, held_until) WHERE held_until IS NOT NULL` ("Releasing today"), `(branch_id)`, GIN `(interests)`; `(contact_id)`.
RLS: organization policy, enabled and forced. Branch: application filter on `branch_id` — no branch = visible in every branch.

`app.lead_involved_memberships` (no public id): `lead_id` → leads `ON DELETE CASCADE`, `membership_id` → memberships `ON DELETE RESTRICT` (K2), `organization_id`, `created_at`; primary key `(lead_id, membership_id)`; index `(membership_id, lead_id)` for the team filter. RLS: organization policy, enabled and forced. Branch: through its lead.

### 5.4 Permissions

One code set (L3), in the **Leads** row of the Roles matrix.

| Code | Roles matrix | Allows | Routes (5.7) | Held by default |
| --- | --- | --- | --- | --- |
| `lead:read` | Leads · View | leads | 1, 4 | Owner, Admin, Doctor, Front desk, Counsellor, Marketing |
| `lead:create` | Leads · Create | add a lead (an inline new contact also needs `contact:create`) | 3 | same |
| `lead:update` | Leads · Edit | change, claim or release a lead | 5, 8, 9 | same |
| `lead:delete` | Leads · Delete | delete or restore a lead | 6, 7 | Owner, Admin |
| `lead:export` | Leads · Export | the leads CSV (L4) | 2 | Owner, Admin, Doctor |

**Lead visibility**: a holder of `branch:read` sees every lead; anyone else sees the leads of the branches they work at plus leads with no branch — anything else is a `404`. "Mine" is a filter, not a wall.

### 5.5 Common to every route

| Item | Value |
| --- | --- |
| Base | `/api/v1/app` |
| Auth | `Authorization: Bearer <access token>`; the active organization comes from the token |
| Writes | every `POST` needs `X-Idempotency-Key`; `PATCH` takes an optional `expected_updated_at` (a stale save → `409 record_changed`) |
| Success | `200` with `{ data, meta }`; lists `{ data: [...], meta: { pagination: { per_page, next, has_more, estimated_total } } }` (`estimated_total` on the first page, up to 10,000); `DELETE` → `204` |
| Lists | `limit` (1–100, default 25), `after`, `q` (1–200), `sort`, `order`, `created_from` / `created_to` (`to` exclusive) |
| Errors | `{ error: { type, code, reason?, detail, errors[] } }` — `400 invalid_field`, `401`, `403`, `404`, `409`, `422` idempotency key missing or reused |

### 5.6 Objects returned

**Lead** — `app.leads` (+ `lead_involved_memberships`); routes 1, 3–9

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | `lead_…` |
| `lead_number` | integer | shown as "#2371" |
| `contact_id` | string | `con_…` (L1) |
| `contact` | object | `id`, `contact_number`, `first_name`, `last_name`, `primary_phone`, `default_channel` — for lists |
| `patient_id` | string \| null | `pat_…` — the contact's patient file, created at check-in; read-only |
| `status` | string | open: `new` (default) · `contacted` · `follow_up` · `no_response`; closed: `not_interested` · `invalid` · `lost` · `clinic_visited` (set by check-in only — the last status, L8) |
| `source` | string \| null | `instagram` · `google` · `whatsapp` · `facebook` · `walk_in` · `referral` · `retarget` |
| `interests` | string[] | up to 6 of `clinical` · `peel` · `lhr` · `hydrafacial` · `prp` · `others` |
| `kind` | string | server-set: `enquiry` · `retarget` |
| `retarget_reason` | string \| null | server-set, e.g. "No visit for 148 days · LHR 3 of 6 sessions left" |
| `owner_membership_id` | string \| null | `mem_…` — "Assigned" |
| `involved_membership_ids` | string[] | `mem_…`, up to 10 |
| `held_until` | ISO datetime \| null | the owner's hold (organization setting `lead_hold_days`, default 3) |
| `follow_up_at` | ISO datetime \| null | |
| `branch_id` | string \| null | `brn_…`; none = visible in every branch |
| `notes` | string \| null | up to 2000 |
| `last_activity_at`, `is_awaiting_reply` | | the contact's (sub-domain 4) |
| `created_at`, `updated_at` | ISO datetime | |

**Leads export** — route 2: `file_name` (`leads-YYYY-MM-DD.csv`), `content_type`, `row_count` (up to 5,000), `is_truncated`, `content`.

### 5.7 Routes (9)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | `/leads` | List leads (Mine · Unreplied · All are filters) | `lead:read` | |
| 2 | GET | `/leads/exports` | Download the list as CSV | `lead:export` | |
| 3 | POST | `/leads` | Add a lead (for a contact, or with a new one) | `lead:create` | req |
| 4 | GET | `/leads/{lead_id}` | Get a lead | `lead:read` | |
| 5 | PATCH | `/leads/{lead_id}` | Change a lead | `lead:update` | |
| 6 | DELETE | `/leads/{lead_id}` | Remove a lead | `lead:delete` | |
| 7 | POST | `/leads/{lead_id}/restore` | Undo a removal | `lead:delete` | req |
| 8 | POST | `/leads/{lead_id}/claim` | Take the lead (and hold it) | `lead:update` | req |
| 9 | POST | `/leads/{lead_id}/release` | Give it back to the team | `lead:update` | req |

Moved out: the contact search and preview (4); the activity, batches and templates (4). Gone: `POST /leads/{lead_id}/reads` (L10) and `POST /leads/{lead_id}/convert` (L8 — automatic at check-in).

### 5.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 1, 2 | `q` (contact names, numbers, contact number, lead number such as `#2371`), `status`, `source`, `interests` (each several values), `kind`, `contact_id`, `owner_membership_id`, `team_membership_id`, `is_awaiting_reply`, `ownership` = `open` \| `held` \| `releasing_today`, `branch_id`, `branch_ids`, `follow_up_at_from` / `follow_up_at_to`, `sort` = `created_at` (default, newest first) \| `name` \| `status` \| `source` \| `follow_up_at` \| `last_activity_at`, `order`, `limit`, `after` (2 ignores `limit` / `after`) | — | 1: Lead[] (paginated) · 2: Leads export |
| 3 | — | `contact_id` **or** `contact` (a Contact body, 4 route 2); optional: `status`, `source`, `interests`, `owner_membership_id`, `involved_membership_ids` (up to 10), `follow_up_at`, `branch_id` (one of yours), `notes` | Lead |
| 4 | — | — | Lead |
| 5 | — | any of `status` (not `clinic_visited`), `source`, `interests`, `owner_membership_id`, `involved_membership_ids` (replaces the set), `follow_up_at`, `branch_id`, `notes` (at least one); `expected_updated_at` | Lead |
| 6 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |
| 7, 8, 9 | — | — | Lead |

### 5.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 3 | `400` · `contact_id` | neither `contact_id` nor `contact`, or both |
| 3, 5, 7 | `409` · `lead_open_exists` | the contact already has an open lead — the error names it (L6) |
| 3 | `409` · `contact_phone_exists` | the inline contact's number belongs to another household (4) |
| 3, 5 | `400` · `branch_id` | a branch the caller does not work at |
| 3, 5 | `400` · `owner_membership_id` / `involved_membership_ids` / `branch_id` / `contact_id` | not a live record of the organization |
| 8 | `403` · `not_a_member` | the caller is not a team member (an API key) |
| 8 | `409` · `lead_held` | another member owns it and their hold has not run out |
| 9 | `403` · `lead_not_yours` | the caller does not own it |
| 5 | `409` · `lead_closed` | setting `clinic_visited`, or changing the status of a `clinic_visited` lead (L8) |
| 8, 9 | `409` · `lead_closed` | the lead is closed |
| 5 | `409` · `record_changed` | `expected_updated_at` is older than the record |
| 7 | `409` · `record_not_deleted` | the lead is live |
| any by-id | `404` | not in the organization, deleted, or in a branch the caller cannot see |

### 5.10 Rules worth knowing

- The lead's owner and involved members are added to the contact's members (4, CT11).
- A sent line to the contact moves its open lead from `new` to `contacted` (4); checking in at an appointment moves it to `clinic_visited` — its last status — and gives the contact a patient file (6, L8).
- Claim holds the lead for `lead_hold_days` (organization setting, 1–30, default 3); claiming again extends the hold; after it runs out — or if the owner left the team — anyone may claim it.
- The design's remove reasons map onto the shared ones: Duplicate → `duplicate`, Test entry → `mistake`, Spam → `not_needed`, Other → `other`.
- Removing a lead keeps the contact and the conversation. Restore works until the purge (`deleted_record_purge_days`).

### 5.11 Code changes (not built — the code is frozen)

| # | Change |
| --- | --- |
| LC1 | L1: `leads.contact_id` (`ON DELETE RESTRICT`); drop the person columns and `search_text`; inline `contact` on create in one transaction; the `contact` summary in responses |
| LC2 | L2: rename `lead_involved_memberships.involved_membership_id` → `membership_id`; index `(membership_id, lead_id)` |
| LC3 | L4: new code `lead:export`; route 2 gated by it |
| LC4 | L5: drop `is_contact_thread` and the `contact_thread` kind; `retarget_reason` check |
| LC5 | L6: partial unique index on open leads per contact → `409 lead_open_exists` |
| LC6 | L7: multi-value filters, `is_awaiting_reply`, `ownership`, `team_membership_id`; `q` through the contact; sort keeps empty values last |
| LC7 | L8: drop `POST /leads/{lead_id}/convert`; check-in (sub-domain 6) moves the open lead to `clinic_visited` and creates the patient file through the patient service; `clinic_visited` server-only and final (`409 lead_closed`) |
| LC8 | L9: claim from another owner adds them to involved; claim / release on open leads only |
| LC9 | L10: drop `app.lead_reads` and `POST /leads/{lead_id}/reads`; `held_until` check |

### 5.12 Nested sub-domains

None — one folder, `src/domains/app/sub-domains/leads/`: `app.lead_involved_memberships` is written with the lead and has no routes of its own; `lead-reads/` goes (LC9).

---

## 6. Appointments — final (rev 4, confirmed 2026-10-08) — visits merged in

6.1 Decisions · 6.2 Open questions · 6.3 Tables and relations · 6.4 Permissions · 6.5 Common to every route ·
6.6 Objects returned · 6.7 Routes · 6.8 Request details · 6.9 Errors · 6.10 Rules worth knowing · 6.11 Code changes · 6.12 Nested sub-domains

A booking of a contact with a doctor, at a branch, in a room or on a machine — and, once they arrive, its
stage across the clinic floor. **The visit is no longer a table of its own** (A10). Design: `appointments.md`,
`today.md`, `schema-routes.md` (Appointment, `appointment_status`). Row #68 (finishing the visit completes
the appointment and records the package session) lands here and in sub-domain 7.

Code: `src/domains/app/sub-domains/appointments/` — one folder, no nested sub-domains (6.12).

### 6.1 Decisions

Taken on your standing answer "go with the recommendation" — confirmed 2026-10-08.

| # | Decision |
| --- | --- |
| A1 | An appointment is for a contact (`contact_id`, required, `ON DELETE RESTRICT`); `patient_id` and `lead_id` and their exactly-one rule go. The response still shows `patient_id` and `lead_id` — the contact's patient file and open lead. Anyone can be booked, and a converted lead's appointments need no moving. |
| A2 | Rooms and machines use sub-domain 1's names (`branch_room_id`, `branch_machine_id`, D11) and must belong to the appointment's branch (`400`). |
| A3 | No double booking, held by PostgreSQL: a generated `time_range tsrange` (local date + start + duration) and three exclusion constraints — doctor, room, machine — over live `scheduled` / `confirmed` / `checked_in` / `completed` bookings, walk-ins exempt. A clash → `409 slot_taken` naming the resource from the constraint. Replaces today's JavaScript overlap check (it reads up to 500 rows) and the advisory lock. |
| A4 | The doctor's working **hours** are checked too (today only their working days) — outside them → `409 slot_closed`, reason `doctor_off`. |
| A5 | Status moves are named routes — `/confirm`, `/check-in`, `/complete`, `/no-show` — replacing `POST /status` with a body, like `/cancel`, `/reinstate`, `/undo-check-in`. Moves follow schema-routes: `scheduled` → `confirmed` · `checked_in` · `cancelled` · `no_show`; `confirmed` → `checked_in` · `cancelled` · `no_show` (a reschedule returns it to `scheduled`); `checked_in` → `completed`. `checked_in_at` / `completed_at` are set exactly with their status (`CHECK`). |
| A14 | **Check-in converts** (sub-domain 5, L8): it moves the contact's open lead to `clinic_visited` — the lead's last status — and, when the contact has no patient file, creates one through the patient service (home branch = the appointment's branch, usual doctor = its doctor, `lead_id` = the lead), in the same transaction. The caller needs only `appointment:update`; the file is the check-in's side effect. Today a lead's check-in opens no visit and leaves no patient file, and converting is a separate manual step. |
| A6 | Walk-in: `POST /appointments` with `is_walk_in` — the server sets today and now, so date and start are not sent; checked in at once; exempt from slot clashes (they wait). |
| A7 | Copy ("book again") goes through the create path — every check and conflict mapping (today it skips them) — and works on any live appointment; the route text promising a status `409` goes. |
| A8 | Dates in filters are whole days, inclusive at both ends — `appointment_date_to` today is exclusive while daily counts are inclusive. The default order is date then start time, ascending (the day view) — the route text "newest first" is wrong. |
| A9 | One code set, in the **Appointments** row: `appointment:read`, `appointment:create`, `appointment:update`, `appointment:delete`, `appointment:export` (replaces `list:export`). The floor stage moves use `appointment:update`. |
| A10 | **The visit merges into the appointment** (your question 1): an appointment and its visit are one-to-one with the same lifecycle, so `app.visits` goes. The floor state becomes columns — `visit_stage` (`waiting` · `with_doctor` · `treatment` · `checkout` · `pharmacy`), `visit_stage_changed_at`, `visit_paused_at` — set only while `checked_in` (`CHECK`); "done" **is** `completed` (`/complete`), and the visit's start is `checked_in_at`. The consult notes, diagnoses and safety checks move to the patient file (sub-domain 7, clinical notes linked to the appointment). The floor is `GET /appointments?status=checked_in&visit_stage=…`. Visits are therefore branch-scoped like their appointment (today they are not), and nothing needs a second branch column. |
| A11 | The floor stage moves forward only (skipping allowed, never back) through `POST …/stage`; pause only when running, resume only when paused. Today any stage can be set and "done" stamps nothing. |
| A12 | `patient_package_id` goes (your question 2) — a package session is recorded on the treatment (sub-domain 7); `type = package_session` stays as a label. |
| A13 | Small fixes: duration must be a multiple of 5 (`400`; today a database `500`); `service_label` defaults to the offering's name; `reminder_status` and `is_confirmed_by_reply` are written by the messaging worker (sub-domain 4, M8). |

### 6.2 Open questions

None — every decision above follows the recommendation.

### 6.3 Tables and relations

| Table | Holds | Key rules |
| --- | --- | --- |
| `app.appointments` | one booking and, once checked in, its floor stage | `appointment_number` from the counter, never reused; no overlapping doctor / room / machine (A3); stage only while checked in (A10); soft delete + restore |

```text
tenancy.organizations
   │
   └──< app.appointments ──┬──> app.contacts                                            who is booked (4)   — lead, patient or neither
                           ├──> app.branches · app.branch_rooms · app.branch_machines   where (sub-domain 1)
                           ├──> tenancy.memberships (doctor, therapist)                 who (sub-domain 2)
                           ├──> app.offerings                                           the service (sub-domain 3)
                           └──> app.appointments (copied_from_appointment_id)           the booking it was copied from

A ──< B   one A has many B     A >── B   many A for one B     A ──> B   a column on A points at one B     A ─── B   at most one B per A
```

Pointing at an appointment (all `ON DELETE SET NULL`): the patient file's records — patient prescriptions, images, clinical notes (sub-domain 7) — `patient_treatments`, `patient_check_ins`, `patient_reviews` (7), `patient_offering_suggestions` (7), `contact_activities.appointment_id` (4).

**PostgreSQL design**

Standard columns on every record table (not repeated below): `id bigint` (identity), `public_id varchar(28)` unique, `organization_id bigint` → organizations `ON DELETE CASCADE`, `created_at` / `updated_at timestamptz`, `created_by_user_id` / `updated_by_user_id`, and — where it soft-deletes — `deleted_at`, `delete_reason`, `delete_note` with their three checks; RLS enabled and forced.

`app.appointments`

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `appointment_number` | `integer` | no | counter | `> 0` — shown "#2841" |
| `contact_id` | `bigint` | no | | → contacts `ON DELETE RESTRICT` (A1) |
| `branch_id` | `bigint` | no | | → branches |
| `type` | `varchar(15)` | no | `'consultation'` | the 5 types |
| `offering_id` | `bigint` | yes | | → offerings `ON DELETE SET NULL` |
| `service_label` | `varchar(120)` | no | the offering's name | 1–120 |
| `doctor_membership_id` | `bigint` | no | | → memberships `ON DELETE RESTRICT` |
| `therapist_membership_id` | `bigint` | yes | | → memberships `ON DELETE RESTRICT` (K2) |
| `branch_room_id`, `branch_machine_id` | `bigint` | yes | | → branch rooms / machines `ON DELETE SET NULL` |
| `appointment_date` | `date` | no | | local date (organization time zone) |
| `start_time` | `time` | no | | local time |
| `duration_minutes` | `smallint` | no | `30` | `BETWEEN 5 AND 240 AND % 5 = 0` |
| `time_range` | `tsrange` | — | generated, stored | `tsrange(date + start, date + start + duration, '[)')` |
| `status` | `varchar(10)` | no | `'scheduled'` | the 6 statuses |
| `is_walk_in` | `boolean` | no | `false` | |
| `cancel_reason`, `cancel_note` | `varchar(20)`, `varchar(280)` | yes | | `(status = 'cancelled') = (cancel_reason IS NOT NULL)` |
| `checked_in_at` | `timestamptz` | yes | | set exactly when `status IN ('checked_in','completed')` — the visit's start |
| `completed_at` | `timestamptz` | yes | | set exactly when `status = 'completed'` — the visit's end |
| `visit_stage` | `varchar(11)` | yes | | the 5 floor stages; `(status = 'checked_in') = (visit_stage IS NOT NULL)` (A10) |
| `visit_stage_changed_at` | `timestamptz` | yes | | with `visit_stage` |
| `visit_paused_at` | `timestamptz` | yes | | only while `checked_in` |
| `rescheduled_from` | `timestamptz` | yes | | |
| `move_count` | `smallint` | no | `0` | `≥ 0` |
| `reason` | `varchar(160)` | yes | | |
| `notes` | `text` | yes | | `char_length ≤ 2000` |
| `follow_up_at` | `timestamptz` | yes | | |
| `copied_from_appointment_id` | `bigint` | yes | | → itself `ON DELETE SET NULL` |
| `reminder_status` | `varchar(17)` | no | `'not_sent'` | written by the messaging worker |
| `is_confirmed_by_reply` | `boolean` | no | `false` | written by the messaging worker |

Exclusion constraints (`btree_gist`), each `WHERE (deleted_at IS NULL AND NOT is_walk_in AND status IN ('scheduled','confirmed','checked_in','completed'))`:
`excl_appointments_doctor_time (doctor_membership_id WITH =, time_range WITH &&)`;
`excl_appointments_room_time (branch_room_id WITH =, time_range WITH &&)` (also `branch_room_id IS NOT NULL`);
`excl_appointments_machine_time (branch_machine_id WITH =, time_range WITH &&)` (also `branch_machine_id IS NOT NULL`).
Indexes: unique `public_id`; unique `(organization_id, appointment_number)`; `WHERE deleted_at IS NULL`: `(organization_id, appointment_date, start_time, id)` (day view, daily counts), `(branch_id, appointment_date, start_time)`, `(doctor_membership_id, appointment_date)`, `(contact_id, appointment_date DESC)` (a person's last and next visit), `(organization_id, branch_id, visit_stage) WHERE status = 'checked_in'` (the floor); `(offering_id)`, `(copied_from_appointment_id)` `WHERE … IS NOT NULL`. Stage moves change only `visit_stage` columns, so the exclusion indexes are untouched.
RLS: organization policy, enabled and forced. Branch: application filter on `branch_id` — the floor stage with it.

### 6.4 Permissions

One code set (A9), in the **Appointments** row of the Roles matrix.

| Code | Roles matrix | Allows | Routes (6.7) | Held by default |
| --- | --- | --- | --- | --- |
| `appointment:read` | Appointments · View | appointments (and the floor), slots, daily counts | 1, 3, 4, 6 | Owner, Admin, Doctor, Therapist, Front desk, Counsellor |
| `appointment:create` | Appointments · Create | book, walk in, copy | 5, 17 | same |
| `appointment:update` | Appointments · Edit | change or move; confirm, check in, complete, no-show, cancel, reinstate, undo check-in; floor stage, pause, resume | 7, 10–16, 18–20 | same |
| `appointment:delete` | Appointments · Delete | delete or restore | 8, 9 | Owner, Admin |
| `appointment:export` | Appointments · Export | the appointments CSV | 2 | Owner, Admin, Doctor |

**Visibility**: a holder of `branch:read` sees every appointment; anyone else sees those of the branches they work at — anything else is a `404`; booking at another branch is a `400`.

### 6.5 Common to every route

| Item | Value |
| --- | --- |
| Base | `/api/v1/app` |
| Auth | `Authorization: Bearer <access token>`; the active organization comes from the token |
| Writes | every `POST` needs `X-Idempotency-Key`; `PATCH` takes an optional `expected_updated_at` (a stale save → `409 record_changed`) |
| Success | `200` with `{ data, meta }`; lists `{ data: [...], meta: { pagination: { per_page, next, has_more, estimated_total } } }` (`estimated_total` on the first page, up to 10,000); `DELETE` → `204` |
| Lists | `limit` (1–100, default 25), `after`, `q` (1–200), `sort`, `order`, `created_from` / `created_to` (`to` exclusive) |
| Errors | `{ error: { type, code, reason?, detail, errors[] } }` — `400 invalid_field`, `401`, `403`, `404`, `409`, `422` idempotency key missing or reused |

### 6.6 Objects returned

**Appointment** — `app.appointments`; routes 1, 5–20

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | `appt_…` |
| `appointment_number` | integer | shown "#2841" |
| `contact_id` | string | `con_…` (A1) |
| `contact` | object | `id`, `contact_number`, `first_name`, `last_name`, `primary_phone` — for lists |
| `patient_id`, `lead_id` | string \| null | the contact's patient file and open lead (read-only) |
| `branch_id` | string | `brn_…` |
| `type` | string | `consultation` (default) · `follow_up` · `treatment` · `package_session` · `other` |
| `offering_id` | string \| null | `off_…` |
| `service_label` | string | 1–120; defaults to the offering's name |
| `doctor_membership_id` | string | `mem_…` |
| `therapist_membership_id` | string \| null | `mem_…` |
| `branch_room_id`, `branch_machine_id` | string \| null | `room_…` / `mach_…` in the same branch (A2) |
| `appointment_date` | `YYYY-MM-DD` | local |
| `start_time`, `end_time` | `HH:mm` | local; `end_time` = start + duration |
| `duration_minutes` | integer | 5–240, a multiple of 5 |
| `status` | string | `scheduled` · `confirmed` · `checked_in` · `completed` · `cancelled` · `no_show` |
| `visit_stage` | string \| null | `waiting` · `with_doctor` · `treatment` · `checkout` · `pharmacy` — only while `checked_in` (A10) |
| `visit_stage_changed_at`, `visit_paused_at` | ISO datetime \| null | |
| `is_walk_in` | boolean | |
| `cancel_reason`, `cancel_note` | string \| null | with `cancelled` |
| `checked_in_at`, `completed_at` | ISO datetime \| null | with their status — the visit's start and end |
| `rescheduled_from` | ISO datetime \| null | "Rescheduled · was …" |
| `move_count` | integer | |
| `reason` | string \| null | up to 160 |
| `notes` | string \| null | up to 2000 |
| `follow_up_at` | ISO datetime \| null | |
| `copied_from_appointment_id` | string \| null | |
| `reminder_status`, `is_confirmed_by_reply` | | written by the messaging worker (A13) |
| `created_at`, `updated_at` | ISO datetime | |

**Appointments export** — route 2: `file_name` (`appointments-YYYY-MM-DD.csv`), `content_type`, `row_count` (up to 5,000), `is_truncated`, `content`.

**Slots** — route 3: `appointment_date`, `is_open`, `closed_reason` (`past` · `branch_inactive` · `closed_day` · `holiday` · `doctor_off`) or null, `closed_label` (the holiday's label) or null, `slots[]` of `{ start_time, end_time }`.

**Daily count** — route 4: one per day in the range: `appointment_date`, `total`, `by_status` (every status, zeros included).

### 6.7 Routes (20)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | `/appointments` | List appointments — and the clinic floor (`status=checked_in`) | `appointment:read` | |
| 2 | GET | `/appointments/exports` | Download the list as CSV | `appointment:export` | |
| 3 | GET | `/appointments/slots` | Free slots for a day | `appointment:read` | |
| 4 | GET | `/appointments/daily-counts` | Counts per day and status | `appointment:read` | |
| 5 | POST | `/appointments` | Book, or record a walk-in | `appointment:create` | req |
| 6 | GET | `/appointments/{appointment_id}` | Get an appointment | `appointment:read` | |
| 7 | PATCH | `/appointments/{appointment_id}` | Change or move a booking | `appointment:update` | |
| 8 | DELETE | `/appointments/{appointment_id}` | Delete a booking | `appointment:delete` | |
| 9 | POST | `/appointments/{appointment_id}/restore` | Undo a delete | `appointment:delete` | req |
| 10 | POST | `/appointments/{appointment_id}/confirm` | They said yes **(new, A5)** | `appointment:update` | req |
| 11 | POST | `/appointments/{appointment_id}/check-in` | They arrived — stage `waiting` **(new, A5)** | `appointment:update` | req |
| 12 | POST | `/appointments/{appointment_id}/complete` | The visit is done **(new, A5)** | `appointment:update` | req |
| 13 | POST | `/appointments/{appointment_id}/no-show` | They did not come **(new, A5)** | `appointment:update` | req |
| 14 | POST | `/appointments/{appointment_id}/cancel` | Cancel with a reason | `appointment:update` | req |
| 15 | POST | `/appointments/{appointment_id}/reinstate` | Undo a cancel | `appointment:update` | req |
| 16 | POST | `/appointments/{appointment_id}/undo-check-in` | Undo a mistaken check-in | `appointment:update` | req |
| 17 | POST | `/appointments/{appointment_id}/copy` | Book again on another day | `appointment:create` | req |
| 18 | POST | `/appointments/{appointment_id}/stage` | Move to a later floor stage **(was the visit's, A10)** | `appointment:update` | req |
| 19 | POST | `/appointments/{appointment_id}/pause` | Pause the visit **(was the visit's)** | `appointment:update` | req |
| 20 | POST | `/appointments/{appointment_id}/resume` | Resume it **(was the visit's)** | `appointment:update` | req |

Removed: `POST /appointments/{appointment_id}/status` (now 10–13) and all six `/visits…` routes — the floor list is route 1, stage / pause / resume are 18–20, and the consult notes are the patient file's (sub-domain 7).

### 6.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 1, 2 | `q` (service, contact names, numbers, appointment number), `contact_id`, `branch_id`, `branch_ids`, `doctor_membership_id`, `branch_room_id`, `branch_machine_id`, `offering_id`, `type`, `status` (several), `visit_stage` (several), `is_walk_in`, `appointment_date_from` / `appointment_date_to` (inclusive, A8), `sort` = `appointment_date` (default: date, then start, ascending) \| `visit_stage_changed_at` \| `created_at`, `order`, `limit`, `after` (2 ignores `limit` / `after`) | — | 1: Appointment[] (paginated) · 2: Appointments export |
| 3 | `branch_id*`, `appointment_date*`, `duration_minutes*` (5–240), `doctor_membership_id`, `branch_room_id`, `branch_machine_id`, `step_minutes` (5–60, default 15) | — | Slots |
| 4 | `date_from*`, `date_to*` (inclusive, up to 62 days), `branch_ids`, `doctor_membership_id` | — | Daily count[] |
| 5 | — | `contact_id*`, `branch_id*` (one of yours), `doctor_membership_id*`, `appointment_date*` + `start_time*` (not for a walk-in); optional: `type`, `offering_id`, `service_label`, `therapist_membership_id`, `branch_room_id`, `branch_machine_id`, `duration_minutes`, `reason`, `notes`, `follow_up_at`, `is_walk_in` | Appointment |
| 6 | — | — | Appointment |
| 7 | — | any field of #5 but `contact_id` and `is_walk_in` (at least one); `expected_updated_at` | Appointment |
| 8 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |
| 9, 10, 11, 12, 13, 15, 16, 19, 20 | — | — | Appointment |
| 14 | — | `cancel_reason*` (the 7 reasons), `cancel_note` (up to 280) | Appointment |
| 17 | — | `appointment_date*`, `start_time*` | Appointment — the new booking |
| 18 | — | `visit_stage*` (a later stage) | Appointment |

### 6.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 5, 7, 15, 17 | `409` · `slot_in_past` | the start has passed (organization time) |
| 5, 7, 15, 17 | `409` · `slot_closed` (`reason`: `branch_inactive` · `closed_day` · `holiday` · `doctor_off`) | the branch or the doctor is not working then (A4) |
| 5, 7, 15, 17 | `409` · `slot_outside_hours` | outside the branch's opening hours |
| 5, 7, 9, 15, 17 | `409` · `slot_taken` (`resource`: doctor · room · machine) | an exclusion constraint fired (A3) |
| 5, 7 | `400` · `branch_room_id` / `branch_machine_id` | not in the appointment's branch (A2) |
| 5, 7 | `400` · `duration_minutes` | not a multiple of 5 (A13) |
| 5, 7 | `400` · `branch_id` | a branch the caller does not work at |
| 7 | `409` · `appointment_not_movable` | a slot change after check-in, cancel or no-show |
| 10–16 | `409` · `transition_not_allowed` | not a move schema-routes allows (A5) |
| 11, 13 | `409` · `appointment_not_due` | a check-in on a later day, or a no-show before the start |
| 16 | `409` · `visit_started` | the floor stage has moved past `waiting` |
| 18 | `409` · `transition_not_allowed` | not checked in, or not a later stage (A11) |
| 19, 20 | `409` · `transition_not_allowed` | pause when paused or not checked in, resume when running |
| 4 | `400` · `date_to` | before `date_from`, or more than 62 days |
| 7 | `409` · `record_changed` | `expected_updated_at` is older than the record |
| 9 | `409` · `record_not_deleted` | the booking is live |
| any by-id | `404` | not in the organization, deleted, or in a branch the caller cannot see |

### 6.10 Rules worth knowing

- Check-in (route 11, or a walk-in) sets stage `waiting`, moves the contact's open lead to `clinic_visited` (its last status), creates the contact's patient file if it has none (A14), writes a `system` entry in the contact's activity ("Moved to Clinic visited at check-in") and adds the doctor and therapist to the contact's members (4). Undo check-in is allowed while the stage is still `waiting`; the lead stays `clinic_visited` and the patient file stays.
- Complete ends the visit (stage cleared, `completed_at` set); row #68 adds the package session on the treatment (sub-domain 7).
- Moving a booking stamps `rescheduled_from` and adds one to `move_count`; a confirmed booking moved returns to `scheduled`.
- Cancelled and no-show bookings free their slot; restore does not re-take one that was booked meanwhile (`409 slot_taken`).
- Free slots follow the branch's hours, working days and holidays (sub-domain 1), the doctor's working days and hours (sub-domain 2), and the three exclusion rules.

### 6.11 Code changes (not built — the code is frozen)

| # | Change |
| --- | --- |
| AC1 | A1: `appointments.contact_id` (`ON DELETE RESTRICT`); drop `patient_id`, `lead_id` and their check; derived `patient_id` / `lead_id` and the `contact` summary in responses; check-in reads the lead and patient through the contact |
| AC2 | A2: rename `room_id` / `machine_id` → `branch_room_id` / `branch_machine_id`; same-branch check |
| AC3 | A3: `CREATE EXTENSION btree_gist`; generated `time_range`; the three exclusion constraints; map SQLSTATE `23P01` to `409 slot_taken`; drop the JavaScript overlap check and the advisory lock |
| AC4 | A4: check the doctor's `work_starts_at` / `work_ends_at` |
| AC5 | A5: routes `/confirm`, `/check-in`, `/complete`, `/no-show` replace `/status`; `confirmed` → `scheduled` on a move; the timestamp `CHECK`s |
| AC14 | A14: check-in moves the open lead to `clinic_visited` and creates the missing patient file, in one transaction |
| AC6 | A6: walk-in without date and start |
| AC7 | A7: copy through the create path |
| AC8 | A8: inclusive `appointment_date_to`; fix the "newest first" route text |
| AC9 | A9: new code `appointment:export`; route 2 gated by it |
| AC10 | A10: drop `app.visits` and the `visits` nested sub-domain; `visit_stage`, `visit_stage_changed_at`, `visit_paused_at` on `app.appointments` with their `CHECK`s; the consult fields move to the patient file's clinical notes (sub-domain 7) |
| AC11 | A11: routes 18–20 with forward-only stages and pause / resume guards |
| AC12 | A12: drop `appointments.patient_package_id` |
| AC13 | A13: multiple-of-5 check in the app; `service_label` default from the offering |

### 6.12 Nested sub-domains

None — one folder, `src/domains/app/sub-domains/appointments/`; `visits/` goes (AC10).

---

## 7. Patients — final (confirmed 2026-10-08) — nested sub-domains 7.A–7.M

*Restructured 2026-10-08: old sub-domains 5 (rev 10), 8 (rev 2) and 9 (rev 2) in one section — layout only, no decision changed.*

Code: the **`patients` sub-domain folder** — `src/domains/app/sub-domains/patients/` (the patient file itself at the folder root) with `patient-clinical-notes/`, `patient-prescriptions/`, `prescription-kits/`, `patient-diagnoses/`, `patient-images/`, `patient-reports/`, `patient-treatments/`, `patient-check-ins/`, `patient-reviews/`, `patient-feedback-actions/`, `patient-offerings/` and `patient-offering-suggestions/` (P21, P22).

7.1 Decisions (whole sub-domain) · 7.2 Open questions · 7.3 Tables and relations · 7.4 Permissions · 7.5 Common to every route ·
7.6 Objects returned · 7.7 Routes · 7.8 Request details · 7.9 Errors · 7.10 Rules worth knowing · 7.11 Code changes (whole sub-domain) ·
7.12 Nested sub-domains · then **7.A Patients · 7.B Clinical notes · 7.C Prescriptions · 7.D Prescription kits · 7.E Patient diagnoses · 7.F Images · 7.G Reports · 7.H Treatments · 7.I Check-ins · 7.J Reviews · 7.K Feedback actions · 7.L Patient offerings · 7.M Offering suggestions** — each with the same eleven sections: .1 Decisions ·
.2 Open questions · .3 Tables and relations · .4 Permissions · .5 Common to every route · .6 Objects returned · .7 Routes ·
.8 Request details · .9 Errors · .10 Rules worth knowing · .11 Code changes

Everything the clinic records about a patient: the file, what was done and how they felt about it, what they bought and what is planned next.

**The patient file.** A patient file is the **clinical side of a contact** (4) — consents, allergies, usual doctor, home branch,
status — and, since the old patient-file sub-domain merged in, everything the clinic records about their care. Everything about the
person lives on the contact; the timeline is the contact's activity (4); the search is the contacts search
(4). Design: `patients.md`,
`patient-file.md`, `schema-routes.md`.

**Treatments and feedback.** What the clinic did for a patient and how they felt about it: treatment sessions (and the bought sessions they
spend), aftercare check-ins, reviews, and what the team did about poor feedback. Every table is the patient's (P21),
so every route sits under `/patients/{patient_id}/…`. Design: `patient-file.md` (Treatments
tab, Feedback card, the drawers), `today.md` (the visit sheet), `tasks.md`, `schema-routes.md` (Treatment, CheckIn,
Review, FeedbackAction). Row #68 (finishing a visit records the package session) lands here and in sub-domain 6.

**Patient offerings and plan.** What a patient has bought — every session-based offering on their bills, a package being one with more than one
session — and what the clinic plans to sell them next (the patient's plan): suggested (7.M) → bought (7.L) → done
(7.H–7.K). Both are the patient's (P21). Design: `patient-file.md` (Packages tab, Offering suggestions card, the visit flow's Invoice step),
`payments.md` (the invoice drawer's "⚡ Package" and "⚡ Plan" fills), `appointments.md` (Package session, "Plan
ready"), `schema-routes.md` (PatientPackage, OfferingSuggestion). Route numbers run 1–73.

### 7.1 Decisions (whole sub-domain)

Taken on your standing answer "go with the recommendation" — confirmed 2026-10-08. A decision
that belongs to one table is in its nested sub-domain.

| # | Decision |
| --- | --- |
| P5 | Two code sets, both in the **Patients** row: `patient:read` · `create` · `update` · `delete` · `export` (replaces `list:export`, O14) with the field-level `patient:clinical_record:read` and `patient:private_album:read` (renamed as O15 did); and `patient_prescription:read` · `create` · `update` · `delete` — prescribing is the doctors'; folding it into `patient:update` would let the front desk prescribe. |
| P6 | Patients are not branch-scoped — a person may be seen in any branch; `home_branch_id` says where they belong. The patient file's records follow their patient. |
| P7 | Patients are never purged — soft delete only, restore always possible; every table that points at a patient does so `ON DELETE RESTRICT` (today `NO ACTION`, two `CASCADE` / `SET NULL`). Clinical records must be kept. |
| P8 | The timeline and the global search go (your point 3): the timeline → the contact's activity (4), where each sub-domain writes a `system` entry linked to its record, shown only to callers who can read that record (M10); `GET /searches` → `GET /contacts?q=` (4) plus each list's own number search. |
| P11 | The old patient-file sub-domain merges here (your point 4). **Routes and folders follow ownership** (your rule: a sub-domain is laid out like a domain, and what it owns are its nested sub-domains): what a patient owns nests under them — routes under `/patients/{patient_id}/…`, code in the sub-domain folder's `sub-domains/` — while prescription kits and the diagnosis catalogue belong to no one patient, so their routes stay top-level — `/prescription-kits`, `/patient-diagnoses` (P22). Today all six are flat siblings of `patients/` and their by-id routes are top-level. |
| P14 | Writing a clinical note, a photo or a report needs `patient:update` **and** `patient:clinical_record:read` (today the front desk writes clinical notes it may not read); reports are read with `patient:clinical_record:read` like notes and photos (today any `patient:read` holder reads lab results). |
| P20 | Patient notes go — a team note is a `note` in the contact's activity (4); `app.patient_notes` and its 6 routes are dropped. `app.patient_ideas` (a table with no routes) is dropped until its feature is built. |
| P21 | Every table a patient owns is named `patient_<thing>`, nests under `/patients/{patient_id}/<things>` and lives in `patients/patient-<things>/` (your rule); an organization-wide list uses the table's name. Treatments, check-ins, reviews, feedback actions and what was bought (7.H–7.M) follow it too. |
| P22 | **Folder names follow the table.** A table the patient owns carries their prefix (`patient_clinical_notes` → `patient-clinical-notes/`), and so does the diagnosis catalogue — `patient_diagnoses`, the diagnoses the clinic records on its patients (your call, P28); `prescription_kits` (a doctor's own) keeps its name → `prescription-kits/`, as `tenancy/sub-domains/permission/` sits beside `organization/` today. Other options for the kits: nest them under `patient-prescriptions/` (they serve prescriptions, but no prescription owns them — breaks "what a parent owns nests under it"), or rename them `patient_prescription_kits`. |
| TR1 | **Names and nesting follow P21**: `app.treatments` → `app.patient_treatments`, `app.check_ins` → `app.patient_check_ins`, `app.reviews` → `app.patient_reviews`, `app.feedback_actions` → `app.patient_feedback_actions`; every by-id route nests under `/patients/{patient_id}/…` (today `/treatments/{treatment_id}`, `/check-ins/…`, `/reviews/…` and a flat `/feedback-actions`); path ids `patient_treatment_id`, `patient_check_in_id`, `patient_review_id`. The organization-wide treatments list is `/patient-treatments` (the table's name, P21). Public-id prefixes stay (`trt_`, `chk_`, `rev_`, `fba_`). |
| TR2 | **Two code sets in the Patients row**, as the patient file (7.A–7.G) did for prescriptions (P5): treatments get their own — `patient_treatment:read` · `create` · `update` (replaces `treatment:*`) — because recording a session spends a paid session and is the clinicians' work; there is no `:delete`, since a treatment is reversed, never deleted (TR4). Check-ins, reviews and feedback actions are the patient file's own and use `patient:read` / `patient:update` (the desk makes the feedback calls); `review:*` goes. Today treatments are read with `patient:read` while the timeline asked for `treatment:read`. After this, Marketing (today `review:*`) needs Patients · Edit to log reviews. |
| TR3 | Not branch-scoped — they follow their patient (P6). **Same-patient rule** on every link: an appointment must be the patient's contact's, a treatment or a patient offering the patient's (`400`); today only the package is checked. The path's patient always wins — today `?patient_id=` on a nested list overrides the path. |
| TR4 | **Follow-up tasks are sub-domain 10's** rules over these records: a doctor call-back while a check-in or a review **needs action** (TR9, TR11), an aftercare call while a treatment with `aftercare_call` has no check-in. Today the check-in insert writes the call-back itself — for feel `worse` only, never on a later edit, never for reviews. Until sub-domain 10 is built, the writes keep creating it, now for `worse` or a score ≤ 4, a rating ≤ 3, and an edit that turns it on. |
| TR5 | Recording or reversing a treatment, a check-in and a review each write a `system` entry in the contact's activity, linked to the record and shown only to callers who can read it (4, M10). 4's link columns are renamed to match: `patient_treatment_id`, `patient_check_in_id`, `patient_review_id`. |
| PK1 | **Names and nesting follow P21**: `app.patient_packages` → **`app.patient_offerings`** — PK4 widens it to every session-based offering bought, so the name says what it holds (the design's PatientPackage and Packages tab read it with `is_package=true`) — under `/patients/{patient_id}/offerings/{patient_offering_id}` (today `/patient-packages/{…}`); `app.offering_suggestions` → `app.patient_offering_suggestions` under `/patients/{patient_id}/offering-suggestions/{patient_offering_suggestion_id}`. Public-id prefixes: `poff_` (new, was `ppkg_`), `osug_` stays; the OpenAPI tag `Invoice` becomes `Patient`. |
| PK2 | **Permissions — the Patients row, plus the billing code for what was billed**: reading both and writing the plan use `patient:read` / `patient:update` (doctors and counsellors plan; therapists see sessions left); a patient offering's terms — its sessions and validity — are what was invoiced, so changing them needs `payment:update` (sub-domain 8). Today a package is created with `payment:create`, changed with `patient:update` and deleted with `payment:delete` — the Accountant can sell but not change one, the Doctor change but not sell. |
| PK3 | Not branch-scoped — they follow their patient (P6). Links follow the same-patient rule (TR3): an appointment must be the patient's contact's, a check-in the patient's (`400`). |

### 7.2 Open questions

None — every decision follows the recommendation.

### 7.3 Tables and relations

**The patient file**

```text
tenancy.organizations
   │
   ├──< app.patients ──┬──> app.contacts                                                              the person (4)   — one patient file per contact
   │                   ├──> app.branches (home_branch_id) · tenancy.memberships (doctor)              home branch, usual doctor
   │                   ├──> app.leads (lead_id)                                                       the lead they came from
   │                   ├──< app.patient_clinical_notes ──> app.appointments · app.patient_diagnoses   7.B — complaints, findings, diagnoses, plans, safety checks
   │                   ├──< app.patient_prescriptions ──> app.appointments · tenancy.memberships      7.C — doctor and approver; lines as jsonb
   │                   ├──< app.patient_images ──> app.appointments                                   7.F — photos: general, LHR, private album
   │                   └──< app.patient_reports                                                       7.G — lab, scan, consent files
   │
   ├──< app.prescription_kits ──> tenancy.memberships (owner)                                         7.D — a doctor's reusable prescription lines
   └──< app.patient_diagnoses                                                                         7.E — the organization's diagnosis catalogue

A ──< B   one A has many B     A >── B   many A for one B     A ──> B   a column on A points at one B     A ─── B   at most one B per A
```

Pointing at a patient (all `ON DELETE RESTRICT` — P7): the patient-file tables, `patient_treatments`, `patient_check_ins`, `patient_reviews` (7.H–7.K), `patient_offerings`, `patient_offering_suggestions` (7.L–7.M). Billing and tasks point at the contact instead (8, B3; 10, TK5); stock points at the treatment (9, S14).

Standard columns on every record table (not repeated below): `id bigint` (identity), `public_id varchar(28)` unique, `organization_id bigint` → organizations `ON DELETE CASCADE`, `created_at` / `updated_at timestamptz`, `created_by_user_id` / `updated_by_user_id`, and — where it soft-deletes — `deleted_at`, `delete_reason`, `delete_note` with their three checks; RLS enabled and forced. Every patient-file table also has `patient_id` → patients `ON DELETE RESTRICT`, an index `(patient_id, created_at, id)`, RLS (organization policy, enabled and forced) and no branch rule (P6). Each table's design is in its nested sub-domain.

**Treatments and feedback**

| Table | Holds | Key rules |
| --- | --- | --- |
| `app.patient_treatments` | one session done on a patient | reversed with a reason, never deleted (TR6); spends at most one bought session, linked before or after the bill (TR7, TR13) |
| `app.patient_check_ins` | how the patient feels after a visit or a session | needs action when feel is `worse` or the score ≤ 4 and nothing was done (TR9); soft delete + restore |
| `app.patient_reviews` | a review the patient left — Google, video, Instagram, form, WhatsApp | needs action when the rating ≤ 3 and nothing was done (TR11); soft delete + restore |
| `app.patient_feedback_actions` | what the team did about one check-in or one review | exactly one parent; append-only (TR12) |

```text
tenancy.organizations
   │
   └──< app.patients     ──┬──< app.patient_treatments ──┬──> app.patient_offerings                      7.H — spends at most one bought session
                           │                             ├──> app.appointments · app.offerings           the visit, what was done
                           │                             └──> tenancy.memberships (doctor, therapist)    who did it
                           ├──< app.patient_check_ins ──┬──> app.patient_treatments · app.appointments   7.I — after a session or a visit
                           │                            ├──< app.patient_offering_suggestions            its next offerings, in the plan
                           │                            └──< app.patient_feedback_actions                7.K — what was done about it
                           └──< app.patient_reviews ──┬──> app.appointments                              7.J — Google, video, Instagram, form, WhatsApp
                                                      └──< app.patient_feedback_actions                  7.K — what was done about it

A ──< B   one A has many B     A >── B   many A for one B     A ──> B   a column on A points at one B     A ─── B   at most one B per A
```

Pointing at these from other sub-domains: `contact_activities.patient_treatment_id` / `patient_check_in_id` / `patient_review_id` (4, TR5), `patient_offering_suggestions.patient_check_in_id` (7.L–7.M — a check-in's next offerings), `stock_item_movements.patient_treatment_id` (9 — the stock a session used), the task source (10).

**PostgreSQL design**

Standard columns as above.

**Patient offerings and plan**

| Table | Holds | Key rules |
| --- | --- | --- |
| `app.patient_offerings` | the sessions bought in one invoice line — a package when more than one | created only by invoicing (PK4); sessions spent and given back only by treatments, recorded before or after the bill (PK5, PK11); goes and comes back with its invoice |
| `app.patient_offering_suggestions` | one row of the patient's plan | status `planned` · `accepted` · `next_time` · `declined`; invoiced through invoice lines (PK7); soft delete + restore |

```text
tenancy.organizations
   │
   └──< app.patients     ──┬──< app.patient_offerings ──┬──> app.offerings                                             7.L — what was bought
                           │                            ├─── app.invoice_items (8)                                     the invoice line that sold it — one per line
                           │                            └──< app.patient_treatments                                    the sessions spent — linked before or after the bill
                           └──< app.patient_offering_suggestions ──┬──> app.offerings                                  7.M — the plan
                                                                   ├──> app.appointments · app.patient_check_ins       where it came from
                                                                   ├──> tenancy.memberships (suggested by)             who suggested it
                                                                   └──< app.invoice_items (8)                          the lines that invoiced it

A ──< B   one A has many B     A >── B   many A for one B     A ──> B   a column on A points at one B     A ─── B   at most one B per A
```

Pointing at these: `patient_treatments.patient_offering_id` (7.H–7.K — `ON DELETE RESTRICT`), `invoice_items.patient_offering_suggestion_id` (8), `contact_activities.patient_offering_id` (4).

**PostgreSQL design**

Standard columns as above.

### 7.4 Permissions

All of the sub-domain's codes in one place; each nested sub-domain's routes repeat the gate.

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `patient:read` | Patients · View | patient files; check-ins, reviews and their actions; what was bought, and the plan | 1, 4, 51, 53, 57, 59, 65, 66, 68, 70 | Owner, Admin, Doctor, Therapist, Front desk, Counsellor, Pharmacist, Accountant, Marketing |
| `patient:create` | Patients · Create | add a patient file by hand (an inline new contact also needs `contact:create`); check-in creates one without it (sub-domain 6) | 3 | Owner, Admin, Doctor, Therapist, Front desk, Counsellor |
| `patient:update` | Patients · Edit | change a patient file; with the clinical code: write clinical notes, photos, reports (P14); write, delete and restore check-ins and reviews; log actions; plan: add, change, remove, restore | 5, 9, 11, 12, 34, 36–38, 40, 42–44, 52, 54–56, 58, 60–64, 69, 71–73 | same |
| `patient:delete` | Patients · Delete | delete or restore a patient file | 6, 7 | Owner, Admin |
| `patient:export` | Patients · Export | the patients CSV | 2 | Owner, Admin, Doctor, Pharmacist, Accountant |
| `patient:clinical_record:read` | Patients · Clinical record | clinical notes, photos, reports — read, and needed to write them (P14) | 8, 10, 33, 35, 39, 41 (+ the writes) | Owner, Admin, Doctor, Therapist, Counsellor |
| `patient:private_album:read` | Patients · Private album | private photos — read and write (P19) | 33–38 for `album = private` | Owner, Admin, Doctor |
| `patient_prescription:read` | Patients · Prescriptions · View | prescriptions | 13, 14, 16 | Owner, Admin, Doctor, Therapist, Counsellor, Pharmacist |
| `patient_prescription:create` | Patients · Prescriptions · Create | write a prescription; own kits; add to the diagnosis catalogue | 15, 21–26, 28 | Owner, Admin, Doctor |
| `patient_prescription:update` | Patients · Prescriptions · Edit | change or approve a draft; edit the catalogue | 17, 18, 30 | Owner, Admin, Doctor |
| `patient_prescription:delete` | Patients · Prescriptions · Delete | delete or restore a draft; catalogue entries | 19, 20, 31, 32 | Owner, Admin |
| `organization:read` | — (always on) | the diagnosis catalogue | 27, 29 | every role |
| `patient_treatment:read` | Patients · Treatments · View | treatments | 45, 46, 48 | Owner, Admin, Doctor, Therapist, Front desk, Counsellor |
| `patient_treatment:create` | Patients · Treatments · Create | record a session — may spend a bought session | 47 | Owner, Admin, Doctor, Therapist |
| `patient_treatment:update` | Patients · Treatments · Edit | change or reverse a session — reversing gives the session back | 49, 50 | Owner, Admin, Doctor, Therapist |
| `payment:update` | Payments · Edit | change a patient offering's sessions or validity | 67 | sub-domain 8 (Owner, Admin, Front desk, Accountant) |

"+ clinical" on a route = also `patient:clinical_record:read` (P14); a private photo also needs `patient:private_album:read`.

Holders follow today's presets (`treatment:*`). The design gives the Therapist view only on Patients (`users.md`) while making treatments theirs (`schema-routes.md`: "Doctor, Therapist") — the presets keep the Therapist able to record sessions.

Selling an offering is invoicing it — `payment:create` (sub-domain 8).

### 7.5 Common to every route

| Item | Value |
| --- | --- |
| Base | `/api/v1/app` |
| Auth | `Authorization: Bearer <access token>`; the active organization comes from the token |
| Writes | every `POST` needs `X-Idempotency-Key`; `PATCH` takes an optional `expected_updated_at` (a stale save → `409 record_changed`) |
| Success | `200` with `{ data, meta }`; lists `{ data: [...], meta: { pagination: { per_page, next, has_more, estimated_total } } }` (`estimated_total` on the first page, up to 10,000); `DELETE` → `204` |
| Lists | `limit` (1–100, default 25), `after`, `q` (1–200), `sort`, `order`, `created_from` / `created_to` (`to` exclusive) |
| Errors | `{ error: { type, code, reason?, detail, errors[] } }` — `400 invalid_field`, `401`, `403`, `404`, `409`, `422` idempotency key missing or reused |

### 7.6 Objects returned

Each nested sub-domain lists its own objects (7.A to 7.M, section .6):

| Object | Where |
| --- | --- |
| Patient · Patients export | 7.A.6 — Patients |
| Clinical note | 7.B.6 — Clinical notes |
| Patient prescription | 7.C.6 — Prescriptions |
| Prescription kit | 7.D.6 — Prescription kits |
| Patient diagnosis | 7.E.6 — Patient diagnoses |
| Patient image | 7.F.6 — Images |
| Patient report | 7.G.6 — Reports |
| Treatment | 7.H.6 — Treatments |
| Check-in | 7.I.6 — Check-ins |
| Review | 7.J.6 — Reviews |
| Feedback action | 7.K.6 — Feedback actions |
| Patient offering | 7.L.6 — Patient offerings |
| Offering suggestion | 7.M.6 — Offering suggestions |

### 7.7 Routes

Every route of the sub-domain in one table; each nested sub-domain repeats its own with the details.

| # | Method | Path | Purpose | Gate | Idem | Nested sub-domain |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | GET | `/patients` | List patient files | `patient:read` | | 7.A Patients |
| 2 | GET | `/patients/exports` | Download the list as CSV | `patient:export` | | 7.A Patients |
| 3 | POST | `/patients` | Add a patient file (for a contact, or with a new one) | `patient:create` | req | 7.A Patients |
| 4 | GET | `/patients/{patient_id}` | Get a patient file | `patient:read` | | 7.A Patients |
| 5 | PATCH | `/patients/{patient_id}` | Change a patient file | `patient:update` | | 7.A Patients |
| 6 | DELETE | `/patients/{patient_id}` | Remove a patient file | `patient:delete` | | 7.A Patients |
| 7 | POST | `/patients/{patient_id}/restore` | Undo a removal | `patient:delete` | req | 7.A Patients |
| 8 | GET | `/patients/{patient_id}/clinical-notes` | The clinical notes | `patient:clinical_record:read` | | 7.B Clinical notes |
| 9 | POST | `/patients/{patient_id}/clinical-notes` | Add a clinical note | `patient:update` + clinical | req | 7.B Clinical notes |
| 10 | GET | `/patients/{patient_id}/clinical-notes/{patient_clinical_note_id}` | Get one **(moved)** | `patient:clinical_record:read` | | 7.B Clinical notes |
| 11 | DELETE | `/patients/{patient_id}/clinical-notes/{patient_clinical_note_id}` | Delete a wrong note **(moved)** | `patient:update` + clinical | | 7.B Clinical notes |
| 12 | POST | `/patients/{patient_id}/clinical-notes/{patient_clinical_note_id}/restore` | Undo **(moved)** | `patient:update` + clinical | req | 7.B Clinical notes |
| 13 | GET | `/patient-prescriptions` | All prescriptions — the pharmacy queue | `patient_prescription:read` | | 7.C Prescriptions |
| 14 | GET | `/patients/{patient_id}/prescriptions` | A patient's prescriptions | `patient_prescription:read` | | 7.C Prescriptions |
| 15 | POST | `/patients/{patient_id}/prescriptions` | Write a prescription | `patient_prescription:create` | req | 7.C Prescriptions |
| 16 | GET | `/patients/{patient_id}/prescriptions/{patient_prescription_id}` | Get one **(moved)** | `patient_prescription:read` | | 7.C Prescriptions |
| 17 | PATCH | `/patients/{patient_id}/prescriptions/{patient_prescription_id}` | Change a draft **(moved)** | `patient_prescription:update` | | 7.C Prescriptions |
| 18 | POST | `/patients/{patient_id}/prescriptions/{patient_prescription_id}/approve` | Approve — final **(moved)** | `patient_prescription:update` | req | 7.C Prescriptions |
| 19 | DELETE | `/patients/{patient_id}/prescriptions/{patient_prescription_id}` | Delete a draft **(moved)** | `patient_prescription:delete` | | 7.C Prescriptions |
| 20 | POST | `/patients/{patient_id}/prescriptions/{patient_prescription_id}/restore` | Undo **(moved)** | `patient_prescription:delete` | req | 7.C Prescriptions |
| 21 | GET | `/prescription-kits` | My kits | `patient_prescription:create` | | 7.D Prescription kits |
| 22 | POST | `/prescription-kits` | Save a kit | `patient_prescription:create` | req | 7.D Prescription kits |
| 23 | GET | `/prescription-kits/{prescription_kit_id}` | Get a kit | `patient_prescription:create` | | 7.D Prescription kits |
| 24 | PATCH | `/prescription-kits/{prescription_kit_id}` | Change a kit | `patient_prescription:create` | | 7.D Prescription kits |
| 25 | DELETE | `/prescription-kits/{prescription_kit_id}` | Delete a kit | `patient_prescription:create` | | 7.D Prescription kits |
| 26 | POST | `/prescription-kits/{prescription_kit_id}/restore` | Undo | `patient_prescription:create` | req | 7.D Prescription kits |
| 27 | GET | `/patient-diagnoses` | The diagnosis catalogue **(renamed)** | any member | | 7.E Patient diagnoses |
| 28 | POST | `/patient-diagnoses` | Add a diagnosis **(renamed)** | `patient_prescription:create` | req | 7.E Patient diagnoses |
| 29 | GET | `/patient-diagnoses/{patient_diagnosis_id}` | Get one **(renamed)** | any member | | 7.E Patient diagnoses |
| 30 | PATCH | `/patient-diagnoses/{patient_diagnosis_id}` | Rename one **(renamed)** | `patient_prescription:update` | | 7.E Patient diagnoses |
| 31 | DELETE | `/patient-diagnoses/{patient_diagnosis_id}` | Delete one **(renamed)** | `patient_prescription:delete` | | 7.E Patient diagnoses |
| 32 | POST | `/patient-diagnoses/{patient_diagnosis_id}/restore` | Undo **(renamed)** | `patient_prescription:delete` | req | 7.E Patient diagnoses |
| 33 | GET | `/patients/{patient_id}/images` | The photos — one album tab, or all you can see | `patient:clinical_record:read` | | 7.F Images |
| 34 | POST | `/patients/{patient_id}/images` | Add a photo to an album | `patient:update` + clinical | req | 7.F Images |
| 35 | GET | `/patients/{patient_id}/images/{patient_image_id}` | Get one **(moved)** | `patient:clinical_record:read` | | 7.F Images |
| 36 | PATCH | `/patients/{patient_id}/images/{patient_image_id}` | Change its details or move it to another album **(moved)** | `patient:update` + clinical | | 7.F Images |
| 37 | DELETE | `/patients/{patient_id}/images/{patient_image_id}` | Delete one **(moved)** | `patient:update` + clinical | | 7.F Images |
| 38 | POST | `/patients/{patient_id}/images/{patient_image_id}/restore` | Undo **(moved)** | `patient:update` + clinical | req | 7.F Images |
| 39 | GET | `/patients/{patient_id}/reports` | The reports | `patient:clinical_record:read` | | 7.G Reports |
| 40 | POST | `/patients/{patient_id}/reports` | Add a report | `patient:update` + clinical | req | 7.G Reports |
| 41 | GET | `/patients/{patient_id}/reports/{patient_report_id}` | Get one **(moved)** | `patient:clinical_record:read` | | 7.G Reports |
| 42 | PATCH | `/patients/{patient_id}/reports/{patient_report_id}` | Change one **(moved)** | `patient:update` + clinical | | 7.G Reports |
| 43 | DELETE | `/patients/{patient_id}/reports/{patient_report_id}` | Delete one **(moved)** | `patient:update` + clinical | | 7.G Reports |
| 44 | POST | `/patients/{patient_id}/reports/{patient_report_id}/restore` | Undo **(moved)** | `patient:update` + clinical | req | 7.G Reports |
| 45 | GET | `/patient-treatments` | Every patient's treatments — a doctor's or therapist's sessions **(renamed)** | `patient_treatment:read` | | 7.H Treatments |
| 46 | GET | `/patients/{patient_id}/treatments` | The patient's treatments | `patient_treatment:read` | | 7.H Treatments |
| 47 | POST | `/patients/{patient_id}/treatments` | Record a session (may spend a bought session) | `patient_treatment:create` | req | 7.H Treatments |
| 48 | GET | `/patients/{patient_id}/treatments/{patient_treatment_id}` | Get one **(moved)** | `patient_treatment:read` | | 7.H Treatments |
| 49 | PATCH | `/patients/{patient_id}/treatments/{patient_treatment_id}` | Change a session **(moved)** | `patient_treatment:update` | | 7.H Treatments |
| 50 | POST | `/patients/{patient_id}/treatments/{patient_treatment_id}/reverse` | Reverse it with a reason **(moved)** | `patient_treatment:update` | req | 7.H Treatments |
| 51 | GET | `/patients/{patient_id}/check-ins` | The patient's check-ins | `patient:read` | | 7.I Check-ins |
| 52 | POST | `/patients/{patient_id}/check-ins` | Log a check-in | `patient:update` | req | 7.I Check-ins |
| 53 | GET | `/patients/{patient_id}/check-ins/{patient_check_in_id}` | Get one **(moved)** | `patient:read` | | 7.I Check-ins |
| 54 | PATCH | `/patients/{patient_id}/check-ins/{patient_check_in_id}` | Change it **(moved)** | `patient:update` | | 7.I Check-ins |
| 55 | DELETE | `/patients/{patient_id}/check-ins/{patient_check_in_id}` | Remove it **(moved)** | `patient:update` | | 7.I Check-ins |
| 56 | POST | `/patients/{patient_id}/check-ins/{patient_check_in_id}/restore` | Undo **(moved)** | `patient:update` | req | 7.I Check-ins |
| 57 | GET | `/patients/{patient_id}/reviews` | The patient's reviews | `patient:read` | | 7.J Reviews |
| 58 | POST | `/patients/{patient_id}/reviews` | Log a review | `patient:update` | req | 7.J Reviews |
| 59 | GET | `/patients/{patient_id}/reviews/{patient_review_id}` | Get one **(moved)** | `patient:read` | | 7.J Reviews |
| 60 | PATCH | `/patients/{patient_id}/reviews/{patient_review_id}` | Change it **(moved)** | `patient:update` | | 7.J Reviews |
| 61 | DELETE | `/patients/{patient_id}/reviews/{patient_review_id}` | Remove it **(moved)** | `patient:update` | | 7.J Reviews |
| 62 | POST | `/patients/{patient_id}/reviews/{patient_review_id}/restore` | Undo **(moved)** | `patient:update` | req | 7.J Reviews |
| 63 | POST | `/patients/{patient_id}/check-ins/{patient_check_in_id}/actions` | Log what was done about a check-in **(moved)** | `patient:update` | req | 7.K Feedback actions |
| 64 | POST | `/patients/{patient_id}/reviews/{patient_review_id}/actions` | Log what was done about a review **(moved)** | `patient:update` | req | 7.K Feedback actions |
| 65 | GET | `/patients/{patient_id}/offerings` | What the patient bought — the Packages tab with `is_package=true` **(renamed)** | `patient:read` | | 7.L Patient offerings |
| 66 | GET | `/patients/{patient_id}/offerings/{patient_offering_id}` | Get one **(moved)** | `patient:read` | | 7.L Patient offerings |
| 67 | PATCH | `/patients/{patient_id}/offerings/{patient_offering_id}` | Change its sessions or validity **(moved)** | `payment:update` | | 7.L Patient offerings |
| 68 | GET | `/patients/{patient_id}/offering-suggestions` | The patient's plan | `patient:read` | | 7.M Offering suggestions |
| 69 | POST | `/patients/{patient_id}/offering-suggestions` | Add to the plan | `patient:update` | req | 7.M Offering suggestions |
| 70 | GET | `/patients/{patient_id}/offering-suggestions/{patient_offering_suggestion_id}` | Get one **(moved)** | `patient:read` | | 7.M Offering suggestions |
| 71 | PATCH | `/patients/{patient_id}/offering-suggestions/{patient_offering_suggestion_id}` | Change quantity, price, status, reason **(moved)** | `patient:update` | | 7.M Offering suggestions |
| 72 | DELETE | `/patients/{patient_id}/offering-suggestions/{patient_offering_suggestion_id}` | Remove from the plan **(moved)** | `patient:update` | | 7.M Offering suggestions |
| 73 | POST | `/patients/{patient_id}/offering-suggestions/{patient_offering_suggestion_id}/restore` | Undo **(moved)** | `patient:update` | req | 7.M Offering suggestions |

### 7.8 Request details

In each nested sub-domain (7.A to 7.M, section .8).

### 7.9 Errors

Every route can answer the errors in 7.5; each route's own errors are in its nested sub-domain (7.A to 7.M, section .9).

### 7.10 Rules worth knowing

- Name, numbers, gender, birth date and referral are edited on the contact (4) — "applies everywhere"; the usual doctor is added to the contact's members.
- Approving a prescription, adding a clinical note, a photo or a report writes a `system` entry in the contact's activity, shown only to callers who can read it (4, M10).
- Removing a patient file hides it; nothing clinical is deleted, and it can always be restored (P7).

- A bought session is spent only by a treatment linked to its patient offering — when recorded (TR7) or when billed after (TR13) — and given back only by reversing it (7.L–7.M). The Packages card's "Use a session" opens the treatment drawer; Today's "Complete session 4 of 6" records the treatment, then completes the appointment (sub-domain 6) — two writes, each with its own idempotency key.
- A check-in's next offerings become the patient's planned offering suggestions, linked back to the check-in (7.L–7.M) — they are not stored twice (TR10).
- `needs_action` (check-ins and reviews) turns off with the first feedback action — that is what clears the call-back (TR4).
- The design's field limits are tighter than the API's in places (remark 1,000 vs 2,000; plan 400 vs 500; review text 600 vs 2,000) — the API keeps the wider limit and the screen may hold the user to less.

- Selling: the invoice drawer (sub-domain 8) — "Add package" in the patient file opens it with the offering filled in. The invoice line creates the patient offering and, when the line came from the plan, marks that plan row accepted and invoiced.
- Spending a session: recording a treatment with the patient offering (7.H–7.K, TR7), or billing a treatment already recorded (PK11); "Book next" books a `package_session` appointment (sub-domain 6) — the session is spent when its treatment is recorded or billed, not at booking.
- The visit flow's Invoice step (`patient-file.md`): "Covered by package · nothing to bill" = today's treatments are all `is_billed=true`; "2 items ready · ₹6,250" = today's `is_billed=false` treatments (7.H–7.K) plus today's prescription; "Create invoice from visit" sends those treatments on their lines (PK11).
- The appointment's "Plan ready · n offerings" = live `planned` or `accepted` suggestions with its `appointment_id` (`GET …/offering-suggestions?appointment_id=`).
- Prices in the plan may sit below the lowest price — flagged, not refused; the invoice refuses them (sub-domain 8, O16).

### 7.11 Code changes (whole sub-domain)

| # | Change |
| --- | --- |
| PC4 | P5: codes `patient:export`, `patient:clinical_record:read`, `patient:private_album:read`, `patient_prescription:*` (permissions, catalog seed, presets, matrix) |
| PC5 | P7: patients out of the purge list; every incoming foreign key `ON DELETE RESTRICT` |
| PC6 | P8: drop the timeline route and rules, and the `searches` nested sub-domain |
| PC8 | P11, P22: move `patient-clinical-notes`, `prescriptions` (→ `patient-prescriptions`), `prescription-kits`, `diagnoses` (→ `patient-diagnoses`), `patient-images`, `patient-reports` into `app/sub-domains/patients/`, and nest the patient-owned by-id routes under `/patients/{patient_id}/…` |
| PC10 | P14: the clinical write routes require `patient:clinical_record:read` too; reports read with it |
| PC14 | P20: drop `app.patient_notes` (6 routes) and `app.patient_ideas` with their folders |
| TRC1 | TR1: rename the four tables (init migration, Drizzle schemas, indexes, constraints, RLS policies, the FORCE-RLS and purge lists), the folders into `app/sub-domains/patients/`, the routes, and the path ids in the param registry; 4's link columns (TR5) |
| TRC2 | TR2: codes `patient_treatment:read\|create\|update` replace `treatment:*` (app permissions, catalog seed, presets, matrix); drop `treatment:delete` and `review:*` |
| TRC3 | TR3: the same-patient checks on every link; the path patient wins over `?patient_id=` (in `base-record.service.ts`, for every nested list) |
| TRC4 | TR4: the call-back for a score ≤ 4, a rating ≤ 3 and on edits; task shape stays sub-domain 10's |
| TRC5 | TR5: `system` entries for treatments (recorded, reversed), check-ins and reviews |
| PKC1 | PK1: rename `app.patient_packages` → `app.patient_offerings` and `app.offering_suggestions` → `app.patient_offering_suggestions` (tables, schemas, indexes, constraints, RLS, FORCE-RLS and purge lists, folders, the `poff` prefix); move both folders into `app/sub-domains/patients/`; nest the by-id routes; path ids in the param registry; the OpenAPI tag |
| PKC2 | PK2: the package `PATCH` gated by `payment:update`; plan writes by `patient:update` |
| PKC3 | PK3: same-patient checks on `appointment_id` and `patient_check_in_id` |

### 7.12 Nested sub-domains

| Nested sub-domain | Folder | Tables | Routes | Status |
| --- | --- | --- | --- | --- |
| 7.A Patients | folder root | `app.patients` | 1–7 | final |
| 7.B Clinical notes | `patient-clinical-notes/` | `app.patient_clinical_notes` | 8–12 | final |
| 7.C Prescriptions | `patient-prescriptions/` | `app.patient_prescriptions` | 13–20 | final |
| 7.D Prescription kits | `prescription-kits/` | `app.prescription_kits` | 21–26 | final |
| 7.E Patient diagnoses | `patient-diagnoses/` | `app.patient_diagnoses` | 27–32 | final |
| 7.F Images | `patient-images/` | `app.patient_images` | 33–38 | final |
| 7.G Reports | `patient-reports/` | `app.patient_reports` | 39–44 | final |
| 7.H Treatments | `patient-treatments/` | `app.patient_treatments` | 45–50 | final |
| 7.I Check-ins | `patient-check-ins/` | `app.patient_check_ins` | 51–56 | final |
| 7.J Reviews | `patient-reviews/` | `app.patient_reviews` | 57–62 | final |
| 7.K Feedback actions | `patient-feedback-actions/` | `app.patient_feedback_actions` | 63–64 | final |
| 7.L Patient offerings | `patient-offerings/` | `app.patient_offerings` | 65–67 | final |
| 7.M Offering suggestions | `patient-offering-suggestions/` | `app.patient_offering_suggestions` | 68–73 | final |

---

### 7.A Patients — `app/sub-domains/patients/` (folder root) — final

#### 7.A.1 Decisions

| # | Decision |
| --- | --- |
| P1 | A patient file belongs to one contact (`contact_id`, `ON DELETE RESTRICT`), at most one per contact (partial unique index). `POST /patients` takes a `contact_id` **or** an inline `contact`, in one transaction; a second file for the same contact → `409 contact_is_patient`. Also the duplicate guard — today duplicates pass. |
| P2 | Every person field leaves the patient for the contact (your point 5): name, numbers, email, address, Instagram, default channel, preferences (as tags — 4, CT14; `language` goes), marketing consent, household, **gender, date of birth, referral source and referrer** (`referred_by_patient_id` → the contact's `referred_by_contact_id`). The patient keeps what is clinical or about being a patient. |
| P3 | The Patient object carries `contact_id` only — no embedded contact (your point 7); a list shows names with one call, `GET /contacts?ids=…` (4). |
| P4 | `conversion` means "took a treatment" (schema-routes T-Converted). Creating the file at check-in does not set it — today lead convert sets it, wrongly; treatments and feedback (7.H–7.K) sets it when the first treatment session is recorded, and it stays editable. |
| P9 | The list searches the patient number and, through the contact, names, numbers and contact number; `types` filters by several values. |
| P10 | A file is created at check-in when the contact has none (sub-domain 6, A14) — or by hand (no appointment yet). `lead_id` is the lead they came from — set at that check-in, read-only. |

#### 7.A.2 Open questions

None.

#### 7.A.3 Tables and relations

`app.patients`

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `patient_number` | `integer` | no | counter | `> 0` — shown "PT-0412" |
| `contact_id` | `bigint` | no | | → contacts `ON DELETE RESTRICT` |
| `home_branch_id` | `bigint` | no | | → branches |
| `types` | `text[]` | no | `'{}'` | `<@` the 6 types, `cardinality ≤ 6` |
| `status` | `varchar(8)` | no | `'new'` | `IN ('new','regular','vip','inactive')` |
| `conversion` | `varchar(13)` | no | `'not_converted'` | `IN ('converted','not_converted')` (P4) |
| `doctor_membership_id` | `bigint` | yes | | → memberships `ON DELETE RESTRICT` (K2) — the usual doctor; kept, shown as left, when they leave |
| `follow_up_at` | `timestamptz` | yes | | |
| `notes` | `text` | yes | | `char_length ≤ 2000` |
| `lead_id` | `bigint` | yes | | → leads `ON DELETE SET NULL` (P10) |
| `has_data_consent`, `has_photo_consent` | `boolean` | no | `false` | |
| `allergies`, `contraindications` | `text[]` | no | `'{}'` | `cardinality ≤ 30` each |

Indexes: unique `public_id`; unique `(organization_id, patient_number)`; unique `(organization_id, contact_id) WHERE deleted_at IS NULL` (P1); `WHERE deleted_at IS NULL`: `(organization_id, created_at DESC, id)`, `(organization_id, follow_up_at, id) WHERE follow_up_at IS NOT NULL`, GIN `(types)`; `(home_branch_id)`; `(doctor_membership_id)`, `(lead_id)` `WHERE … IS NOT NULL`. Name search and sort go through `app.contacts`' indexes. RLS: organization policy, enabled and forced. Branch: none.

Indexes: unique `public_id`; unique `(organization_id, patient_number)`; unique `(organization_id, contact_id) WHERE deleted_at IS NULL` (P1); `WHERE deleted_at IS NULL`: `(organization_id, created_at DESC, id)`, `(organization_id, follow_up_at, id) WHERE follow_up_at IS NOT NULL`, GIN `(types)`; `(home_branch_id)`; `(doctor_membership_id)`, `(lead_id)` `WHERE … IS NOT NULL`. Name search and sort go through `app.contacts`' indexes. RLS: organization policy, enabled and forced. Branch: none.

#### 7.A.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `patient:read` | Patients · View | patient files; check-ins, reviews and their actions; what was bought, and the plan | 1, 4 | Owner, Admin, Doctor, Therapist, Front desk, Counsellor, Pharmacist, Accountant, Marketing |
| `patient:create` | Patients · Create | add a patient file by hand (an inline new contact also needs `contact:create`); check-in creates one without it (sub-domain 6) | 3 | Owner, Admin, Doctor, Therapist, Front desk, Counsellor |
| `patient:update` | Patients · Edit | change a patient file; with the clinical code: write clinical notes, photos, reports (P14); write, delete and restore check-ins and reviews; log actions; plan: add, change, remove, restore | 5 | same |
| `patient:delete` | Patients · Delete | delete or restore a patient file | 6, 7 | Owner, Admin |
| `patient:export` | Patients · Export | the patients CSV | 2 | Owner, Admin, Doctor, Pharmacist, Accountant |

The codes as a whole, with their notes: 7.4.

#### 7.A.5 Common to every route

As 7.5.

#### 7.A.6 Objects returned

**Patient**

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | `pat_…` |
| `patient_number` | integer | shown "PT-0412" |
| `contact_id` | string | `con_…` — the person (P1, P3) |
| `home_branch_id` | string | `brn_…` |
| `types` | string[] | up to 6 of `aesthetic` · `clinical` · `lhr` · `dental` · `physio` · `gynac` |
| `status` | string | `new` (default) · `regular` · `vip` · `inactive` |
| `conversion` | string | `not_converted` (default) · `converted` — took a treatment (P4) |
| `doctor_membership_id` | string \| null | `mem_…` — usual doctor |
| `follow_up_at` | ISO datetime \| null | |
| `notes` | string \| null | up to 2000 |
| `lead_id` | string \| null | `lead_…` — where they came from (read-only) |
| `has_data_consent`, `has_photo_consent` | boolean | |
| `allergies`, `contraindications` | string[] | up to 30 each, each 1–120 |
| `created_at`, `updated_at` | ISO datetime | |

**Patients export**: `file_name` (`patients-YYYY-MM-DD.csv`), `content_type`, `row_count` (up to 5,000), `is_truncated`, `content` — with the contact's name and primary number joined in.

#### 7.A.7 Routes (1–7)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | `/patients` | List patient files | `patient:read` | |
| 2 | GET | `/patients/exports` | Download the list as CSV | `patient:export` | |
| 3 | POST | `/patients` | Add a patient file (for a contact, or with a new one) | `patient:create` | req |
| 4 | GET | `/patients/{patient_id}` | Get a patient file | `patient:read` | |
| 5 | PATCH | `/patients/{patient_id}` | Change a patient file | `patient:update` | |
| 6 | DELETE | `/patients/{patient_id}` | Remove a patient file | `patient:delete` | |
| 7 | POST | `/patients/{patient_id}/restore` | Undo a removal | `patient:delete` | req |

Removed: `GET /patients/{patient_id}/timeline` and `GET /searches` (P8).

#### 7.A.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 1, 2 | `q` (patient number such as `PT-0412` / `#412`, and through the contact: names, numbers, contact number), `status`, `conversion`, `types` (several), `home_branch_id`, `doctor_membership_id`, `contact_id`, `follow_up_at_from` / `follow_up_at_to`, `sort` = `created_at` (default, newest first) \| `patient_number` \| `follow_up_at`, `order`, `limit`, `after` (2 ignores `limit` / `after`) | — | 1: Patient[] · 2: Patients export |
| 3 | — | `contact_id` **or** `contact` (a Contact body, 4 route 2), `home_branch_id*`; optional: `types`, `status`, `conversion`, `doctor_membership_id`, `follow_up_at`, `notes`, `has_data_consent`, `has_photo_consent`, `allergies`, `contraindications` | Patient |
| 4, 7 | — | — | Patient |
| 5 | — | any field of #3 but the contact (at least one); `expected_updated_at` | Patient |
| 6 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |

#### 7.A.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 3 | `400` · `contact_id` | neither `contact_id` nor `contact`, or both |
| 3, 7 | `409` · `contact_is_patient` | the contact already has a live patient file (P1) |
| 3 | `409` · `contact_phone_exists` | the inline contact's number belongs to another household (4) |
| 3, 5 | `400` · `home_branch_id` / `doctor_membership_id` | not a live record of the organization |
| 5 | `409` · `record_changed` | `expected_updated_at` is older than the record |
| 7 | `409` · `record_not_deleted` | the file is live |
| 2 | `403` | missing `patient:export` |
| 4–7 | `404` | not in the organization, or deleted |

#### 7.A.10 Rules worth knowing

None beyond 7.10.

#### 7.A.11 Code changes

| # | Change |
| --- | --- |
| PC1 | P1, P2: `patients.contact_id` (`ON DELETE RESTRICT`) with a partial unique index; drop every person column and `search_text`; inline `contact` on create |
| PC2 | P3: no `contact` object in responses |
| PC3 | P4: `conversion` not set at file creation; treatments and feedback (7.H–7.K) sets it |
| PC7 | P9: list search through the contact; multi-value `types`; drop the visit-date decoration (the contact has it) |

---

### 7.B Clinical notes — `patients/patient-clinical-notes/` — final

#### 7.B.1 Decisions

| # | Decision |
| --- | --- |
| P12 | Clinical notes take over the visit's consult notes (sub-domain 6, A10): kinds `complaint` · `finding` · `diagnosis` · `treatment_suggestion` · `future_suggestion` · `safety_check`; `appointment_id` ties a note to the visit; a `diagnosis` note may point at the catalogue (`patient_diagnosis_id` — today the visit's diagnoses were free text). Notes are never edited (a medical record) — a wrong one is deleted with a reason and written again; the unused update DTO goes. Writing needs `patient:update` + the clinical code (P14). |

#### 7.B.2 Open questions

None.

#### 7.B.3 Tables and relations

`app.patient_clinical_notes`: `kind varchar(20)` (the 6 kinds), `text varchar(500)` (1–500), `appointment_id` → appointments `ON DELETE SET NULL`, `patient_diagnosis_id` → patient_diagnoses `ON DELETE SET NULL` with `CHECK (patient_diagnosis_id IS NULL OR kind = 'diagnosis')`, `added_at timestamptz` default `now()`. Indexes `(patient_id, kind, created_at)`, `(appointment_id) WHERE appointment_id IS NOT NULL`. RLS: organization, enabled and forced. Branch: none.

#### 7.B.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `patient:update` | Patients · Edit | change a patient file; with the clinical code: write clinical notes, photos, reports (P14); write, delete and restore check-ins and reviews; log actions; plan: add, change, remove, restore | 9, 11, 12 | same |
| `patient:clinical_record:read` | Patients · Clinical record | clinical notes, photos, reports — read, and needed to write them (P14) | 8, 10 (+ the writes) | Owner, Admin, Doctor, Therapist, Counsellor |

The codes as a whole, with their notes: 7.4.

#### 7.B.5 Common to every route

As 7.5.

#### 7.B.6 Objects returned

**Clinical note**: `id` (`pcn_…`), `patient_id`, `kind`, `text` (1–500), `appointment_id` (or null), `patient_diagnosis_id` (or null), `added_at`, `created_at`, `updated_at`.

#### 7.B.7 Routes (8–12)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 8 | GET | `/patients/{patient_id}/clinical-notes` | The clinical notes | `patient:clinical_record:read` | |
| 9 | POST | `/patients/{patient_id}/clinical-notes` | Add a clinical note | `patient:update` + clinical | req |
| 10 | GET | `/patients/{patient_id}/clinical-notes/{patient_clinical_note_id}` | Get one **(moved)** | `patient:clinical_record:read` | |
| 11 | DELETE | `/patients/{patient_id}/clinical-notes/{patient_clinical_note_id}` | Delete a wrong note **(moved)** | `patient:update` + clinical | |
| 12 | POST | `/patients/{patient_id}/clinical-notes/{patient_clinical_note_id}/restore` | Undo **(moved)** | `patient:update` + clinical | req |

#### 7.B.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 8 | `kind` (several), `appointment_id`, `q` (text), `sort` = `created_at` (default, newest first), `order`, `limit`, `after` | — | Clinical note[] |
| 9 | — | `kind*`, `text*` (1–500); optional: `appointment_id`, `patient_diagnosis_id` (`diagnosis` kind only) | Clinical note |
| 10, 12 | — | — | Clinical note |
| 11 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |

#### 7.B.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 9 | `400` · `patient_diagnosis_id` | on a kind other than `diagnosis`, or not in the catalogue |
| 9, 11, 12 | `403` | without `patient:clinical_record:read` (P14) |
| 12 | `409` · `record_not_deleted` | the note is live |
| 10–12 | `404` | not in the organization, deleted, or under another patient |

#### 7.B.10 Rules worth knowing

None beyond 7.10.

#### 7.B.11 Code changes

| # | Change |
| --- | --- |
| PC9 | P12: kinds `finding` and `safety_check`; `appointment_id`, `patient_diagnosis_id` and the kind check; the visit's consult fields move here (sub-domain 6, AC10); drop the unused update DTO |

---

### 7.C Prescriptions — `patients/patient-prescriptions/` — final

#### 7.C.1 Decisions

| # | Decision |
| --- | --- |
| P15 | An approved prescription is final — `PATCH` **and** `DELETE` are refused (today delete passes); `approved_by_membership_id` records who approved (missing today); approve needs at least one line; a line's `medicine_id` must be a live medicine (sub-domain 11 — today unchecked); the nested list ignores a `?patient_id=` (today it overrides the path). |
| P16 | Lines stay `jsonb` (≤ 30, always read, printed and approved with their prescription) with `CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) <= 30)` — a lines table would cost a join on every read for no query that needs one. |
| P27 | Renamed `app.prescriptions` → `app.patient_prescriptions` (path id `{patient_prescription_id}`, codes `patient_prescription:*`); the pharmacy queue is `GET /patient-prescriptions`. Invoices and medical sales point at it as `patient_prescription_id` (sub-domains 8, 11). |

#### 7.C.2 Open questions

None.

#### 7.C.3 Tables and relations

`app.patient_prescriptions`: `prescription_number integer` (counter, `> 0`, unique per organization), `doctor_membership_id` → memberships `ON DELETE RESTRICT`, `appointment_id` → appointments `ON DELETE SET NULL`, `prescription_date date`, `items jsonb` default `'[]'` (P16), `advice`, `lab_report`, `procedure_today text` (≤ 2000 each), `follow_up_date date`, `print_language varchar(8)` (`english` · `gujarati` · `hindi`), `status varchar(8)` default `'draft'` (`draft` · `approved`), `approved_at timestamptz`, `approved_by_membership_id` → memberships `ON DELETE RESTRICT` (K2) with `CHECK ((status = 'approved') = (approved_at IS NOT NULL AND approved_by_membership_id IS NOT NULL))`. Indexes: unique `(organization_id, prescription_number)`, `(organization_id, status, prescription_date, id) WHERE deleted_at IS NULL` (the pharmacy queue), `(appointment_id)`, `(doctor_membership_id)`. Pointed at by `invoices`, `medical_sales` (`ON DELETE SET NULL`). RLS: organization, enabled and forced. Branch: none.

#### 7.C.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `patient_prescription:read` | Patients · Prescriptions · View | prescriptions | 13, 14, 16 | Owner, Admin, Doctor, Therapist, Counsellor, Pharmacist |
| `patient_prescription:create` | Patients · Prescriptions · Create | write a prescription; own kits; add to the diagnosis catalogue | 15 | Owner, Admin, Doctor |
| `patient_prescription:update` | Patients · Prescriptions · Edit | change or approve a draft; edit the catalogue | 17, 18 | Owner, Admin, Doctor |
| `patient_prescription:delete` | Patients · Prescriptions · Delete | delete or restore a draft; catalogue entries | 19, 20 | Owner, Admin |

The codes as a whole, with their notes: 7.4.

#### 7.C.5 Common to every route

As 7.5.

#### 7.C.6 Objects returned

**Patient prescription**: `id` (`rx_…`), `prescription_number` ("RX-500"), `patient_id`, `appointment_id`, `doctor_membership_id`, `prescription_date`, `items[]`, `advice`, `lab_report`, `procedure_today`, `follow_up_date`, `print_language`, `status` (`draft` · `approved`), `approved_at`, `approved_by_membership_id`, `created_at`, `updated_at`.
A line (`items[]`, up to 30): `medicine_name*` (1–120), `medicine_id` (a live medicine, P15), `dose_morning` / `dose_afternoon` / `dose_night` (0–2), `is_sos`, `meal` (`before` · `after`), `timing` (8 values) / `timing_text`, `body_part` (10 parts) / `body_part_text`, `quantity` (1–999), `remarks` (1–200).

#### 7.C.7 Routes (13–20)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 13 | GET | `/patient-prescriptions` | All prescriptions — the pharmacy queue | `patient_prescription:read` | |
| 14 | GET | `/patients/{patient_id}/prescriptions` | A patient's prescriptions | `patient_prescription:read` | |
| 15 | POST | `/patients/{patient_id}/prescriptions` | Write a prescription | `patient_prescription:create` | req |
| 16 | GET | `/patients/{patient_id}/prescriptions/{patient_prescription_id}` | Get one **(moved)** | `patient_prescription:read` | |
| 17 | PATCH | `/patients/{patient_id}/prescriptions/{patient_prescription_id}` | Change a draft **(moved)** | `patient_prescription:update` | |
| 18 | POST | `/patients/{patient_id}/prescriptions/{patient_prescription_id}/approve` | Approve — final **(moved)** | `patient_prescription:update` | req |
| 19 | DELETE | `/patients/{patient_id}/prescriptions/{patient_prescription_id}` | Delete a draft **(moved)** | `patient_prescription:delete` | |
| 20 | POST | `/patients/{patient_id}/prescriptions/{patient_prescription_id}/restore` | Undo **(moved)** | `patient_prescription:delete` | req |

#### 7.C.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 13, 14 | `q` (prescription number only, e.g. `RX-500`), `status`, `doctor_membership_id`, `appointment_id`, `prescription_date_from` / `prescription_date_to`, 13 also `patient_id`; `sort` = `created_at` (default) \| `prescription_date`, `order`, `limit`, `after` | — | Patient prescription[] |
| 15 | — | `doctor_membership_id*`, `prescription_date*`; optional: `appointment_id`, `items` (up to 30 lines), `advice`, `lab_report`, `procedure_today`, `follow_up_date`, `print_language` | Patient prescription (`draft`) |
| 16, 18, 20 | — | — | Patient prescription |
| 17 | — | any field of #15 (a draft only); `expected_updated_at` | Patient prescription |
| 19 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |

#### 7.C.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 15, 17 | `400` · `items` | a line's `medicine_id` is not a live medicine, or more than 30 lines (P15, P16) |
| 15, 17 | `400` · `doctor_membership_id` / `appointment_id` | not a live record of the organization |
| 17, 19 | `409` · `prescription_approved` | an approved prescription is final (P15) |
| 18 | `400` · `items` | approving with no line |
| 18 | `409` · `transition_not_allowed` | not a draft |
| 17 | `409` · `record_changed` | `expected_updated_at` is older than the record |
| 20 | `409` · `record_not_deleted` | the prescription is live |
| 16–20 | `404` | not in the organization, deleted, or under another patient |

#### 7.C.10 Rules worth knowing

None beyond 7.10.

#### 7.C.11 Code changes

| # | Change |
| --- | --- |
| PC11 | P15, P16: refuse `DELETE` of an approved prescription; `approved_by_membership_id` and its check; resolve `medicine_id`; the path wins over `?patient_id=`; the `items` checks |
| PC15 | P27: rename `app.prescriptions` → `app.patient_prescriptions` (table, schema, indexes, RLS, the counter key, the folder), the path ids, the `/patient-prescriptions` list, the codes; `patient_prescription_id` on invoices and medical sales (sub-domains 8, 11) |

---

### 7.D Prescription kits — `patients/prescription-kits/` — final

#### 7.D.1 Decisions

| # | Decision |
| --- | --- |
| P17 | A kit is a doctor's own reusable lines: the owner becomes an explicit `owner_membership_id` (today the audit column `created_by_user_id`), names unique per owner (today none); every kit route needs `patient_prescription:create`. A kit is applied by the screen copying its lines into a draft — no server-side "apply". |

#### 7.D.2 Open questions

None.

#### 7.D.3 Tables and relations

`app.prescription_kits` (no `patient_id`): `owner_membership_id` → memberships `ON DELETE CASCADE`, `name varchar(80)`, `items jsonb` (the same checks as a prescription's). Indexes: unique `(organization_id, owner_membership_id, lower(name)) WHERE deleted_at IS NULL`; `(owner_membership_id, created_at DESC)`. RLS: organization, enabled and forced. Branch: none.

#### 7.D.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `patient_prescription:create` | Patients · Prescriptions · Create | write a prescription; own kits; add to the diagnosis catalogue | 21–26 | Owner, Admin, Doctor |

The codes as a whole, with their notes: 7.4.

#### 7.D.5 Common to every route

As 7.5.

#### 7.D.6 Objects returned

**Prescription kit**: `id` (`rxk_…`), `owner_membership_id`, `name` (1–80), `items[]` (as a prescription's), `created_at`, `updated_at`.

#### 7.D.7 Routes (21–26)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 21 | GET | `/prescription-kits` | My kits | `patient_prescription:create` | |
| 22 | POST | `/prescription-kits` | Save a kit | `patient_prescription:create` | req |
| 23 | GET | `/prescription-kits/{prescription_kit_id}` | Get a kit | `patient_prescription:create` | |
| 24 | PATCH | `/prescription-kits/{prescription_kit_id}` | Change a kit | `patient_prescription:create` | |
| 25 | DELETE | `/prescription-kits/{prescription_kit_id}` | Delete a kit | `patient_prescription:create` | |
| 26 | POST | `/prescription-kits/{prescription_kit_id}/restore` | Undo | `patient_prescription:create` | req |

#### 7.D.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 21 | `q` (name), `sort` = `created_at` (default) \| `name`, `order`, `limit`, `after` — the caller's own kits | — | Prescription kit[] |
| 22 | — | `name*` (1–80), `items*` (up to 30 lines) | Prescription kit |
| 23, 26 | — | — | Prescription kit |
| 24 | — | any of `name`, `items`; `expected_updated_at` | Prescription kit |
| 25 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |

#### 7.D.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 22, 24 | `409` (message: record already exists) | you already have a kit with that name |
| 22, 24 | `400` · `items` | more than 30 lines, or a `medicine_id` that is not a live medicine |
| 24 | `409` · `record_changed` | `expected_updated_at` is older than the record |
| 26 | `409` · `record_not_deleted` / `record_restore_conflict` | the kit is live, or its name was reused meanwhile |
| 23–26 | `404` | not in the organization, deleted, or another member's kit |

#### 7.D.10 Rules worth knowing

None beyond 7.10.

#### 7.D.11 Code changes

| # | Change |
| --- | --- |
| PC12 | P17: `prescription_kits.owner_membership_id` (from `created_by_user_id`); unique name per owner; gates renamed to `patient_prescription:create` |

---

### 7.E Patient diagnoses — `patients/patient-diagnoses/` — final

#### 7.E.1 Decisions

| # | Decision |
| --- | --- |
| P18 | The organization's diagnosis catalogue: readable by every member (a picker); writes need `patient_prescription:*`; names unique in the organization (any case); a clinical note of kind `diagnosis` may point at an entry (P12). |
| P28 | **Renamed `app.diagnoses` → `app.patient_diagnoses`** (your call): folder `patient-diagnoses/`, routes `/patient-diagnoses`, path id `{patient_diagnosis_id}`, and the clinical notes' `patient_diagnosis_id`. It stays a catalogue — no `patient_id`, and its routes are not under a patient, since no one patient owns an entry; the public-id prefix `dgn_` stays. |

#### 7.E.2 Open questions

None.

#### 7.E.3 Tables and relations

`app.patient_diagnoses` (no `patient_id`): `name varchar(120)`. Indexes: unique `(organization_id, lower(name)) WHERE deleted_at IS NULL`; `(organization_id, name, id) WHERE deleted_at IS NULL`. Pointed at by `patient_clinical_notes.patient_diagnosis_id` (`ON DELETE SET NULL`). RLS: organization, enabled and forced. Branch: none.

#### 7.E.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `patient_prescription:create` | Patients · Prescriptions · Create | write a prescription; own kits; add to the diagnosis catalogue | 28 | Owner, Admin, Doctor |
| `patient_prescription:update` | Patients · Prescriptions · Edit | change or approve a draft; edit the catalogue | 30 | Owner, Admin, Doctor |
| `patient_prescription:delete` | Patients · Prescriptions · Delete | delete or restore a draft; catalogue entries | 31, 32 | Owner, Admin |
| `organization:read` | — (always on) | the diagnosis catalogue | 27, 29 | every role |

The codes as a whole, with their notes: 7.4.

#### 7.E.5 Common to every route

As 7.5.

#### 7.E.6 Objects returned

**Patient diagnosis**: `id` (`dgn_…`), `name` (1–120), `created_at`, `updated_at`.

#### 7.E.7 Routes (27–32)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 27 | GET | `/patient-diagnoses` | The diagnosis catalogue **(renamed)** | any member | |
| 28 | POST | `/patient-diagnoses` | Add a diagnosis **(renamed)** | `patient_prescription:create` | req |
| 29 | GET | `/patient-diagnoses/{patient_diagnosis_id}` | Get one **(renamed)** | any member | |
| 30 | PATCH | `/patient-diagnoses/{patient_diagnosis_id}` | Rename one **(renamed)** | `patient_prescription:update` | |
| 31 | DELETE | `/patient-diagnoses/{patient_diagnosis_id}` | Delete one **(renamed)** | `patient_prescription:delete` | |
| 32 | POST | `/patient-diagnoses/{patient_diagnosis_id}/restore` | Undo **(renamed)** | `patient_prescription:delete` | req |

#### 7.E.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 27 | `q` (name), `sort` = `name` (default) \| `created_at`, `order`, `limit`, `after` | — | Patient diagnosis[] |
| 28 | — | `name*` (1–120) | Patient diagnosis |
| 29, 32 | — | — | Patient diagnosis |
| 30 | — | `name*`; `expected_updated_at` | Patient diagnosis |
| 31 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |

#### 7.E.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 28, 30 | `409` (message: record already exists) | the diagnosis is in the catalogue |
| 30 | `409` · `record_changed` | `expected_updated_at` is older than the record |
| 32 | `409` · `record_not_deleted` / `record_restore_conflict` | the entry is live, or its name was reused meanwhile |
| 29–32 | `404` | not in the organization, or deleted |

#### 7.E.10 Rules worth knowing

None beyond 7.10.

#### 7.E.11 Code changes

| # | Change |
| --- | --- |
| — | Gates renamed to `patient_prescription:*` (PC4); reads open to every member (today `patient:read`) |
| PC20 | P28: rename `app.diagnoses` → `app.patient_diagnoses` (init migration, schema, indexes, constraints, RLS, the FORCE-RLS and purge lists, the folder), the routes and path id (param registry), and `patient_clinical_notes.diagnosis_id` → `patient_diagnosis_id` |

---

### 7.F Images — `patients/patient-images/` — final

#### 7.F.1 Decisions

| # | Decision |
| --- | --- |
| P19 | A photo's `file_key` must be a confirmed upload of the organization (today unchecked). The private album needs `patient:private_album:read` to read **and** to write (unchanged); reading needs the clinical code and writing `patient:update` + the clinical code (P14). |
| P23 | **Three albums** — the Photos tabs General · Private · LHR (`patient-file.md`, enum `image_album`): **`general`** (default) — everyday clinical photos, for every holder of the clinical code; **`private`** — sensitive photos (intimate areas, by consent), only for `patient:private_album:read` holders (Owner, Admin, Doctor): they alone add, read, change, move a photo into or out of it, delete and restore; to anyone else a private photo does not exist — not listed, not counted, `404` by id, its activity entry hidden (M10), never in "Share Rx, invoice & photos"; **`lhr`** — laser hair removal progress, compared session by session (P24). The album is a column with a `CHECK`, not three tables: one tab, one filter. |
| P24 | **A photo can file under its session and stage**: optional `patient_treatment_id` (the patient's — "LHR Full Face · session 3") and `stage` `before` · `after`, so the visit flow's "Before photos taken · Auto-paired with after photos" has something to pair on — a session's before and after of the same body part. Any album may use them; the LHR album is where they matter. Neither is in the design's entity today. Other option: no new columns — pair by visit and time only. |
| P25 | **Upload and fields**: JPG or PNG, up to 15 MB (the design's limit), checked on the confirmed upload; an upload is filed once (`409 image_exists`); `file_name` comes from the upload (design: server-set); `taken_on` defaults to today and can't be in the future; `display_name` is the drawer's Name (≤ 60), `caption` ≤ 200. A visit's photo needs the appointment to be the patient's contact's and checked in or completed (design: "Photos open once the patient is at the clinic"). **One body-part list for the patient file**, photos and treatments (TR8): `face` · `upper_lip` · `chin` · `neck` · `scalp` · `hair` · `chest` · `back` · `underarm` · `arms` · `hands` · `legs` · `body` · `full_body` · `other` — the photo drawer adds `neck` and `hands`, the treatment drawer `upper_lip`, `chin`, `full_body`. The design's delete reasons map to the standard ones: "Wrong patient" → `mistake`, "Blurry / retake" → `not_needed`. |
| P26 | **Tabs, counts and filters**: the list filters by `album` (the tab — none = every album you can see), visit (`appointment_id`, or `has_appointment=false` for "Not attached to a visit"), `patient_treatment_id`, `stage` and `body_part`; `meta.album_counts` gives the live photos per album you can see (the tab counts and "Load more · 4 left"); each photo carries its visit's `service_label` for the date groups ("24 Sep · Hydrafacial"). |

#### 7.F.2 Open questions

None.

#### 7.F.3 Tables and relations

`app.patient_images`

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `patient_id` | `bigint` | no | | → patients `ON DELETE RESTRICT` |
| `appointment_id` | `bigint` | yes | | → appointments `ON DELETE SET NULL` |
| `patient_treatment_id` | `bigint` | yes | | → patient_treatments `ON DELETE SET NULL` (new, P24) |
| `album` | `varchar(7)` | no | `'general'` | `IN ('general', 'private', 'lhr')` |
| `stage` | `varchar(6)` | yes | | `IN ('before', 'after')` (new, P24) |
| `file_key` | `varchar(512)` | no | | a confirmed JPG or PNG upload, ≤ 15 MB |
| `file_name` | `varchar(120)` | no | | from the upload |
| `display_name` | `varchar(60)` | yes | | the drawer's Name |
| `caption` | `varchar(200)` | yes | | |
| `body_part` | `varchar(9)` | yes | | the 15 parts (P25) |
| `taken_on` | `date` | no | | today by default; not in the future (app) |

Indexes: unique `public_id`; `WHERE deleted_at IS NULL`: `(patient_id, album, taken_on DESC, id)` — each tab, newest first, and its count; unique `(organization_id, file_key)` — an upload is filed once; `(appointment_id) WHERE appointment_id IS NOT NULL` — a visit's photos; `(patient_treatment_id) WHERE patient_treatment_id IS NOT NULL` — a session's photos.
RLS: organization policy, enabled and forced. The private album is a permission rule in the application (like branch visibility), not RLS. Branch: none.

#### 7.F.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `patient:update` | Patients · Edit | change a patient file; with the clinical code: write clinical notes, photos, reports (P14); write, delete and restore check-ins and reviews; log actions; plan: add, change, remove, restore | 34, 36–38 | same |
| `patient:clinical_record:read` | Patients · Clinical record | clinical notes, photos, reports — read, and needed to write them (P14) | 33, 35 (+ the writes) | Owner, Admin, Doctor, Therapist, Counsellor |
| `patient:private_album:read` | Patients · Private album | private photos — read and write (P19) | 33–38 for `album = private` | Owner, Admin, Doctor |

The codes as a whole, with their notes: 7.4.

#### 7.F.5 Common to every route

As 7.5.

#### 7.F.6 Objects returned

**Patient image**: `id` (`pimg_…`), `patient_id`, `appointment_id`, `patient_treatment_id`, `album` (`general` · `private` · `lhr`), `stage` (`before` · `after`, or null), `file_key`, `file_name`, `display_name`, `caption`, `body_part`, `taken_on`, `service_label` (its visit's, or null), `created_at`, `updated_at`.

#### 7.F.7 Routes (33–38)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 33 | GET | `/patients/{patient_id}/images` | The photos — one album tab, or all you can see | `patient:clinical_record:read` | |
| 34 | POST | `/patients/{patient_id}/images` | Add a photo to an album | `patient:update` + clinical | req |
| 35 | GET | `/patients/{patient_id}/images/{patient_image_id}` | Get one **(moved)** | `patient:clinical_record:read` | |
| 36 | PATCH | `/patients/{patient_id}/images/{patient_image_id}` | Change its details or move it to another album **(moved)** | `patient:update` + clinical | |
| 37 | DELETE | `/patients/{patient_id}/images/{patient_image_id}` | Delete one **(moved)** | `patient:update` + clinical | |
| 38 | POST | `/patients/{patient_id}/images/{patient_image_id}/restore` | Undo **(moved)** | `patient:update` + clinical | req |

A private photo also needs `patient:private_album:read` on every route (P23).

#### 7.F.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 33 | `album` (`general` · `private` · `lhr`; none = every album you can see), `appointment_id`, `has_appointment`, `patient_treatment_id`, `stage`, `body_part`, `q` (name or file name), `sort` = `taken_on` (default, newest first) \| `created_at`, `order`, `limit` (the screen asks for 12), `after` | — | Patient image[], `meta.album_counts` (`{ general, lhr, private }` — `private` only with the album code) |
| 34 | — | `file_key*` (a confirmed upload); optional: `album` (default `general`), `stage`, `appointment_id`, `patient_treatment_id`, `body_part`, `taken_on` (default today), `display_name`, `caption` | Patient image |
| 35, 38 | — | — | Patient image |
| 36 | — | any of #34's fields but `file_key`; `expected_updated_at` | Patient image |
| 37 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |

#### 7.F.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 34 | `400` · `file_key` | not a confirmed upload of the organization, not JPG or PNG, or over 15 MB (P19, P25) |
| 34 | `409` · `image_exists` | that upload is already filed (P25) |
| 34, 36 | `400` · `appointment_id` | another contact's, or not checked in or completed |
| 34, 36 | `400` · `patient_treatment_id` | another patient's |
| 34, 36 | `400` · `taken_on` | in the future |
| 34, 36 | `403` · `field_permission_required` | `album = private` without `patient:private_album:read` |
| 33–38 | `403` | without `patient:clinical_record:read` (P14) |
| 36 | `409` · `record_changed` | `expected_updated_at` is older than the record |
| 38 | `409` · `record_not_deleted` | the photo is live |
| 35–38 | `404` | not in the organization, deleted, under another patient, or a private photo without the album code |

#### 7.F.10 Rules worth knowing

None beyond 7.10.

#### 7.F.11 Code changes

| # | Change |
| --- | --- |
| PC13 | P19: check `file_key` against the organization's confirmed uploads |
| PC16 | P23: keep private photos out of `meta.album_counts`, the activity stream (M10) and WhatsApp sharing (4) for callers without the album code — the read scope already hides them from lists and reads |
| PC17 | P24: `patient_treatment_id` and `stage` (init migration, schema, DTO, serializer, the same-patient check, the index) |
| PC18 | P25: the JPG / PNG and 15 MB check on the upload; unique `(organization_id, file_key)`; `file_name` server-set from the upload (today sent by the client); `taken_on` default and not in the future; the appointment status check; the 15-part body list (constants, `CHECK`, `varchar(9)`) shared with treatments (TR8) |
| PC19 | P26: filters `has_appointment`, `patient_treatment_id`, `stage`; `meta.album_counts`; `service_label` in the serializer |

---

### 7.G Reports — `patients/patient-reports/` — final

#### 7.G.1 Decisions

| # | Decision |
| --- | --- |
| P29 | A report's `file_keys` (up to 10) must be confirmed uploads of the organization (today unchecked). Reports are clinical: read with `patient:clinical_record:read` and written with `patient:update` + the clinical code (P14 — today any `patient:read` holder reads lab results). |

#### 7.G.2 Open questions

None.

#### 7.G.3 Tables and relations

`app.patient_reports`: `type varchar(7)` default `'lab'` (`lab` · `scan` · `consent` · `other`), `name varchar(120)`, `report_date date`, `file_keys text[]` (`cardinality ≤ 10`, confirmed uploads), `notes text` (≤ 1000). Index `(patient_id, report_date DESC)`. RLS: organization, enabled and forced. Branch: none.

#### 7.G.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `patient:update` | Patients · Edit | change a patient file; with the clinical code: write clinical notes, photos, reports (P14); write, delete and restore check-ins and reviews; log actions; plan: add, change, remove, restore | 40, 42–44 | same |
| `patient:clinical_record:read` | Patients · Clinical record | clinical notes, photos, reports — read, and needed to write them (P14) | 39, 41 (+ the writes) | Owner, Admin, Doctor, Therapist, Counsellor |

The codes as a whole, with their notes: 7.4.

#### 7.G.5 Common to every route

As 7.5.

#### 7.G.6 Objects returned

**Patient report**: `id` (`prep_…`), `patient_id`, `type`, `name`, `report_date`, `file_keys[]` (up to 10), `notes`, `created_at`, `updated_at`.

#### 7.G.7 Routes (39–44)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 39 | GET | `/patients/{patient_id}/reports` | The reports | `patient:clinical_record:read` | |
| 40 | POST | `/patients/{patient_id}/reports` | Add a report | `patient:update` + clinical | req |
| 41 | GET | `/patients/{patient_id}/reports/{patient_report_id}` | Get one **(moved)** | `patient:clinical_record:read` | |
| 42 | PATCH | `/patients/{patient_id}/reports/{patient_report_id}` | Change one **(moved)** | `patient:update` + clinical | |
| 43 | DELETE | `/patients/{patient_id}/reports/{patient_report_id}` | Delete one **(moved)** | `patient:update` + clinical | |
| 44 | POST | `/patients/{patient_id}/reports/{patient_report_id}/restore` | Undo **(moved)** | `patient:update` + clinical | req |

#### 7.G.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 39 | `type`, `q` (name), `sort` = `report_date` (default, newest first) \| `created_at`, `order`, `limit`, `after` | — | Patient report[] |
| 40 | — | `name*`, `report_date*`; optional: `type`, `file_keys` (up to 10 confirmed uploads), `notes` (up to 1000) | Patient report |
| 41, 44 | — | — | Patient report |
| 42 | — | any of #40's fields; `expected_updated_at` | Patient report |
| 43 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |

#### 7.G.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 40, 42 | `400` · `file_keys` | not confirmed uploads of the organization, or more than 10 (P29) |
| 40, 42–44 | `403` | without `patient:clinical_record:read` (P14) |
| 42 | `409` · `record_changed` | `expected_updated_at` is older than the record |
| 44 | `409` · `record_not_deleted` | the report is live |
| 41–44 | `404` | not in the organization, deleted, or under another patient |

#### 7.G.10 Rules worth knowing

None beyond 7.10.

#### 7.G.11 Code changes

| # | Change |
| --- | --- |
| PC21 | P29: check `file_keys` against the organization's confirmed uploads; reads gated by the clinical code (PC10) |

---
### 7.H Treatments — `patients/patient-treatments/` — final

#### 7.H.1 Decisions

| # | Decision |
| --- | --- |
| TR6 | **Reversed, never deleted** (`today.md`: "Cancelled or wrong sessions are reversed with a reason, never deleted"): `POST …/reverse` with a reason, final (no un-reverse); a reversed treatment can't be changed (`409 treatment_reversed`). Reversing gives its session back and clears `patient_offering_id` in the same transaction, so a wrong bill can then be fixed (sub-domain 8, B12). The soft-delete columns go — no route ever set them, and the patient file's "Delete" becomes "Reverse". |
| TR7 | **Paid before the visit**: `patient_offering_id` is sent on create only (TR13 covers billing after). The patient offering must be the patient's, live, not past `valid_until` (organization time zone) and have a session left; its offering becomes the treatment's `offering_id` (a different one sent → `400`); one guarded `UPDATE … SET sessions_used = sessions_used + 1 WHERE sessions_used < sessions_total` spends it (`409 offering_used_up`), and `session_number` becomes its new count — server-set, so it can't be sent or changed for a linked session. Changing or removing the link later is refused — reverse and record again. Today the package can't be changed but its session number can, and reversing a session whose package was deleted silently gives nothing back (a patient offering now goes only with its invoice, patient offerings and plan (7.L–7.M)). |
| TR8 | Fields: `name` stays required (1–120; the drawer's quick chips fill it); `body_parts` uses the patient file's one body-part list (7.F, P25 — 15 parts, adding the skin areas the design lists), up to 12 — teeth, physio regions and other template detail go in `parameters`; `session_number` 1–999 (packages may hold up to 999 sessions, patient offerings and plan (7.L–7.M)); `performed_at` not in the future; a linked appointment must be checked in or completed, and an offering active (O13). The aftercare values keep `in_two_days` (the design's `in_2_days` breaks the no-digits rule). |
| TR13 | **Billed after the visit** (7.L–7.M, PK11): a done treatment with an offering and no `patient_offering_id` is not billed until an invoice line names it in `patient_treatment_ids` (sub-domain 8, B28) — the save sets the link, spends the session and sets `session_number` to the patient offering's count, under the same guarded `UPDATE`. `is_billed` is derived: `true` with a link, `false` for a done treatment with an offering and none, null when it has no offering or is reversed; lists 1 and 2 filter on it (the visit's "items ready", and work done but not billed). |

#### 7.H.2 Open questions

None.

#### 7.H.3 Tables and relations

`app.patient_treatments` (no soft-delete columns — TR6)

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `patient_id` | `bigint` | no | | → patients `ON DELETE RESTRICT` |
| `appointment_id` | `bigint` | yes | | → appointments `ON DELETE SET NULL` |
| `offering_id` | `bigint` | yes | | → offerings `ON DELETE SET NULL` |
| `name` | `varchar(120)` | no | | 1–120 |
| `template` | `varchar(7)` | no | `'skin'` | `skin` · `dental` · `physio` · `gynac` · `general` |
| `performed_at` | `timestamptz` | no | `now()` | |
| `doctor_membership_id`, `therapist_membership_id` | `bigint` | yes | | → memberships `ON DELETE RESTRICT` (K2) |
| `body_parts` | `text[]` | no | `'{}'` | `<@` the 15 parts (P25), `cardinality ≤ 12` |
| `session_number` | `smallint` | no | `1` | 1–999 |
| `parameters` | `jsonb` | no | `'{}'` | `jsonb_typeof = 'object'`; values are strings up to 80 (checked in the app) |
| `remark` | `varchar(2000)` | yes | | |
| `aftercare_call` | `varchar(11)` | no | `'next_day'` | `none` · `next_day` · `in_two_days` · `in_week` |
| `patient_offering_id` | `bigint` | yes | | → patient_offerings `ON DELETE RESTRICT` — a spent session keeps what paid for it; set on create (TR7) or by its invoice (TR13), cleared on reverse: `status = 'done' OR patient_offering_id IS NULL` |
| `status` | `varchar(8)` | no | `'done'` | `done` · `reversed` |
| `reversed_reason` | `varchar(280)` | yes | | `(status = 'reversed') = (reversed_reason IS NOT NULL)` |
| `reversed_at` | `timestamptz` | yes | | `(status = 'reversed') = (reversed_at IS NOT NULL)` |

Indexes: unique `public_id`; `(patient_id, performed_at DESC, id)` — the tab; `(organization_id, performed_at DESC, id)` — the organization list; `WHERE … IS NOT NULL`: `(patient_offering_id)`, `(appointment_id)`, `(offering_id)`, `(doctor_membership_id, performed_at)`, `(therapist_membership_id, performed_at)`; `(organization_id, performed_at DESC, id) WHERE status = 'done' AND offering_id IS NOT NULL AND patient_offering_id IS NULL` — not billed (TR13).
RLS: organization policy, enabled and forced. Branch: none (TR3).

#### 7.H.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `patient_treatment:read` | Patients · Treatments · View | treatments | 45, 46, 48 | Owner, Admin, Doctor, Therapist, Front desk, Counsellor |
| `patient_treatment:create` | Patients · Treatments · Create | record a session — may spend a bought session | 47 | Owner, Admin, Doctor, Therapist |
| `patient_treatment:update` | Patients · Treatments · Edit | change or reverse a session — reversing gives the session back | 49, 50 | Owner, Admin, Doctor, Therapist |

The codes as a whole, with their notes: 7.4.

#### 7.H.5 Common to every route

As 7.5.

#### 7.H.6 Objects returned

**Treatment**: `id` (`trt_…`), `patient_id`, `appointment_id`, `offering_id`, `name`, `template`, `performed_at`, `doctor_membership_id`, `therapist_membership_id`, `body_parts`, `session_number`, `parameters`, `remark`, `aftercare_call`, `patient_offering_id`, `is_billed` (TR13), `status`, `reversed_reason`, `reversed_at`, `latest_check_in` (`{ id, feel, score, check_in_date }` or null — the tab's Feedback column), `created_at`, `updated_at`.

#### 7.H.7 Routes (45–50)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 45 | GET | `/patient-treatments` | Every patient's treatments — a doctor's or therapist's sessions **(renamed)** | `patient_treatment:read` | |
| 46 | GET | `/patients/{patient_id}/treatments` | The patient's treatments | `patient_treatment:read` | |
| 47 | POST | `/patients/{patient_id}/treatments` | Record a session (may spend a bought session) | `patient_treatment:create` | req |
| 48 | GET | `/patients/{patient_id}/treatments/{patient_treatment_id}` | Get one **(moved)** | `patient_treatment:read` | |
| 49 | PATCH | `/patients/{patient_id}/treatments/{patient_treatment_id}` | Change a session **(moved)** | `patient_treatment:update` | |
| 50 | POST | `/patients/{patient_id}/treatments/{patient_treatment_id}/reverse` | Reverse it with a reason **(moved)** | `patient_treatment:update` | req |

#### 7.H.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 45 | `patient_id`, `doctor_membership_id`, `therapist_membership_id`, `appointment_id`, `offering_id`, `patient_offering_id`, `is_billed`, `status`, `performed_from` / `performed_to` (whole days, inclusive), `q` (name), `sort` = `performed_at` (default, newest first) \| `created_at`, `order`, `limit`, `after` | — | Treatment[] |
| 46 | as 45, without `patient_id` | — | Treatment[] |
| 47 | — | `name*`; optional: `appointment_id`, `offering_id`, `template`, `performed_at`, `doctor_membership_id`, `therapist_membership_id`, `body_parts`, `session_number` (not with `patient_offering_id`), `parameters`, `remark`, `aftercare_call`, `patient_offering_id` | Treatment |
| 48 | — | — | Treatment |
| 49 | — | any field of 47 except `patient_offering_id` (and `session_number` or `offering_id` once linked); `expected_updated_at` | Treatment |
| 50 | — | `reason*` (1–280) | Treatment |

#### 7.H.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 47 | `400` · `patient_offering_id` | another patient's, deleted, or another offering than the one sent |
| 47 | `409` · `offering_expired` | past its `valid_until` |
| 47 | `409` · `offering_used_up` | no session left |
| 47, 49 | `400` · `appointment_id` | another contact's, or not checked in or completed |
| 47, 49 | `400` · `offering_id` | inactive (O13), or changed on a linked session |
| 47, 49 | `400` · `session_number` | sent for a linked session |
| 49 | `409` · `treatment_reversed` | it was reversed |
| 50 | `409` · `transition_not_allowed` | already reversed |
| 48–50 | `404` | not in the organization, or under another patient |

#### 7.H.10 Rules worth knowing

None beyond 7.10.

#### 7.H.11 Code changes

| # | Change |
| --- | --- |
| TRC6 | TR6: drop the soft-delete columns and index; the `reversed_at` check; reversal gives the session back through the `RESTRICT` link (no silent miss) and clears it |
| TRC7 | TR7, TR8: refuse `session_number` for linked sessions on create and `PATCH`; the shared 15-part body list (PC18) and the 12 cap; `session_number` 1–999 (`smallint`); `performed_at` not in the future; appointment status and offering checks; `latest_check_in` in the serializer |
| TRC12 | TR7, TR13: `patient_package_id` → `patient_offering_id` (column, index, DTO, serializer, filter) with the done-only check; the offering match; `is_billed` (serializer, filter) and the not-billed index; errors `offering_expired`, `offering_used_up` (were `package_*`) |

---

### 7.I Check-ins — `patients/patient-check-ins/` — final

#### 7.I.1 Decisions

| # | Decision |
| --- | --- |
| TR9 | Fields: `feel*` and `score*` (1–10) as today; `check_in_date` defaults to today (organization time zone); `context` becomes optional — the server fills "After <treatment>" or "Visit · <date>" (the design has no field for it, `schema-routes.md` makes it required); `followed`, `followed_note` (≤ 280), `current_state` and `next_plan` (≤ 500). **Needs action** = feel `worse` or score ≤ 4 (design; today `worse` only) with no feedback action logged. `score_change` against the patient's previous check-in drives the ▲▼ trend. |
| TR10 | **Next offerings live in the plan**: `next_offering_ids` (up to 10, active offerings) creates planned offering suggestions linked by `patient_check_in_id` (7.L–7.M), and is read back from them — `app.check_in_next_offerings` goes. It is accepted on create only; later changes happen in the plan. An offering already planned for the patient is skipped, not duplicated. `next_plan` is no longer copied into the suggestion's `reason` — today a plan over 200 characters makes the check-in a `500`. |

#### 7.I.2 Open questions

None.

#### 7.I.3 Tables and relations

`app.patient_check_ins`

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `patient_id` | `bigint` | no | | → patients `ON DELETE RESTRICT` |
| `appointment_id` | `bigint` | yes | | → appointments `ON DELETE SET NULL` |
| `patient_treatment_id` | `bigint` | yes | | → patient_treatments `ON DELETE SET NULL` |
| `context` | `varchar(80)` | no | | 1–80; server-filled when not sent |
| `feel` | `varchar(11)` | no | | `much_better` · `better` · `same` · `worse` |
| `score` | `smallint` | no | | 1–10 |
| `followed` | `varchar(10)` | yes | | `fully` · `mostly` · `partly` · `not_at_all` |
| `followed_note` | `varchar(280)` | yes | | |
| `current_state`, `next_plan` | `varchar(500)` | yes | | |
| `check_in_date` | `date` | no | | not in the future |

Indexes: unique `public_id`; `WHERE deleted_at IS NULL`: `(patient_id, check_in_date DESC, id)` — the card and the previous score, `(patient_treatment_id, check_in_date DESC) WHERE patient_treatment_id IS NOT NULL` — a treatment's latest check-in, `(organization_id, created_at) WHERE feel = 'worse' OR score <= 4` — sub-domain 10's call-back rule; `(appointment_id) WHERE appointment_id IS NOT NULL`.
RLS: organization policy, enabled and forced. Branch: none.

#### 7.I.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `patient:read` | Patients · View | patient files; check-ins, reviews and their actions; what was bought, and the plan | 51, 53 | Owner, Admin, Doctor, Therapist, Front desk, Counsellor, Pharmacist, Accountant, Marketing |
| `patient:update` | Patients · Edit | change a patient file; with the clinical code: write clinical notes, photos, reports (P14); write, delete and restore check-ins and reviews; log actions; plan: add, change, remove, restore | 52, 54–56 | same |

The codes as a whole, with their notes: 7.4.

#### 7.I.5 Common to every route

As 7.5.

#### 7.I.6 Objects returned

**Check-in**: `id` (`chk_…`), `patient_id`, `appointment_id`, `patient_treatment_id`, `context`, `feel`, `score`, `score_change` (vs the previous check-in, or null), `followed`, `followed_note`, `current_state`, `next_plan`, `next_offering_ids` (from its suggestions), `check_in_date`, `needs_action`, `actions` (Feedback action[], newest first — 7.K), `created_at`, `updated_at`.

#### 7.I.7 Routes (51–56)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 51 | GET | `/patients/{patient_id}/check-ins` | The patient's check-ins | `patient:read` | |
| 52 | POST | `/patients/{patient_id}/check-ins` | Log a check-in | `patient:update` | req |
| 53 | GET | `/patients/{patient_id}/check-ins/{patient_check_in_id}` | Get one **(moved)** | `patient:read` | |
| 54 | PATCH | `/patients/{patient_id}/check-ins/{patient_check_in_id}` | Change it **(moved)** | `patient:update` | |
| 55 | DELETE | `/patients/{patient_id}/check-ins/{patient_check_in_id}` | Remove it **(moved)** | `patient:update` | |
| 56 | POST | `/patients/{patient_id}/check-ins/{patient_check_in_id}/restore` | Undo **(moved)** | `patient:update` | req |

#### 7.I.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 51 | `feel` (several), `needs_action`, `patient_treatment_id`, `appointment_id`, `check_in_date_from` / `check_in_date_to` (inclusive), `sort` = `check_in_date` (default, newest first) \| `created_at`, `order`, `limit`, `after` | — | Check-in[] |
| 52 | — | `feel*`, `score*`; optional: `check_in_date`, `context`, `appointment_id`, `patient_treatment_id`, `followed`, `followed_note`, `current_state`, `next_plan`, `next_offering_ids` | Check-in |
| 53, 56 | — | — | Check-in |
| 54 | — | any field of 52 except `next_offering_ids`; `expected_updated_at` | Check-in |
| 55 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |

#### 7.I.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 52, 54 | `400` · `appointment_id` / `patient_treatment_id` | another patient's |
| 52 | `400` · `next_offering_ids` | an inactive offering, or more than 10 |
| 52, 54 | `400` · `check_in_date` | in the future |
| 56 | `409` · `record_not_deleted` | it is live |
| 53–56 | `404` | not in the organization, deleted (9–11), or under another patient |

#### 7.I.10 Rules worth knowing

None beyond 7.10.

#### 7.I.11 Code changes

| # | Change |
| --- | --- |
| TRC8 | TR9: `context` optional and server-filled; `check_in_date` default; `needs_action` and `score_change` in the serializer; `q` dropped from the list (it matched nothing) |
| TRC9 | TR10: drop `app.check_in_next_offerings`; create the suggestions with `patient_check_in_id` and without `reason`; skip offerings already planned; `next_offering_ids` create-only and read back from the suggestions |

---

### 7.J Reviews — `patients/patient-reviews/` — final

#### 7.J.1 Decisions

| # | Decision |
| --- | --- |
| TR11 | Fields as today — `source*` (`google` · `video` · `instagram` · `internal_form` · `whatsapp`), `review_date` (default today), `rating` 1–5 or none, `text` (≤ 2,000), `link`, `file_keys` (≤ 10), `appointment_id` — plus checks: `link` must be `https://` (today any text), `file_keys` must be the organization's confirmed uploads (as P19), the appointment the patient's contact's. **Needs action** = rating ≤ 3 with no feedback action (design). No organization-wide reviews list — the design has none; it comes with a reviews screen. |

#### 7.J.2 Open questions

None.

#### 7.J.3 Tables and relations

`app.patient_reviews`

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `patient_id` | `bigint` | no | | → patients `ON DELETE RESTRICT` |
| `appointment_id` | `bigint` | yes | | → appointments `ON DELETE SET NULL` |
| `source` | `varchar(13)` | no | | the 5 sources |
| `rating` | `smallint` | yes | | 1–5 |
| `text` | `varchar(2000)` | yes | | |
| `link` | `varchar(500)` | yes | | `~ '^https://'` |
| `file_keys` | `text[]` | no | `'{}'` | `cardinality ≤ 10` |
| `review_date` | `date` | no | | not in the future |

Indexes: unique `public_id`; `WHERE deleted_at IS NULL`: `(patient_id, review_date DESC, id)`, `(organization_id, created_at) WHERE rating <= 3` — sub-domain 10's call-back rule; `(appointment_id) WHERE appointment_id IS NOT NULL`.
RLS: organization policy, enabled and forced. Branch: none.

#### 7.J.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `patient:read` | Patients · View | patient files; check-ins, reviews and their actions; what was bought, and the plan | 57, 59 | Owner, Admin, Doctor, Therapist, Front desk, Counsellor, Pharmacist, Accountant, Marketing |
| `patient:update` | Patients · Edit | change a patient file; with the clinical code: write clinical notes, photos, reports (P14); write, delete and restore check-ins and reviews; log actions; plan: add, change, remove, restore | 58, 60–62 | same |

The codes as a whole, with their notes: 7.4.

#### 7.J.5 Common to every route

As 7.5.

#### 7.J.6 Objects returned

**Review**: `id` (`rev_…`), `patient_id`, `appointment_id`, `source`, `rating`, `text`, `link`, `file_keys`, `review_date`, `needs_action`, `actions` (Feedback action[], newest first — 7.K), `created_at`, `updated_at`.

#### 7.J.7 Routes (57–62)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 57 | GET | `/patients/{patient_id}/reviews` | The patient's reviews | `patient:read` | |
| 58 | POST | `/patients/{patient_id}/reviews` | Log a review | `patient:update` | req |
| 59 | GET | `/patients/{patient_id}/reviews/{patient_review_id}` | Get one **(moved)** | `patient:read` | |
| 60 | PATCH | `/patients/{patient_id}/reviews/{patient_review_id}` | Change it **(moved)** | `patient:update` | |
| 61 | DELETE | `/patients/{patient_id}/reviews/{patient_review_id}` | Remove it **(moved)** | `patient:update` | |
| 62 | POST | `/patients/{patient_id}/reviews/{patient_review_id}/restore` | Undo **(moved)** | `patient:update` | req |

#### 7.J.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 57 | `source` (several), `needs_action`, `review_date_from` / `review_date_to` (inclusive), `sort` = `review_date` (default, newest first) \| `created_at`, `order`, `limit`, `after` | — | Review[] |
| 58 | — | `source*`; optional: `review_date`, `rating`, `text`, `link`, `file_keys`, `appointment_id` | Review |
| 59, 62 | — | — | Review |
| 60 | — | any field of 58; `expected_updated_at` | Review |
| 61 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |

#### 7.J.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 58, 60 | `400` · `link` | not `https://` |
| 58, 60 | `400` · `file_keys` | not a confirmed upload of the organization |
| 58, 60 | `400` · `appointment_id` | another contact's |
| 62 | `409` · `record_not_deleted` | it is live |
| 59–62 | `404` | not in the organization, deleted (15–17), or under another patient |

#### 7.J.10 Rules worth knowing

None beyond 7.10.

#### 7.J.11 Code changes

| # | Change |
| --- | --- |
| TRC10 | TR11: `https://` check on `link` (DTO + `CHECK`); upload check on `file_keys`; `review_date` not in the future; `needs_action` in the serializer; `rating` as `smallint` |

---

### 7.K Feedback actions — `patients/patient-feedback-actions/` — final

#### 7.K.1 Decisions

| # | Decision |
| --- | --- |
| TR12 | **An action belongs to one check-in or one review**: it is logged under it — `POST …/check-ins/{patient_check_in_id}/actions` or `POST …/reviews/{patient_review_id}/actions` — and returned inside it (`actions`). The six flat `/feedback-actions` routes go (6 → 2). **Append-only**, like the activity stream (4): no change, delete or restore (the design has none — a wrong one is followed by a right one); actions go only with their parent. The first action turns `needs_action` off. Actions as today: `doctor_called` · `asked_revisit` · `free_review_booked` · `plan_changed` · `replied_google` · `replied_instagram` · `replied_whatsapp` · `refund_credit` · `other` (`note` required). Other option: soft delete + restore per the general rule — 4 more routes. |

#### 7.K.2 Open questions

None.

#### 7.K.3 Tables and relations

`app.patient_feedback_actions` (append-only — no `updated_*` or soft-delete columns)

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `patient_check_in_id` | `bigint` | yes | | → patient_check_ins `ON DELETE CASCADE` |
| `patient_review_id` | `bigint` | yes | | → patient_reviews `ON DELETE CASCADE`; `num_nonnulls(patient_check_in_id, patient_review_id) = 1` |
| `action` | `varchar(18)` | no | | the 9 actions |
| `note` | `varchar(280)` | yes | | required when `action = 'other'` |
| `author_membership_id` | `bigint` | yes | | → memberships `ON DELETE RESTRICT` (K2); the caller (the design's "by") |

Indexes: unique `public_id`; `(patient_check_in_id, created_at) WHERE patient_check_in_id IS NOT NULL`; `(patient_review_id, created_at) WHERE patient_review_id IS NOT NULL`.
RLS: organization policy, enabled and forced. Branch: none.

#### 7.K.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `patient:update` | Patients · Edit | change a patient file; with the clinical code: write clinical notes, photos, reports (P14); write, delete and restore check-ins and reviews; log actions; plan: add, change, remove, restore | 63, 64 | same |

The codes as a whole, with their notes: 7.4.

#### 7.K.5 Common to every route

As 7.5.

#### 7.K.6 Objects returned

**Feedback action**: `id` (`fba_…`), `action`, `note`, `author_membership_id`, `created_at` — inside its check-in or review.

#### 7.K.7 Routes (63–64)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 63 | POST | `/patients/{patient_id}/check-ins/{patient_check_in_id}/actions` | Log what was done about a check-in **(moved)** | `patient:update` | req |
| 64 | POST | `/patients/{patient_id}/reviews/{patient_review_id}/actions` | Log what was done about a review **(moved)** | `patient:update` | req |

#### 7.K.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 63 | — | `action*`; `note` (1–280, required for `other`) | Check-in (with the new action) |
| 64 | — | as 63 | Review (with the new action) |

#### 7.K.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 63, 64 | `400` · `note` | missing for `other` |
| 63, 64 | `404` | the check-in or review is not the patient's, or deleted |

#### 7.K.10 Rules worth knowing

None beyond 7.10.

#### 7.K.11 Code changes

| # | Change |
| --- | --- |
| TRC11 | TR12: drop the six `/feedback-actions` routes, the update DTO and the soft-delete columns; the two nested routes; `author_membership_id`; `actions` inside the check-in and review serializers |

---
### 7.L Patient offerings — `patients/patient-offerings/` — final

#### 7.L.1 Decisions

| # | Decision |
| --- | --- |
| PK4 | **A patient offering is bought only by invoicing it** (`schema-routes.md`: "written by invoicing a package offering" — widened to every session-based offering). Saving an invoice line whose offering is a `treatment`, `package` or `lhr` creates one in the same transaction (sub-domain 8) — not a `consultation` (the visit itself) or a `product`, and never a medicine: `sessions_total` = the offering's sessions × the line's quantity (+ the extra sessions of an `extra` offer on the line); `valid_until` = the invoice date + `validity_days`, or none when that is 0 (the design: "0 = no expiry"). A package is one with more than one session (`is_package`) — a 7-session LHR pack is category `lhr`. `POST /patients/{patient_id}/packages` goes: the patient file's "Add package" opens the invoice drawer instead, so no session can be spent without a bill (the design's "Package added · invoice it from Invoices" would allow that). Other option: keep a manual create with `payment:create`, e.g. for packages sold before Clinozy. |
| PK5 | **Sessions move only with treatments** — spent when a treatment is linked to it, before or after the bill (7.H–7.K, TR7; PK11), given back by reversing one; no bare "use a session" counter, so every spent session has a treatment behind it (the card's button opens the treatment drawer). `status` is derived: `active` (a session left, not expired) · `used_up` · `expired` — the appointment form's "active package". |
| PK6 | **Changing one**: `valid_until` (extend, or none) and `sessions_total` (never below `sessions_used` → `400`; today a database `500`), with `payment:update` (PK2). A refund of unused sessions is a credit note on its invoice (sub-domain 8) plus lowering `sessions_total` to `sessions_used`. A patient offering goes and comes back with its invoice — no delete or restore of its own (today `payment:delete`); an invoice whose patient offering has a spent session can't be deleted (sub-domain 8). |
| PK11 | **Paid before or after the visit — one link either way**: a treatment points at the patient offering that pays for it (`patient_treatments.patient_offering_id`, 7.H–7.K). **Before** — the session is recorded with it (a package, or a single session paid ahead; 7.H–7.K, TR7). **After** — the visit flow's "Create invoice from visit": the invoice line carries `patient_treatment_ids` (the patient's done, unbilled treatments of that offering, up to its sessions) and the save links them and spends their sessions in the same transaction (sub-domain 8, B28; 7.H–7.K, TR13). A treatment with an offering and no link is **not billed**: `is_billed` on the treatment and its `is_billed=false` filter give the Invoice step's "items ready" and a list of work done but not billed. A free session is a line at 100% discount, so it still counts as billed. Other option: packages only — a single session billed after the visit stays unlinked, and nothing shows what was done but not billed. |

#### 7.L.2 Open questions

None.

#### 7.L.3 Tables and relations

`app.patient_offerings` (the soft-delete columns are written only with its invoice)

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `patient_id` | `bigint` | no | | → patients `ON DELETE RESTRICT` |
| `offering_id` | `bigint` | no | | → offerings `ON DELETE RESTRICT` |
| `invoice_item_id` | `bigint` | no | | → invoice_items `ON DELETE CASCADE` — it goes with its line, and one with a spent session is held by its treatments' `RESTRICT` (7.H–7.K); unique — one per invoice line (replaces `invoice_id`) |
| `sessions_total` | `smallint` | no | | 1–999 |
| `sessions_used` | `smallint` | no | `0` | `0 ≤ sessions_used ≤ sessions_total` |
| `valid_until` | `date` | yes | | none = no expiry |

Indexes: unique `public_id`; unique `(invoice_item_id)`; `WHERE deleted_at IS NULL`: `(patient_id, created_at DESC, id)`; `(patient_id, offering_id) WHERE sessions_used < sessions_total` — what a treatment can spend; `(offering_id)`. The redundant `sessions_used BETWEEN 0 AND 99` check goes.
RLS: organization policy, enabled and forced. Branch: none.

#### 7.L.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `patient:read` | Patients · View | patient files; check-ins, reviews and their actions; what was bought, and the plan | 65, 66 | Owner, Admin, Doctor, Therapist, Front desk, Counsellor, Pharmacist, Accountant, Marketing |
| `payment:update` | Payments · Edit | change a patient offering's sessions or validity | 67 | sub-domain 8 (Owner, Admin, Front desk, Accountant) |

The codes as a whole, with their notes: 7.4.

#### 7.L.5 Common to every route

As 7.5.

#### 7.L.6 Objects returned

**Patient offering**: `id` (`poff_…`), `patient_id`, `offering_id`, `offering_name`, `invoice_id`, `invoice_item_id`, `sessions_total`, `sessions_used`, `sessions_left`, `is_package` (more than one session), `valid_until` (or null), `status` (`active` · `used_up` · `expired`), `created_at`, `updated_at`.

#### 7.L.7 Routes (65–67)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 65 | GET | `/patients/{patient_id}/offerings` | What the patient bought — the Packages tab with `is_package=true` **(renamed)** | `patient:read` | |
| 66 | GET | `/patients/{patient_id}/offerings/{patient_offering_id}` | Get one **(moved)** | `patient:read` | |
| 67 | PATCH | `/patients/{patient_id}/offerings/{patient_offering_id}` | Change its sessions or validity **(moved)** | `payment:update` | |

#### 7.L.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 65 | `status` (several), `offering_id`, `is_package`, `sort` = `created_at` (default, newest first) \| `valid_until`, `order`, `limit`, `after` | — | Patient offering[] |
| 66 | — | — | Patient offering |
| 67 | — | optional: `valid_until` (date, or null for no expiry), `sessions_total`; `expected_updated_at` | Patient offering |

#### 7.L.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 67 | `400` · `sessions_total` | below `sessions_used`, or over 999 |
| 67 | `400` · `valid_until` | before the invoice date |
| 66, 67 | `404` | not in the organization, deleted, or under another patient |

#### 7.L.10 Rules worth knowing

None beyond 7.10.

#### 7.L.11 Code changes

| # | Change |
| --- | --- |
| PKC4 | PK4: drop `POST /patients/{patient_id}/packages` and the create DTO; the invoice service creates patient offerings for `treatment`, `package` and `lhr` lines (sub-domain 8); `invoice_item_id` replaces `invoice_id`; `valid_until` nullable; sessions `smallint` 1–999 |
| PKC5 | PK5: derived `status`, `sessions_left`, `is_package` (and its filter), `offering_name` in the serializer |
| PKC6 | PK6: drop the package `DELETE` and restore routes; the `sessions_total` check in the service; the unused list-limit constant |
| PKC11 | PK11: the sessions-left index; linking at invoicing lives in the invoice service (sub-domain 8, BC25) and `is_billed` on treatments (7.H–7.K, TRC12) |

---

### 7.M Offering suggestions — `patients/patient-offering-suggestions/` — final

#### 7.M.1 Decisions

| # | Decision |
| --- | --- |
| PK7 | **Status and invoicing**: `planned` (default) · `accepted` · `next_time` · `declined`, moved freely by the team, and set to `accepted` when an invoice line is linked (sub-domain 8). "Invoiced" is derived from the linked invoice lines — `invoiced_quantity` = their total quantity, fully invoiced when it reaches `quantity` (the design's "✓ Invoiced" / "Invoiced · 1 of 2"). The jsonb `invoice_links` (never written today) is replaced by `invoice_items.patient_offering_suggestion_id` (sub-domain 8): a line serves one plan row, a plan row may be invoiced over several lines. `quantity` can't drop below `invoiced_quantity`. |
| PK8 | **Where it came from is a real link**: `appointment_id` (planned at a visit) and `patient_check_in_id` (a check-in's next offering, TR10); `source_label` is derived ("Check-in · 26 Sep", "Appt #2790 · Consultation", else "Patient file") instead of stored text; `suggested_by_membership_id` = the caller (the design's "by"). |
| PK9 | **Price and total**: `price` is the line's final amount for the whole quantity, none = the offering's billed price × quantity. Below the offering's lowest price × quantity is allowed here ("warns, not blocks") and flagged `is_below_lowest_price` — the invoice refuses it (sub-domain 8). The list's `meta.plan_total` = the planned and accepted rows (the card's total). **No duplicates**: the same offering again → `409 suggestion_exists` while a live row for it is planned, next time, or accepted and not fully invoiced; declined rows stay as a record ("Use Declined instead to keep a record"). |
| PK10 | Remove = soft delete with a reason + restore (your rule; the design hard-deletes). The offering must be active (O13). The design's "ideas" (computed, never stored) are not in this API. |

#### 7.M.2 Open questions

None.

#### 7.M.3 Tables and relations

`app.patient_offering_suggestions`

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `patient_id` | `bigint` | no | | → patients `ON DELETE RESTRICT` |
| `offering_id` | `bigint` | no | | → offerings `ON DELETE RESTRICT` |
| `quantity` | `smallint` | no | `1` | 1–99 |
| `price` | `numeric(12,2)` | yes | | `≥ 0`; none = the billed price × quantity |
| `status` | `varchar(9)` | no | `'planned'` | the 4 statuses |
| `reason` | `varchar(200)` | yes | | the "why" |
| `appointment_id` | `bigint` | yes | | → appointments `ON DELETE SET NULL` |
| `patient_check_in_id` | `bigint` | yes | | → patient_check_ins `ON DELETE SET NULL` |
| `suggested_by_membership_id` | `bigint` | yes | | → memberships `ON DELETE RESTRICT` (K2) |

Dropped: `source_label`, `invoice_links`. Indexes: unique `public_id`; `WHERE deleted_at IS NULL`: `(patient_id, created_at DESC, id)`, `(patient_id, offering_id) WHERE status <> 'declined'` — the duplicate check, `(appointment_id) WHERE appointment_id IS NOT NULL` — "Plan ready"; `(patient_check_in_id) WHERE patient_check_in_id IS NOT NULL`; `(offering_id)`.
RLS: organization policy, enabled and forced. Branch: none.

#### 7.M.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `patient:read` | Patients · View | patient files; check-ins, reviews and their actions; what was bought, and the plan | 68, 70 | Owner, Admin, Doctor, Therapist, Front desk, Counsellor, Pharmacist, Accountant, Marketing |
| `patient:update` | Patients · Edit | change a patient file; with the clinical code: write clinical notes, photos, reports (P14); write, delete and restore check-ins and reviews; log actions; plan: add, change, remove, restore | 69, 71–73 | same |

The codes as a whole, with their notes: 7.4.

#### 7.M.5 Common to every route

As 7.5.

#### 7.M.6 Objects returned

**Offering suggestion**: `id` (`osug_…`), `patient_id`, `offering_id`, `offering_name`, `quantity`, `price` (or null), `status`, `reason`, `appointment_id`, `patient_check_in_id`, `source_label`, `suggested_by_membership_id`, `invoiced_quantity`, `is_fully_invoiced`, `is_below_lowest_price`, `created_at`, `updated_at`.

#### 7.M.7 Routes (68–73)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 68 | GET | `/patients/{patient_id}/offering-suggestions` | The patient's plan | `patient:read` | |
| 69 | POST | `/patients/{patient_id}/offering-suggestions` | Add to the plan | `patient:update` | req |
| 70 | GET | `/patients/{patient_id}/offering-suggestions/{patient_offering_suggestion_id}` | Get one **(moved)** | `patient:read` | |
| 71 | PATCH | `/patients/{patient_id}/offering-suggestions/{patient_offering_suggestion_id}` | Change quantity, price, status, reason **(moved)** | `patient:update` | |
| 72 | DELETE | `/patients/{patient_id}/offering-suggestions/{patient_offering_suggestion_id}` | Remove from the plan **(moved)** | `patient:update` | |
| 73 | POST | `/patients/{patient_id}/offering-suggestions/{patient_offering_suggestion_id}/restore` | Undo **(moved)** | `patient:update` | req |

#### 7.M.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 68 | `status` (several), `appointment_id`, `patient_check_in_id`, `sort` = `created_at` (default, newest first), `order`, `limit`, `after` | — | Offering suggestion[], `meta.plan_total` |
| 69 | — | `offering_id*`; optional: `quantity`, `price`, `status`, `reason`, `appointment_id` | Offering suggestion |
| 70, 73 | — | — | Offering suggestion |
| 71 | — | optional: `quantity`, `price`, `status`, `reason`; `expected_updated_at` (the offering can't change) | Offering suggestion |
| 72 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |

#### 7.M.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 69 | `400` · `offering_id` | inactive (O13) |
| 69, 73 | `409` · `suggestion_exists` | the offering is already in the plan (PK9) |
| 69 | `400` · `appointment_id` | another contact's |
| 71 | `400` · `quantity` | below `invoiced_quantity` |
| 73 | `409` · `record_not_deleted` | it is live |
| 70–73 | `404` | not in the organization, deleted (6–8), or under another patient |

#### 7.M.10 Rules worth knowing

None beyond 7.10.

#### 7.M.11 Code changes

| # | Change |
| --- | --- |
| PKC7 | PK7: drop `invoice_links`; `invoiced_quantity` / `is_fully_invoiced` from `invoice_items` (sub-domain 8); `accepted` on link; the `quantity` check |
| PKC8 | PK8: drop `source_label`; add `patient_check_in_id` and `suggested_by_membership_id`; derived `source_label` |
| PKC9 | PK9: `is_below_lowest_price`, `meta.plan_total`, the duplicate check (`409`) |
| PKC10 | PK10: the active-offering check; `offering_name` in the serializer |

---

## 8. Billing — final (rev 2, confirmed 2026-10-08) — nested sub-domains 8.A–8.E

*Was sub-domain 10 before the restructure (2026-10-08) — layout only, no decision changed.*

Code: the **`billing` sub-domain folder** (your call) — `src/domains/app/sub-domains/billing/` (only `billing.routes.ts` and `billing.container.ts` at the root) with `invoices/`, `invoice-credit-notes/`, `payments/`, `pending-credits/`, `day-closes/`. The platform's `src/domains/billing/` (the Stripe subscription, Postgres schema `billing`) is a different folder and schema.

8.1 Decisions (whole sub-domain) · 8.2 Open questions · 8.3 Tables and relations · 8.4 Permissions · 8.5 Common to every route ·
8.6 Objects returned · 8.7 Routes · 8.8 Request details · 8.9 Errors · 8.10 Rules worth knowing · 8.11 Code changes (whole sub-domain) ·
8.12 Nested sub-domains · then **8.A Invoices · 8.B Invoice credit notes · 8.C Payments · 8.D Pending credits · 8.E Day closes** — each with the same eleven sections: .1 Decisions ·
.2 Open questions · .3 Tables and relations · .4 Permissions · .5 Common to every route · .6 Objects returned · .7 Routes ·
.8 Request details · .9 Errors · .10 Rules worth knowing · .11 Code changes

Bills, the money in and out, refunds, what is owed either way, and each branch's daily cash close. Launch row #69
is **not built**: today these are generic records — nothing computes a total, GST, what is paid or due, checks
that splits add up, settles, refunds, reverses or locks a day. Route numbers run 1–32. Design: `payments.md`,
`patient-file.md` (Invoices, Payments tabs), `today.md` (checkout), `users.md` (Payments row, special switches),
`schema-routes.md` (Invoice, InvoiceItem, Payment, CreditNote, PendingCredit, DayClose).

### 8.1 Decisions (whole sub-domain)

Taken on your standing answer "go with the recommendation" — confirmed 2026-10-08. A decision that belongs to one table is in its nested sub-domain.

| # | Decision |
| --- | --- |
| B1 | **Folders and names follow the tables** (P22): five nested sub-domains named after their tables; what an invoice owns carries its prefix — `invoice_items` (new, B5), `invoice_members` (today `invoice_team_memberships`, like `branch_members` / `contact_members`), `invoice_credit_notes` (today `credit_notes`) — and credit notes nest under their invoice: `/invoices/{invoice_id}/credit-notes`, with the organization-wide list at `/invoice-credit-notes` (the table's name, as P21). |
| B2 | **One code set, in the Payments row**: `payment:read` · `create` · `update` · `delete` · `export`. The design's special switches fold into it (no special codes — your rule): "Give refunds & credit notes" → `payment:create`; "Close the day" → `payment:update`; "Reverse settled payments" and "Void sales & delete invoices" (for invoices) → `payment:delete`; "Export lists" → `payment:export`. `invoice:*`, `day_close:*`, `day_close:close`, `payment:reverse_settled`, `refund:create` and `list:export` (here) go; `sale:void` stays only for sub-domain 11's medical sales. |
| B3 | **The billed person is a contact** (4 — one person, one record): `invoices.contact_id`, `payments.contact_id` and `pending_credits.contact_id` replace `patient_id` and `medical_contact_id` (sub-domain 11 drops `medical_contacts`; a walk-in buyer becomes a contact from a name and a mobile — the design's "Add contact + Mobile"). A clinic or consultation invoice needs a contact with a patient file (`400 patient_file_required` — the design's picker offers only patients); a medical invoice may have no contact (sub-domain 11 decides). Responses carry the contact summary and its `patient_id`; the patient file's Invoices and Payments tabs list by the patient's contact. |
| B4 | **Branch**: invoices, payments and day closes are branch-filtered (`branch:read` to see every branch, as today); credit notes follow their invoice's branch (today none); pending credits are the organization's. A record's branch is fixed once created. |
| B5 | **Money is computed and stored by the server**: invoice lines become rows (`app.invoice_items`) instead of a jsonb array, and each save computes and stores every line's and the invoice's amounts (8.A, B9). `paid_amount` is kept by the payment writes in the same transaction; `due_amount` and `payment_status` are generated columns. |
| B6 | **A closed day locks its money**: a payment belongs to its branch's day (the organization date of `paid_at`); once that day is closed it can't be changed, deleted or restored, and nothing can be added to it (`409 day_closed`) — settled money is undone only by a reversal (8.C). Every payment write reads the day close `FOR SHARE` and closing takes it `FOR UPDATE`, so a close and a payment never interleave. `payments.day_close_id` goes — the branch and date already name the day. |
| B7 | Saving an invoice, receiving, refunding and reversing write a `system` entry in the contact's activity (4, M10). "Payment due" (an invoice with a due) and a pending credit's `settle_by` are sub-domain 10's task rules. |

### 8.2 Open questions

None — every decision follows the recommendation.

### 8.3 Tables and relations

| Table | Holds | Key rules |
| --- | --- | --- |
| `app.invoices` | one bill | two numbers from triggers (B11); amounts computed (B9); editable until settled (B12); deleted only unpaid (B14) |
| `app.invoice_items` | its lines | offering or medicine, exactly one; snapshot rate and GST; computed amounts |
| `app.invoice_members` | invoice ↔ membership: who is credited | key (`invoice_id`, `membership_id`); up to 10 |
| `app.invoice_credit_notes` | a refund document on an invoice | written with its refund payment; never edited (B16) |
| `app.payments` | one entry in or out | kind fixes direction (B17); splits add up (B18); locked by the day close (B6) |
| `app.payment_edits` | what a change to a payment changed | append-only (B20) |
| `app.pending_credits` | money owed to or by someone | settled in parts by payments (B24) |
| `app.day_closes` | one branch's day: opening, expected, counted cash | one per branch and day; locks the day (B25) |
| `app.day_close_events` | what happened to a day | append-only (B27) |

```text
tenancy.organizations
   │
   ├──< app.invoices ──┬──> app.contacts (4)   · app.branches                                                   who is billed, where
   │                   ├──< app.invoice_items ──┬──> app.offerings · app.medicines (11)                         the lines
   │                   │                        ├──> app.patient_offering_suggestions (7)                       the plan row it invoices
   │                   │                        └─── app.patient_offerings (7) ──< app.patient_treatments (7)   the sessions it sold, and the treatments it bills
   │                   ├──< app.invoice_members >── tenancy.memberships                                         who is credited
   │                   └──< app.invoice_credit_notes ─── app.payments                                           a refund and its payment
   ├──< app.payments ──┬──> app.contacts · app.branches · app.invoices                                          money in and out
   │                   ├──> app.pending_credits · app.payments (reverses)                                       what it settles or undoes
   │                   └──< app.payment_edits                                                                   what each change changed
   ├──< app.pending_credits ──> app.contacts · app.invoices                                                     owed to or by someone
   └──< app.day_closes ──┬──> app.branches                                                                      one per branch and day
                         └──< app.day_close_events                                                              what happened

A ──< B   one A has many B     A >── B   many A for one B     A ──> B   a column on A points at one B     A ─── B   at most one B per A
```

Pointing at these from other sub-domains: `patient_offerings.invoice_item_id` (7), `contact_activities.invoice_id` / `payment_id` (4), `medical_sales.invoice_id` (11), the task source (10).

**PostgreSQL design**

Standard columns on every record table (not repeated below): `id bigint` (identity), `public_id varchar(28)` unique, `organization_id bigint` → organizations `ON DELETE CASCADE`, `created_at` / `updated_at timestamptz`, `created_by_user_id` / `updated_by_user_id`, and — where it soft-deletes — `deleted_at`, `delete_reason`, `delete_note` with their three checks; RLS enabled and forced. Money is `numeric(12,2)` in rupees everywhere; a payment's day is the organization-local date of `paid_at`. RLS: organization policy, enabled and forced, on every table, link and log tables included. Each table's design is in its nested sub-domain.

### 8.4 Permissions

One code set (B2), in the **Payments** row of the Roles matrix; each nested sub-domain's routes repeat the gate.

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `payment:read` | Payments · View | invoices, credit notes, payments and their changes, pending credits, day closes | 1, 4, 8, 9, 11, 12, 15, 17, 21, 23, 28, 30 | Owner, Admin, Front desk, Counsellor, Accountant |
| `payment:create` | Payments · Create | bill (with "Paid now"), receive and pay, refund with a credit note, add and settle pending credits | 3, 10, 14, 22, 27 | Owner, Admin, Front desk, Counsellor, Accountant |
| `payment:update` | Payments · Edit | change invoices, open-day payments and pending credits; open and close the day; a patient offering's sessions or validity (7) | 5, 16, 24, 29, 31 | Owner, Admin, Front desk, Accountant |
| `payment:delete` | Payments · Delete | delete or restore unpaid invoices, open-day payments, unsettled pending credits; reverse a settled payment; reopen a closed day | 6, 7, 18–20, 25, 26, 32 | Owner, Admin |
| `payment:export` | Payments · Export | the invoices and payments CSVs | 2, 13 | Owner, Admin, Accountant |

Holders follow today's presets. The design gives the Accountant "Reverse settled payments" — that is now Payments · Delete, so give it to the Accountant role if they should reverse.

### 8.5 Common to every route

| Item | Value |
| --- | --- |
| Base | `/api/v1/app` |
| Auth | `Authorization: Bearer <access token>`; the active organization comes from the token |
| Writes | every `POST` needs `X-Idempotency-Key`; `PATCH` takes an optional `expected_updated_at` (a stale save → `409 record_changed`) |
| Success | `200` with `{ data, meta }`; lists `{ data: [...], meta: { pagination: { per_page, next, has_more, estimated_total } } }` (`estimated_total` on the first page, up to 10,000); `DELETE` → `204` |
| Lists | `limit` (1–100, default 25), `after`, `q` (1–200), `sort`, `order`, `created_from` / `created_to` (`to` exclusive) |
| Errors | `{ error: { type, code, reason?, detail, errors[] } }` — `400 invalid_field`, `401`, `403`, `404`, `409`, `422` idempotency key missing or reused |

### 8.6 Objects returned

Each nested sub-domain lists its own objects (8.A to 8.E, section .6):

| Object | Where |
| --- | --- |
| Invoice · Invoice item · Invoices export | 8.A.6 — Invoices |
| Credit note | 8.B.6 — Invoice credit notes |
| Payment · Payment edit · Payments export | 8.C.6 — Payments |
| Pending credit | 8.D.6 — Pending credits |
| Day close · Day close event | 8.E.6 — Day closes |

### 8.7 Routes

Every route of the sub-domain in one table; each nested sub-domain repeats its own with the details.

| # | Method | Path | Purpose | Gate | Idem | Nested sub-domain |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | GET | `/invoices` | List invoices | `payment:read` | | 8.A Invoices |
| 2 | GET | `/invoices/exports` | The invoices CSV | `payment:export` | | 8.A Invoices |
| 3 | POST | `/invoices` | Bill — optionally with "Paid now" | `payment:create` | req | 8.A Invoices |
| 4 | GET | `/invoices/{invoice_id}` | Get an invoice (the print preview) | `payment:read` | | 8.A Invoices |
| 5 | PATCH | `/invoices/{invoice_id}` | Change it, until settled | `payment:update` | | 8.A Invoices |
| 6 | DELETE | `/invoices/{invoice_id}` | Delete an unpaid invoice | `payment:delete` | | 8.A Invoices |
| 7 | POST | `/invoices/{invoice_id}/restore` | Undo | `payment:delete` | req | 8.A Invoices |
| 8 | GET | `/invoice-credit-notes` | Every credit note **(renamed)** | `payment:read` | | 8.B Invoice credit notes |
| 9 | GET | `/invoices/{invoice_id}/credit-notes` | An invoice's credit notes | `payment:read` | | 8.B Invoice credit notes |
| 10 | POST | `/invoices/{invoice_id}/credit-notes` | Refund: credit note + refund payment **(new)** | `payment:create` | req | 8.B Invoice credit notes |
| 11 | GET | `/invoices/{invoice_id}/credit-notes/{invoice_credit_note_id}` | Get one **(moved)** | `payment:read` | | 8.B Invoice credit notes |
| 12 | GET | `/payments` | The ledger | `payment:read` | | 8.C Payments |
| 13 | GET | `/payments/exports` | The payments CSV | `payment:export` | | 8.C Payments |
| 14 | POST | `/payments` | Receive, pay an expense or a supplier bill, record money back | `payment:create` | req | 8.C Payments |
| 15 | GET | `/payments/{payment_id}` | Get a payment | `payment:read` | | 8.C Payments |
| 16 | PATCH | `/payments/{payment_id}` | Change it on an open day — recorded | `payment:update` | | 8.C Payments |
| 17 | GET | `/payments/{payment_id}/edits` | What changed **(new)** | `payment:read` | | 8.C Payments |
| 18 | POST | `/payments/{payment_id}/reverse` | Undo a settled payment **(new)** | `payment:delete` | req | 8.C Payments |
| 19 | DELETE | `/payments/{payment_id}` | Delete on an open day | `payment:delete` | | 8.C Payments |
| 20 | POST | `/payments/{payment_id}/restore` | Undo | `payment:delete` | req | 8.C Payments |
| 21 | GET | `/pending-credits` | List pending credits | `payment:read` | | 8.D Pending credits |
| 22 | POST | `/pending-credits` | Add one — give or take | `payment:create` | req | 8.D Pending credits |
| 23 | GET | `/pending-credits/{pending_credit_id}` | Get one | `payment:read` | | 8.D Pending credits |
| 24 | PATCH | `/pending-credits/{pending_credit_id}` | Change it, while nothing is settled | `payment:update` | | 8.D Pending credits |
| 25 | DELETE | `/pending-credits/{pending_credit_id}` | Delete it, while nothing is settled | `payment:delete` | | 8.D Pending credits |
| 26 | POST | `/pending-credits/{pending_credit_id}/restore` | Undo | `payment:delete` | req | 8.D Pending credits |
| 27 | POST | `/pending-credits/{pending_credit_id}/settle` | Give back, get back, or use on a bill **(new)** | `payment:create` | req | 8.D Pending credits |
| 28 | GET | `/day-closes` | Past and open days | `payment:read` | | 8.E Day closes |
| 29 | POST | `/day-closes` | Open the day — accept or recount the opening cash | `payment:update` | req | 8.E Day closes |
| 30 | GET | `/day-closes/{day_close_id}` | A day, with its live figures and events | `payment:read` | | 8.E Day closes |
| 31 | POST | `/day-closes/{day_close_id}/close` | Count and close — locks the day | `payment:update` | req | 8.E Day closes |
| 32 | POST | `/day-closes/{day_close_id}/reopen` | Reopen a closed day | `payment:delete` | req | 8.E Day closes |

### 8.8 Request details

In each nested sub-domain (8.A to 8.E, section .8).

### 8.9 Errors

Every route can answer the errors in 8.5; each route's own errors are in its nested sub-domain (8.A to 8.E, section .9).

### 8.10 Rules worth knowing

- Paid = receipts against the invoice − refunds against it (reversals cancel either); due = total − paid; status `paid` · `partial` · `unpaid`. Nobody pays more than the due (`409 more_than_due`).
- A refund to a patient is always a credit note on the invoice plus its refund payment (8.B); money given back without an invoice goes through a pending credit (8.D).
- Selling an offering or a plan row is invoicing it (7): a `treatment`, `package` or `lhr` line creates the patient offering, links the plan row and marks it accepted, and links the treatments it bills (B28).
- Today's checkout "Previous due" and "Advance paid" are separate entries: a receipt against the older invoice, and an advance (a receipt with no invoice) moved onto the bill by changing its invoice on an open day.

### 8.11 Code changes (whole sub-domain)

| # | Change |
| --- | --- |
| BC1 | B1: move the five folders into `app/sub-domains/billing/` with `billing.routes.ts` / `billing.container.ts`; rename `credit_notes` → `invoice_credit_notes` and `invoice_team_memberships` → `invoice_members` (init migration, schemas, indexes, constraints, RLS, the FORCE-RLS and purge lists, the counter key); the routes and path ids |
| BC2 | B2: codes `payment:read\|create\|update\|delete\|export` (app permissions, catalog seed, presets, the Payments row with Export); drop `invoice:*`, `day_close:*`, `day_close:close`, `payment:reverse_settled`, `refund:create`, `list:export` here; invoices stop using `sale:void` |
| BC3 | B3: `contact_id` on invoices (required except `medical`), payments and pending credits; drop `patient_id` and `medical_contact_id` with their checks; the patient-file check; the contact summary and `patient_id` in responses |
| BC4 | B4: credit notes filtered through their invoice's branch; `branch_id` refused on `PATCH` |
| BC5 | B6: the day lock (`FOR SHARE` / `FOR UPDATE`) in every payment write; drop `payments.day_close_id` and its filter |
| BC6 | B7: `system` entries for invoices, receipts, refunds, reversals |

### 8.12 Nested sub-domains

| Nested sub-domain | Folder (`src/domains/app/sub-domains/billing/…`) | Tables | Routes | Status |
| --- | --- | --- | --- | --- |
| 8.A Invoices | `invoices/` | `app.invoices`, `app.invoice_items`, `app.invoice_members` | 1–7 | final |
| 8.B Invoice credit notes | `invoice-credit-notes/` | `app.invoice_credit_notes` | 8–11 | final |
| 8.C Payments | `payments/` | `app.payments`, `app.payment_edits` | 12–20 | final |
| 8.D Pending credits | `pending-credits/` | `app.pending_credits` | 21–27 | final |
| 8.E Day closes | `day-closes/` (+ the auto-close worker) | `app.day_closes`, `app.day_close_events` | 28–32 | final |

---

### 8.A Invoices — `billing/invoices/` — final

#### 8.A.1 Decisions

| # | Decision |
| --- | --- |
| B8 | Types stay `clinic` · `consultation` · `medical`; a line is an offering (clinic, consultation — a consultation invoice takes consultation offerings only) or a medicine (medical, sub-domain 11) — exactly one. An offering must be active (O13) and offered at the invoice's branch (O5). Medical invoices are written through sub-domain 11's sale, which points at the invoice; `invoices.medical_sale_id` (the second copy of that link, never settable) goes. |
| B9 | **Amounts**, per line: gross = quantity × rate; line discount = gross × `discount_percent` ÷ 100; the overall discount is shared across lines in proportion to what is left after their line discounts ("Discount (before tax)", `today.md`); net = gross − line discount − share; taxable = net ÷ (1 + GST ÷ 100) when the offering's GST is inclusive, else net; GST = taxable × GST ÷ 100; amount = taxable + GST. Invoice: subtotal = Σ gross, discount total = Σ discounts and shares, taxable total, GST total, total = Σ amount. Each line rounds to the paisa; the last line absorbs the overall discount's rounding. `rate` is server-set — the offering's billed price (offer price, else list price, O4) or the medicine's price (11) — as the design shows it read-only (the quick line's "@500" goes); `discount_percent` 0–100 with 2 decimals, so a typed "Final" maps back exactly; `overall_discount` is an amount, at most what the lines come to after their discounts (the design's % field sends the amount — `schema-routes.md` already says amount). |
| B10 | **Lowest price**: a line's net per unit (after its share of the overall discount, before GST) below the offering's `min_price` → `400 below_lowest_price` (O16 — nobody bills below it; the message shows the floor only with `offering:lower_price:read`). |
| B11 | **Numbers as built**: `invoice_sequence` "#1042" (organization-wide, for search) and the statutory `invoice_number` per branch and financial year (April–March, "2026-27/0412"), both from triggers and never reused. Because the number depends on them, `branch_id` can't change and `invoice_date` can't move to another financial year (`400`) — today a `PATCH` leaves the number stale. |
| B12 | **Editing until settled**: an invoice can be changed until it has a payment on a closed day (`409 invoice_settled` — then a credit note, as `today.md`: "Changes now go through Cancel bill or Credit note"); the new total can't fall below what is paid (`409 below_paid`), the contact can't change once anything is paid, and every change is in the audit log (design: "Changes are logged"). Lines are kept by id: sent with an id = changed, without = added, left out = removed; a line whose patient offering has a spent session can't be removed or change its offering or quantity (`409 offering_in_use` — reverse its treatments first, 7, TR6), otherwise its patient offering follows. |
| B13 | **A save does the rest in the same transaction**: a `treatment`, `package` or `lhr` line creates its patient offering (7, PK4) and links the treatments it bills (B28); a line carrying `patient_offering_suggestion_id` — or, when none is sent, the patient's live planned or accepted plan row for the same offering — is linked and the row marked accepted (7, PK7; design: "it links itself when the offering matches"); `payment` in the body (the drawer's "Paid now") records the receipt (8.C), up to the total. |
| B14 | **Delete only unpaid**: nothing paid and no credit note (`409 invoice_paid`); its patient offerings go and come back with it (`409 offering_in_use` when one has a spent session); linked plan rows count as not invoiced while it is deleted. |
| B15 | The team (`member_ids`, up to 10 — who is credited; the drawer fills the contact's team) is `invoice_members`. The prescription link is `patient_prescription_id` (sub-domain 7, PC15). |
| B28 | **A line bills the visit's treatments** (7, PK11): on a new or changed line, `patient_treatment_ids` (up to its sessions left) names the patient's treatments it pays for — done, of the line's offering, not yet billed (`400 patient_treatment_ids`; billed by another line meanwhile → `409 treatment_billed`). The save links each (`patient_treatments.patient_offering_id`) and spends its session in the same transaction (7, TR13). "Create invoice from visit" sends today's not-billed treatments this way; a line without them leaves its sessions to spend later. Links are added, never removed here — reversing the treatment removes one (7, TR6). |

#### 8.A.2 Open questions

None.

#### 8.A.3 Tables and relations

`app.invoices`

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `invoice_sequence` | `integer` | no | counter | `> 0` — "#1042" |
| `invoice_number` | `varchar(30)` | no | trigger | per branch and financial year — "2026-27/0412" |
| `financial_year` | `varchar(9)` | no | trigger | `~ '^\d{4}-\d{2}$'` |
| `type` | `varchar(12)` | no | `'clinic'` | `clinic` · `consultation` · `medical` |
| `branch_id` | `bigint` | no | | → branches `ON DELETE RESTRICT`; fixed |
| `contact_id` | `bigint` | yes | | → contacts `ON DELETE RESTRICT`; `contact_id IS NOT NULL OR type = 'medical'` (B3) |
| `invoice_date` | `date` | no | | stays in its financial year |
| `overall_discount` | `numeric(12,2)` | no | `0` | `≥ 0` |
| `subtotal`, `discount_total`, `taxable_total`, `gst_total`, `total` | `numeric(12,2)` | no | `0` | computed (B9); each `≥ 0`; `total = taxable_total + gst_total` |
| `paid_amount` | `numeric(12,2)` | no | `0` | `0 ≤ paid_amount ≤ total`; kept by the payment writes |
| `due_amount` | `numeric(12,2)` | | generated | `total − paid_amount`, stored |
| `payment_status` | `varchar(7)` | | generated | `paid` (nothing due) · `partial` · `unpaid`, stored |
| `remark` | `varchar(500)` | yes | | printed |
| `patient_prescription_id` | `bigint` | yes | | → patient_prescriptions `ON DELETE SET NULL` |

Dropped: `items` (jsonb), `patient_id`, `medical_contact_id`, `medical_sale_id`, the patient-unless-medical check. Indexes: unique `public_id`; unique `(organization_id, invoice_sequence)`; unique `(organization_id, branch_id, financial_year, invoice_number)`; `WHERE deleted_at IS NULL`: `(organization_id, invoice_date DESC, id)`, `(contact_id, invoice_date DESC, id)` — the patient file's tab, `(branch_id, invoice_date)`, `(organization_id, invoice_date) WHERE due_amount > 0` — dues and sub-domain 10's reminder.
RLS: organization policy, enabled and forced. Branch: application filter on `branch_id`.

`app.invoice_items` (rows go with their invoice; a removed line is deleted)

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `invoice_id` | `bigint` | no | | → invoices `ON DELETE CASCADE` |
| `line_number` | `smallint` | no | | 1–50; unique `(invoice_id, line_number)` |
| `offering_id` | `bigint` | yes | | → offerings `ON DELETE RESTRICT` |
| `medicine_id` | `bigint` | yes | | → medicines `ON DELETE RESTRICT` (11); `num_nonnulls(offering_id, medicine_id) = 1` |
| `name` | `varchar(120)` | no | | snapshot |
| `pack_size` | `varchar(30)` | yes | | medicines |
| `quantity` | `smallint` | no | | 1–999 |
| `rate` | `numeric(12,2)` | no | | `≥ 0`; snapshot (B9) |
| `discount_percent` | `numeric(5,2)` | no | `0` | 0–100 |
| `discount_amount` | `numeric(12,2)` | no | `0` | line discount + its share; `≥ 0` |
| `gst_percent` | `smallint` | no | | `IN (0, 5, 12, 18, 28)`; snapshot |
| `is_gst_inclusive` | `boolean` | no | | snapshot |
| `taxable_amount`, `gst_amount`, `amount` | `numeric(12,2)` | no | | computed; `≥ 0` |
| `patient_offering_suggestion_id` | `bigint` | yes | | → patient_offering_suggestions `ON DELETE SET NULL` (7) |
| `batch_number` | `varchar(20)` | yes | | medicines (11) |

Indexes: unique `public_id`; unique `(invoice_id, line_number)`; `WHERE … IS NOT NULL`: `(offering_id)`, `(medicine_id)`, `(patient_offering_suggestion_id)`. RLS: organization policy, enabled and forced. Branch: through its invoice.

`app.invoice_members` (no public id): `invoice_id` → invoices `ON DELETE CASCADE`, `membership_id` → memberships `ON DELETE RESTRICT` (K2 — a credited member stays listed after leaving), `organization_id`, `created_at`; primary key `(invoice_id, membership_id)`; index `(membership_id, invoice_id)` — a member's billing. RLS: organization policy, enabled and forced.

#### 8.A.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `payment:read` | Payments · View | invoices, credit notes, payments and their changes, pending credits, day closes | 1, 4 | Owner, Admin, Front desk, Counsellor, Accountant |
| `payment:create` | Payments · Create | bill (with "Paid now"), receive and pay, refund with a credit note, add and settle pending credits | 3 | Owner, Admin, Front desk, Counsellor, Accountant |
| `payment:update` | Payments · Edit | change invoices, open-day payments and pending credits; open and close the day; a patient offering's sessions or validity (7) | 5 | Owner, Admin, Front desk, Accountant |
| `payment:delete` | Payments · Delete | delete or restore unpaid invoices, open-day payments, unsettled pending credits; reverse a settled payment; reopen a closed day | 6, 7 | Owner, Admin |
| `payment:export` | Payments · Export | the invoices and payments CSVs | 2 | Owner, Admin, Accountant |

The codes as a whole, with their notes: 8.4.

#### 8.A.5 Common to every route

As 8.5.

#### 8.A.6 Objects returned

**Invoice**: `id` (`invc_…`), `invoice_sequence`, `invoice_number`, `financial_year`, `type`, `branch_id`, `contact` (`{ id, name, primary_phone }` or null), `patient_id` (the contact's patient file, or null), `member_ids`, `items` (Invoice item[]), `overall_discount`, `subtotal`, `discount_total`, `taxable_total`, `gst_total`, `total`, `paid_amount`, `due_amount`, `payment_status`, `is_settled`, `invoice_date`, `remark`, `patient_prescription_id`, `created_at`, `updated_at`.

**Invoice item**: `id` (`iitm_…`, new prefix), `line_number`, `offering_id`, `medicine_id`, `name`, `pack_size`, `quantity`, `rate`, `discount_percent`, `discount_amount`, `gst_percent`, `is_gst_inclusive`, `taxable_amount`, `gst_amount`, `amount`, `patient_offering_suggestion_id`, `patient_offering_id` (the patient offering it created, or null), `patient_treatment_ids` (the treatments it bills), `batch_number`.

**Invoices export** (route 2): `file_name` (`invoices-YYYY-MM-DD.csv`), `content_type`, `row_count` (up to 5,000), `is_truncated`, `content` — as the offerings export (3.6).

#### 8.A.7 Routes (1–7)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | `/invoices` | List invoices | `payment:read` | |
| 2 | GET | `/invoices/exports` | The invoices CSV | `payment:export` | |
| 3 | POST | `/invoices` | Bill — optionally with "Paid now" | `payment:create` | req |
| 4 | GET | `/invoices/{invoice_id}` | Get an invoice (the print preview) | `payment:read` | |
| 5 | PATCH | `/invoices/{invoice_id}` | Change it, until settled | `payment:update` | |
| 6 | DELETE | `/invoices/{invoice_id}` | Delete an unpaid invoice | `payment:delete` | |
| 7 | POST | `/invoices/{invoice_id}/restore` | Undo | `payment:delete` | req |

#### 8.A.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 1 | `q` (`#1042` or `2026-27/0412`), `type` (several), `branch_id` (several), `contact_id`, `patient_id`, `member_id`, `payment_status` (several), `invoice_date_from` / `invoice_date_to` (inclusive), `sort` = `invoice_date` (default, newest first) \| `created_at` \| `due_amount`, `order`, `limit`, `after` | — | Invoice[] |
| 2 | as 1, without paging | — | Invoices export |
| 3 | — | `branch_id*` (one of yours), `items*` (1–50: `offering_id` or `medicine_id`, `quantity*`; optional `discount_percent`, `patient_offering_suggestion_id`, `patient_treatment_ids` (B28)); `contact_id` (required except `medical`); optional: `type` (default `clinic`), `invoice_date` (default today), `member_ids` (≤ 10), `overall_discount`, `remark`, `patient_prescription_id`, `payment` (`splits*`; optional `paid_at`, `reference`) | Invoice |
| 4, 7 | — | — | Invoice |
| 5 | — | optional: `contact_id` (nothing paid yet), `invoice_date` (same financial year), `items` (by `id`, B12; `patient_treatment_ids` adds links, B28), `member_ids`, `overall_discount`, `remark`, `patient_prescription_id`; `expected_updated_at` | Invoice |
| 6 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |

#### 8.A.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 3, 5 | `400` · `patient_file_required` | a clinic or consultation invoice for a contact with no patient file |
| 3, 5 | `400` · `items` | empty, over 50, a line of the wrong kind for the type, an inactive offering or one not offered at the branch |
| 3, 5 | `400` · `below_lowest_price` | a line under the offering's lowest price (B10) |
| 3, 5 | `400` · `overall_discount` | more than the lines come to |
| 3, 5 | `400` · `patient_treatment_ids` | another patient's, another offering's, reversed, or more than the line's sessions left |
| 3, 5 | `409` · `treatment_billed` | a treatment was billed by another line meanwhile |
| 3 | `409` · `more_than_due` | "Paid now" above the total |
| 5 | `400` · `branch_id` / `invoice_date` | the branch changes, or the date leaves its financial year |
| 5 | `409` · `invoice_settled` | it has a payment on a closed day |
| 5 | `409` · `below_paid` | the new total is under what is paid |
| 5, 6 | `409` · `offering_in_use` | a line's patient offering has a spent session |
| 6 | `409` · `invoice_paid` | something is paid or credited |
| 7 | `409` · `record_not_deleted` | it is live |
| 4–7 | `404` | not in the organization, or another branch without `branch:read` |

#### 8.A.10 Rules worth knowing

None beyond 8.10.

#### 8.A.11 Code changes

| # | Change |
| --- | --- |
| BC7 | B5, B9: new `app.invoice_items` (schema, RLS, `iitm` prefix); drop `invoices.items`; the computed columns, `paid_amount`, the generated `due_amount` / `payment_status` and their checks; the amounts service |
| BC8 | B8, B10: line kind by type; active and offered-here checks; the lowest-price check; drop `invoices.medical_sale_id` |
| BC9 | B11, B12: refuse a branch change and a financial-year move; the settled, below-paid and patient-offering checks; lines kept by id |
| BC10 | B13: patient offerings, plan links and "Paid now" in the invoice transaction |
| BC11 | B14: delete only unpaid; patient offerings with their invoice |
| BC12 | B15: `invoice_team_memberships` → `invoice_members` (`membership_id`), `member_ids` in body and response; `patient_prescription_id` |
| BC25 | B28: `patient_treatment_ids` on lines (DTO, checks, linking and spending in the invoice transaction, the response from the treatments' links); errors `patient_treatment_ids`, `treatment_billed`, `offering_in_use` (was `package_in_use`) |

---

### 8.B Invoice credit notes — `billing/invoice-credit-notes/` — final

#### 8.B.1 Decisions

| # | Decision |
| --- | --- |
| B16 | **A credit note is an invoice's refund**: `POST /invoices/{invoice_id}/credit-notes` with the amount, the reason and how the money goes back (cash, UPI, card) writes the credit note ("CN-001") and its refund payment together, on the invoice's branch and an open day; the amount can't exceed what is paid (`409 more_than_paid`) and lowers it. Never edited (`schema-routes.md`); deleting its refund payment on an open day removes the credit note too, and a settled refund is reversed (8.C). Today credit notes are read-only and nothing creates them. A refund of unused sessions also lowers the patient offering (7, PK6). |

#### 8.B.2 Open questions

None.

#### 8.B.3 Tables and relations

`app.invoice_credit_notes` (its soft-delete columns are written only with its refund payment)

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `credit_note_number` | `integer` | no | counter | `> 0` — "CN-001" |
| `invoice_id` | `bigint` | no | | → invoices `ON DELETE RESTRICT` |
| `amount` | `numeric(12,2)` | no | | `> 0` (today `≥ 0`) |
| `reason` | `varchar(280)` | no | | 1–280 |

Indexes: unique `public_id`; unique `(organization_id, credit_note_number)`; `WHERE deleted_at IS NULL`: `(invoice_id)`, `(organization_id, created_at DESC, id)`.
RLS: organization policy, enabled and forced. Branch: through its invoice (B4).

#### 8.B.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `payment:read` | Payments · View | invoices, credit notes, payments and their changes, pending credits, day closes | 8, 9, 11 | Owner, Admin, Front desk, Counsellor, Accountant |
| `payment:create` | Payments · Create | bill (with "Paid now"), receive and pay, refund with a credit note, add and settle pending credits | 10 | Owner, Admin, Front desk, Counsellor, Accountant |

The codes as a whole, with their notes: 8.4.

#### 8.B.5 Common to every route

As 8.5.

#### 8.B.6 Objects returned

**Credit note**: `id` (`cn_…`), `credit_note_number`, `invoice_id`, `amount`, `reason`, `payment_id` (its refund), `created_at`, `updated_at`.

#### 8.B.7 Routes (8–11)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 8 | GET | `/invoice-credit-notes` | Every credit note **(renamed)** | `payment:read` | |
| 9 | GET | `/invoices/{invoice_id}/credit-notes` | An invoice's credit notes | `payment:read` | |
| 10 | POST | `/invoices/{invoice_id}/credit-notes` | Refund: credit note + refund payment **(new)** | `payment:create` | req |
| 11 | GET | `/invoices/{invoice_id}/credit-notes/{invoice_credit_note_id}` | Get one **(moved)** | `payment:read` | |

#### 8.B.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 8 | `q` (`CN-12`), `invoice_id`, `contact_id`, `branch_id` (several), `created_from` / `created_to`, `sort` = `created_at` (default, newest first), `order`, `limit`, `after` | — | Credit note[] |
| 9 | `sort`, `order`, `limit`, `after` | — | Credit note[] |
| 10 | — | `amount*`, `reason*` (1–280), `splits*` (cash, UPI, card — adding up to `amount`); optional: `paid_at` (an open day), `reference`, `note` | Credit note |
| 11 | — | — | Credit note |

#### 8.B.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 10 | `409` · `more_than_paid` | more than the invoice's paid amount |
| 10 | `400` · `splits` | they don't add up, or use `credit` |
| 10 | `409` · `day_closed` | `paid_at` falls on a closed day |
| 9–11 | `404` | the invoice or credit note is not in the organization, or another branch without `branch:read` |

#### 8.B.10 Rules worth knowing

None beyond 8.10.

#### 8.B.11 Code changes

| # | Change |
| --- | --- |
| BC13 | B16: the create route writing the credit note and its refund payment in one transaction; `amount > 0`; nested routes; drop the unused update DTO and the service text promising edits |

---

### 8.C Payments — `billing/payments/` — final

#### 8.C.1 Decisions

| # | Decision |
| --- | --- |
| B17 | **Kind fixes direction**: received — `receipt` (from a contact, optionally against one of their invoices; without one it is an advance) and `money_back` (money coming back to the clinic); paid — `expense` (category and payee required), `supplier_bill` (its purchase link lands with sub-domains 11 and 9 — `bill_ref` and `bill_allocations` jsonb go) and `refund` (only through a credit note or a pending credit); `reversal` only through `/reverse`, opposite to what it undoes. `POST /payments` takes `receipt`, `money_back`, `expense`, `supplier_bill`. |
| B18 | **Splits as columns**: `cash_amount`, `upi_amount`, `card_amount`, `credit_amount` with `CHECK (their sum = amount)` — the database holds "splits add up" (today unchecked jsonb), and the day close sums `cash_amount` directly. The API keeps `splits: [{ mode, amount }]`. `credit` is only a pending credit used on a bill (8.D). `amount` > 0 is checked in the app (today 0 passes and the database answers `500`). |
| B19 | **Receipts**: against an invoice → that invoice's contact, at most its due (`409 more_than_due`). |
| B20 | **Changes are recorded**: a payment changes only on an open day (B6); each `PATCH` writes the changed fields (before → after) to `app.payment_edits` in the same transaction — the ledger's "Edited 1× · last ₹600 UPI → ₹700 UPI" (today nothing records it) — read at `GET /payments/{payment_id}/edits`. Kind, direction and branch never change. |
| B21 | **Delete or reverse**: delete (soft, with a reason) and restore on an open day only; a settled payment is undone by `POST /payments/{payment_id}/reverse` with a reason — a `reversal` entry on an open day, pointing at it (once — unique), shown greyed (design: "grey when reversed"). The invoice's paid amount moves with every receipt, refund, delete, restore and reversal. |
| B22 | "Mark as checked" (`POST /payments/{payment_id}/checked`, `is_checked_at_close`) goes — the design neither stores it nor needs it to close (`payments.md`), and today it never refuses. Other option: keep it, recording who checked. |

#### 8.C.2 Open questions

None.

#### 8.C.3 Tables and relations

`app.payments`

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `payment_number` | `integer` | no | counter | `> 0` — "PAY-…" |
| `direction` | `varchar(8)` | no | | `received` · `paid`; matches `kind` (B17) |
| `kind` | `varchar(13)` | no | | `receipt` · `money_back` · `expense` · `supplier_bill` · `refund` · `reversal` |
| `branch_id` | `bigint` | no | | → branches `ON DELETE RESTRICT`; fixed |
| `amount` | `numeric(12,2)` | no | | `> 0` (the duplicate `≥ 0` check goes) |
| `cash_amount`, `upi_amount`, `card_amount`, `credit_amount` | `numeric(12,2)` | no | `0` | each `≥ 0`; sum `= amount`; `credit_amount > 0` only with `pending_credit_id` |
| `paid_at` | `timestamptz` | no | `now()` | its day must be open on every write |
| `contact_id` | `bigint` | yes | | → contacts `ON DELETE RESTRICT`; required for a receipt |
| `invoice_id` | `bigint` | yes | | → invoices `ON DELETE RESTRICT` |
| `invoice_credit_note_id` | `bigint` | yes | | → invoice_credit_notes `ON DELETE RESTRICT`; unique; a refund against an invoice has one |
| `pending_credit_id` | `bigint` | yes | | → pending_credits `ON DELETE RESTRICT` |
| `reverses_payment_id` | `bigint` | yes | | → payments `ON DELETE RESTRICT`; unique; `(kind = 'reversal') = (reverses_payment_id IS NOT NULL)` |
| `payee_name` | `varchar(120)` | yes | | required for `expense` and `supplier_bill` |
| `expense_category` | `varchar(11)` | yes | | the 8 categories; `(kind = 'expense') = (expense_category IS NOT NULL)` |
| `reference` | `varchar(60)` | yes | | UPI ref, card's last 4 |
| `note` | `varchar(280)` | yes | | |
| `attachment_keys` | `text[]` | no | `'{}'` | `cardinality ≤ 5`; confirmed uploads |

Dropped: `splits`, `bill_ref`, `bill_allocations` (sub-domains 11 and 9 add typed purchase links), `day_close_id`, `is_checked_at_close`, `patient_id`, `credit_note_id` (renamed). Indexes: unique `public_id`; unique `(organization_id, payment_number)`; `WHERE deleted_at IS NULL`: `(organization_id, paid_at DESC, id)`, `(branch_id, paid_at)` — the day close's sums, `(contact_id, paid_at DESC) WHERE contact_id IS NOT NULL` — the patient file's tab; `(invoice_id)`, `(pending_credit_id)` `WHERE … IS NOT NULL`; unique `(reverses_payment_id)` and `(invoice_credit_note_id)` `WHERE … IS NOT NULL`.
RLS: organization policy, enabled and forced. Branch: application filter on `branch_id`.

`app.payment_edits` (append-only — no `updated_*` or soft-delete columns): `payment_id` → payments `ON DELETE CASCADE`, `changes jsonb` (`{ field: { from, to } }`, changed fields only, `jsonb_typeof = 'object'`), `author_membership_id` → memberships `ON DELETE RESTRICT` (K2). Index `(payment_id, created_at DESC)`. RLS: organization policy, enabled and forced.

#### 8.C.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `payment:read` | Payments · View | invoices, credit notes, payments and their changes, pending credits, day closes | 12, 15, 17 | Owner, Admin, Front desk, Counsellor, Accountant |
| `payment:create` | Payments · Create | bill (with "Paid now"), receive and pay, refund with a credit note, add and settle pending credits | 14 | Owner, Admin, Front desk, Counsellor, Accountant |
| `payment:update` | Payments · Edit | change invoices, open-day payments and pending credits; open and close the day; a patient offering's sessions or validity (7) | 16 | Owner, Admin, Front desk, Accountant |
| `payment:delete` | Payments · Delete | delete or restore unpaid invoices, open-day payments, unsettled pending credits; reverse a settled payment; reopen a closed day | 18–20 | Owner, Admin |
| `payment:export` | Payments · Export | the invoices and payments CSVs | 13 | Owner, Admin, Accountant |

The codes as a whole, with their notes: 8.4.

#### 8.C.5 Common to every route

As 8.5.

#### 8.C.6 Objects returned

**Payment**: `id` (`pay_…`), `payment_number`, `direction`, `kind`, `branch_id`, `amount`, `splits` (`[{ mode, amount }]`), `paid_at`, `contact` (summary or null), `patient_id`, `invoice_id`, `invoice_credit_note_id`, `pending_credit_id`, `reverses_payment_id`, `reversed_by_payment_id`, `payee_name`, `expense_category`, `reference`, `note`, `attachment_keys`, `is_settled` (its day is closed), `edit_count`, `last_edit` (Payment edit or null), `created_at`, `updated_at`.

**Payment edit**: `id` (`pedit_…`), `changes`, `author_membership_id`, `created_at`.

**Payments export** (route 13): as the invoices export, `payments-YYYY-MM-DD.csv`.

#### 8.C.7 Routes (12–20)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 12 | GET | `/payments` | The ledger | `payment:read` | |
| 13 | GET | `/payments/exports` | The payments CSV | `payment:export` | |
| 14 | POST | `/payments` | Receive, pay an expense or a supplier bill, record money back | `payment:create` | req |
| 15 | GET | `/payments/{payment_id}` | Get a payment | `payment:read` | |
| 16 | PATCH | `/payments/{payment_id}` | Change it on an open day — recorded | `payment:update` | |
| 17 | GET | `/payments/{payment_id}/edits` | What changed **(new)** | `payment:read` | |
| 18 | POST | `/payments/{payment_id}/reverse` | Undo a settled payment **(new)** | `payment:delete` | req |
| 19 | DELETE | `/payments/{payment_id}` | Delete on an open day | `payment:delete` | |
| 20 | POST | `/payments/{payment_id}/restore` | Undo | `payment:delete` | req |

#### 8.C.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 12 | `q` (payee, `PAY-12`), `direction`, `kind` (several), `mode` (several — has that split), `branch_id` (several), `contact_id`, `patient_id`, `invoice_id`, `pending_credit_id`, `expense_category` (several), `paid_date_from` / `paid_date_to` (organization dates, inclusive — one day = that day's entries), `is_settled`, `sort` = `paid_at` (default, newest first) \| `created_at` \| `amount`, `order`, `limit`, `after` | — | Payment[] |
| 13 | as 12, without paging | — | Payments export |
| 14 | — | `kind*` (`receipt` · `money_back` · `expense` · `supplier_bill`), `branch_id*` (one of yours), `splits*` (1–4, each mode once — `amount` is their total); optional: `paid_at` (default now; an open day), `contact_id` (required for `receipt`), `invoice_id` (`receipt`), `payee_name` (required for `expense` and `supplier_bill`), `expense_category` (required for `expense`), `reference`, `note`, `attachment_keys` | Payment |
| 15, 20 | — | — | Payment |
| 16 | — | optional: `splits`, `paid_at`, `contact_id`, `invoice_id`, `payee_name`, `expense_category`, `reference`, `note`, `attachment_keys`; `expected_updated_at` | Payment |
| 17 | `limit`, `after` | — | Payment edit[] (newest first) |
| 18 | — | `reason*` (1–280); optional `paid_at` (an open day, default now) | Payment (the reversal) |
| 19 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |

#### 8.C.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 14 | `400` · `kind` | `refund` or `reversal` (their own routes) |
| 14, 16 | `400` · `splits` | a mode twice, `credit` outside a pending credit, or an amount of 0 |
| 14, 16 | `400` · `contact_id` | missing on a receipt, or not the invoice's contact |
| 14, 16 | `400` · `payee_name` / `expense_category` | missing for that kind |
| 14, 16 | `409` · `more_than_due` | over the invoice's due |
| 14, 16, 18–20 | `409` · `day_closed` | the payment's day — or the new `paid_at`'s — is closed (18: the reversal's own day) |
| 18 | `409` · `day_open` | its day is still open — delete it instead |
| 18 | `409` · `already_reversed` | it was reversed before, or is itself a reversal |
| 20 | `409` · `record_not_deleted` | it is live |
| 15–20 | `404` | not in the organization, or another branch without `branch:read` |

#### 8.C.10 Rules worth knowing

None beyond 8.10.

#### 8.C.11 Code changes

| # | Change |
| --- | --- |
| BC14 | B17: kind ↔ direction `CHECK`; `POST` limited to four kinds; drop `bill_ref`, `bill_allocations` |
| BC15 | B18: the four split columns with the sum `CHECK`; `splits` mapped in the DTO and serializer; drop the jsonb and the duplicate amount check |
| BC16 | B19: the receipt checks; `paid_amount` kept on the invoice by every payment write |
| BC17 | B20: write `app.payment_edits` on `PATCH` (it is never instantiated today); route 17; `edit_count` / `last_edit` |
| BC18 | B21: route 18 and `reverses_payment_id`; delete and restore only on an open day |
| BC19 | B22: drop `POST /payments/{payment_id}/checked` and `is_checked_at_close` |

---

### 8.D Pending credits — `billing/pending-credits/` — final

#### 8.D.1 Decisions

| # | Decision |
| --- | --- |
| B23 | **Who**: a contact (`contact_id`) or a typed name (`party_name`) — a supplier link lands with sub-domain 11; `party_kind` goes. Fields the design has and the table lacks: `invoice_id` ("For invoice"), `settle_by` ("Creates a task due then" — sub-domain 10) and `note` (≤ 300). Status: `open` until settled in full, then `given_back` · `got_back` · `used`, by how the last part was settled. |
| B24 | **Settle in parts** — `POST /pending-credits/{pending_credit_id}/settle` with up to what is left (design: "partial amounts leave the remainder open"): `give` + money → a refund payment (with a credit note when the credit names an invoice); `take` + money → a `money_back` receipt; `give` + `use_on_bill` → a receipt on one of the party's invoices paid by `credit_amount` (no cash moves; design: "Use on next bill"). Each settlement is a payment pointing at the credit; `settled_amount` is their total, kept in the same transaction; the single `settled_payment_id` goes. Change, delete and restore only while nothing is settled. |

#### 8.D.2 Open questions

None.

#### 8.D.3 Tables and relations

`app.pending_credits`

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `pending_credit_number` | `integer` | no | counter | `> 0` — "CR-2" |
| `direction` | `varchar(4)` | no | | `give` · `take` |
| `contact_id` | `bigint` | yes | | → contacts `ON DELETE RESTRICT` |
| `party_name` | `varchar(120)` | yes | | `contact_id IS NOT NULL OR party_name IS NOT NULL` |
| `amount` | `numeric(12,2)` | no | | `> 0` |
| `settled_amount` | `numeric(12,2)` | no | `0` | `0 ≤ settled_amount ≤ amount` |
| `status` | `varchar(10)` | no | `'open'` | `open` · `given_back` · `got_back` · `used`; `(status = 'open') = (settled_amount < amount)` |
| `reason` | `varchar(280)` | no | | 1–280 (the design's chips or text) |
| `note` | `varchar(300)` | yes | | |
| `invoice_id` | `bigint` | yes | | → invoices `ON DELETE SET NULL` |
| `source_payment_id` | `bigint` | yes | | → payments `ON DELETE SET NULL` |
| `settle_by` | `date` | yes | | |

Dropped: `party_kind`, `patient_id`, `settled_payment_id`. Indexes: unique `public_id`; unique `(organization_id, pending_credit_number)`; `WHERE deleted_at IS NULL`: `(organization_id, created_at DESC, id)`, `(organization_id, settle_by) WHERE status = 'open'` — sub-domain 10's reminder; `(contact_id) WHERE contact_id IS NOT NULL`.
RLS: organization policy, enabled and forced. Branch: none — the organization's (B4).

#### 8.D.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `payment:read` | Payments · View | invoices, credit notes, payments and their changes, pending credits, day closes | 21, 23 | Owner, Admin, Front desk, Counsellor, Accountant |
| `payment:create` | Payments · Create | bill (with "Paid now"), receive and pay, refund with a credit note, add and settle pending credits | 22, 27 | Owner, Admin, Front desk, Counsellor, Accountant |
| `payment:update` | Payments · Edit | change invoices, open-day payments and pending credits; open and close the day; a patient offering's sessions or validity (7) | 24 | Owner, Admin, Front desk, Accountant |
| `payment:delete` | Payments · Delete | delete or restore unpaid invoices, open-day payments, unsettled pending credits; reverse a settled payment; reopen a closed day | 25, 26 | Owner, Admin |

The codes as a whole, with their notes: 8.4.

#### 8.D.5 Common to every route

As 8.5.

#### 8.D.6 Objects returned

**Pending credit**: `id` (`pcr_…`), `pending_credit_number`, `direction`, `contact` (summary or null), `party_name`, `amount`, `settled_amount`, `left_amount`, `status`, `reason`, `note`, `invoice_id`, `source_payment_id`, `settle_by`, `payment_ids` (its settlements), `created_at`, `updated_at`.

#### 8.D.7 Routes (21–27)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 21 | GET | `/pending-credits` | List pending credits | `payment:read` | |
| 22 | POST | `/pending-credits` | Add one — give or take | `payment:create` | req |
| 23 | GET | `/pending-credits/{pending_credit_id}` | Get one | `payment:read` | |
| 24 | PATCH | `/pending-credits/{pending_credit_id}` | Change it, while nothing is settled | `payment:update` | |
| 25 | DELETE | `/pending-credits/{pending_credit_id}` | Delete it, while nothing is settled | `payment:delete` | |
| 26 | POST | `/pending-credits/{pending_credit_id}/restore` | Undo | `payment:delete` | req |
| 27 | POST | `/pending-credits/{pending_credit_id}/settle` | Give back, get back, or use on a bill **(new)** | `payment:create` | req |

#### 8.D.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 21 | `q` (party, `CR-2`), `direction`, `status` (several), `contact_id`, `invoice_id`, `settle_by_from` / `settle_by_to`, `sort` = `created_at` (default, newest first) \| `settle_by`, `order`, `limit`, `after` | — | Pending credit[] |
| 22 | — | `direction*`, `amount*`, `reason*`, and `contact_id` or `party_name*`; optional: `invoice_id`, `source_payment_id`, `settle_by`, `note` | Pending credit |
| 23, 26 | — | — | Pending credit |
| 24 | — | any field of 22; `expected_updated_at` | Pending credit |
| 25 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |
| 27 | — | `amount*` (up to what is left), `method*` (`money` · `use_on_bill`); for `money`: `branch_id*`, `splits*` (cash, UPI, card), optional `paid_at`; for `use_on_bill`: `invoice_id*` (the party's, with a due) | Pending credit |

#### 8.D.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 22, 24 | `400` · `party_name` | neither a contact nor a name |
| 24, 25 | `409` · `credit_settled` | part of it is settled |
| 27 | `400` · `amount` | more than is left |
| 27 | `400` · `method` | `use_on_bill` for a `take` |
| 27 | `409` · `nothing_due` | the invoice is not the party's, or has nothing due (design: "Nothing due for <name> to adjust against") |
| 27 | `409` · `credit_closed` | it is settled in full |
| 27 | `409` · `day_closed` | `paid_at` falls on a closed day |
| 26 | `409` · `record_not_deleted` | it is live |
| 23–27 | `404` | not in the organization |

#### 8.D.10 Rules worth knowing

None beyond 8.10.

#### 8.D.11 Code changes

| # | Change |
| --- | --- |
| BC20 | B23: `contact_id`, `invoice_id`, `settle_by`, `note`; drop `party_kind`, `patient_id`, `settled_payment_id` and the duplicate amount check; the status `CHECK` |
| BC21 | B24: route 27 with its three settlements; `settled_amount` kept with each; change and delete only while nothing is settled |

---

### 8.E Day closes — `billing/day-closes/` — final

#### 8.E.1 Decisions

| # | Decision |
| --- | --- |
| B25 | **One row per branch and day**, opened from the drawer screen's gate: `POST /day-closes` with the opening cash — carried from the branch's last close (default; 0 for the first) or recounted (the design's "Recount"; `default_float` goes, as no float is configured anywhere). `/close` with the counted cash stores the expected cash = opening + cash received − cash paid that day (live entries), the difference (generated) and a reason whenever it isn't zero (the route's description promises it; today unchecked), and locks the day (B6). `/reopen` with a reason needs `payment:delete`; the next close recomputes. No change or delete of a day close (as today) — its soft-delete columns go. |
| B26 | **Auto close**: a worker closes each branch-day still open at the end of the following day (design: "auto-closes in N h", "close themselves at midnight") with the counted cash taken as expected (`close_kind = auto`), creating the row when money moved but nobody opened the day. Pull-based, one job per organization, under the queue rules. |
| B27 | **What happened**: `app.day_close_events` (opened, recounted, closed, auto-closed, reopened — who, when, the reason) is written by each step and returned inside the day close (today the table exists and nothing writes it). The day close also carries the live figures — cash in and out, expected cash, net by mode, totals per member. The admin's WhatsApp summary belongs to the messaging worker (4) — later. |

#### 8.E.2 Open questions

None.

#### 8.E.3 Tables and relations

`app.day_closes` (no soft-delete columns — B25)

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `branch_id` | `bigint` | no | | → branches `ON DELETE RESTRICT` |
| `close_date` | `date` | no | | unique `(organization_id, branch_id, close_date)`; not in the future |
| `status` | `varchar(6)` | no | `'open'` | `open` · `closed` |
| `opening_cash` | `numeric(12,2)` | no | | `≥ 0` |
| `opening_source` | `varchar(9)` | no | `'carried'` | `carried` · `recounted` |
| `opening_accepted_at` | `timestamptz` | no | `now()` | |
| `opening_accepted_by_membership_id` | `bigint` | yes | | → memberships `ON DELETE RESTRICT` (K2) |
| `expected_cash`, `counted_cash` | `numeric(12,2)` | yes | | set at close; `counted_cash ≥ 0` |
| `difference` | `numeric(12,2)` | | generated | `counted_cash − expected_cash`, stored |
| `difference_reason` | `varchar(280)` | yes | | required when `difference <> 0` |
| `close_kind` | `varchar(6)` | yes | | `manual` · `auto` |
| `closed_at` | `timestamptz` | yes | | |
| `closed_by_membership_id` | `bigint` | yes | | → memberships `ON DELETE RESTRICT` (K2) |

`CHECK`: `status = 'closed'` exactly when `closed_at`, `expected_cash`, `counted_cash` and `close_kind` are set. Indexes: unique `public_id`; unique `(organization_id, branch_id, close_date)`; `(organization_id, close_date DESC, id)`; `(organization_id, close_date) WHERE status = 'open'` — the worker.
RLS: organization policy, enabled and forced. Branch: application filter on `branch_id`.

`app.day_close_events` (append-only): `day_close_id` → day_closes `ON DELETE CASCADE`, `kind varchar(11)` (`opened` · `recounted` · `closed` · `auto_closed` · `reopened`), `text varchar(280)`, `membership_id` → memberships `ON DELETE RESTRICT` (K2), `occurred_at timestamptz` default `now()`. Index `(day_close_id, occurred_at)`. RLS: organization policy, enabled and forced.

#### 8.E.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `payment:read` | Payments · View | invoices, credit notes, payments and their changes, pending credits, day closes | 28, 30 | Owner, Admin, Front desk, Counsellor, Accountant |
| `payment:update` | Payments · Edit | change invoices, open-day payments and pending credits; open and close the day; a patient offering's sessions or validity (7) | 29, 31 | Owner, Admin, Front desk, Accountant |
| `payment:delete` | Payments · Delete | delete or restore unpaid invoices, open-day payments, unsettled pending credits; reverse a settled payment; reopen a closed day | 32 | Owner, Admin |

The codes as a whole, with their notes: 8.4.

#### 8.E.5 Common to every route

As 8.5.

#### 8.E.6 Objects returned

**Day close**: `id` (`dcl_…`), `branch_id`, `close_date`, `status`, `opening_cash`, `opening_source`, `opening_accepted_at`, `opening_accepted_by_membership_id`, `cash_in`, `cash_out`, `expected_cash` (live while open), `counted_cash`, `difference`, `difference_reason`, `close_kind`, `closed_at`, `closed_by_membership_id`, `net_by_mode` (`{ cash, upi, card, credit }`), `by_member` (`[{ membership_id, count, amount }]`), `entry_count`, `events` (Day close event[]), `created_at`, `updated_at`.

**Day close event**: `id` (`dce_…`), `kind`, `text`, `membership_id`, `occurred_at`.

#### 8.E.7 Routes (28–32)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 28 | GET | `/day-closes` | Past and open days | `payment:read` | |
| 29 | POST | `/day-closes` | Open the day — accept or recount the opening cash | `payment:update` | req |
| 30 | GET | `/day-closes/{day_close_id}` | A day, with its live figures and events | `payment:read` | |
| 31 | POST | `/day-closes/{day_close_id}/close` | Count and close — locks the day | `payment:update` | req |
| 32 | POST | `/day-closes/{day_close_id}/reopen` | Reopen a closed day | `payment:delete` | req |

#### 8.E.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 28 | `branch_id` (several), `status`, `close_date_from` / `close_date_to` (inclusive), `sort` = `close_date` (default, newest first) \| `created_at`, `order`, `limit`, `after` | — | Day close[] |
| 29 | — | `branch_id*` (one of yours); optional: `close_date` (default today; up to 120 days back), `opening_source` (default `carried`), `opening_cash` (required when `recounted`) | Day close |
| 30 | — | — | Day close |
| 31 | — | `counted_cash*`; `difference_reason` (required when the count differs) | Day close |
| 32 | — | `reason*` (1–280) | Day close |

#### 8.E.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 29 | `409` · `record_already_exists` | that branch's day is already open or closed |
| 29 | `400` · `close_date` | in the future, or more than 120 days back |
| 29 | `400` · `opening_cash` | missing for a recount |
| 31 | `400` · `difference_reason` | the count differs and no reason is given |
| 31, 32 | `409` · `transition_not_allowed` | already closed (31), or open (32) |
| 30–32 | `404` | not in the organization, or another branch without `branch:read` |

#### 8.E.10 Rules worth knowing

None beyond 8.10.

#### 8.E.11 Code changes

| # | Change |
| --- | --- |
| BC22 | B25: `opening_source` `carried` / `recounted` with the carried default; who accepted; `expected_cash` and the generated `difference` at close; the reason check; reopen with `payment:delete` and a reason; drop the soft-delete columns and the unused update DTO |
| BC23 | B26: the auto-close worker (`billing/day-closes/workers/`), its repeatable job in the scheduler, tests per the queue rules |
| BC24 | B27: write `app.day_close_events` at each step (the repository is never instantiated today); the live figures and `events` in the serializer |

---

## 9. Stock — final (rev 2, confirmed 2026-10-08) — nested sub-domains 9.A–9.E

*Was sub-domain 12 before the restructure (2026-10-08) — layout only, no decision changed.*

Code: the **`stock` sub-domain folder** — `src/domains/app/sub-domains/stock/` (only `stock.routes.ts` and `stock.container.ts` at the root, like `billing/`) with `stock-items/`, `stock-item-movements/`, `stock-counts/`, `stock-purchases/`, `stock-vendors/`.

9.1 Decisions (whole sub-domain) · 9.2 Open questions · 9.3 Tables and relations · 9.4 Permissions · 9.5 Common to every route ·
9.6 Objects returned · 9.7 Routes · 9.8 Request details · 9.9 Errors · 9.10 Rules worth knowing · 9.11 Code changes (whole sub-domain) ·
9.12 Nested sub-domains · then **9.A Stock items · 9.B Stock item movements · 9.C Stock counts · 9.D Stock purchases · 9.E Stock vendors** — each with the same eleven sections: .1 Decisions ·
.2 Open questions · .3 Tables and relations · .4 Permissions · .5 Common to every route · .6 Objects returned · .7 Routes ·
.8 Request details · .9 Errors · .10 Rules worth knowing · .11 Code changes

The consumables and equipment the clinic uses in procedures and never sells (`clinic-stock.md`) — kept apart from the
medical store (11): their own items, vendors and purchases. Launch row #71 is **not built**: today these are plain
records — nothing moves an item's quantity (it stays 0), counts and purchases write no movements, and paying a purchase is
an editable number. Route numbers run 1–28. Design: `clinic-stock.md`, `payments.md` (paying a purchase), `schema-routes.md`
(StockItem, StockMovement, StockCount, StockPurchase, StockVendor).

### 9.1 Decisions (whole sub-domain)

Taken on your standing answer "go with the recommendation" — confirmed 2026-10-08. A decision that belongs to one table is in its nested sub-domain.

| # | Decision |
| --- | --- |
| S1 | **Folder and names**: the sub-domain folder `stock/` (routes and container only, like `billing/`); five nested sub-domains named after their tables (P22). An item's movements are its own — `app.stock_movements` → **`app.stock_item_movements`** (children carry the parent prefix, as `branch_rooms`), nested under `/stock-items/{stock_item_id}/movements`, with the organization-wide list at `/stock-item-movements` (the Movements tab). Count and purchase lines become rows — `app.stock_count_lines`, `app.stock_purchase_items` (no routes of their own, K1) — instead of unchecked jsonb. Public-id prefixes stay (`sitm_`, `smov_`, `scnt_`, `spur_`, `svnd_`). |
| S2 | **One code set, in the Clinic stock row**: `stock_item:read` · `create` · `update` · `delete` · `export` — items, movements, counts, purchases and vendors; `stock_vendor:*`, `stock_purchase:*` and `list:export` (here) go. Using, receiving, adjusting and reverting stock and counting are `stock_item:update`. Holders follow today's presets plus the design's Pharmacist: Owner and Admin everything; Therapist, Front desk and Pharmacist read, create and update (they use stock in procedures — PRD "clinic stock usage"); Accountant read and export. |
| S3 | **Organization-wide** — no stock record has a branch (design: "See every branch" does not apply). Other option: stock per branch (`branch_id` on movements and a per-branch balance) — later, if clinics keep separate cupboards. |
| S4 | **Quantities are exact decimals**: `numeric(12,3)` columns and plain numbers in the API (`quantity: 2.5`), instead of the design's `*_milli` integers (an engineering workaround PostgreSQL does not need). Other option: keep the `_milli` integers. |
| S5 | **The ledger and the balance**: every change is one movement row (design: "every change is one row"); the item's `quantity` is the balance, written in the same transaction by one guarded `UPDATE … SET quantity = quantity + $change WHERE quantity + $change >= 0` — below zero → `409 not_enough_stock` (design: "Only 3 tube · 90 g in stock"). Movements are never changed or deleted; a wrong one is reverted (S8). |

### 9.2 Open questions

None — every decision follows the recommendation.

### 9.3 Tables and relations

| Table | Holds | Key rules |
| --- | --- | --- |
| `app.stock_items` | one consumable or piece of equipment, and how much is left | `quantity` moves only with a movement (S5); deleted only at zero (S6) |
| `app.stock_item_movements` | every change to an item's quantity | append-only; the sign follows the type; reverted, never deleted (S7, S8) |
| `app.stock_counts` | one stock check | never changed or deleted; writes `adjust` movements (S9) |
| `app.stock_count_lines` | what was counted for one item | key (`stock_count_id`, `stock_item_id`) |
| `app.stock_purchases` | one vendor bill: what arrived, what is owed | lines fixed once saved; paid through payments (S10, S11) |
| `app.stock_purchase_items` | one line of a purchase | writes a `received` movement |
| `app.stock_vendors` | who the clinic buys consumables from | never shared with the medical store's suppliers |

```text
tenancy.organizations
   │
   ├──< app.stock_items ──┬──> app.stock_vendors                                                                           9.A  — quantity = the last movement's balance
   │                      └──< app.stock_item_movements ──┬──> app.patient_treatments (7) · tenancy.memberships (by)       9.B  — every change is one row
   │                                                      └──> app.stock_purchases · app.stock_counts · itself (reverts)   what made the change
   ├──< app.stock_counts ──< app.stock_count_lines >── app.stock_items                                                     9.C  — a stock check
   ├──< app.stock_purchases ──┬──> app.stock_vendors                                                                       9.D  — a vendor bill
   │                          ├──< app.stock_purchase_items >── app.stock_items                                            its lines — each a received movement
   │                          └──< app.payments (8, supplier bills)                                                       what was paid
   └──< app.stock_vendors                                                                                                  9.E  — never the medical store's suppliers

A ──< B   one A has many B     A >── B   many A for one B     A ──> B   a column on A points at one B     A ─── B   at most one B per A
```

Pointing at these from other sub-domains: `payments.stock_purchase_id` (8 — the typed link sub-domain 8 left for supplier bills, S11).

**PostgreSQL design**

Standard columns on every record table (not repeated below): `id bigint` (identity), `public_id varchar(28)` unique, `organization_id bigint` → organizations `ON DELETE CASCADE`, `created_at` / `updated_at timestamptz`, `created_by_user_id` / `updated_by_user_id`, and — where it soft-deletes — `deleted_at`, `delete_reason`, `delete_note` with their three checks; RLS enabled and forced. Quantities are `numeric(12,3)`, money `numeric(12,2)`. RLS: organization policy, enabled and forced, on every table, link and line tables included; no branch rule (S3). Each table's design is in its nested sub-domain.

### 9.4 Permissions

One code set (S2), in the **Clinic stock** row of the Roles matrix; each nested sub-domain's routes repeat the gate.

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `stock_item:read` | Clinic stock · View | items, movements, counts, purchases, vendors | 1, 4, 8, 9, 11, 13, 15, 16, 19, 23, 25 | Owner, Admin, Therapist, Front desk, Pharmacist, Accountant |
| `stock_item:create` | Clinic stock · Create | add an item, a purchase (it receives its lines), a vendor | 3, 18, 24 | Owner, Admin, Therapist, Front desk, Pharmacist |
| `stock_item:update` | Clinic stock · Edit | use, receive, damage, return, adjust and revert stock; count; change an item, a purchase, a vendor | 5, 10, 12, 14, 20, 26 | Owner, Admin, Therapist, Front desk, Pharmacist |
| `stock_item:delete` | Clinic stock · Delete | delete or restore an item, an unpaid purchase, a vendor | 6, 7, 21, 22, 27, 28 | Owner, Admin |
| `stock_item:export` | Clinic stock · Export | the items and purchases CSVs | 2, 17 | Owner, Admin, Accountant |

Paying a purchase is a payment — `payment:create` (sub-domain 8).

### 9.5 Common to every route

| Item | Value |
| --- | --- |
| Base | `/api/v1/app` |
| Auth | `Authorization: Bearer <access token>`; the active organization comes from the token |
| Writes | every `POST` needs `X-Idempotency-Key`; `PATCH` takes an optional `expected_updated_at` (a stale save → `409 record_changed`) |
| Success | `200` with `{ data, meta }`; lists `{ data: [...], meta: { pagination: { per_page, next, has_more, estimated_total } } }` (`estimated_total` on the first page, up to 10,000); `DELETE` → `204` |
| Lists | `limit` (1–100, default 25), `after`, `q` (1–200), `sort`, `order`, `created_from` / `created_to` (`to` exclusive) |
| Errors | `{ error: { type, code, reason?, detail, errors[] } }` — `400 invalid_field`, `401`, `403`, `404`, `409`, `422` idempotency key missing or reused |

### 9.6 Objects returned

Each nested sub-domain lists its own objects (9.A to 9.E, section .6):

| Object | Where |
| --- | --- |
| Stock item · Stock items export | 9.A.6 — Stock items |
| Stock item movement | 9.B.6 — Stock item movements |
| Stock count | 9.C.6 — Stock counts |
| Stock purchase · Stock purchases export | 9.D.6 — Stock purchases |
| Stock vendor | 9.E.6 — Stock vendors |

### 9.7 Routes

Every route of the sub-domain in one table; each nested sub-domain repeats its own with the details.

| # | Method | Path | Purpose | Gate | Idem | Nested sub-domain |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | GET | `/stock-items` | The Items tab | `stock_item:read` | | 9.A Stock items |
| 2 | GET | `/stock-items/exports` | The items CSV | `stock_item:export` | | 9.A Stock items |
| 3 | POST | `/stock-items` | Add an item, with its opening quantity | `stock_item:create` | req | 9.A Stock items |
| 4 | GET | `/stock-items/{stock_item_id}` | Get an item | `stock_item:read` | | 9.A Stock items |
| 5 | PATCH | `/stock-items/{stock_item_id}` | Change an item (not its quantity) | `stock_item:update` | | 9.A Stock items |
| 6 | DELETE | `/stock-items/{stock_item_id}` | Delete an item at zero | `stock_item:delete` | | 9.A Stock items |
| 7 | POST | `/stock-items/{stock_item_id}/restore` | Undo | `stock_item:delete` | req | 9.A Stock items |
| 8 | GET | `/stock-item-movements` | Every movement — the Movements tab **(renamed)** | `stock_item:read` | | 9.B Stock item movements |
| 9 | GET | `/stock-items/{stock_item_id}/movements` | An item's history | `stock_item:read` | | 9.B Stock item movements |
| 10 | POST | `/stock-items/{stock_item_id}/movements` | Use, receive, damage, return or adjust **(moved)** | `stock_item:update` | req | 9.B Stock item movements |
| 11 | GET | `/stock-items/{stock_item_id}/movements/{stock_item_movement_id}` | Get one **(moved)** | `stock_item:read` | | 9.B Stock item movements |
| 12 | POST | `/stock-items/{stock_item_id}/movements/{stock_item_movement_id}/revert` | Revert it with a reason **(new)** | `stock_item:update` | req | 9.B Stock item movements |
| 13 | GET | `/stock-counts` | Past stock checks | `stock_item:read` | | 9.C Stock counts |
| 14 | POST | `/stock-counts` | Save a stock check — adjusts what differs | `stock_item:update` | req | 9.C Stock counts |
| 15 | GET | `/stock-counts/{stock_count_id}` | Get one | `stock_item:read` | | 9.C Stock counts |
| 16 | GET | `/stock-purchases` | The Purchases tab | `stock_item:read` | | 9.D Stock purchases |
| 17 | GET | `/stock-purchases/exports` | The purchases CSV | `stock_item:export` | | 9.D Stock purchases |
| 18 | POST | `/stock-purchases` | Record a purchase — receives its lines, optionally pays | `stock_item:create` | req | 9.D Stock purchases |
| 19 | GET | `/stock-purchases/{stock_purchase_id}` | Get one | `stock_item:read` | | 9.D Stock purchases |
| 20 | PATCH | `/stock-purchases/{stock_purchase_id}` | Change the bill details | `stock_item:update` | | 9.D Stock purchases |
| 21 | DELETE | `/stock-purchases/{stock_purchase_id}` | Delete an unpaid purchase | `stock_item:delete` | | 9.D Stock purchases |
| 22 | POST | `/stock-purchases/{stock_purchase_id}/restore` | Undo | `stock_item:delete` | req | 9.D Stock purchases |
| 23 | GET | `/stock-vendors` | The vendor picker | `stock_item:read` | | 9.E Stock vendors |
| 24 | POST | `/stock-vendors` | Add a vendor | `stock_item:create` | req | 9.E Stock vendors |
| 25 | GET | `/stock-vendors/{stock_vendor_id}` | Get one | `stock_item:read` | | 9.E Stock vendors |
| 26 | PATCH | `/stock-vendors/{stock_vendor_id}` | Change one | `stock_item:update` | | 9.E Stock vendors |
| 27 | DELETE | `/stock-vendors/{stock_vendor_id}` | Delete one with nothing owed | `stock_item:delete` | | 9.E Stock vendors |
| 28 | POST | `/stock-vendors/{stock_vendor_id}/restore` | Undo | `stock_item:delete` | req | 9.E Stock vendors |

### 9.8 Request details

In each nested sub-domain (9.A to 9.E, section .8).

### 9.9 Errors

Every route can answer the errors in 9.5; each route's own errors are in its nested sub-domain (9.A to 9.E, section .9).

### 9.10 Rules worth knowing

- "Use" (the popover), "Receive stock", "Log usage", "Damaged", "Returned" and "Adjust count" are all one route — a movement on the item (route 10); "Undo" on the toast is a revert (route 12), so both rows stay in the history.
- "⚡ Reorder low items" fills a purchase from `GET /stock-items?stock_level=low`, each at maximum − quantity.
- Low stock shows in the list (`stock_level`, `lasts_days`); no task is raised for it — the design has none.
- The Items and Purchases lists can be saved as views (sub-domain 2 — `stock_items`, `stock_purchases`).

### 9.11 Code changes (whole sub-domain)

| # | Change |
| --- | --- |
| SC1 | S1: move the five folders into `app/sub-domains/stock/` with `stock.routes.ts` / `stock.container.ts`; rename `app.stock_movements` → `app.stock_item_movements` (init migration, schemas, indexes, constraints, RLS, the FORCE-RLS and purge lists); new `app.stock_count_lines` and `app.stock_purchase_items` replacing the jsonb `lines`; the routes and path ids |
| SC2 | S2: codes `stock_item:read\|create\|update\|delete\|export` (app permissions, catalog seed, presets — Pharmacist added, the Clinic stock row with Export); drop `stock_vendor:*`, `stock_purchase:*` and `list:export` here |
| SC3 | S4: `*_milli` integers → `numeric(12,3)` columns and decimal fields in DTOs and serializers |
| SC4 | S5: the guarded balance update in the movement service, used by every writer (items, movements, counts, purchases) |

### 9.12 Nested sub-domains

| Nested sub-domain | Folder (`src/domains/app/sub-domains/stock/…`) | Tables | Routes | Status |
| --- | --- | --- | --- | --- |
| 9.A Stock items | `stock-items/` | `app.stock_items` | 1–7 | final |
| 9.B Stock item movements | `stock-item-movements/` | `app.stock_item_movements` | 8–12 | final |
| 9.C Stock counts | `stock-counts/` | `app.stock_counts`, `app.stock_count_lines` | 13–15 | final |
| 9.D Stock purchases | `stock-purchases/` | `app.stock_purchases`, `app.stock_purchase_items` | 16–22 | final |
| 9.E Stock vendors | `stock-vendors/` | `app.stock_vendors` | 23–28 | final |

---

### 9.A Stock items — `stock/stock-items/` — final

#### 9.A.1 Decisions

| # | Decision |
| --- | --- |
| S6 | Fields as designed — name, category (6), unit (15), contents per unit with its measure (both or neither), minimum, maximum (≥ minimum), usage per week, vendor — with DTO checks for what the database checks (today min above max, a size of 0 or a size without its measure are `500`s). The **opening quantity** on create writes an `opening` movement (the design's "In stock" — today it would bypass the ledger); afterwards the quantity changes only through a movement or a count, never a `PATCH`. `last_rate` comes from the latest purchase line. Derived: `stock_level` `ok` · `low` (≤ minimum) · `out` (0), `lasts_days` = quantity ÷ usage per week × 7 (none without usage). The name is unique (any case). Delete only at zero (`409 item_has_stock` — write it off first). |

#### 9.A.2 Open questions

None.

#### 9.A.3 Tables and relations

`app.stock_items`

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `stock_item_number` | `integer` | no | counter | `> 0` — "#167" |
| `name` | `varchar(120)` | no | | unique `(organization_id, lower(name))` among live items |
| `category` | `varchar(13)` | no | `'consumables'` | `creams_serums` · `peels` · `masks` · `consumables` · `equipment` · `other` |
| `unit` | `varchar(7)` | no | `'piece'` | the 15 units |
| `size_per_unit` | `numeric(12,3)` | yes | | `> 0` — "1 tube = 30 g" |
| `measure_unit` | `varchar(5)` | yes | | `ml` · `g` · `pcs` · `units`; `(size_per_unit IS NULL) = (measure_unit IS NULL)` |
| `quantity` | `numeric(12,3)` | no | `0` | `≥ 0`; written only with a movement (S5) |
| `min_quantity` | `numeric(12,3)` | no | `1` | `≥ 0` |
| `max_quantity` | `numeric(12,3)` | no | `10` | `≥ min_quantity` |
| `usage_per_week` | `numeric(12,3)` | no | `0` | `≥ 0` |
| `stock_vendor_id` | `bigint` | yes | | → stock_vendors `ON DELETE SET NULL` |
| `last_rate` | `numeric(12,2)` | yes | | `≥ 0`; from the latest purchase line |

Indexes: unique `public_id`; unique `(organization_id, stock_item_number)`; `WHERE deleted_at IS NULL`: unique `(organization_id, lower(name))`, `(organization_id, name, id)`, `(organization_id, category, name)`, `(organization_id) WHERE quantity <= min_quantity` — the low list; `(stock_vendor_id) WHERE stock_vendor_id IS NOT NULL`.
RLS: organization policy, enabled and forced. Branch: none (S3).

#### 9.A.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `stock_item:read` | Clinic stock · View | items, movements, counts, purchases, vendors | 1, 4 | Owner, Admin, Therapist, Front desk, Pharmacist, Accountant |
| `stock_item:create` | Clinic stock · Create | add an item, a purchase (it receives its lines), a vendor | 3 | Owner, Admin, Therapist, Front desk, Pharmacist |
| `stock_item:update` | Clinic stock · Edit | use, receive, damage, return, adjust and revert stock; count; change an item, a purchase, a vendor | 5 | Owner, Admin, Therapist, Front desk, Pharmacist |
| `stock_item:delete` | Clinic stock · Delete | delete or restore an item, an unpaid purchase, a vendor | 6, 7 | Owner, Admin |
| `stock_item:export` | Clinic stock · Export | the items and purchases CSVs | 2 | Owner, Admin, Accountant |

The codes as a whole, with their notes: 9.4.

#### 9.A.5 Common to every route

As 9.5.

#### 9.A.6 Objects returned

**Stock item**: `id` (`sitm_…`), `stock_item_number`, `name`, `category`, `unit`, `size_per_unit`, `measure_unit`, `quantity`, `min_quantity`, `max_quantity`, `usage_per_week`, `stock_vendor_id`, `last_rate`, `stock_level` (`ok` · `low` · `out`), `lasts_days` (or null), `created_at`, `updated_at`.

**Stock items export** (route 2): `file_name` (`stock-items-YYYY-MM-DD.csv`), `content_type`, `row_count` (up to 5,000), `is_truncated`, `content` — as the offerings export (3.B.6).

#### 9.A.7 Routes (1–7)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | `/stock-items` | The Items tab | `stock_item:read` | |
| 2 | GET | `/stock-items/exports` | The items CSV | `stock_item:export` | |
| 3 | POST | `/stock-items` | Add an item, with its opening quantity | `stock_item:create` | req |
| 4 | GET | `/stock-items/{stock_item_id}` | Get an item | `stock_item:read` | |
| 5 | PATCH | `/stock-items/{stock_item_id}` | Change an item (not its quantity) | `stock_item:update` | |
| 6 | DELETE | `/stock-items/{stock_item_id}` | Delete an item at zero | `stock_item:delete` | |
| 7 | POST | `/stock-items/{stock_item_id}/restore` | Undo | `stock_item:delete` | req |

#### 9.A.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 1 | `q` (name, `#167`), `category` (several), `stock_level` (several), `stock_vendor_id`, `sort` = `name` (default) \| `stock_item_number` \| `category` \| `quantity` \| `lasts_days` \| `created_at`, `order`, `limit`, `after` | — | Stock item[] |
| 2 | as 1, without paging | — | Stock items export |
| 3 | — | `name*`; optional: `category`, `unit`, `size_per_unit` + `measure_unit`, `min_quantity`, `max_quantity`, `usage_per_week`, `stock_vendor_id`, `opening_quantity` (≥ 0) | Stock item |
| 4, 7 | — | — | Stock item |
| 5 | — | any field of 3 but `opening_quantity`; `expected_updated_at` | Stock item |
| 6 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |

#### 9.A.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 3, 5 | `409` · `record_already_exists` | the name is taken |
| 3, 5 | `400` · `max_quantity` / `size_per_unit` / `measure_unit` | maximum below minimum; a size of 0; a size without its measure, or the reverse |
| 6 | `409` · `item_has_stock` | the quantity is not zero |
| 7 | `409` · `record_not_deleted` / `record_restore_conflict` | it is live, or its name was reused |
| 4–7 | `404` | not in the organization |

#### 9.A.10 Rules worth knowing

None beyond 9.10.

#### 9.A.11 Code changes

| # | Change |
| --- | --- |
| SC5 | S6: DTO checks for the three `CHECK`s; `opening_quantity` writing an `opening` movement; `quantity` and `last_rate` never in a `PATCH`; unique name; delete at zero; `stock_level`, `lasts_days`; the `stock_level` filter and the sorts; `export` gated by `stock_item:export` |

---

### 9.B Stock item movements — `stock/stock-item-movements/` — final

#### 9.B.1 Decisions

| # | Decision |
| --- | --- |
| S7 | **Types and signs**: `opening` (+, the item's first quantity), `received` (+, a purchase line or by hand), `used` (−, a procedure — "Used for" up to 80, optional treatment session, S14), `damaged` (−), `returned` (−, back to the vendor), `adjust` (±, a count or "Adjust count" — sent as the counted quantity, the server writes the difference), `reverted` (the opposite of what it undoes); a `CHECK` ties the sign to the type (today any sign, and 0 is a `500`). By hand (route 10): `used`, `received`, `damaged`, `returned`, `adjust`. `note` up to 280 (the design's Remark, "Stock check"); `author_membership_id` = the caller (the design's "By", K2); `quantity_after` keeps the balance each row left (the history reads without summing). |
| S8 | **Revert** (route 12) with a reason — `mistake` · `wrong_item` · `wrong_quantity` · `other` (note required) — writes a `reverted` movement pointing at the original, once (unique), never on a revert itself; refused when it would take the quantity below zero. The toast's "Undo" is a revert (the design says it removes the movement — the history keeps both instead). |
| S14 | **A use names its session, not the patient** (your call): `used` may carry `patient_treatment_id` — the treatment (7) the stock went into; the patient, the offering and the visit come through it, so no stock table has a `patient_id` (the design's `patientId` on `useStock` goes). Only on `used`; the treatment must be in the organization and not reversed (`400`). Reversing the treatment leaves its stock alone — what was used was used; a wrong use is reverted (S8). The lists filter by `patient_treatment_id` (a session's stock). Other options: `appointment_id` (the visit — coarser), or `offering_id` (the kind of procedure, no session). |

#### 9.B.2 Open questions

None.

#### 9.B.3 Tables and relations

`app.stock_item_movements` (append-only — no `updated_*` or soft-delete columns)

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `stock_item_id` | `bigint` | no | | → stock_items `ON DELETE RESTRICT` |
| `type` | `varchar(8)` | no | | the 7 types |
| `quantity_change` | `numeric(12,3)` | no | | `≠ 0`; `> 0` for `opening` / `received`, `< 0` for `used` / `damaged` / `returned` |
| `quantity_after` | `numeric(12,3)` | no | | `≥ 0` — the balance after this row |
| `used_for` | `varchar(80)` | yes | | `used` only |
| `note` | `varchar(280)` | yes | | |
| `patient_treatment_id` | `bigint` | yes | | → patient_treatments `ON DELETE RESTRICT` (7); only `used` (S14) |
| `stock_purchase_id` | `bigint` | yes | | → stock_purchases `ON DELETE RESTRICT`; only `received` / `reverted` |
| `stock_count_id` | `bigint` | yes | | → stock_counts `ON DELETE RESTRICT`; only `adjust` |
| `reverts_stock_item_movement_id` | `bigint` | yes | | → itself `ON DELETE RESTRICT`; unique; `(type = 'reverted') = (reverts_stock_item_movement_id IS NOT NULL)` |
| `revert_reason` | `varchar(14)` | yes | | the 4 reasons; set exactly on `reverted` |
| `author_membership_id` | `bigint` | yes | | → memberships `ON DELETE RESTRICT` (K2) |

Dropped: `reverted_by_stock_movement_id` (the unique link answers it), `delta_milli`, `patient_id` (S14). Indexes: unique `public_id`; `(stock_item_id, created_at DESC, id)` — an item's history; `(organization_id, created_at DESC, id)` — the Movements tab; `WHERE … IS NOT NULL`: `(stock_purchase_id)`, `(stock_count_id)`, `(patient_treatment_id)`, unique `(reverts_stock_item_movement_id)`.
RLS: organization policy, enabled and forced. Branch: none.

#### 9.B.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `stock_item:read` | Clinic stock · View | items, movements, counts, purchases, vendors | 8, 9, 11 | Owner, Admin, Therapist, Front desk, Pharmacist, Accountant |
| `stock_item:update` | Clinic stock · Edit | use, receive, damage, return, adjust and revert stock; count; change an item, a purchase, a vendor | 10, 12 | Owner, Admin, Therapist, Front desk, Pharmacist |

The codes as a whole, with their notes: 9.4.

#### 9.B.5 Common to every route

As 9.5.

#### 9.B.6 Objects returned

**Stock item movement**: `id` (`smov_…`), `stock_item_id`, `type`, `quantity_change`, `quantity_after`, `used_for`, `note`, `patient_treatment_id`, `stock_purchase_id`, `stock_count_id`, `reverts_stock_item_movement_id`, `reverted_by_stock_item_movement_id` (derived), `revert_reason`, `author_membership_id`, `created_at`.

#### 9.B.7 Routes (8–12)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 8 | GET | `/stock-item-movements` | Every movement — the Movements tab **(renamed)** | `stock_item:read` | |
| 9 | GET | `/stock-items/{stock_item_id}/movements` | An item's history | `stock_item:read` | |
| 10 | POST | `/stock-items/{stock_item_id}/movements` | Use, receive, damage, return or adjust **(moved)** | `stock_item:update` | req |
| 11 | GET | `/stock-items/{stock_item_id}/movements/{stock_item_movement_id}` | Get one **(moved)** | `stock_item:read` | |
| 12 | POST | `/stock-items/{stock_item_id}/movements/{stock_item_movement_id}/revert` | Revert it with a reason **(new)** | `stock_item:update` | req |

#### 9.B.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 8 | `stock_item_id`, `type` (several), `patient_treatment_id`, `author_membership_id`, `created_from` / `created_to`, `sort` = `created_at` (default, newest first), `order`, `limit`, `after` | — | Stock item movement[] |
| 9 | as 8, without `stock_item_id` | — | Stock item movement[] |
| 10 | — | `type*` (`used` · `received` · `damaged` · `returned` · `adjust`); `quantity*` (> 0 — how much was used, received, damaged or returned; for `adjust` the counted quantity, ≥ 0); optional: `used_for` and `patient_treatment_id` (`used` only), `note` | Stock item movement |
| 11 | — | — | Stock item movement |
| 12 | — | `reason*`; `note` (required for `other`) | Stock item movement (the revert) |

#### 9.B.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 10, 12 | `409` · `not_enough_stock` | it would take the quantity below zero |
| 10 | `400` · `quantity` | 0 or below; an `adjust` equal to the quantity (nothing to change) |
| 10 | `400` · `used_for` | on a type other than `used` |
| 10 | `400` · `patient_treatment_id` | on a type other than `used`, not found, or reversed (S14) |
| 12 | `409` · `already_reverted` | it was reverted before, or is itself a revert |
| 9–12 | `404` | the item or movement is not in the organization, or the movement is another item's |

#### 9.B.10 Rules worth knowing

None beyond 9.10.

#### 9.B.11 Code changes

| # | Change |
| --- | --- |
| SC6 | S7: the sign `CHECK`s and the DTO's `quantity` per type (the server signs it); `adjust` from the counted quantity; `quantity_after`; `author_membership_id`; the nested routes; drop the dead update wiring |
| SC13 | S14: `patient_id` → `patient_treatment_id` (init migration, schema, index, DTO, filter, serializer) with the `used`-only check; the treatment checks |
| SC7 | S8: route 12 with the reasons and the unique revert link; drop `reverted_by_stock_movement_id` |

---

### 9.C Stock counts — `stock/stock-counts/` — final

#### 9.C.1 Decisions

| # | Decision |
| --- | --- |
| S9 | **A count records each counted item**: `app.stock_count_lines` (item, the system quantity at save — taken by the server, not sent — and the counted quantity); only differing lines write `adjust` movements (note "Stock check"); a count needs at least one difference (the design disables Save until then — `400`). A count is never changed or deleted — it moved stock; a wrong one is followed by another count or a revert. Today's `DELETE` and restore (gated by `stock_item:update`) go. |

#### 9.C.2 Open questions

None.

#### 9.C.3 Tables and relations

`app.stock_counts` (no `updated_*` or soft-delete columns): `counted_at timestamptz` default `now()`, `author_membership_id` → memberships `ON DELETE RESTRICT` (K2). Index `(organization_id, counted_at DESC, id)`.

`app.stock_count_lines` (no public id): `stock_count_id` → stock_counts `ON DELETE CASCADE`, `stock_item_id` → stock_items `ON DELETE RESTRICT`, `system_quantity`, `counted_quantity` `numeric(12,3)` `≥ 0`, `organization_id`; primary key `(stock_count_id, stock_item_id)`; index `(stock_item_id)`; up to 500 per count (app).
RLS: organization policy, enabled and forced, on both. Branch: none.

#### 9.C.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `stock_item:read` | Clinic stock · View | items, movements, counts, purchases, vendors | 13, 15 | Owner, Admin, Therapist, Front desk, Pharmacist, Accountant |
| `stock_item:update` | Clinic stock · Edit | use, receive, damage, return, adjust and revert stock; count; change an item, a purchase, a vendor | 14 | Owner, Admin, Therapist, Front desk, Pharmacist |

The codes as a whole, with their notes: 9.4.

#### 9.C.5 Common to every route

As 9.5.

#### 9.C.6 Objects returned

**Stock count**: `id` (`scnt_…`), `counted_at`, `author_membership_id`, `lines` (`[{ stock_item_id, system_quantity, counted_quantity, difference }]`), `changed_item_count`, `created_at`.

#### 9.C.7 Routes (13–15)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 13 | GET | `/stock-counts` | Past stock checks | `stock_item:read` | |
| 14 | POST | `/stock-counts` | Save a stock check — adjusts what differs | `stock_item:update` | req |
| 15 | GET | `/stock-counts/{stock_count_id}` | Get one | `stock_item:read` | |

#### 9.C.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 13 | `counted_from` / `counted_to`, `sort` = `counted_at` (default, newest first), `order`, `limit`, `after` | — | Stock count[] |
| 14 | — | `lines*` (1–500: `stock_item_id*`, `counted_quantity*` ≥ 0; each item once) | Stock count |
| 15 | — | — | Stock count |

#### 9.C.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 14 | `400` · `lines` | empty, over 500, an item twice, an unknown or deleted item, or nothing differs |
| 15 | `404` | not in the organization |

#### 9.C.10 Rules worth knowing

None beyond 9.10.

#### 9.C.11 Code changes

| # | Change |
| --- | --- |
| SC8 | S9: `app.stock_count_lines` replacing `lines` jsonb; the system quantity from the item; `adjust` movements for the differences; drop `DELETE` / restore and the soft-delete columns of `app.stock_counts`; `author_membership_id` |

---

### 9.D Stock purchases — `stock/stock-purchases/` — final

#### 9.D.1 Decisions

| # | Decision |
| --- | --- |
| S10 | **Lines are what arrived**: `app.stock_purchase_items` (item, quantity > 0, rate, amount) — each writes a `received` movement and sets the item's `last_rate`, in the same transaction; "Not in the list · add as typed" creates the item in the same call. Lines can't change once saved (`409 purchase_received`); vendor, bill number, date and bill amount can. `bill_amount` defaults to the lines' total and may be changed (design), never below what is paid. No stages (design). |
| S11 | **Paying is sub-domain 8's**: `paid_amount` is kept by supplier-bill payments that point at the purchase — `payments.stock_purchase_id`, `ON DELETE RESTRICT` (the typed link sub-domain 8 left for this sub-domain); the drawer's "Paid" records that payment in the same transaction (like an invoice's "Paid now"), category `consumables`; "Pay ₹1,710" opens Payments with the bill picked. `due_amount` and `payment_status` (`paid` · `partial` · `unpaid`) are generated columns, as on invoices. The vendor's payable = the open dues of its purchases. |
| S12 | **Delete only unpaid**: nothing paid (`409 purchase_paid`); deleting reverts its `received` movements (`409 not_enough_stock` when some was used since), restoring re-applies them. |

#### 9.D.2 Open questions

None.

#### 9.D.3 Tables and relations

`app.stock_purchases`

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `stock_purchase_number` | `integer` | no | counter | `> 0` — "#16" |
| `stock_vendor_id` | `bigint` | no | | → stock_vendors `ON DELETE RESTRICT` |
| `bill_number` | `varchar(30)` | yes | | the vendor's bill |
| `purchase_date` | `date` | no | | not in the future |
| `bill_amount` | `numeric(12,2)` | no | | `≥ 0`; defaults to the lines' total |
| `paid_amount` | `numeric(12,2)` | no | `0` | `0 ≤ paid_amount ≤ bill_amount`; kept by payments (S11) |
| `due_amount` | `numeric(12,2)` | | generated | `bill_amount − paid_amount`, stored |
| `payment_status` | `varchar(7)` | | generated | `paid` · `partial` · `unpaid`, stored |

`app.stock_purchase_items` (no public id): `stock_purchase_id` → stock_purchases `ON DELETE CASCADE`, `line_number smallint` (1–50), `stock_item_id` → stock_items `ON DELETE RESTRICT`, `quantity numeric(12,3)` `> 0`, `rate numeric(12,2)` `≥ 0`, `amount numeric(12,2)` (= quantity × rate, rounded), `organization_id`; primary key `(stock_purchase_id, line_number)`; index `(stock_item_id)`.

Indexes: unique `public_id`; unique `(organization_id, stock_purchase_number)`; `WHERE deleted_at IS NULL`: `(organization_id, purchase_date DESC, id)`, `(stock_vendor_id, purchase_date)`, `(organization_id, purchase_date) WHERE due_amount > 0` — what is owed.
RLS: organization policy, enabled and forced, on both. Branch: none.

#### 9.D.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `stock_item:read` | Clinic stock · View | items, movements, counts, purchases, vendors | 16, 19 | Owner, Admin, Therapist, Front desk, Pharmacist, Accountant |
| `stock_item:create` | Clinic stock · Create | add an item, a purchase (it receives its lines), a vendor | 18 | Owner, Admin, Therapist, Front desk, Pharmacist |
| `stock_item:update` | Clinic stock · Edit | use, receive, damage, return, adjust and revert stock; count; change an item, a purchase, a vendor | 20 | Owner, Admin, Therapist, Front desk, Pharmacist |
| `stock_item:delete` | Clinic stock · Delete | delete or restore an item, an unpaid purchase, a vendor | 21, 22 | Owner, Admin |
| `stock_item:export` | Clinic stock · Export | the items and purchases CSVs | 17 | Owner, Admin, Accountant |

The codes as a whole, with their notes: 9.4.

#### 9.D.5 Common to every route

As 9.5.

#### 9.D.6 Objects returned

**Stock purchase**: `id` (`spur_…`), `stock_purchase_number`, `stock_vendor_id`, `bill_number`, `purchase_date`, `items` (`[{ line_number, stock_item_id, quantity, rate, amount }]`), `bill_amount`, `paid_amount`, `due_amount`, `payment_status`, `payment_ids`, `created_at`, `updated_at`.

**Stock purchases export** (route 17): as the items export, `stock-purchases-YYYY-MM-DD.csv`.

#### 9.D.7 Routes (16–22)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 16 | GET | `/stock-purchases` | The Purchases tab | `stock_item:read` | |
| 17 | GET | `/stock-purchases/exports` | The purchases CSV | `stock_item:export` | |
| 18 | POST | `/stock-purchases` | Record a purchase — receives its lines, optionally pays | `stock_item:create` | req |
| 19 | GET | `/stock-purchases/{stock_purchase_id}` | Get one | `stock_item:read` | |
| 20 | PATCH | `/stock-purchases/{stock_purchase_id}` | Change the bill details | `stock_item:update` | |
| 21 | DELETE | `/stock-purchases/{stock_purchase_id}` | Delete an unpaid purchase | `stock_item:delete` | |
| 22 | POST | `/stock-purchases/{stock_purchase_id}/restore` | Undo | `stock_item:delete` | req |

#### 9.D.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 16 | `q` (bill number, `#16`, vendor name), `stock_vendor_id`, `payment_status` (several), `purchase_date_from` / `purchase_date_to` (inclusive), `sort` = `purchase_date` (default, newest first) \| `stock_purchase_number` \| `bill_amount` \| `due_amount`, `order`, `limit`, `after` | — | Stock purchase[], `meta.due_total` (the footer) |
| 17 | as 16, without paging | — | Stock purchases export |
| 18 | — | `stock_vendor_id*`, `items*` (1–50: `stock_item_id` or `new_item` {`name*`, `unit`}, `quantity*`, `rate*`); optional: `bill_number`, `purchase_date` (default today), `bill_amount`, `payment` (`splits*`; optional `paid_at`, `reference`) | Stock purchase |
| 19, 22 | — | — | Stock purchase |
| 20 | — | optional: `stock_vendor_id`, `bill_number`, `purchase_date`, `bill_amount`; `expected_updated_at` | Stock purchase |
| 21 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |

#### 9.D.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 18 | `400` · `items` | empty, over 50, an unknown item, or a quantity of 0 |
| 18, 20 | `400` · `bill_amount` | below what is paid |
| 18 | `409` · `more_than_due` | "Paid" above the bill |
| 20 | `409` · `purchase_received` | `items` sent — lines are fixed |
| 21 | `409` · `purchase_paid` | something is paid |
| 21 | `409` · `not_enough_stock` | some of it was used since |
| 22 | `409` · `record_not_deleted` | it is live |
| 19–22 | `404` | not in the organization |

#### 9.D.10 Rules worth knowing

None beyond 9.10.

#### 9.D.11 Code changes

| # | Change |
| --- | --- |
| SC9 | S10: `app.stock_purchase_items` replacing `lines` jsonb; `received` movements and `last_rate` on create; quick items; lines fixed after save; the bill default |
| SC10 | S11: `payments.stock_purchase_id` (sub-domain 8's table; `RESTRICT`, at most one purchase link per payment, supplier bills only); `paid_amount` kept by payments; "Paid" through the payment service; the generated `due_amount` / `payment_status`; `meta.due_total` |
| SC11 | S12: delete only unpaid, reverting the received movements; restore re-applies them |

---

### 9.E Stock vendors — `stock/stock-vendors/` — final

#### 9.E.1 Decisions

| # | Decision |
| --- | --- |
| S13 | Vendors are the stock sub-domain's own — never the medical store's suppliers (design). Name (unique, any case), phone, `is_quick` (true when a picker adds it inline — the design's stacked drawer). Derived `payable` = the open dues of its purchases. Delete only without open dues (`409 vendor_has_dues`); its items keep pointing nowhere (`SET NULL`), its purchases keep it (`RESTRICT`). |

#### 9.E.2 Open questions

None.

#### 9.E.3 Tables and relations

`app.stock_vendors`: `name varchar(120)` (unique `(organization_id, lower(name))` among live vendors), `phone varchar(13)` `CHECK (~ '^\+91\d{10}$')`, `is_quick boolean` default `false`. Indexes: unique `public_id`; `(organization_id, name, id) WHERE deleted_at IS NULL`.
RLS: organization policy, enabled and forced. Branch: none.

#### 9.E.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `stock_item:read` | Clinic stock · View | items, movements, counts, purchases, vendors | 23, 25 | Owner, Admin, Therapist, Front desk, Pharmacist, Accountant |
| `stock_item:create` | Clinic stock · Create | add an item, a purchase (it receives its lines), a vendor | 24 | Owner, Admin, Therapist, Front desk, Pharmacist |
| `stock_item:update` | Clinic stock · Edit | use, receive, damage, return, adjust and revert stock; count; change an item, a purchase, a vendor | 26 | Owner, Admin, Therapist, Front desk, Pharmacist |
| `stock_item:delete` | Clinic stock · Delete | delete or restore an item, an unpaid purchase, a vendor | 27, 28 | Owner, Admin |

The codes as a whole, with their notes: 9.4.

#### 9.E.5 Common to every route

As 9.5.

#### 9.E.6 Objects returned

**Stock vendor**: `id` (`svnd_…`), `name`, `phone`, `is_quick`, `payable`, `created_at`, `updated_at`.

#### 9.E.7 Routes (23–28)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 23 | GET | `/stock-vendors` | The vendor picker | `stock_item:read` | |
| 24 | POST | `/stock-vendors` | Add a vendor | `stock_item:create` | req |
| 25 | GET | `/stock-vendors/{stock_vendor_id}` | Get one | `stock_item:read` | |
| 26 | PATCH | `/stock-vendors/{stock_vendor_id}` | Change one | `stock_item:update` | |
| 27 | DELETE | `/stock-vendors/{stock_vendor_id}` | Delete one with nothing owed | `stock_item:delete` | |
| 28 | POST | `/stock-vendors/{stock_vendor_id}/restore` | Undo | `stock_item:delete` | req |

#### 9.E.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 23 | `q` (name), `sort` = `name` (default) \| `created_at`, `order`, `limit`, `after` | — | Stock vendor[] |
| 24 | — | `name*`; optional: `phone`, `is_quick` (the picker's inline add) | Stock vendor |
| 25, 28 | — | — | Stock vendor |
| 26 | — | `name`, `phone`; `expected_updated_at` | Stock vendor |
| 27 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |

#### 9.E.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 24, 26 | `409` · `record_already_exists` | the name is taken |
| 27 | `409` · `vendor_has_dues` | a purchase of theirs is not fully paid |
| 28 | `409` · `record_not_deleted` / `record_restore_conflict` | it is live, or its name was reused |
| 25–28 | `404` | not in the organization |

#### 9.E.10 Rules worth knowing

None beyond 9.10.

#### 9.E.11 Code changes

| # | Change |
| --- | --- |
| SC12 | S13: unique name; `payable`; delete only with nothing owed; drop the unused list-limit constant and the unused import |

---

## 10. Tasks & rules — final (rev 1, confirmed 2026-10-08) — nested sub-domains 10.A–10.B

*Was sub-domain 13 before the restructure (2026-10-08) — layout only, no decision changed.*

Code: the **`tasks` sub-domain folder** — `src/domains/app/sub-domains/tasks/` (the task itself at the folder root, with `app.task_owner_changes` beside it — no routes of its own, K1) with `task-rule-settings/`.

10.1 Decisions (whole sub-domain) · 10.2 Open questions · 10.3 Tables and relations · 10.4 Permissions · 10.5 Common to every route ·
10.6 Objects returned · 10.7 Routes · 10.8 Request details · 10.9 Errors · 10.10 Rules worth knowing · 10.11 Code changes (whole sub-domain) ·
10.12 Nested sub-domains · then **10.A Tasks · 10.B Task rule settings** — each with the same eleven sections: .1 Decisions ·
.2 Open questions · .3 Tables and relations · .4 Permissions · .5 Common to every route · .6 Objects returned · .7 Routes ·
.8 Request details · .9 Errors · .10 Rules worth knowing · .11 Code changes

The team's to-do list: tasks the server opens from fixed rules (reply to a message, confirm a visit, call back an
unhappy patient, collect a due, …) and the follow-ups people set themselves. Launch row #72 is **not built**: today one
rule exists (a check-in that feels worse), nothing closes or wakes a task, and nothing records a reassignment.
Route numbers run 1–12. Design: `tasks.md`, `today.md`, `schema-routes.md` (Task, TaskRuleSetting, `task_kind`,
`task_outcome`), `users.md` (Tasks row).

### 10.1 Decisions (whole sub-domain)

Taken on your standing answer "go with the recommendation" — confirmed 2026-10-08. A decision that belongs to one table is in its nested sub-domain.

| # | Decision |
| --- | --- |
| TK1 | **Folder and names**: the task at the root of `tasks/`; `app.task_owner_changes` beside it — written by a reassignment and read inside the task (no routes of its own, K1); `task-rule-settings/` its one nested sub-domain. Public-id prefixes stay (`task_`, `toc_`, `trs_`). |
| TK2 | **One code set, in the Tasks row**: `task:read` · `create` · `update` · `delete` · `export` (`list:export` here goes). Turning rules on and off is an organization setting — `organization:update` (Owner, Admin) replaces the special `task_rule:update`. Holders follow the design (`users.md`, `tasks.md`): Owner and Admin everything; Doctor, Therapist, Front desk and Counsellor read, create and update (the therapist makes the aftercare calls, and `tasks.md` lets everyone who sees a task take its outcome); Pharmacist, Accountant and Marketing see no tasks by default (today every role holds `task:read` · `create` · `update`). |
| TK3 | **Mine and Everyone** (`tasks.md`): `scope=mine` (default) = owned by me, or unowned in the queue of one of my roles; `scope=everyone` = every task — for everyone who sees tasks (PRD says only the Owner; the screen spec wins). A task carries its record's branch (lead, appointment, invoice) and is filtered like that record (`branch:read` sees every branch; no branch = every branch) — a lead's task must not show a lead the caller cannot see. |
| TK4 | **The server opens and closes rule tasks**: a worker — pull-based, one job per organization every 5 minutes, under the queue rules — opens a task for each record that meets a rule that is on, and closes the open ones whose record no longer does ("Done by Clinozy" — `tasks.md`: "A task closes itself when its record changes"). A rule that fires on a write (a check-in or review needing action, 8 TR4) opens its task in that write's transaction through the same service. One open task per rule per record: a unique partial index on `(rule_key, source_key)` — today nothing stops duplicates. Snoozed tasks wake when their time comes (today they never do). |
| TK5 | **What a task is about is a real link**, not `source_type` + `source_id` text: the person is `contact_id` (replaces `patient_id`), and the record is at most one of `lead_id`, `appointment_id`, `patient_treatment_id`, `patient_check_in_id`, `patient_review_id`, `invoice_id`, `pending_credit_id` (`num_nonnulls(…) ≤ 1`, as the activity stream, M5). |

### 10.2 Open questions

None — every decision follows the recommendation.

### 10.3 Tables and relations

| Table | Holds | Key rules |
| --- | --- | --- |
| `app.tasks` | one thing someone has to do | owner or role queue; one open task per rule per record (TK4); rule tasks are never edited (TK7) |
| `app.task_owner_changes` | who a task moved from and to | append-only; written by reassign and by a member leaving (TK8) |
| `app.task_rule_settings` | one rule's switch for the organization | one row per rule; no row = on, by hand |

```text
tenancy.organizations
   │
   ├──< app.tasks ──┬──> tenancy.memberships (owner) — or a role queue                                               10.A — one thing to do
   │                ├──> app.contacts (4)                                                                            the person
   │                ├──> one record: lead · appointment · treatment · check-in · review · invoice · pending credit   what it is about
   │                └──< app.task_owner_changes                                                                      who it moved from and to
   └──< app.task_rule_settings                                                                                       10.B — one switch per rule

A ──< B   one A has many B     A >── B   many A for one B     A ──> B   a column on A points at one B     A ─── B   at most one B per A
```

Pointing at tasks: `contact_activities.task_id` (4).

**PostgreSQL design**

Standard columns on every record table (not repeated below): `id bigint` (identity), `public_id varchar(28)` unique, `organization_id bigint` → organizations `ON DELETE CASCADE`, `created_at` / `updated_at timestamptz`, `created_by_user_id` / `updated_by_user_id`, and — where it soft-deletes — `deleted_at`, `delete_reason`, `delete_note` with their three checks; RLS enabled and forced. RLS: organization policy, enabled and forced, on every table. Each table's design is in its nested sub-domain.

### 10.4 Permissions

One code set (TK2), in the **Tasks** row of the Roles matrix; each nested sub-domain's routes repeat the gate.

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `task:read` | Tasks · View | tasks and the rule switches | 1, 4, 11 | Owner, Admin, Doctor, Therapist, Front desk, Counsellor |
| `task:create` | Tasks · Create | a task by hand | 3 | Owner, Admin, Doctor, Therapist, Front desk, Counsellor |
| `task:update` | Tasks · Edit | snooze, resolve (with a next step), reassign; change a task made by hand | 5–8 | Owner, Admin, Doctor, Therapist, Front desk, Counsellor |
| `task:delete` | Tasks · Delete | delete or restore a task made by hand | 9, 10 | Owner, Admin |
| `task:export` | Tasks · Export | the tasks CSV | 2 | Owner, Admin |
| `organization:update` | — (organization settings) | turn rules on and off; let Clinozy handle them | 12 | Owner, Admin |

### 10.5 Common to every route

| Item | Value |
| --- | --- |
| Base | `/api/v1/app` |
| Auth | `Authorization: Bearer <access token>`; the active organization comes from the token |
| Writes | every `POST` needs `X-Idempotency-Key`; `PATCH` takes an optional `expected_updated_at` (a stale save → `409 record_changed`) |
| Success | `200` with `{ data, meta }`; lists `{ data: [...], meta: { pagination: { per_page, next, has_more, estimated_total } } }` (`estimated_total` on the first page, up to 10,000); `DELETE` → `204` |
| Lists | `limit` (1–100, default 25), `after`, `q` (1–200), `sort`, `order`, `created_from` / `created_to` (`to` exclusive) |
| Errors | `{ error: { type, code, reason?, detail, errors[] } }` — `400 invalid_field`, `401`, `403`, `404`, `409`, `422` idempotency key missing or reused |

### 10.6 Objects returned

Each nested sub-domain lists its own objects (10.A to 10.B, section .6):

| Object | Where |
| --- | --- |
| Task · Tasks export | 10.A.6 — Tasks |
| Task rule setting | 10.B.6 — Task rule settings |

### 10.7 Routes

Every route of the sub-domain in one table; each nested sub-domain repeats its own with the details.

| # | Method | Path | Purpose | Gate | Idem | Nested sub-domain |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | GET | `/tasks` | The Tasks tabs — To do, Snoozed, Done | `task:read` | | 10.A Tasks |
| 2 | GET | `/tasks/exports` | The tasks CSV | `task:export` | | 10.A Tasks |
| 3 | POST | `/tasks` | Add a task by hand | `task:create` | req | 10.A Tasks |
| 4 | GET | `/tasks/{task_id}` | Get a task (the drawer) | `task:read` | | 10.A Tasks |
| 5 | PATCH | `/tasks/{task_id}` | Change a task made by hand | `task:update` | | 10.A Tasks |
| 6 | POST | `/tasks/{task_id}/snooze` | Snooze it | `task:update` | req | 10.A Tasks |
| 7 | POST | `/tasks/{task_id}/resolve` | Take an outcome — optionally set the next step | `task:update` | req | 10.A Tasks |
| 8 | POST | `/tasks/{task_id}/reassign` | Give it to someone or a role queue **(new)** | `task:update` | req | 10.A Tasks |
| 9 | DELETE | `/tasks/{task_id}` | Delete a task made by hand | `task:delete` | | 10.A Tasks |
| 10 | POST | `/tasks/{task_id}/restore` | Undo | `task:delete` | req | 10.A Tasks |
| 11 | GET | `/task-rule-settings` | Every rule and its switches (the Rules popover) | `task:read` | | 10.B Task rule settings |
| 12 | PUT | `/task-rule-settings` | Turn rules on or off; let Clinozy handle them | `organization:update` | | 10.B Task rule settings |

### 10.8 Request details

In each nested sub-domain (10.A to 10.B, section .8).

### 10.9 Errors

Every route can answer the errors in 10.5; each route's own errors are in its nested sub-domain (10.A to 10.B, section .9).

### 10.10 Rules worth knowing

- Today's work queue (`today.md`) is its own list, not these tasks.
- A rule that is off hides its open tasks from every tab; turning it on again shows them (design: "drop out of every tab").
- Outcomes act on the record: "Doing well" writes a Better check-in (7), `unhappy` on a feedback task opens a `call_back`, "Claim it" claims the lead (5).
- The Tasks list can be saved as a view (sub-domain 2 — `tasks`).

### 10.11 Code changes (whole sub-domain)

| # | Change |
| --- | --- |
| TKC1 | TK1: `app.task_owner_changes` written (today never) and read inside the task; `task-rule-settings/` under `tasks/` |
| TKC2 | TK2: `task:export`; drop the special `task_rule:update` and `list:export` here; rule settings gated by `organization:update`; presets per the design (Pharmacist, Accountant, Marketing lose the task codes from `EVERY_ROLE_CODES`) |
| TKC3 | TK3: `scope`; `branch_id` copied from the record; the branch filter |
| TKC4 | TK4: the rules worker (domain-owned under `tasks/workers/`, its repeatable job in the scheduler, tests per the queue rules); automatic close; snooze wake-up; the unique open-task index; sub-domain 7's write-time call-back through the task service |
| TKC5 | TK5: `contact_id` and the typed links replace `patient_id`, `source_type`, `source_id`; the generated `source_key` |

### 10.12 Nested sub-domains

| Nested sub-domain | Folder (`src/domains/app/sub-domains/tasks/…`) | Tables | Routes | Status |
| --- | --- | --- | --- | --- |
| 10.A Tasks | folder root | `app.tasks`, `app.task_owner_changes` | 1–10 | final |
| 10.B Task rule settings | `task-rule-settings/` | `app.task_rule_settings` | 11–12 | final |

---

### 10.A Tasks — `app/sub-domains/tasks/` (folder root) — final

#### 10.A.1 Decisions

| # | Decision |
| --- | --- |
| TK6 | **Kinds and owners**: `kind` is `rule` (with its `rule_key`) · `follow_up` (from "What's next" — the design's "Follow-ups you set") · `manual` — the seven old kinds go (the rule key already says what a rule task is). A task has an owner (`owner_membership_id`) or, when nobody has it yet, a role queue (`owner_role`) — one of the two (design: "null = role queue"; today `owner_role` is required and defaults to `admin`). An owner must be an active member who can see tasks. |
| TK7 | **Lifecycle**: `open` → `snoozed` (until a future time — the worker wakes it) → `done` (by hand with an outcome, or by Clinozy). Outcomes stay effect codes — `done` · `no_answer` (snoozes 3 h) · `doing_well` (writes a Better check-in, 7) · `log_check_in` · `happy` · `unhappy` (opens a `call_back`) — and the design's ~40 per-rule labels are the `result_text` (≤ 200). Resolving may set the next step (design "What's next": title, due, owner, note) — a `follow_up` task in the same transaction. Rule tasks are never edited (design); `PATCH` changes a `manual` or `follow_up` task's title, why, due and priority only (`409 rule_task`). `should_remind_before` (never used) goes. |
| TK8 | **Reassign** (`POST …/reassign`) to a member or a role queue writes a `task_owner_changes` row (from → to, by whom); the task shows who had it (design: "Was A → B"). A lead's task also moves the lead's owner through the lead service (sub-domain 5's claim rules). A member who leaves (K4): their open tasks go back to their role queue, each with an owner-change row. |
| TK9 | **Delete** only `manual` and `follow_up` tasks (soft, with a reason, restore); a rule task goes when its record changes or its rule is turned off. |

#### 10.A.2 Open questions

None.

#### 10.A.3 Tables and relations

`app.tasks`

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `kind` | `varchar(9)` | no | `'manual'` | `rule` · `follow_up` · `manual` |
| `rule_key` | `varchar(17)` | yes | | the 14 rules (10.A.10); `(kind = 'rule') = (rule_key IS NOT NULL)` |
| `title` | `varchar(120)` | no | | 1–120 |
| `why` | `varchar(280)` | yes | | |
| `owner_membership_id` | `bigint` | yes | | → memberships `ON DELETE SET NULL` (cleared when they leave, K4) |
| `owner_role` | `varchar(10)` | yes | | the 9 roles; `owner_membership_id IS NOT NULL OR owner_role IS NOT NULL` |
| `contact_id` | `bigint` | yes | | → contacts `ON DELETE CASCADE` — the person |
| `lead_id`, `appointment_id`, `patient_treatment_id`, `patient_check_in_id`, `patient_review_id`, `invoice_id`, `pending_credit_id` | `bigint` | yes | | each → its table `ON DELETE CASCADE`; `num_nonnulls(…) ≤ 1` (TK5) |
| `source_key` | `text` | | generated | the one record link, e.g. `appointment:1042` — for the unique open task |
| `branch_id` | `bigint` | yes | | → branches `ON DELETE SET NULL`; copied from the record (TK3) |
| `due_at` | `timestamptz` | no | | |
| `status` | `varchar(7)` | no | `'open'` | `open` · `snoozed` · `done` |
| `snoozed_until` | `timestamptz` | yes | | `(status = 'snoozed') = (snoozed_until IS NOT NULL)` |
| `snooze_label` | `varchar(40)` | yes | | "Tomorrow 10:00" |
| `outcome` | `varchar(12)` | yes | | the 6 outcomes; `(status = 'done') = (outcome IS NOT NULL AND resolved_at IS NOT NULL)` |
| `result_text` | `varchar(200)` | yes | | the outcome's label — "Confirmed on call" |
| `note` | `varchar(280)` | yes | | |
| `resolved_at` | `timestamptz` | yes | | |
| `is_resolved_automatically` | `boolean` | no | `false` | "Done by Clinozy" |
| `resolved_by_membership_id` | `bigint` | yes | | → memberships `ON DELETE RESTRICT` (K2); null when Clinozy resolved it |
| `priority` | `varchar(6)` | no | `'normal'` | `low` · `normal` · `high` |

Indexes: unique `public_id`; unique `(organization_id, rule_key, source_key) WHERE kind = 'rule' AND status <> 'done' AND deleted_at IS NULL` — one open task per rule per record; `WHERE deleted_at IS NULL`: `(owner_membership_id, status, due_at)` — Mine, `(organization_id, owner_role, status, due_at) WHERE owner_membership_id IS NULL` — the queues, `(organization_id, status, due_at, id)` — Everyone, `(snoozed_until) WHERE status = 'snoozed'` — the wake-up; `(contact_id)`; each record link `WHERE … IS NOT NULL`.
RLS: organization policy, enabled and forced. Branch: application filter on `branch_id` (TK3).

`app.task_owner_changes` (append-only — no `updated_*` or soft-delete columns; no routes of its own): `task_id` → tasks `ON DELETE CASCADE`; `from_membership_id`, `to_membership_id`, `changed_by_membership_id` → memberships `ON DELETE RESTRICT` (K2 — today `SET NULL`), null for a role queue or the server; `from_role`, `to_role` `varchar(10)`; `created_at`. Index `(task_id, created_at)`. RLS: organization policy, enabled and forced.

#### 10.A.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `task:read` | Tasks · View | tasks and the rule switches | 1, 4 | Owner, Admin, Doctor, Therapist, Front desk, Counsellor |
| `task:create` | Tasks · Create | a task by hand | 3 | Owner, Admin, Doctor, Therapist, Front desk, Counsellor |
| `task:update` | Tasks · Edit | snooze, resolve (with a next step), reassign; change a task made by hand | 5–8 | Owner, Admin, Doctor, Therapist, Front desk, Counsellor |
| `task:delete` | Tasks · Delete | delete or restore a task made by hand | 9, 10 | Owner, Admin |
| `task:export` | Tasks · Export | the tasks CSV | 2 | Owner, Admin |

The codes as a whole, with their notes: 10.4.

#### 10.A.5 Common to every route

As 10.5.

#### 10.A.6 Objects returned

**Task**: `id` (`task_…`), `kind`, `rule_key`, `title`, `why`, `owner_membership_id`, `owner_role`, `contact` (`{ id, name, primary_phone, preference_tags }` or null — the screen warns on `no_calls`, 4 CT14), `lead_id` · `appointment_id` · `patient_treatment_id` · `patient_check_in_id` · `patient_review_id` · `invoice_id` · `pending_credit_id` (at most one set), `branch_id`, `due_at`, `status`, `snoozed_until`, `snooze_label`, `outcome`, `result_text`, `note`, `resolved_at`, `is_resolved_automatically`, `resolved_by_membership_id`, `priority`, `owner_changes` (the latest 5: `{ from_membership_id, from_role, to_membership_id, to_role, changed_by_membership_id, created_at }`), `can_clinozy_handle`, `created_at`, `updated_at`.

**Tasks export** (route 2): `file_name` (`tasks-YYYY-MM-DD.csv`), `content_type`, `row_count` (up to 5,000), `is_truncated`, `content` — as the offerings export (3.B.6).

#### 10.A.7 Routes (1–10)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | `/tasks` | The Tasks tabs — To do, Snoozed, Done | `task:read` | |
| 2 | GET | `/tasks/exports` | The tasks CSV | `task:export` | |
| 3 | POST | `/tasks` | Add a task by hand | `task:create` | req |
| 4 | GET | `/tasks/{task_id}` | Get a task (the drawer) | `task:read` | |
| 5 | PATCH | `/tasks/{task_id}` | Change a task made by hand | `task:update` | |
| 6 | POST | `/tasks/{task_id}/snooze` | Snooze it | `task:update` | req |
| 7 | POST | `/tasks/{task_id}/resolve` | Take an outcome — optionally set the next step | `task:update` | req |
| 8 | POST | `/tasks/{task_id}/reassign` | Give it to someone or a role queue **(new)** | `task:update` | req |
| 9 | DELETE | `/tasks/{task_id}` | Delete a task made by hand | `task:delete` | |
| 10 | POST | `/tasks/{task_id}/restore` | Undo | `task:delete` | req |

#### 10.A.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 1 | `tab` = `open` (default — overdue first) \| `snoozed` \| `done` (resolved today by default), `scope` = `mine` (default) \| `everyone`, `kind`, `rule_key` (several — the type filter), `owner_membership_id`, `owner_role`, `contact_id`, `lead_id`, `appointment_id`, `branch_id` (several), `due_from` / `due_to`, `resolved_from` / `resolved_to`, `q` (title, why, the person's name), `sort` = `due_at` (default, soonest first) \| `resolved_at` \| `created_at`, `order`, `limit`, `after` | — | Task[] |
| 2 | as 1, without paging | — | Tasks export |
| 3 | — | `title*`, `due_at*`; `owner_membership_id` or `owner_role`; optional: `why`, `contact_id`, one record link, `priority` | Task |
| 4, 10 | — | — | Task |
| 5 | — | optional: `title`, `why`, `due_at`, `priority`; `expected_updated_at` | Task |
| 6 | — | `snoozed_until*` (in the future); optional `snooze_label` | Task |
| 7 | — | `outcome*`; optional: `result_text`, `note`, `next` (`title*`, `due_at*`, `owner_membership_id` or `owner_role`, `note`) | Task (with `next_task_id` when one was set) |
| 8 | — | `owner_membership_id` or `owner_role` | Task |
| 9 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |

#### 10.A.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 3, 7, 8 | `400` · `owner_membership_id` / `owner_role` | neither or both; a member who is not active or cannot see tasks |
| 3 | `400` · the record link | more than one, or not the contact's |
| 5, 9 | `409` · `rule_task` | a rule task — it is not edited or deleted |
| 6 | `400` · `snoozed_until` | not in the future |
| 6–8 | `409` · `transition_not_allowed` | the task is done |
| 7 | `400` · `outcome` | not one of the 6, or `doing_well` / `log_check_in` on a task with no patient |
| 10 | `409` · `record_not_deleted` | it is live |
| 4–10 | `404` | not in the organization, or a task about a branch the caller cannot see |

#### 10.A.10 Rules worth knowing

The rules — each opens one task per record while its condition holds, and closes it when the record changes (TK4):

| Rule (`rule_key`) | Opens a task when | Due | Owner | Closes itself when |
| --- | --- | --- | --- | --- |
| `reply` | a contact's last message came in, nothing was sent since, and their lead is open | 30 min after it came | the lead's owner, else the front desk queue | a message is sent to them |
| `failed_message` | the last message sent to a contact failed | at once | its author, else the lead's owner | a later message is delivered |
| `follow_up` | an open lead's follow-up date is today or past | 11:00 that day | the lead's owner, else the counsellor queue | the follow-up moves or the lead closes |
| `claim` | a lead's hold ended, or its owner left (K4) | 3 h later | the counsellor queue ("Anyone") | someone claims it |
| `confirm` | a scheduled booking starts within 48 h | 2 h before when under 20 h away, else 18:00 the day before | the branch's default front desk, else the front desk queue | confirmed, cancelled or moved |
| `arrive` | 15 min past a booking's start, not checked in | start + 15 min | the front desk queue | checked in, no-show or cancelled |
| `rebook` | a booking became a no-show | next day 11:00 | the front desk queue | the contact has a new booking |
| `feedback` | a visit completed 1–3 days ago has no check-in or review since | 12:00 | the counsellor queue | a check-in or review is logged |
| `aftercare` | a treatment's aftercare call is due (`aftercare_call`, 7) with no check-in for it — shown from 2 days before | the treatment date + its offset | the treatment's therapist, else its doctor | a check-in for that treatment |
| `call_back` | a check-in or review needs action (7, TR9, TR11), or a `feedback` task ends `unhappy` | 3 h later (check-in), 4 h (review), 18:00 (unhappy) | the visit's doctor, else the doctor queue | a feedback action is logged |
| `next_visit` | a patient's last visit was 1–45 days ago and nothing is booked | 17:00 | the front desk queue | a booking |
| `gone_quiet` | a patient with paid sessions left (7) last visited 30+ days ago and nothing is booked | 12:00 | the counsellor queue | a booking — with "Let Clinozy handle" it opens a re-target lead instead (5, `retarget_reason`) |
| `payment_due` | an invoice still has a due the day after its date | the next day 11:00 | its first credited member, else the front desk queue | nothing is due |
| `settle_by` | an open pending credit reaches its settle-by date | that day 11:00 | its creator, else the front desk queue | it is settled |

`onboarding` (no rule designed) and `unhappy` (folded into `call_back`) go; `medical_rep_visit` comes back with the medical store.

**Added by the medical store (11, MD8, D75):** `medical_rep_visit` — an MR's next visit date (`medical_reps.next_visit_on`) is today or past — due 11:00 that day — the pharmacist queue — closes when a visit is logged or the date moves (`tasks.medical_rep_id` joins the record links).

#### 10.A.11 Code changes

| # | Change |
| --- | --- |
| TKC6 | TK6: kinds `rule` · `follow_up` · `manual`; the rule-key check; `owner_role` nullable with the owner-or-queue check; the owner checks |
| TKC7 | TK7: the 6 outcomes (adds `unhappy`) and their effects; `result_text` ≤ 200; `next` on resolve; `PATCH` limited to tasks made by hand; snooze in the future; drop `should_remind_before` |
| TKC8 | TK8: route 8; `task_owner_changes` rows (from, to, by — `RESTRICT`, K2); the lead's owner moves with a lead task; K4's leave step returns open tasks to their queue |
| TKC9 | TK9: `DELETE` / restore only for tasks made by hand; `resolved_by_membership_id` |

---

### 10.B Task rule settings — `tasks/task-rule-settings/` — final

#### 10.B.1 Decisions

| # | Decision |
| --- | --- |
| TK10 | **One switch per rule** for the organization: `is_on` and `is_automatic` ("Let Clinozy handle"); no row = on, by hand. `PUT` saves the sent rules in one transaction (today row by row, so a save can half-apply) and needs `organization:update` (TK2). "Let Clinozy handle" works only for rules with a step the server can take — `confirm` (the confirmation message), `payment_due` (the reminder message), `feedback` (the review request), `gone_quiet` (the re-target lead) — the worker takes it and resolves the task "Done by Clinozy"; for the others it is refused (`400`). There are no thresholds (the design has none — a lead's hold length is sub-domain 5's). The soft-delete columns go. |

#### 10.B.2 Open questions

None.

#### 10.B.3 Tables and relations

`app.task_rule_settings` (no soft-delete columns): `rule_key varchar(17)` (the 14 rules) — unique `(organization_id, rule_key)`; `is_on boolean` default `true`; `is_automatic boolean` default `false`, `CHECK (NOT is_automatic OR rule_key IN ('confirm', 'payment_due', 'feedback', 'gone_quiet'))`. RLS: organization policy, enabled and forced.

#### 10.B.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `task:read` | Tasks · View | tasks and the rule switches | 11 | Owner, Admin, Doctor, Therapist, Front desk, Counsellor |
| `organization:update` | — (organization settings) | turn rules on and off; let Clinozy handle them | 12 | Owner, Admin |

The codes as a whole, with their notes: 10.4.

#### 10.B.5 Common to every route

As 10.5.

#### 10.B.6 Objects returned

**Task rule setting**: `id` (`trs_…`, or null when never saved), `rule_key`, `is_on`, `is_automatic`, `can_be_automatic`, `updated_at` (or null).

#### 10.B.7 Routes (11–12)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 11 | GET | `/task-rule-settings` | Every rule and its switches (the Rules popover) | `task:read` | |
| 12 | PUT | `/task-rule-settings` | Turn rules on or off; let Clinozy handle them | `organization:update` | |

#### 10.B.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 11 | — | — | Task rule setting[] — all 14, in the table's order |
| 12 | — | `rules*` (1–14: `rule_key*`, `is_on`, `is_automatic`; each rule once) | Task rule setting[] — all 14 |

#### 10.B.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 12 | `400` · `rules` | empty, an unknown or repeated rule |
| 12 | `400` · `is_automatic` | the rule has no step Clinozy can take |
| 12 | `403` | without `organization:update` |

#### 10.B.10 Rules worth knowing

None beyond 10.10.

#### 10.B.11 Code changes

| # | Change |
| --- | --- |
| TKC10 | TK10: one transaction for `PUT`; `organization:update`; the `is_automatic` check; drop the soft-delete columns and the duplicated rule-key constant; rules that are off hide their tasks from the list |

---

## 11. Medical store — final (rev 1, recommendation, 2026-10-08) — nested sub-domains 11.A–11.H

*Back in the build (D75 — user 2026-10-08: "continue with medical plan for final-routes … go ahead with your
recommendings"); D49's pause ends. Decided by recommendation — every decision below says what the code does today.*

Code: the **`medical` sub-domain folder** — `src/domains/app/sub-domains/medical/` (only `medical.routes.ts` and
`medical.container.ts` at the root, like `billing/` and `stock/`) with `manufacturers/`, `suppliers/` (its
`supplier-credits/` inside), `medicines/`, `medical-purchase-orders/`, `medical-reps/` (its `medical-rep-visits/`
inside) and `medical-sales/`.

11.1 Decisions (whole sub-domain) · 11.2 Open questions · 11.3 Tables and relations · 11.4 Permissions · 11.5 Common to every route ·
11.6 Objects returned · 11.7 Routes · 11.8 Request details · 11.9 Errors · 11.10 Rules worth knowing · 11.11 Code changes (whole sub-domain) ·
11.12 Nested sub-domains · then **11.A Manufacturers · 11.B Suppliers · 11.C Supplier credits · 11.D Medicines · 11.E Medical
purchase orders · 11.F Medical reps · 11.G Medical rep visits · 11.H Medical sales** — each with the same eleven sections.

The in-house medicine store (`medical.md`): medicines with batches and expiry, sales to patients and other contacts,
purchase orders that become batches, suppliers and what the clinic owes them, manufacturers, MRs and their visits, and
the store's slice of the payments ledger — never sharing records with clinic stock (9). Today the store is the first
build: batches, supplier prices, order lines and sale returns are unchecked `jsonb`; nothing moves stock (a sale, an
order received or a return changes no quantity); a sale writes an invoice through a second link the billing review
dropped (B8); walk-in buyers are a separate `medical_contacts` table (B3 drops it); its codes are six code sets plus
`sale:void`. Route numbers run 1–51. Design: `medical.md`, `schema-routes.md` (Manufacturer, Supplier, MedicalRep,
MRVisit, Medicine, MedicalPurchaseOrder, MedicalSale), `payments.md` (paying a medical order), `patient-file.md`
(Sell medicines from a prescription), `tasks.md` (the MR visit reminder).

### 11.1 Decisions (whole sub-domain)

Taken on your standing answer "go with the recommendation" (D75). A decision that belongs to one table is in its
nested sub-domain.

| # | Decision |
| --- | --- |
| MD1 | **Folder and names**: the sub-domain folder `medical/` (routes and container only, like `billing/`); eight nested sub-domains named after their tables (P22): the store's records keep their names (`manufacturers`, `suppliers`, `medicines`, `medical_*`); what a record owns nests inside it — `suppliers/supplier-credits/`, `medical-reps/medical-rep-visits/` (visits move under `/medical-reps/{medical_rep_id}/visits`, today half of them sit at `/medical-rep-visits/{id}`). The `jsonb` columns become rows: `app.medicine_batches`, `app.medicine_supplier_prices`, `app.medical_purchase_order_items`, `app.medical_sale_returns` + `app.medical_sale_return_items` (no routes of their own, K1). Public-id prefixes stay (`mfr_`, `sup_`, `scr_`, `med_`, `mpo_`, `mrep_`, `mrv_`, `msal_`); new ones `mbt_` (a batch), `mpoi_` (an order line), `msrt_` (a return). |
| MD2 | **One code set, in the Medical row**: `medicine:read` · `create` · `update` · `delete` · `export` — medicines, sales, orders, suppliers, manufacturers, MRs and their visits; `manufacturer:*`, `supplier:*`, `medical_rep:*`, `medical_purchase_order:*`, `medical_sale:*`, `sale:void` and the store's `list:export` go. Holders as the design's access line: Owner and Admin everything; Pharmacist read, create, update; Accountant read and export (today create and update too — the design says view). Money keeps sub-domain 8's code (B2): a sale's "Paid now", a return's refund and paying a supplier also need `payment:create`, which the **Pharmacist gains** (they sell and collect — `medical.md`: "Collect ₹563"). |
| MD3 | **One store per organization**: medicines, batches, suppliers, orders, manufacturers and MRs have no branch (the design shows none); a sale has one — its invoice's (one of yours, B5), and the sales list follows the invoices' branch rule. Other option: a store per branch (`branch_id` on batches and orders). |
| MD4 | **Whole units and one balance**: quantities are packs (`integer`, the design's steppers); a medicine's `quantity` is the sum of its batches', both written in one guarded `UPDATE … WHERE quantity + change >= 0` — below zero is `409 not_enough_stock` ("Only 3 of Glycolac Cream in stock"). No movement ledger: the design shows no medicine history, and every change is one document's line — a sale line, a received order line, a return line, a supplier credit, a batch edited by hand. Other option: a movement ledger like 9.B. |
| MD5 | **Batches and expiry**: a batch is a medicine's batch number (unique, any case) with its expiry month (`expiry_month` `YYYY-MM`, stored as the month's first day), quantity, purchase rate and supplier. A sale draws from the earliest expiry first, then the oldest batch; an expired batch (its month before this one) is never sold. |
| MD6 | **The buyer is a contact** (B3): `app.medical_contacts` and its 6 routes go; a sale names `contact_id*` — a patient's, a lead's or anyone's (the picker is `GET /contacts`; "Add contact" is `POST /contacts`, its mobile the contact's phone). A medical invoice therefore always has a contact. |
| MD7 | **Money through billing** (8): a sale writes its `medical` invoice through the invoice ledger in the same transaction (B8, B9 — one line per batch it draws from, rate = MRP with GST inside, the line's discount, "Paid now" as receipts, B13); collecting the rest is `POST /payments` against the invoice; a return refunds through a credit note (B16); paying for an order is a `supplier_bill` payment pointing at it (`payments.medical_purchase_order_id`, as 9's `stock_purchase_id`); the store's Payments tab is `GET /medical-payments`. |
| MD8 | **Background work**: WC-34 → the task rule `medical_rep_visit` (10.A.10's fifteenth rule, the pharmacist queue; `tasks.medical_rep_id` joins the record links); WC-45 → no worker: the pharmacy queue is `GET /patient-prescriptions?is_filled=false` (7), read on refresh (D37). |

### 11.2 Open questions

None — every decision follows the recommendation (D75).

### 11.3 Tables and relations

| Table | Holds | Key rules |
| --- | --- | --- |
| `app.manufacturers` | the brand on the pack | name unique (any case), kept upper case; deleted only without medicines |
| `app.supplier_manufacturers` | who distributes which brand | key (`supplier_id`, `manufacturer_id`); written by either side |
| `app.suppliers` | an agency the store buys from | name unique (any case); deleted only with nothing owed or on order |
| `app.supplier_credits` | stock returned to a supplier, owed back | applied to the supplier's dues (MD11); never changed or deleted |
| `app.medicines` | a medicine for sale | `quantity` = its batches' sum (MD4); deleted only at zero |
| `app.medicine_batches` | one batch of a medicine | unique batch number per medicine (any case); quantity `≥ 0` |
| `app.medicine_supplier_prices` | what a supplier charges for a medicine | key (`medicine_id`, `supplier_id`) |
| `app.medical_purchase_orders` | an order to a supplier: ordered, then received | lines fixed once received; paid through payments |
| `app.medical_purchase_order_items` | one line of an order | becomes a batch when received |
| `app.medical_reps` | a medical representative | next visit date; the brands they represent |
| `app.medical_rep_manufacturers` | which brands an MR represents | key (`medical_rep_id`, `manufacturer_id`) |
| `app.medical_rep_visits` | one logged MR visit | sets the rep's next visit |
| `app.medical_sales` | one sale and its medical invoice | never edited; voided only unpaid and unreturned |
| `app.medical_sale_returns` | medicines brought back, and the refund | its credit note (8); never changed |
| `app.medical_sale_return_items` | one returned line | back into its batch, or written off |

```text
tenancy.organizations
   │
   ├──< app.manufacturers ──┬──< app.supplier_manufacturers >── app.suppliers                                   11.A — the brands
   │                        └──< app.medical_rep_manufacturers >── app.medical_reps
   ├──< app.suppliers ──< app.supplier_credits ──> app.medicine_batches                                         11.B, 11.C — what is owed back
   ├──< app.medicines ──┬──> app.manufacturers                                                                  11.D — a medicine
   │                    ├──< app.medicine_batches ──> app.suppliers · app.medical_purchase_orders               its stock, by batch
   │                    └──< app.medicine_supplier_prices >── app.suppliers                                     what each supplier charges
   ├──< app.medical_purchase_orders ──┬──> app.suppliers                                                        11.E — ordered → received
   │                                  ├──< app.medical_purchase_order_items ──> app.medicines · app.medicine_batches
   │                                  └──< app.payments (8, supplier bills)                                     what was paid
   ├──< app.medical_reps ──< app.medical_rep_visits ──> tenancy.memberships (logged by)                         11.F, 11.G
   └──< app.medical_sales ──┬──── app.invoices (8, type medical) ──< app.invoice_items ──> app.medicine_batches 11.H — a sale
                            ├──> app.contacts (4) · app.patient_prescriptions (7)
                            └──< app.medical_sale_returns ──┬──── app.invoice_credit_notes (8)                  a return and its refund
                                                            └──< app.medical_sale_return_items ──> app.invoice_items

A ──< B   one A has many B     A >── B   many A for one B     A ──> B   a column on A points at one B     A ─── B   at most one B per A
```

Pointing at these from other sub-domains: `invoice_items.medicine_id` (8 — today) and **`medicine_batch_id`** (new),
`payments.medical_purchase_order_id` (8 — new, MD7), `patient_prescriptions` items' `medicine_id` (7, P15),
`tasks.medical_rep_id` (10 — new, MD8).

**PostgreSQL design**

Standard columns on every record table (not repeated below): `id bigint` (identity), `public_id varchar(28)` unique,
`organization_id bigint` → organizations `ON DELETE CASCADE`, `created_at` / `updated_at timestamptz`,
`created_by_user_id` / `updated_by_user_id`, and — where it soft-deletes — `deleted_at`, `delete_reason`, `delete_note`
with their three checks; RLS enabled and forced on every table, link and line tables included. Quantities are
`integer`, money `numeric(12,2)`. No branch rule but on sales (MD3). Each table's design is in its nested sub-domain.

### 11.4 Permissions

One code set (MD2), in the **Medical** row of the Roles matrix; each nested sub-domain's routes repeat the gate.

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `medicine:read` | Medical · View | every list and record of the store, its payments | 1, 3, 7, 9, 14, 16, 17, 20, 25, 28, 33, 35, 39, 41, 44, 47, 51 | Owner, Admin, Pharmacist, Accountant |
| `medicine:create` | Medical · Create | add a manufacturer, supplier, medicine, order, MR or sale; log a visit | 2, 8, 19, 27, 34, 40, 46 | Owner, Admin, Pharmacist |
| `medicine:update` | Medical · Edit | change any of them; receive an order; return stock to a supplier; the near-expiry discount | 4, 10, 15, 21, 24, 29, 32, 36 | Owner, Admin, Pharmacist |
| `medicine:delete` | Medical · Delete | delete or restore a record; cancel an order; void a sale | 5, 6, 11, 12, 22, 23, 30, 31, 37, 38, 42, 43, 48, 49 | Owner, Admin |
| `medicine:export` | Medical · Export | the medicines, orders and sales CSVs | 18, 26, 45 | Owner, Admin, Accountant |
| `payment:create` (8) | Payments · Create | pay a supplier; refund a return; a sale's "Paid now" (field) | 13, 50 | Owner, Admin, Accountant, **Pharmacist** (MD2) |

### 11.5 Common to every route

| Item | Value |
| --- | --- |
| Base | `/api/v1/app` |
| Auth | `Authorization: Bearer <access token>`; the active organization comes from the token |
| Writes | every `POST` needs `X-Idempotency-Key`; `PATCH` takes an optional `expected_updated_at` (a stale save → `409 record_changed`) |
| Success | `200` with `{ data, meta }`; lists `{ data: [...], meta: { pagination: { per_page, next, has_more, estimated_total } } }`; `DELETE` → `204` |
| Lists | `limit` (1–100, default 25), `after`, `q` (1–200), `sort`, `order`, `created_from` / `created_to` (`to` exclusive) |
| Errors | `{ error: { type, code, reason?, detail, errors[] } }` — `400 invalid_field`, `401`, `403`, `404`, `409`, `422` idempotency key missing or reused |

### 11.6 Objects returned

| Object | Where |
| --- | --- |
| Manufacturer | 11.A.6 |
| Supplier | 11.B.6 |
| Supplier credit | 11.C.6 |
| Medicine · Medicines export | 11.D.6 |
| Medical purchase order · Medical purchase orders export | 11.E.6 |
| Medical rep | 11.F.6 |
| Medical rep visit | 11.G.6 |
| Medical sale · Medical sales export · Payment (8.C.6) | 11.H.6 |

### 11.7 Routes

| # | Method | Path | Purpose | Gate | Idem | Nested sub-domain |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | GET | `/manufacturers` | The Manufacturers tab and picker | `medicine:read` | | 11.A |
| 2 | POST | `/manufacturers` | Add one (or a quick one from a picker) | `medicine:create` | req | 11.A |
| 3 | GET | `/manufacturers/{manufacturer_id}` | Get one | `medicine:read` | | 11.A |
| 4 | PATCH | `/manufacturers/{manufacturer_id}` | Change one and its suppliers and MRs | `medicine:update` | | 11.A |
| 5 | DELETE | `/manufacturers/{manufacturer_id}` | Delete one without medicines | `medicine:delete` | | 11.A |
| 6 | POST | `/manufacturers/{manufacturer_id}/restore` | Undo | `medicine:delete` | req | 11.A |
| 7 | GET | `/suppliers` | The Suppliers tab and picker | `medicine:read` | | 11.B |
| 8 | POST | `/suppliers` | Add one | `medicine:create` | req | 11.B |
| 9 | GET | `/suppliers/{supplier_id}` | Get one with what is owed | `medicine:read` | | 11.B |
| 10 | PATCH | `/suppliers/{supplier_id}` | Change one | `medicine:update` | | 11.B |
| 11 | DELETE | `/suppliers/{supplier_id}` | Delete one with nothing owed | `medicine:delete` | | 11.B |
| 12 | POST | `/suppliers/{supplier_id}/restore` | Undo | `medicine:delete` | req | 11.B |
| 13 | POST | `/suppliers/{supplier_id}/payments` | Pay what is due — "Pay ₹827" **(new)** | `payment:create` | req | 11.B |
| 14 | GET | `/supplier-credits` | Every credit — a supplier's account | `medicine:read` | | 11.C |
| 15 | POST | `/supplier-credits` | Return expiring stock and take credit | `medicine:update` | req | 11.C |
| 16 | GET | `/supplier-credits/{supplier_credit_id}` | Get one | `medicine:read` | | 11.C |
| 17 | GET | `/medicines` | The Medicines tab and the pickers | `medicine:read` | | 11.D |
| 18 | GET | `/medicines/exports` | The medicines CSV | `medicine:export` | | 11.D |
| 19 | POST | `/medicines` | Add a medicine with its batches and supplier prices | `medicine:create` | req | 11.D |
| 20 | GET | `/medicines/{medicine_id}` | Get one | `medicine:read` | | 11.D |
| 21 | PATCH | `/medicines/{medicine_id}` | Change one, its batches and prices | `medicine:update` | | 11.D |
| 22 | DELETE | `/medicines/{medicine_id}` | Delete one at zero stock | `medicine:delete` | | 11.D |
| 23 | POST | `/medicines/{medicine_id}/restore` | Undo | `medicine:delete` | req | 11.D |
| 24 | POST | `/medicines/near-expiry-discount` | "Sell all at 20% off" / remove it **(new)** | `medicine:update` | req | 11.D |
| 25 | GET | `/medical-purchase-orders` | The Purchases tab | `medicine:read` | | 11.E |
| 26 | GET | `/medical-purchase-orders/exports` | The orders CSV | `medicine:export` | | 11.E |
| 27 | POST | `/medical-purchase-orders` | Create an order | `medicine:create` | req | 11.E |
| 28 | GET | `/medical-purchase-orders/{medical_purchase_order_id}` | Get one | `medicine:read` | | 11.E |
| 29 | PATCH | `/medical-purchase-orders/{medical_purchase_order_id}` | Change an order not yet received | `medicine:update` | | 11.E |
| 30 | DELETE | `/medical-purchase-orders/{medical_purchase_order_id}` | Cancel an order not yet received | `medicine:delete` | | 11.E |
| 31 | POST | `/medical-purchase-orders/{medical_purchase_order_id}/restore` | Undo the cancel | `medicine:delete` | req | 11.E |
| 32 | POST | `/medical-purchase-orders/{medical_purchase_order_id}/receive` | Receive goods — lines become batches | `medicine:update` | req | 11.E |
| 33 | GET | `/medical-reps` | The MRs tab and picker | `medicine:read` | | 11.F |
| 34 | POST | `/medical-reps` | Add an MR | `medicine:create` | req | 11.F |
| 35 | GET | `/medical-reps/{medical_rep_id}` | Get one | `medicine:read` | | 11.F |
| 36 | PATCH | `/medical-reps/{medical_rep_id}` | Change one | `medicine:update` | | 11.F |
| 37 | DELETE | `/medical-reps/{medical_rep_id}` | Delete one | `medicine:delete` | | 11.F |
| 38 | POST | `/medical-reps/{medical_rep_id}/restore` | Undo | `medicine:delete` | req | 11.F |
| 39 | GET | `/medical-reps/{medical_rep_id}/visits` | An MR's visits | `medicine:read` | | 11.G |
| 40 | POST | `/medical-reps/{medical_rep_id}/visits` | Log a visit | `medicine:create` | req | 11.G |
| 41 | GET | `/medical-reps/{medical_rep_id}/visits/{medical_rep_visit_id}` | Get one **(moved)** | `medicine:read` | | 11.G |
| 42 | DELETE | `/medical-reps/{medical_rep_id}/visits/{medical_rep_visit_id}` | Delete one **(moved)** | `medicine:delete` | | 11.G |
| 43 | POST | `/medical-reps/{medical_rep_id}/visits/{medical_rep_visit_id}/restore` | Undo **(moved)** | `medicine:delete` | req | 11.G |
| 44 | GET | `/medical-sales` | The Sales tab | `medicine:read` | | 11.H |
| 45 | GET | `/medical-sales/exports` | The sales CSV | `medicine:export` | | 11.H |
| 46 | POST | `/medical-sales` | New sale — the medical invoice, stock by earliest expiry | `medicine:create` | req | 11.H |
| 47 | GET | `/medical-sales/{medical_sale_id}` | Get one (the Sale drawer) | `medicine:read` | | 11.H |
| 48 | DELETE | `/medical-sales/{medical_sale_id}` | Void an unpaid sale — stock goes back **(was `/void`)** | `medicine:delete` | | 11.H |
| 49 | POST | `/medical-sales/{medical_sale_id}/restore` | Undo the void | `medicine:delete` | req | 11.H |
| 50 | POST | `/medical-sales/{medical_sale_id}/returns` | Return from patient — refund, stock back **(new)** | `payment:create` | req | 11.H |
| 51 | GET | `/medical-payments` | The store's Payments tab **(new)** | `medicine:read` | | 11.H |

Gone (8 routes): `/medical-contacts` (6 — MD6), `/medical-purchase-orders/{id}/cancel` (→ route 30), `/medical-sales/{id}/void` (→ route 48);
`PATCH /medical-rep-visits/{id}` and the rest of `/medical-rep-visits` move under the rep (39–43); `/supplier-credits/{id}`
`DELETE` and `restore` go (a credit is never undone — MD11).

### 11.8 Request details

Each nested sub-domain's .8 has its routes' query, body and response.

### 11.9 Errors

Each nested sub-domain's .9; common to many routes:

| Route | Status · reason | When |
| --- | --- | --- |
| 19, 21, 46, 15, 32 | `409` · `not_enough_stock` | a sale, a batch edit or a return to a supplier would take a batch below zero |
| 2, 4, 8, 10, 19, 21 | `409` · `record_already_exists` | the name (or a batch number) is taken |
| 6, 12, 23, 31, 38, 43, 49 | `409` · `record_not_deleted` / `record_restore_conflict` | it is live, or its name was reused meanwhile |
| every `{…_id}` route | `404` | not in the organization (a sale of a branch you cannot see) |

### 11.10 Rules worth knowing

- A sale, a received order, a return and a supplier credit each move a batch and its medicine in the same transaction (MD4).
- "Prescriptions to fill" is `GET /patient-prescriptions?is_filled=false` (7); opening one prefills the sale's `patient_prescription_id`.
- A sale's invoice is the patient file's invoice too (its contact's) — the Invoices tab shows it (8).
- Unpaid sales get the `payment_due` task the day after (10.A.10); "Send payment reminders" is a message batch (4).
- An MR's next visit opens the `medical_rep_visit` task in the pharmacist queue on that day (MD8).

### 11.11 Code changes (whole sub-domain)

| # | Change |
| --- | --- |
| MDC1 | MD1: the `medical/` folder (routes and container only) and its eight nested sub-domains; the moves and renames; the new line, batch, price and return tables replace the `jsonb` columns (folded into the baseline — no data to keep); `app.medical_contacts` dropped with its folder and routes |
| MDC2 | MD2: `medicine:read|create|update|delete|export` in the catalog seed and the Medical section; the six old code sets, `sale:void` and the store's `list:export` go; the Pharmacist gains `payment:create`, the Accountant keeps read and export |
| MDC3 | MD7: `payments.medical_purchase_order_id` (supplier bills and their reversals only, `RESTRICT`) through the billing ledger, as `stock_purchase_id` (9); `invoice_items.medicine_batch_id` (`RESTRICT`); `GET /medical-payments` through the payments service |
| MDC4 | MD8: the `medical_rep_visit` task rule and `tasks.medical_rep_id` (10); `is_filled` on `GET /patient-prescriptions` (7) |
| MDC5 | i18n keys (en, es), OpenAPI response maps, the route catalog and its maps, the saved-view lists (`medicines`, `medical_sales`, `medical_purchase_orders`), seeds, live checks |

### 11.12 Nested sub-domains

| Nested sub-domain | Folder | Tables | Routes |
| --- | --- | --- | --- |
| 11.A Manufacturers | `medical/manufacturers/` | `app.manufacturers` | 1–6 |
| 11.B Suppliers | `medical/suppliers/` | `app.suppliers`, `app.supplier_manufacturers` | 7–13 |
| 11.C Supplier credits | `medical/suppliers/supplier-credits/` | `app.supplier_credits` | 14–16 |
| 11.D Medicines | `medical/medicines/` | `app.medicines`, `app.medicine_batches`, `app.medicine_supplier_prices` | 17–24 |
| 11.E Medical purchase orders | `medical/medical-purchase-orders/` | `app.medical_purchase_orders`, `app.medical_purchase_order_items` | 25–32 |
| 11.F Medical reps | `medical/medical-reps/` | `app.medical_reps`, `app.medical_rep_manufacturers` | 33–38 |
| 11.G Medical rep visits | `medical/medical-reps/medical-rep-visits/` | `app.medical_rep_visits` | 39–43 |
| 11.H Medical sales | `medical/medical-sales/` | `app.medical_sales`, `app.medical_sale_returns`, `app.medical_sale_return_items` | 44–51 |

---

### 11.A Manufacturers — `medical/manufacturers/` — final

#### 11.A.1 Decisions

| # | Decision |
| --- | --- |
| MD9 | Fields as designed: `name` (1–80, stored upper case — "ALVI"; unique, any case), `tone` (`lav` · `sky` · `butter` · `blush` · `sage` · `mint`; a quick one gets the next tone after the last added), `is_quick` (set once, from a picker). `supplier_ids` and `medical_rep_ids` (each up to 50) replace the links on save — the same link tables the supplier's and the MR's `manufacturer_ids` write (design: "links are written on the suppliers and MRs too"). Derived: `medicine_count`, `suppliers` and `medical_reps` (id and name). Delete only without live medicines (`409 manufacturer_has_medicines`). Today: no uniqueness, links written only from the other side, delete always. |

#### 11.A.2 Open questions

None.

#### 11.A.3 Tables and relations

`app.manufacturers`

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `name` | `varchar(80)` | no | | upper case (`name = upper(name)`); unique `(organization_id, lower(name))` among live |
| `tone` | `varchar(6)` | no | `'lav'` | the six tones |
| `is_quick` | `boolean` | no | `false` | |

Indexes: unique `public_id`; `WHERE deleted_at IS NULL`: unique `(organization_id, lower(name))`, `(organization_id, name, id)`. RLS: organization policy, enabled and forced.

#### 11.A.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `medicine:read` | Medical · View | as 11.4 | 1, 3 | Owner, Admin, Pharmacist, Accountant |
| `medicine:create` | Medical · Create | as 11.4 | 2 | Owner, Admin, Pharmacist |
| `medicine:update` | Medical · Edit | as 11.4 | 4 | Owner, Admin, Pharmacist |
| `medicine:delete` | Medical · Delete | as 11.4 | 5, 6 | Owner, Admin |

#### 11.A.5 Common to every route

As 11.5.

#### 11.A.6 Objects returned

**Manufacturer**: `id` (`mfr_…`), `name`, `tone`, `is_quick`, `medicine_count`, `suppliers` (`id`, `name`), `medical_reps` (`id`, `name`), `created_at`, `updated_at`.

#### 11.A.7 Routes (1–6)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | `/manufacturers` | The Manufacturers tab and picker | `medicine:read` | |
| 2 | POST | `/manufacturers` | Add one | `medicine:create` | req |
| 3 | GET | `/manufacturers/{manufacturer_id}` | Get one | `medicine:read` | |
| 4 | PATCH | `/manufacturers/{manufacturer_id}` | Change one and its links | `medicine:update` | |
| 5 | DELETE | `/manufacturers/{manufacturer_id}` | Delete one without medicines | `medicine:delete` | |
| 6 | POST | `/manufacturers/{manufacturer_id}/restore` | Undo | `medicine:delete` | req |

#### 11.A.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 1 | `q` (name), `supplier_id`, `medical_rep_id`, `sort` = `name` (default) \| `created_at`, `order`, `limit`, `after` | — | Manufacturer[] |
| 2 | — | `name*`; optional: `tone`, `is_quick`, `supplier_ids`, `medical_rep_ids` | Manufacturer |
| 3, 6 | — | — | Manufacturer |
| 4 | — | `name`, `tone`, `supplier_ids`, `medical_rep_ids`; `expected_updated_at` | Manufacturer |
| 5 | `reason*` = `mistake` \| `duplicate` \| `not_needed` \| `other`, `note` (required for `other`) | — | 204 |

#### 11.A.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 2, 4 | `409` · `record_already_exists` | the name is taken (any case) |
| 2, 4 | `400` · `supplier_ids` / `medical_rep_ids` | one is not a live record of the organization |
| 5 | `409` · `manufacturer_has_medicines` | live medicines name it |
| 3–6 | `404` | not in the organization |

#### 11.A.10 Rules worth knowing

None beyond 11.10.

#### 11.A.11 Code changes

| # | Change |
| --- | --- |
| MDC6 | MD9: upper case and the unique name; the next tone for a quick one; `supplier_ids` / `medical_rep_ids` writing the link tables; the derived counts and names; delete only without medicines |

---

### 11.B Suppliers — `medical/suppliers/` — final

#### 11.B.1 Decisions

| # | Decision |
| --- | --- |
| MD10 | Fields as designed: `name` ("Agency name", 1–120, unique any case), `phone` (`+91` and ten digits — the contacts' pattern), `gst_number` (the GSTIN pattern), `manufacturer_ids` (up to 50 — "Distributes"), `is_quick` (set once). Derived: `payable` (the received orders' dues less the open credits, never below zero), `ageing_days` (since the oldest received order still due), `order_count` (live orders) and the manufacturers. **Pay what is due** (route 13): `branch_id*` (the paying branch, one of yours) and `splits*` (cash, UPI, card) up to the payable — one `supplier_bill` payment per received order, oldest first (MD7), on an open day; answers with the supplier. Delete only with nothing payable, no open credit and no order waiting to be received (`409 supplier_has_dues`). Today: no uniqueness, payable and ageing not computed, paying is an editable number on the order. |

#### 11.B.2 Open questions

None.

#### 11.B.3 Tables and relations

`app.suppliers`

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `name` | `varchar(120)` | no | | unique `(organization_id, lower(name))` among live |
| `phone` | `varchar(16)` | yes | | `+91` and ten digits |
| `gst_number` | `varchar(15)` | yes | | the GSTIN pattern |
| `is_quick` | `boolean` | no | `false` | |

`app.supplier_manufacturers`: `supplier_id` → suppliers `ON DELETE CASCADE`, `manufacturer_id` → manufacturers `ON DELETE CASCADE`, `organization_id`; key (`supplier_id`, `manufacturer_id`); index `(manufacturer_id)`.

Indexes: unique `public_id`; `WHERE deleted_at IS NULL`: unique `(organization_id, lower(name))`, `(organization_id, name, id)`. RLS: organization policy, enabled and forced, on both.

#### 11.B.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `medicine:read` | Medical · View | as 11.4 | 7, 9 | Owner, Admin, Pharmacist, Accountant |
| `medicine:create` | Medical · Create | as 11.4 | 8 | Owner, Admin, Pharmacist |
| `medicine:update` | Medical · Edit | as 11.4 | 10 | Owner, Admin, Pharmacist |
| `medicine:delete` | Medical · Delete | as 11.4 | 11, 12 | Owner, Admin |
| `payment:create` | Payments · Create | pay a supplier | 13 | Owner, Admin, Accountant, Pharmacist |

#### 11.B.5 Common to every route

As 11.5.

#### 11.B.6 Objects returned

**Supplier**: `id` (`sup_…`), `name`, `phone`, `gst_number`, `is_quick`, `manufacturers` (`id`, `name`, `tone`), `payable`, `ageing_days` (or null), `order_count`, `created_at`, `updated_at`.

#### 11.B.7 Routes (7–13)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 7 | GET | `/suppliers` | The Suppliers tab and picker | `medicine:read` | |
| 8 | POST | `/suppliers` | Add one | `medicine:create` | req |
| 9 | GET | `/suppliers/{supplier_id}` | Get one | `medicine:read` | |
| 10 | PATCH | `/suppliers/{supplier_id}` | Change one | `medicine:update` | |
| 11 | DELETE | `/suppliers/{supplier_id}` | Delete one with nothing owed | `medicine:delete` | |
| 12 | POST | `/suppliers/{supplier_id}/restore` | Undo | `medicine:delete` | req |
| 13 | POST | `/suppliers/{supplier_id}/payments` | Pay what is due **(new)** | `payment:create` | req |

#### 11.B.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 7 | `q` (name, phone), `manufacturer_id`, `has_payable` (`true`), `sort` = `name` (default) \| `payable` \| `created_at`, `order`, `limit`, `after` | — | Supplier[] |
| 8 | — | `name*`; optional: `phone`, `gst_number`, `manufacturer_ids`, `is_quick` | Supplier |
| 9, 12 | — | — | Supplier |
| 10 | — | `name`, `phone`, `gst_number`, `manufacturer_ids` (`null` clears phone and GST); `expected_updated_at` | Supplier |
| 11 | `reason*`, `note` (as 11.A.8 #5) | — | 204 |
| 13 | — | `branch_id*`, `splits*` (1–3: `mode` cash · upi · card, `amount`); optional: `paid_at` (an open day), `reference`, `note` | Supplier |

#### 11.B.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 8, 10 | `409` · `record_already_exists` | the name is taken |
| 8, 10 | `400` · `phone` / `gst_number` / `manufacturer_ids` | not `+91` and ten digits; not a GSTIN; not a live manufacturer |
| 11 | `409` · `supplier_has_dues` | something is payable, a credit is open or an order waits to be received |
| 13 | `409` · `more_than_due` | the splits come to more than the payable (or nothing is due) |
| 13 | `409` · `day_closed` | `paid_at` falls on a closed day |
| 13 | `400` · `branch_id` / `splits` | not one of your branches; the splits are empty, repeat a mode or use `credit` |
| 9–13 | `404` | not in the organization |

#### 11.B.10 Rules worth knowing

None beyond 11.10.

#### 11.B.11 Code changes

| # | Change |
| --- | --- |
| MDC7 | MD10: the unique name, the phone and GSTIN checks, `manufacturer_ids` on the link table; `payable`, `ageing_days`, `order_count`; the `has_payable` filter and `payable` sort; the pay route through the billing ledger; delete only with nothing owed |

---

### 11.C Supplier credits — `medical/suppliers/supplier-credits/` — final

#### 11.C.1 Decisions

| # | Decision |
| --- | --- |
| MD11 | **"Return expiring stock" is a supplier credit**: `medicine_batch_id*`, `supplier_id*` (any live supplier; the picker offers the medicine's) and `quantity*` (up to the batch's) take the stock out of the batch and record what the supplier owes back — `amount` = quantity × the batch's purchase rate (design: "₹369 (qty × batch rate)"). The credit is **applied at once** to the supplier's received orders still due, oldest first (each order's `credited_amount`), and what is left is applied to orders received later; `status` `open` until fully applied, then `adjusted` (design: "Adjusted"). Never changed or deleted — a mistake is put right with a new order or batch edit. Today: credits are free-standing rows (delete and restore) that change neither stock nor what is owed. |

#### 11.C.2 Open questions

None.

#### 11.C.3 Tables and relations

`app.supplier_credits`

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `supplier_id` | `bigint` | no | | → suppliers `ON DELETE RESTRICT` |
| `medicine_id` | `bigint` | no | | → medicines `ON DELETE RESTRICT` |
| `medicine_batch_id` | `bigint` | no | | → medicine_batches `ON DELETE RESTRICT` |
| `quantity` | `integer` | no | | `> 0` |
| `rate` | `numeric(12,2)` | no | | `≥ 0` — the batch's purchase rate |
| `amount` | `numeric(12,2)` | no | | `= quantity × rate` |
| `applied_amount` | `numeric(12,2)` | no | `0` | `0 ≤ applied_amount ≤ amount` |
| `created_by_membership_id` | `bigint` | yes | | → memberships `ON DELETE RESTRICT` (K2) |

No soft delete, no `updated_*` beyond the applied amount. Indexes: unique `public_id`; `(organization_id, created_at, id)`; `(supplier_id) WHERE applied_amount < amount` — the open ones. RLS: organization policy, enabled and forced.

#### 11.C.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `medicine:read` | Medical · View | as 11.4 | 14, 16 | Owner, Admin, Pharmacist, Accountant |
| `medicine:update` | Medical · Edit | return stock to a supplier | 15 | Owner, Admin, Pharmacist |

#### 11.C.5 Common to every route

As 11.5.

#### 11.C.6 Objects returned

**Supplier credit**: `id` (`scr_…`), `supplier_id`, `supplier_name`, `medicine_id`, `medicine_name`, `medicine_batch_id`, `batch_number`, `quantity`, `rate`, `amount`, `applied_amount`, `status` (`open` · `adjusted`), `created_by_membership_id`, `created_at`.

#### 11.C.7 Routes (14–16)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 14 | GET | `/supplier-credits` | Every credit — a supplier's account | `medicine:read` | |
| 15 | POST | `/supplier-credits` | Return expiring stock and take credit | `medicine:update` | req |
| 16 | GET | `/supplier-credits/{supplier_credit_id}` | Get one | `medicine:read` | |

#### 11.C.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 14 | `supplier_id`, `medicine_id`, `status`, `sort` = `created_at` (default, newest first), `order`, `limit`, `after` | — | Supplier credit[] |
| 15 | — | `medicine_batch_id*`, `supplier_id*`, `quantity*` (1–9999) | Supplier credit |
| 16 | — | — | Supplier credit |

#### 11.C.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 15 | `409` · `not_enough_stock` | more than the batch holds |
| 15 | `400` · `medicine_batch_id` / `supplier_id` | not a batch or live supplier of the organization |
| 16 | `404` | not in the organization |

#### 11.C.10 Rules worth knowing

A credit lowers the supplier's `payable` at once (11.B); paying the supplier (route 13) pays only the rest.

#### 11.C.11 Code changes

| # | Change |
| --- | --- |
| MDC8 | MD11: the credit takes the stock out of the batch (guarded) and is applied to the supplier's dues in the same transaction; `applied_amount`, `status`; the open credits applied when an order is received (11.E); delete and restore go |

---

### 11.D Medicines — `medical/medicines/` — final

#### 11.D.1 Decisions

| # | Decision |
| --- | --- |
| MD12 | Fields as designed: `name` (1–120, unique any case), `composition` (≤ 160 — "used for substitutes"), `manufacturer_id` (required but on a quick medicine), `is_prescription_only` ("Prescription only" / "Over the counter"), `mrp` (with GST inside; `> 0`, `0` allowed only while quick), `gst_percent` (0 · 5 · 12 · 18 · 28, default 12), `min_stock` ("Reorder at", default 2) and `max_stock` ("Fill up to", default 10, `≥ min_stock`, ≤ 9999), `near_expiry_discount_percent` (1–90 or none), `is_quick` (set by a picker; cleared once the MRP and composition are set — design: "a quick record loses its flag"). Derived: `quantity` (MD4), `stock_level` (`ok` · `low` ≤ reorder · `out` 0), `nearest_expiry` (the earliest unexpired batch with stock: month and batch number), `best_rate` (the lowest supplier price and its supplier), `margin_percent` ((MRP − best rate) ÷ MRP), `price_before_gst`, `needs_details` (quick and missing MRP or composition). Delete only at zero stock (`409 medicine_has_stock`). Today: batches and prices are unchecked `jsonb`, stock is never computed, no uniqueness. |
| MD13 | **Batches and prices in the medicine's body**: `batches[]` (up to 50: `batch_number*` 1–20, `expiry_month*` `YYYY-MM`, `quantity*` 0–9999, `purchase_rate`, `supplier_id`) and `supplier_prices[]` (up to 20: `supplier_id*`, `rate*` > 0, `free_quantity`, `lead_days`). On a change, `batches` is the whole list: a kept batch (its `id`) changes its expiry, rate or quantity — the difference moves the stock (a correction by hand); a new one is added; a batch left out goes to zero (it stays while sales or orders name it). `supplier_prices` replaces the prices. |
| MD14 | **The near-expiry discount**: a medicine's `near_expiry_discount_percent` is its sale lines' default discount (route 21 sets one; the design's row action "Sell at 20% off"); route 24 sets or clears it on every live medicine whose nearest expiry falls within 30, 60 or 90 days ("Sell all at 20% off" / "Remove near-expiry discount") and answers how many changed. |

#### 11.D.2 Open questions

None.

#### 11.D.3 Tables and relations

`app.medicines`

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `medicine_number` | `integer` | no | counter | `> 0` — "#458" |
| `name` | `varchar(120)` | no | | unique `(organization_id, lower(name))` among live |
| `composition` | `varchar(160)` | yes | | |
| `manufacturer_id` | `bigint` | yes | | → manufacturers `ON DELETE RESTRICT`; `manufacturer_id IS NOT NULL OR is_quick` |
| `is_prescription_only` | `boolean` | no | `false` | |
| `mrp` | `numeric(12,2)` | no | | `> 0`, or `≥ 0` while quick |
| `gst_percent` | `smallint` | no | `12` | 0 · 5 · 12 · 18 · 28 |
| `min_stock` | `integer` | no | `2` | `≥ 0` |
| `max_stock` | `integer` | no | `10` | `≥ min_stock`, `≤ 9999` |
| `quantity` | `integer` | no | `0` | `≥ 0`; its batches' sum (MD4) |
| `near_expiry_discount_percent` | `numeric(5,2)` | yes | | `> 0`, `≤ 90` |
| `is_quick` | `boolean` | no | `false` | |

`app.medicine_batches`: `medicine_id` → medicines `ON DELETE CASCADE`, `batch_number varchar(20)` (unique `(medicine_id, lower(batch_number))`), `expiry_month date` (the month's first day), `quantity integer ≥ 0`, `purchase_rate numeric(12,2) ≥ 0` (null for an opening batch without one), `supplier_id` → suppliers `ON DELETE SET NULL`, `medical_purchase_order_id` → medical_purchase_orders `ON DELETE SET NULL`, `organization_id`, `public_id` (`mbt_…`), `created_at` / `updated_at`; index `(medicine_id, expiry_month, id) WHERE quantity > 0` — the sale order.

`app.medicine_supplier_prices`: `medicine_id` → medicines `ON DELETE CASCADE`, `supplier_id` → suppliers `ON DELETE CASCADE`, `rate numeric(12,2) > 0`, `free_quantity integer ≥ 0`, `lead_days integer ≥ 0`, `organization_id`; key (`medicine_id`, `supplier_id`); index `(supplier_id)`.

Indexes: unique `public_id`; unique `(organization_id, medicine_number)`; `WHERE deleted_at IS NULL`: unique `(organization_id, lower(name))`, `(organization_id, name, id)`, `(manufacturer_id)`, `(organization_id) WHERE quantity <= min_stock` — the low list. RLS: organization policy, enabled and forced, on all three.

#### 11.D.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `medicine:read` | Medical · View | as 11.4 | 17, 20 | Owner, Admin, Pharmacist, Accountant |
| `medicine:create` | Medical · Create | as 11.4 | 19 | Owner, Admin, Pharmacist |
| `medicine:update` | Medical · Edit | as 11.4 | 21, 24 | Owner, Admin, Pharmacist |
| `medicine:delete` | Medical · Delete | as 11.4 | 22, 23 | Owner, Admin |
| `medicine:export` | Medical · Export | as 11.4 | 18 | Owner, Admin, Accountant |

#### 11.D.5 Common to every route

As 11.5.

#### 11.D.6 Objects returned

**Medicine**: `id` (`med_…`), `medicine_number`, `name`, `composition`, `manufacturer` (`id`, `name`, `tone`, or null), `is_prescription_only`, `mrp`, `gst_percent`, `price_before_gst`, `min_stock`, `max_stock`, `quantity`, `stock_level`, `nearest_expiry` (`expiry_month`, `batch_number`, or null), `near_expiry_discount_percent`, `best_rate` (`rate`, `supplier_id`, `supplier_name`, or null), `margin_percent` (or null), `is_quick`, `needs_details`, `batches` (`id` `mbt_…`, `batch_number`, `expiry_month`, `quantity`, `purchase_rate`, `supplier_id`, `is_expired` — those with stock, earliest expiry first), `supplier_prices` (`supplier_id`, `supplier_name`, `rate`, `free_quantity`, `lead_days`), `created_at`, `updated_at`.

**Medicines export** (route 18): `file_name` (`medicines-YYYY-MM-DD.csv`), `content_type`, `row_count` (up to 5,000), `is_truncated`, `content` — as the offerings export (3.B.6).

#### 11.D.7 Routes (17–24)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 17 | GET | `/medicines` | The Medicines tab and the pickers | `medicine:read` | |
| 18 | GET | `/medicines/exports` | The medicines CSV | `medicine:export` | |
| 19 | POST | `/medicines` | Add one with its batches and prices | `medicine:create` | req |
| 20 | GET | `/medicines/{medicine_id}` | Get one | `medicine:read` | |
| 21 | PATCH | `/medicines/{medicine_id}` | Change one, its batches and prices | `medicine:update` | |
| 22 | DELETE | `/medicines/{medicine_id}` | Delete one at zero stock | `medicine:delete` | |
| 23 | POST | `/medicines/{medicine_id}/restore` | Undo | `medicine:delete` | req |
| 24 | POST | `/medicines/near-expiry-discount` | The near-expiry discount on every medicine expiring soon **(new)** | `medicine:update` | req |

#### 11.D.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 17 | `q` (name, composition, `#458`), `manufacturer_id` (several), `stock_level` (several), `expiring_within_days` (30 · 60 · 90), `supplier_id`, `is_quick`, `sort` = `name` (default) \| `medicine_number` \| `quantity` \| `mrp` \| `nearest_expiry` \| `created_at`, `order`, `limit`, `after` | — | Medicine[] |
| 18 | as 17, without paging | — | Medicines export |
| 19 | — | `name*`, `mrp*` (unless quick); optional: `manufacturer_id` (required unless quick), `composition`, `is_prescription_only`, `gst_percent`, `min_stock`, `max_stock`, `near_expiry_discount_percent`, `is_quick`, `batches`, `supplier_prices` | Medicine |
| 20, 23 | — | — | Medicine |
| 21 | — | any field of 19 but `is_quick`; `batches` (each kept one with its `id`), `supplier_prices`; `null` clears composition and the discount; `expected_updated_at` | Medicine |
| 22 | `reason*`, `note` (as 11.A.8 #5) | — | 204 |
| 24 | — | `expiring_within_days*` (30 · 60 · 90), `discount_percent*` (1–90, or `null` to remove) | `{ updated_count }` |

#### 11.D.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 19, 21 | `409` · `record_already_exists` | the name, or a batch number of the medicine, is taken |
| 19, 21 | `400` · `mrp` / `manufacturer_id` / `max_stock` / `batches` / `supplier_prices` | no MRP or manufacturer on a medicine that is not quick; fill-up below reorder; a batch id not of this medicine, a repeated batch number or a bad month; a repeated or unknown supplier |
| 21 | `409` · `not_enough_stock` | a batch edit below what was sold meanwhile (a stale save) |
| 22 | `409` · `medicine_has_stock` | it still has stock |
| 20–23 | `404` | not in the organization |

#### 11.D.10 Rules worth knowing

None beyond 11.10.

#### 11.D.11 Code changes

| # | Change |
| --- | --- |
| MDC9 | MD12, MD13: the batch and price tables replacing `jsonb`; the batch diff with the medicine's `quantity` kept in step; the quick rules; the unique name; the derived fields and their filters and sorts; delete at zero |
| MDC10 | MD14: route 24 and the discount as the sale lines' default |

---

### 11.E Medical purchase orders — `medical/medical-purchase-orders/` — final

#### 11.E.1 Decisions

| # | Decision |
| --- | --- |
| MD15 | **Ordered → received** (design: "Order → receive → pay"): an order has a supplier, its bill number, a date (not in the future) and lines (1–50: a medicine — or `new_medicine_name`, a quick medicine at MRP 0 with the supplier's first manufacturer and its price — `quantity*` 1–9999, `free_quantity`, `rate*` > 0). While `ordered` it changes and can be cancelled (route 30, with why: `mistake` · `supplier_cant_deliver` · `price_changed` · `other`; route 31 undoes it); once `received` it is read-only (`409 transition_not_allowed`). "Paid" is not a stage: `payment_status` (`unpaid` · `partial` · `paid`) follows `due_amount` = total − paid − credited (generated). Today: `stage` includes `paid` and is set by hand, `items` is `jsonb`, delete and cancel are two routes. |
| MD16 | **Receive goods** (route 32): each line is ticked (`is_received`, default yes) with its `batch_number` (default `NEW-<order number>`) and `expiry_month` (default 24 months after the order date); a received line adds `quantity + free_quantity` to that batch of the medicine (a new batch, or the same batch number adds to it, its rate now this line's) and refreshes the supplier's price for the medicine; the order's total becomes its received lines' amount (at least one — `400 items`), the supplier's open credits are applied (MD11), and `supplier_bill_number` may come with the goods. Paying is a payment (MD7) — `POST /payments` with `medical_purchase_order_id`, or the supplier's route 13. |

#### 11.E.2 Open questions

None.

#### 11.E.3 Tables and relations

`app.medical_purchase_orders`

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `purchase_order_number` | `integer` | no | counter | `> 0` — "PO #431" |
| `supplier_id` | `bigint` | no | | → suppliers `ON DELETE RESTRICT` |
| `supplier_bill_number` | `varchar(30)` | yes | | |
| `order_date` | `date` | no | today | not after today (the organization's) |
| `stage` | `varchar(8)` | no | `'ordered'` | `ordered` · `received`; `(stage = 'received') = (received_at IS NOT NULL)` |
| `received_at` | `timestamptz` | yes | | |
| `total` | `numeric(12,2)` | no | `0` | `≥ 0` — its lines' (received lines' once received) |
| `paid_amount` | `numeric(12,2)` | no | `0` | `≥ 0`; kept by the payments ledger (MD7) |
| `credited_amount` | `numeric(12,2)` | no | `0` | `≥ 0`; supplier credits applied (MD11); `paid_amount + credited_amount ≤ total` |
| `due_amount` | `numeric(12,2)` | — | generated | `CASE WHEN stage = 'received' THEN total − paid_amount − credited_amount ELSE 0 END` |
| `payment_status` | `varchar(7)` | — | generated | `unpaid` · `partial` · `paid` |

Delete reasons (the cancel): `mistake` · `supplier_cant_deliver` · `price_changed` · `other`; only while `ordered`.

`app.medical_purchase_order_items`: `medical_purchase_order_id` → orders `ON DELETE CASCADE`, `line_number smallint`, `medicine_id` → medicines `ON DELETE RESTRICT`, `quantity integer > 0`, `free_quantity integer ≥ 0`, `rate numeric(12,2) > 0`, `amount numeric(12,2)` (= quantity × rate), `is_received boolean` (null until received), `batch_number varchar(20)`, `expiry_month date`, `medicine_batch_id` → medicine_batches `ON DELETE RESTRICT`, `organization_id`, `public_id` (`mpoi_…`); unique (`medical_purchase_order_id`, `line_number`); index `(medicine_id)`.

Indexes: unique `public_id`; unique `(organization_id, purchase_order_number)`; `WHERE deleted_at IS NULL`: `(organization_id, order_date, id)`, `(supplier_id, received_at) WHERE due_amount > 0` — what is owed. RLS: organization policy, enabled and forced, on both.

#### 11.E.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `medicine:read` | Medical · View | as 11.4 | 25, 28 | Owner, Admin, Pharmacist, Accountant |
| `medicine:create` | Medical · Create | as 11.4 | 27 | Owner, Admin, Pharmacist |
| `medicine:update` | Medical · Edit | as 11.4 | 29, 32 | Owner, Admin, Pharmacist |
| `medicine:delete` | Medical · Delete | cancel and undo | 30, 31 | Owner, Admin |
| `medicine:export` | Medical · Export | as 11.4 | 26 | Owner, Admin, Accountant |

Paying an order is a payment — `payment:create` (8).

#### 11.E.5 Common to every route

As 11.5.

#### 11.E.6 Objects returned

**Medical purchase order**: `id` (`mpo_…`), `purchase_order_number`, `supplier` (`id`, `name`), `supplier_bill_number`, `order_date`, `stage`, `received_at`, `items` (`id` `mpoi_…`, `line_number`, `medicine_id`, `medicine_name`, `quantity`, `free_quantity`, `rate`, `amount`, `is_received`, `batch_number`, `expiry_month`), `item_count`, `free_count`, `total`, `paid_amount`, `credited_amount`, `due_amount`, `payment_status`, `created_at`, `updated_at`; the cancel's `delete_reason` / `delete_note` on a cancelled one.

**Medical purchase orders export** (route 26): as 11.D.6's export (`medical-purchase-orders-YYYY-MM-DD.csv`).

#### 11.E.7 Routes (25–32)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 25 | GET | `/medical-purchase-orders` | The Purchases tab | `medicine:read` | |
| 26 | GET | `/medical-purchase-orders/exports` | The orders CSV | `medicine:export` | |
| 27 | POST | `/medical-purchase-orders` | Create an order | `medicine:create` | req |
| 28 | GET | `/medical-purchase-orders/{medical_purchase_order_id}` | Get one | `medicine:read` | |
| 29 | PATCH | `/medical-purchase-orders/{medical_purchase_order_id}` | Change an order not yet received | `medicine:update` | |
| 30 | DELETE | `/medical-purchase-orders/{medical_purchase_order_id}` | Cancel an order not yet received | `medicine:delete` | |
| 31 | POST | `/medical-purchase-orders/{medical_purchase_order_id}/restore` | Undo the cancel | `medicine:delete` | req |
| 32 | POST | `/medical-purchase-orders/{medical_purchase_order_id}/receive` | Receive goods | `medicine:update` | req |

#### 11.E.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 25 | `q` (number `#431`, bill number, supplier name), `supplier_id`, `stage` (several: `ordered` · `received`), `payment_status` (several), `order_date_from` / `order_date_to`, `sort` = `order_date` (default, newest first) \| `purchase_order_number` \| `total` \| `created_at`, `order`, `limit`, `after` | — | Medical purchase order[] |
| 26 | as 25, without paging | — | Medical purchase orders export |
| 27 | — | `supplier_id*`, `items*`; optional: `supplier_bill_number`, `order_date` | Medical purchase order |
| 28, 31 | — | — | Medical purchase order |
| 29 | — | `supplier_id`, `supplier_bill_number`, `order_date`, `items` (the whole list); `expected_updated_at` | Medical purchase order |
| 30 | `reason*` = `mistake` \| `supplier_cant_deliver` \| `price_changed` \| `other`, `note` (required for `other`) | — | 204 |
| 32 | — | optional: `items` (`id*`, `is_received`, `batch_number`, `expiry_month`), `supplier_bill_number` | Medical purchase order |

#### 11.E.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 27, 29 | `400` · `items` / `supplier_id` / `order_date` | no lines or more than 50, a line with neither or both of `medicine_id` and `new_medicine_name`, a rate of 0; not a live supplier; a date after today |
| 29, 30, 32 | `409` · `transition_not_allowed` | it is already received |
| 32 | `400` · `items` | a line id not of this order, or nothing received |
| 32 | `409` · `record_already_exists` | a batch number the medicine already holds with another expiry |
| 28–32 | `404` | not in the organization |

#### 11.E.10 Rules worth knowing

A received order is what the supplier is owed (11.B `payable`); its payments move `paid_amount` (8).

#### 11.E.11 Code changes

| # | Change |
| --- | --- |
| MDC11 | MD15: the line table, quick medicines from a line, the stages, the generated due and payment status, cancel as the delete (ordered only) and its undo; `cancel` and `paid` go |
| MDC12 | MD16: receive — batches, the supplier price, the total, the open credits — in one transaction |

---

### 11.F Medical reps — `medical/medical-reps/` — final

#### 11.F.1 Decisions

| # | Decision |
| --- | --- |
| MD17 | Fields as designed: `name` (1–120 — "Alvio Pharma · Rakesh"), `phone` (`+91` and ten digits), `next_visit_on` (today to 120 days ahead), `manufacturer_ids` (up to 20 — "Represents", the link table the manufacturer's `medical_rep_ids` writes too). Derived: `last_visit_on` and `last_samples` (the latest live visit), `is_visit_overdue` (next visit before today). Names are not unique (two reps share a first name). Delete any time; the visits stay with it. The `medical_rep_visit` task rule (MD8) opens on `next_visit_on`. Today: the derived fields are missing and no task opens. |

#### 11.F.2 Open questions

None.

#### 11.F.3 Tables and relations

`app.medical_reps`

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `name` | `varchar(120)` | no | | |
| `phone` | `varchar(16)` | yes | | `+91` and ten digits |
| `next_visit_on` | `date` | yes | | |

`app.medical_rep_manufacturers`: `medical_rep_id` → medical_reps `ON DELETE CASCADE`, `manufacturer_id` → manufacturers `ON DELETE CASCADE`, `organization_id`; key (`medical_rep_id`, `manufacturer_id`); index `(manufacturer_id)`.

Indexes: unique `public_id`; `WHERE deleted_at IS NULL`: `(organization_id, name, id)`, `(organization_id, next_visit_on) WHERE next_visit_on IS NOT NULL` — the reminder. RLS: organization policy, enabled and forced, on both.

#### 11.F.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `medicine:read` | Medical · View | as 11.4 | 33, 35 | Owner, Admin, Pharmacist, Accountant |
| `medicine:create` | Medical · Create | as 11.4 | 34 | Owner, Admin, Pharmacist |
| `medicine:update` | Medical · Edit | as 11.4 | 36 | Owner, Admin, Pharmacist |
| `medicine:delete` | Medical · Delete | as 11.4 | 37, 38 | Owner, Admin |

#### 11.F.5 Common to every route

As 11.5.

#### 11.F.6 Objects returned

**Medical rep**: `id` (`mrep_…`), `name`, `phone`, `next_visit_on`, `is_visit_overdue`, `last_visit_on`, `last_samples`, `manufacturers` (`id`, `name`, `tone`), `created_at`, `updated_at`.

#### 11.F.7 Routes (33–38)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 33 | GET | `/medical-reps` | The MRs tab and picker | `medicine:read` | |
| 34 | POST | `/medical-reps` | Add an MR | `medicine:create` | req |
| 35 | GET | `/medical-reps/{medical_rep_id}` | Get one | `medicine:read` | |
| 36 | PATCH | `/medical-reps/{medical_rep_id}` | Change one | `medicine:update` | |
| 37 | DELETE | `/medical-reps/{medical_rep_id}` | Delete one | `medicine:delete` | |
| 38 | POST | `/medical-reps/{medical_rep_id}/restore` | Undo | `medicine:delete` | req |

#### 11.F.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 33 | `q` (name, phone), `manufacturer_id`, `is_visit_overdue`, `sort` = `name` (default) \| `next_visit_on` (none last) \| `created_at`, `order`, `limit`, `after` | — | Medical rep[] |
| 34 | — | `name*`; optional: `phone`, `next_visit_on`, `manufacturer_ids` | Medical rep |
| 35, 38 | — | — | Medical rep |
| 36 | — | any field of 34 (`null` clears phone and the next visit); `expected_updated_at` | Medical rep |
| 37 | `reason*`, `note` (as 11.A.8 #5) | — | 204 |

#### 11.F.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 34, 36 | `400` · `phone` / `next_visit_on` / `manufacturer_ids` | not `+91` and ten digits; before today or more than 120 days ahead; not a live manufacturer |
| 35–38 | `404` | not in the organization |

#### 11.F.10 Rules worth knowing

None beyond 11.10.

#### 11.F.11 Code changes

| # | Change |
| --- | --- |
| MDC13 | MD17: the derived visit fields, the overdue filter, the next-visit window; `manufacturer_ids` on the link table |

---

### 11.G Medical rep visits — `medical/medical-reps/medical-rep-visits/` — final

#### 11.G.1 Decisions

| # | Decision |
| --- | --- |
| MD18 | **A visit is the rep's own** — its routes nest under `/medical-reps/{medical_rep_id}/visits` (today half sit at `/medical-rep-visits/{id}`). Logging one (`visit_date`, default today, not after it; `next_visit_on` after the visit, at most 120 days on — the design's "2 weeks" / "1 month"; `samples` ≤ 120; `notes` ≤ 500) sets the rep's next visit to `next_visit_on`, or clears it when it is not sent and the rep's next visit was on or before the visit — so the reminder task closes (MD8); `logged_by_membership_id` is the caller (K2). Never changed (today `PATCH`); deleted and restored with why. |

#### 11.G.2 Open questions

None.

#### 11.G.3 Tables and relations

`app.medical_rep_visits`

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `medical_rep_id` | `bigint` | no | | → medical_reps `ON DELETE CASCADE` |
| `visit_date` | `date` | no | today | not after today |
| `next_visit_on` | `date` | yes | | `> visit_date` |
| `samples` | `varchar(120)` | yes | | |
| `notes` | `varchar(500)` | yes | | |
| `logged_by_membership_id` | `bigint` | yes | | → memberships `ON DELETE RESTRICT` (K2) |

Indexes: unique `public_id`; `WHERE deleted_at IS NULL`: `(medical_rep_id, visit_date, id)`. RLS: organization policy, enabled and forced.

#### 11.G.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `medicine:read` | Medical · View | as 11.4 | 39, 41 | Owner, Admin, Pharmacist, Accountant |
| `medicine:create` | Medical · Create | log a visit | 40 | Owner, Admin, Pharmacist |
| `medicine:delete` | Medical · Delete | as 11.4 | 42, 43 | Owner, Admin |

#### 11.G.5 Common to every route

As 11.5.

#### 11.G.6 Objects returned

**Medical rep visit**: `id` (`mrv_…`), `medical_rep_id`, `visit_date`, `next_visit_on`, `samples`, `notes`, `logged_by_membership_id`, `created_at`.

#### 11.G.7 Routes (39–43)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 39 | GET | `/medical-reps/{medical_rep_id}/visits` | An MR's visits | `medicine:read` | |
| 40 | POST | `/medical-reps/{medical_rep_id}/visits` | Log a visit | `medicine:create` | req |
| 41 | GET | `/medical-reps/{medical_rep_id}/visits/{medical_rep_visit_id}` | Get one | `medicine:read` | |
| 42 | DELETE | `/medical-reps/{medical_rep_id}/visits/{medical_rep_visit_id}` | Delete one | `medicine:delete` | |
| 43 | POST | `/medical-reps/{medical_rep_id}/visits/{medical_rep_visit_id}/restore` | Undo | `medicine:delete` | req |

#### 11.G.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 39 | `sort` = `visit_date` (default, newest first) \| `created_at`, `order`, `limit`, `after` | — | Medical rep visit[] |
| 40 | — | optional: `visit_date`, `next_visit_on`, `samples`, `notes` | Medical rep visit |
| 41, 43 | — | — | Medical rep visit |
| 42 | `reason*`, `note` (as 11.A.8 #5) | — | 204 |

#### 11.G.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 40 | `400` · `visit_date` / `next_visit_on` | after today; not after the visit, or more than 120 days on |
| 39–43 | `404` | the MR or the visit is not in the organization |

#### 11.G.10 Rules worth knowing

None beyond 11.10.

#### 11.G.11 Code changes

| # | Change |
| --- | --- |
| MDC14 | MD18: the nested routes; the rep's next visit set or cleared by a visit; the author; `PATCH` and the flat `/medical-rep-visits` paths go |

---

### 11.H Medical sales — `medical/medical-sales/` — final

#### 11.H.1 Decisions

| # | Decision |
| --- | --- |
| MD19 | **New sale** (design: "Create medical invoice"): `branch_id*` (one of yours), `contact_id*` (MD6), `items*` (1–50: `medicine_id*`, `quantity*`, `discount_percent` — default the medicine's near-expiry discount), optional `overall_discount`, `member_ids` ("Prescribed by", up to 10), `patient_prescription_id` (an approved prescription of the contact's patient file, filled once — `409 prescription_filled`), `remark` (≤ 500), `payment` (`splits` — "Paid now", B13, needs `payment:create`). In one transaction: each medicine's quantity is drawn from its batches by earliest expiry (MD5 — `409 not_enough_stock` when the unexpired batches hold too little), the `medical` invoice is written with one line per batch drawn (`medicine_batch_id`, `batch_number`, rate = MRP, GST inside), the payment, and the sale (`sale_number` — "S-983"). A sale is never edited (design: "a sale is changed by a return, not edited"). |
| MD20 | **Void and undo** (design: "Void sale" — unpaid with no returns): `DELETE` with why (`billed_by_mistake` · `wrong_items` · `customer_changed_mind` · `other`) voids the sale, deletes its invoice (8) and puts each line's quantity back into its batch; `restore` takes it again from the same batches (`409 not_enough_stock`) and restores the invoice. Something paid → `409 sale_has_payments` (refund it first); a return → `409 sale_has_returns`. Today: a `/void` action and a separate delete. |
| MD21 | **Return from patient** (route 50): `items*` (`invoice_item_id*`, `quantity*` up to what is left of the line), `reason*` (`unused` · `reaction` · `doctor_changed` · `wrong_item` · `damaged`), `refund_mode*` (`cash` · `upi` · `card`), optional `note`. Only a sale paid in full (the design offers it on paid sales; unpaid → void) — `409 sale_not_paid`. The refund = the returned lines' share of their amounts; it writes a credit note on the sale's invoice with its refund payment (B16) on the sale's branch, today; `unused`, `doctor_changed` and `wrong_item` put the quantity back into its batch, `reaction` and `damaged` write it off (it never comes back). Status: `voided` · `returned` (any return) · `paid` · `unpaid`. |
| MD22 | **The store's Payments tab** (route 51, MD7): the payments ledger (8.C) limited to the store — receipts and refunds on `medical` invoices, supplier bills of medical orders and `medicines` expenses — with 8.C's filters; gated by `medicine:read`. |

#### 11.H.2 Open questions

None.

#### 11.H.3 Tables and relations

`app.medical_sales`

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `sale_number` | `integer` | no | counter | `> 0` — "S-983" |
| `invoice_id` | `bigint` | no | | → invoices `ON DELETE RESTRICT`; unique |
| `contact_id` | `bigint` | no | | → contacts `ON DELETE RESTRICT` |
| `branch_id` | `bigint` | no | | → branches `ON DELETE RESTRICT` — its invoice's |
| `patient_prescription_id` | `bigint` | yes | | → patient_prescriptions `ON DELETE SET NULL`; unique among live sales |
| `sold_at` | `timestamptz` | no | `now()` | |

Delete reasons (the void): `billed_by_mistake` · `wrong_items` · `customer_changed_mind` · `other`. Dropped: `patient_id`, `medical_contact_id`, `lead_id` (the contact's), `status`, `voided_at` (the delete), `returns` (`jsonb`).

`app.medical_sale_returns`: `medical_sale_id` → medical_sales `ON DELETE RESTRICT`, `reason varchar(14)` (the five), `refund_mode varchar(4)`, `note varchar(280)`, `amount numeric(12,2) > 0`, `invoice_credit_note_id` → invoice_credit_notes `ON DELETE RESTRICT` (unique), `returned_by_membership_id` → memberships `ON DELETE RESTRICT` (K2), `organization_id`, `public_id` (`msrt_…`), `created_at`; append-only. `app.medical_sale_return_items`: `medical_sale_return_id` → returns `ON DELETE CASCADE`, `invoice_item_id` → invoice_items `ON DELETE RESTRICT`, `quantity integer > 0`, `amount numeric(12,2) ≥ 0`, `is_restocked boolean`, `organization_id`; key (`medical_sale_return_id`, `invoice_item_id`).

Indexes: unique `public_id`; unique `(organization_id, sale_number)`; unique `(invoice_id)`; `WHERE deleted_at IS NULL`: `(organization_id, sold_at, id)`, `(contact_id)`, unique `(patient_prescription_id) WHERE patient_prescription_id IS NOT NULL`. RLS: organization policy, enabled and forced, on all three. Branch: the sale's (MD3).

#### 11.H.4 Permissions

| Code | Roles matrix | Allows | Routes | Held by default |
| --- | --- | --- | --- | --- |
| `medicine:read` | Medical · View | as 11.4 | 44, 47, 51 | Owner, Admin, Pharmacist, Accountant |
| `medicine:create` | Medical · Create | a sale | 46 | Owner, Admin, Pharmacist |
| `medicine:delete` | Medical · Delete | void and undo | 48, 49 | Owner, Admin |
| `medicine:export` | Medical · Export | as 11.4 | 45 | Owner, Admin, Accountant |
| `payment:create` | Payments · Create | a return's refund; a sale's `payment` (field) | 50, (46) | Owner, Admin, Accountant, Pharmacist |

A caller who cannot see every branch sees the sales of their branches (as invoices, 8).

#### 11.H.5 Common to every route

As 11.5.

#### 11.H.6 Objects returned

**Medical sale**: `id` (`msal_…`), `sale_number`, `status` (`unpaid` · `paid` · `returned` · `voided`), `contact` (the contact summary, 4), `patient_id` (the contact's file, or null), `branch_id`, `invoice` (`id`, `invoice_number`, `total`, `paid_amount`, `due_amount`, `payment_status`), `items` (`invoice_item_id`, `medicine_id`, `name`, `batch_number`, `expiry_month`, `quantity`, `rate`, `discount_percent`, `amount`, `returned_quantity`), `returned_amount`, `margin_amount`, `margin_percent`, `member_ids`, `patient_prescription_id`, `remark`, `returns` (`id` `msrt_…`, `reason`, `refund_mode`, `note`, `amount`, `invoice_credit_note_id`, `items` (`invoice_item_id`, `quantity`, `amount`, `is_restocked`), `returned_by_membership_id`, `created_at`), `sold_at`, `created_at`, `updated_at`; the void's `deleted_at`, `delete_reason`, `delete_note`.

**Medical sales export** (route 45): as 11.D.6's export (`medical-sales-YYYY-MM-DD.csv`).

**Payment** (route 51): as 8.C.6.

#### 11.H.7 Routes (44–51)

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 44 | GET | `/medical-sales` | The Sales tab | `medicine:read` | |
| 45 | GET | `/medical-sales/exports` | The sales CSV | `medicine:export` | |
| 46 | POST | `/medical-sales` | New sale | `medicine:create` | req |
| 47 | GET | `/medical-sales/{medical_sale_id}` | Get one | `medicine:read` | |
| 48 | DELETE | `/medical-sales/{medical_sale_id}` | Void an unpaid sale | `medicine:delete` | |
| 49 | POST | `/medical-sales/{medical_sale_id}/restore` | Undo the void | `medicine:delete` | req |
| 50 | POST | `/medical-sales/{medical_sale_id}/returns` | Return from patient | `payment:create` | req |
| 51 | GET | `/medical-payments` | The store's Payments tab | `medicine:read` | |

#### 11.H.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 44 | `q` (sale number, the contact's name or phone, a medicine's name), `status` (several), `contact_id`, `branch_id` (several), `medicine_id`, `patient_prescription_id`, `sort` = `sold_at` (default, newest first) \| `sale_number` \| `total`, `order`, `limit`, `after` | — | Medical sale[] |
| 45 | as 44, without paging | — | Medical sales export |
| 46 | — | `branch_id*`, `contact_id*`, `items*`; optional: `overall_discount`, `member_ids`, `patient_prescription_id`, `remark`, `payment` (`splits*`, `paid_at`) | Medical sale |
| 47, 49 | — | — | Medical sale |
| 48 | `reason*` = `billed_by_mistake` \| `wrong_items` \| `customer_changed_mind` \| `other`, `note` (required for `other`) | — | 204 |
| 50 | — | `items*` (1–50), `reason*`, `refund_mode*`; optional: `note` | Medical sale |
| 51 | as 8.C.8 #12 (`q`, `kind`, `mode`, `branch_id`, the paid range, sort) | — | Payment[] |

#### 11.H.9 Errors

| Route | Status · reason | When |
| --- | --- | --- |
| 46 | `409` · `not_enough_stock` | the unexpired batches hold less than asked |
| 46 | `400` · `items` / `contact_id` / `branch_id` / `member_ids` / `patient_prescription_id` | an unknown or deleted medicine, a medicine twice; not a live contact; not one of your branches; not active members; not an approved prescription of the contact's file |
| 46 | `409` · `prescription_filled` | a live sale already fills the prescription |
| 46 | `403` · `field_permission_required` | `payment` without `payment:create` |
| 46, 50 | `409` · `day_closed` | the payment or refund falls on a closed day |
| 48 | `409` · `sale_has_payments` / `sale_has_returns` | something is paid, or something was returned |
| 49 | `409` · `not_enough_stock` | the batches no longer hold the quantity |
| 50 | `409` · `sale_not_paid` | money is still due |
| 50 | `400` · `items` | a line not of this sale, or more than is left of it |
| 47–50 | `404` | not in the organization, or a branch you cannot see |

#### 11.H.10 Rules worth knowing

The invoice a sale writes is an ordinary `medical` invoice (8): collect with `POST /payments`; it cannot be changed or deleted through `/invoices` while its sale is live (`409 invoice_of_sale`).

#### 11.H.11 Code changes

| # | Change |
| --- | --- |
| MDC15 | MD19: the sale through the invoice ledger with batch-split lines in one transaction; the prescription link; the payment field gate |
| MDC16 | MD20: void as the delete (unpaid, no returns) with the invoice and the stock; restore takes the stock again; `/void` goes |
| MDC17 | MD21: the return and its line table, the credit note and refund, the stock back or written off; the derived status |
| MDC18 | MD22: `GET /medical-payments` through the payments service; `/invoices` refuses to change or delete a live sale's invoice |

---
