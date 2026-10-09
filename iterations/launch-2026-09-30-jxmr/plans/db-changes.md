# DB changes — launch-2026-09-30-jxmr

The iteration's database changes, in one file, kept current at every planning step
(`be-iteration-planning` › Data diagrams). Logical types only — these are proposals: at kickoff the
backend's agent-os (its skills, rules and agents — the expert, which wins wherever this plan differs or
is unclear) decides each table's physical design (types, indexes, constraints, tenant rules); the
differences go into `AS-BUILT.md` and this file is synced with the final table and field names. See it drawn in the DB
Viewer's plan mode: `pnpm db:viewer`, then click this iteration under ◇ Plans.

Status: the 2026-10-03 plan, synced with the route review per sub-domain from 2026-10-08 (see Route review sync). Planning Step 5: D1–D44 and the Reconciliation P verdicts applied; each table has its ROUTE row in KICKOFF.md
([coverage.md › Reconciliation](coverage.md#reconciliation)); every screen-only field was answered. Mode initial
(Baseline `none`) · Intake hash `036cbb592ac5`.

**60 tables:** 54 NEW · 4 CHANGED (platform tables:
organizations, users, memberships, roles) · 2 EXISTING (the permission catalog and
role permissions — no schema change; the clinic section codes are seeded, D10).

**`choice`** = one value from a list of allowed values — never a database enum type (stored as text
with its allowed values, `be-sql-design-guard`). A list a clinic can change is a table or catalog of
its own (D10). Organized in build stages — dependency
order, the order the ROUTE ledger will follow. Each table lists what it holds, where that comes from
(`file:line`), what the frontend requests added (D3) and what is still open.

**Domains and table names** — not chosen yet; Step 4 asks which domain each group of new tables goes
under and confirms their names (plural snake_case, like the existing tables). Until then the DB Viewer
draws every new table under `app` with its plural name (`branch` → `app.branches`).

**Not drawn:** embedded lists stay `json` fields (prescription and invoice items, payment splits,
medicine batches and supplier rates, purchase lines, sale returns, stock purchase and count lines);
the common fields on every table (organization, created / updated time and by, soft delete with
reason — `schema-routes.md:126–134`, plus `updated_by` — `patients.md:28`) are not repeated.

## Route review sync (2026-10-08)

The route review ([routes-final.md](routes-final.md), [D46](decisions.md)) is the design now. Its tables, by sub-domain, as
its table designs name them (60 tables; the medical store's wait for its own review, [D49](decisions.md)):

| Sub-domain | Tables (route review) | Design | Built at |
| --- | --- | --- | --- |
| 1. Branches & places | `app.branches`, `app.branch_members`, `app.branch_rooms`, `app.branch_machines`, `app.branch_holidays` | §1 | #125 |
| 2. Team | `app.membership_preferences`, `app.membership_preference_branches`, `app.membership_saved_views`, `tenancy.memberships`, `tenancy.membership_additional_roles`, `tenancy.membership_invitations`, `tenancy.roles`, `tenancy.role_permissions`, `tenancy.permissions` | §2 | #126–#127 |
| 3. Offerings | `app.offering_groups`, `app.offerings`, `app.offering_branches`, `app.offers`, `app.offer_offerings`, `app.offer_branches` | §3 | #128 |
| 4. Contacts | `app.contacts`, `app.contact_phones`, `app.contact_members`, `app.contact_activities`, `app.contact_message_templates` | §4 | #129 (contacts, phones, members) · #130 (activities, templates) |
| 5. Leads | `app.leads`, `app.lead_involved_memberships` | §5 | #131 |
| 6. Appointments | `app.appointments` | §6 | #132 |
| 7. Patients | `app.patients`, `app.patient_clinical_notes`, `app.patient_prescriptions`, `app.prescription_kits`, `app.patient_diagnoses`, `app.patient_images`, `app.patient_reports`, `app.patient_treatments`, `app.patient_check_ins`, `app.patient_reviews`, `app.patient_feedback_actions`, `app.patient_offerings`, `app.patient_offering_suggestions` | §7 | #133 (the file and 7.B–7.G) · #134 (7.H–7.K) · #135 (7.L–7.M) |
| 8. Billing | `app.invoices`, `app.invoice_items`, `app.invoice_members`, `app.invoice_credit_notes`, `app.payments`, `app.payment_edits`, `app.pending_credits`, `app.day_closes`, `app.day_close_events` | §8 | #136 |
| 9. Stock | `app.stock_items`, `app.stock_item_movements`, `app.stock_counts`, `app.stock_count_lines`, `app.stock_purchases`, `app.stock_purchase_items`, `app.stock_vendors` | §9 | #137 |
| 10. Tasks & rules | `app.tasks`, `app.task_owner_changes`, `app.task_rule_settings` | §10 | #138 |

**Where this file and the route review differ, the route review wins** — the renames (`patient_*`, `contact_*`,
`stock_item_movements`, `invoice_credit_notes`, `invoice_members`, `patient_offerings` …), the new tables
(`app.contacts`, `app.contact_phones`, `app.contact_members`, `app.invoice_items`, the count and purchase lines …), and
the dropped ones (`app.visits`, `app.lead_reads`, `app.patient_notes`, `app.patient_ideas`, the old `medical_contacts`
link). The stage diagrams below are the 2026-10-03 plan; each sub-domain row redraws its tables here when it is built
(`be-kickoff-iteration` › Record), so this file ends as the true record.

## Decided so far

| Change | Decision | What it changes here |
| --- | --- | --- |
| organization · CHANGED | [D7](decisions.md), [D34, D35](decisions.md) | the platform organization gains specialties, timezone and currency (fixed INR), and the clinic settings: the reminder hour and the re-target days |
| membership · CHANGED | [D5](decisions.md), [D3](decisions.md) | a membership holds one or more editable roles, and the staff profile (seq, phone, tone, hours, commission, branches) |
| role · CHANGED | [D5](decisions.md), [D3](decisions.md) | the 9 clinic roles are seeded as editable roles with tone and purpose (lock pending) |
| permission, role_permission · EXISTING | [D10](decisions.md), [D12–D19](decisions.md) | clinic sections are codes in the permission catalog (dynamic, not a fixed list), and so are the role-named actions (D13), reviews (D16), the 11 special permissions (D18) and task rules (D19); the default matrix and presets are seed data (D12, D14–D18) — no schema change |
| user · CHANGED | [D4](decisions.md) | staff join by invitation; the user record gains presence only |
| invoice · NEW | [D20, D21, D23](decisions.md) | numbered per branch GSTIN and financial year (`INV/26-27/0001`); the overall discount is spread before tax; each line keeps whether its rate included GST |
| credit_note · NEW | [D22](decisions.md) | always against an invoice; a give-back with no invoice is a refund payment |
| day_close · NEW | [D24](decisions.md) | a reason when the counted cash differs |
| offering, medicine · NEW | [D21, D26, D27](decisions.md) | MRP includes GST; discounts stop at the lowest price (`minPrice`); seeded GST 0% on consultations, 18% on procedures |
| branch_holiday · NEW | [D41](decisions.md) | a branch's closed days; no slot is offered on them |
| room, machine · NEW; appointment · NEW | [D28](decisions.md) | each branch lists its rooms and machines; an appointment may name one of each (replaces schema-routes' fixed `room` list) |
| offering_group · NEW; offering · NEW | [D29](decisions.md) | a fixed kind for behaviour + clinic-defined groups for browsing |
| prescription · NEW | [D31](decisions.md) | draft → approved by a prescriber, with who and when |
| patient_idea · NEW | [D39](decisions.md) | AI ideas from a de-identified summary (Data consent only), rules as the fallback |
| every clinic table | [D36](decisions.md), [D38](decisions.md) | the domain stays the provisional `app` until kickoff; names follow the repository's rules (`mr_visit` → `medical_rep_visit`); deleted rows are purged after 7 days (a clinic setting) |
| 17 new tables beyond schema-routes | [D3](decisions.md) | visit, diagnosis, prescription kits, clinical note items, saved views, lead reads, message templates, payment edits, day-close events, supplier credits, task reassign history, task rule settings |

## Stages

| Stage | Tables |
| --- | --- |
| Stage 1 — Foundation: the organization, branches and the team | `organization`, `branch`, `branch_user_accesses`, `user`, `membership`, `role`, `permission`, `role_permission`, `user_preference`, `saved_view` |
| Stage 2 — Catalogue: what the clinic sells | `offering_group`, `offering`, `offer` |
| Stage 3 — People and conversations | `patient`, `lead`, `lead_message`, `lead_read`, `message_template` |
| Stage 4 — Scheduling and the visit | `branch_holiday`, `room`, `machine`, `appointment`, `visit` |
| Stage 5 — The clinical record | `diagnosis`, `patient_clinical_note`, `prescription`, `prescription_kit`, `patient_image`, `patient_report`, `patient_note` |
| Stage 6 — Billing and money | `invoice`, `patient_package`, `offering_suggestion`, `patient_idea`, `payment`, `payment_edit`, `credit_note`, `pending_credit`, `day_close`, `day_close_event` |
| Stage 7 — Treatments and feedback | `treatment`, `check_in`, `review`, `feedback_action` |
| Stage 8 — Medical store | `manufacturer`, `supplier`, `medical_rep`, `medical_rep_visit`, `medicine`, `medical_purchase_order`, `medical_contact`, `medical_sale`, `supplier_credit` |
| Stage 9 — Clinic stock | `stock_vendor`, `stock_item`, `stock_purchase`, `stock_movement`, `stock_count` |
| Stage 10 — Tasks and automation | `task`, `task_owner_change`, `task_rule_setting` |

## Overview

```mermaid
erDiagram
  organization["organization · CHANGED"]
  branch["branch · NEW"]
  user["user · CHANGED"]
  membership["membership · CHANGED"]
  role["role · CHANGED"]
  permission["permission · EXISTING"]
  role_permission["role_permission · EXISTING"]
  user_preference["user_preference · NEW"]
  saved_view["saved_view · NEW"]
  offering_group["offering_group · NEW"]
  offering["offering · NEW"]
  offer["offer · NEW"]
  patient["patient · NEW"]
  lead["lead · NEW"]
  lead_message["lead_message · NEW"]
  lead_read["lead_read · NEW"]
  message_template["message_template · NEW"]
  branch_holiday["branch_holiday · NEW"]
  room["room · NEW"]
  machine["machine · NEW"]
  appointment["appointment · NEW"]
  visit["visit · NEW"]
  diagnosis["diagnosis · NEW"]
  patient_clinical_note["patient_clinical_note · NEW"]
  prescription["prescription · NEW"]
  prescription_kit["prescription_kit · NEW"]
  patient_image["patient_image · NEW"]
  patient_report["patient_report · NEW"]
  patient_note["patient_note · NEW"]
  invoice["invoice · NEW"]
  patient_package["patient_package · NEW"]
  offering_suggestion["offering_suggestion · NEW"]
  patient_idea["patient_idea · NEW"]
  payment["payment · NEW"]
  payment_edit["payment_edit · NEW"]
  credit_note["credit_note · NEW"]
  pending_credit["pending_credit · NEW"]
  day_close["day_close · NEW"]
  day_close_event["day_close_event · NEW"]
  treatment["treatment · NEW"]
  check_in["check_in · NEW"]
  review["review · NEW"]
  feedback_action["feedback_action · NEW"]
  manufacturer["manufacturer · NEW"]
  supplier["supplier · NEW"]
  medical_rep["medical_rep · NEW"]
  medical_rep_visit["medical_rep_visit · NEW"]
  medicine["medicine · NEW"]
  medical_purchase_order["medical_purchase_order · NEW"]
  medical_contact["medical_contact · NEW"]
  medical_sale["medical_sale · NEW"]
  supplier_credit["supplier_credit · NEW"]
  stock_vendor["stock_vendor · NEW"]
  stock_item["stock_item · NEW"]
  stock_purchase["stock_purchase · NEW"]
  stock_movement["stock_movement · NEW"]
  stock_count["stock_count · NEW"]
  task["task · NEW"]
  task_owner_change["task_owner_change · NEW"]
  task_rule_setting["task_rule_setting · NEW"]

  organization ||--o{ branch : "has"
  branch }o--o{ user : "staffs"
  user }o--o{ role_permission : "is granted through roles"
  membership ||--|| user_preference : "keeps"
  user ||--o{ membership : "is a member through"
  membership }o--o{ role : "ADDED: holds one or more"
  branch |o--o{ lead : "receives"
  user |o--o{ lead : "owns"
  lead ||--o{ lead_message : "holds"
  task |o--o{ lead_message : "is noted in"
  patient |o--o{ lead : "is converted from"
  branch ||--o{ patient : "is home of"
  user |o--o{ patient : "is usual doctor of"
  patient |o--o{ patient : "refers"
  branch ||--o{ appointment : "hosts"
  user ||--o{ appointment : "sees as doctor"
  patient |o--o{ appointment : "books"
  lead |o--o{ appointment : "books"
  offering |o--o{ appointment : "is booked as"
  appointment |o--o{ appointment : "is copied to"
  patient ||--o{ prescription : "is prescribed"
  appointment |o--o{ prescription : "produces"
  prescription }o--o{ medicine : "lists"
  patient ||--o{ treatment : "receives"
  appointment |o--o{ treatment : "produces"
  offering |o--o{ treatment : "is performed as"
  patient_package |o--o{ treatment : "is used by"
  patient ||--o{ patient_image : "is photographed in"
  appointment |o--o{ patient_image : "is photographed in"
  patient ||--o{ patient_report : "has"
  patient ||--o{ patient_note : "has"
  patient ||--o{ offering_suggestion : "is planned"
  appointment |o--o{ offering_suggestion : "suggests"
  offering ||--o{ offering_suggestion : "is suggested as"
  offering_suggestion }o--o{ invoice : "is invoiced on"
  patient ||--o{ check_in : "gives"
  appointment |o--o{ check_in : "is checked on"
  treatment |o--o{ check_in : "is checked on"
  check_in }o--o{ offering : "suggests next"
  patient ||--o{ review : "writes"
  appointment |o--o{ review : "is reviewed in"
  check_in |o--o{ feedback_action : "is acted on by"
  review |o--o{ feedback_action : "is acted on by"
  offering }o--o{ offer : "is discounted by"
  branch }o--o{ offer : "runs"
  branch ||--o{ invoice : "bills"
  patient |o--o{ invoice : "is billed on"
  medical_contact |o--o{ invoice : "is billed on"
  prescription |o--o{ invoice : "is sold on"
  offering }o--o{ invoice : "is a line on"
  medicine }o--o{ invoice : "is a line on"
  invoice ||--o{ patient_package : "sells"
  offering ||--o{ patient_package : "is sold as"
  patient ||--o{ patient_package : "owns"
  branch ||--o{ payment : "records"
  patient |o--o{ payment : "pays or is refunded"
  invoice |o--o{ payment : "is paid by"
  invoice ||--o{ credit_note : "is refunded by"
  credit_note |o--o{ payment : "is paid out by"
  pending_credit |o--o{ payment : "is settled by"
  patient |o--o{ pending_credit : "is owed or owes"
  medical_purchase_order |o--o{ payment : "is paid by"
  stock_purchase |o--o{ payment : "is paid by"
  branch ||--o{ day_close : "closes"
  day_close |o--o{ payment : "locks"
  user |o--o{ task : "owns"
  patient |o--o{ task : "prompts"
  lead |o--o{ task : "prompts"
  manufacturer ||--o{ medicine : "makes"
  manufacturer }o--o{ supplier : "is distributed by"
  manufacturer }o--o{ medical_rep : "is represented by"
  medical_rep ||--o{ medical_rep_visit : "logs"
  supplier ||--o{ medical_purchase_order : "fulfils"
  supplier }o--o{ medicine : "quotes for"
  medicine }o--o{ medical_purchase_order : "is ordered on"
  invoice ||--o| medical_sale : "records"
  patient |o--o{ medical_sale : "buys"
  medical_contact |o--o{ medical_sale : "buys"
  prescription |o--o{ medical_sale : "is filled by"
  stock_vendor ||--o{ stock_purchase : "supplies"
  stock_vendor |o--o{ stock_item : "is usual vendor of"
  stock_item }o--o{ stock_purchase : "is bought on"
  stock_item ||--o{ stock_movement : "changes by"
  stock_purchase |o--o{ stock_movement : "receives"
  stock_count |o--o{ stock_movement : "adjusts"
  stock_item }o--o{ stock_count : "is counted in"
  patient |o--o{ stock_movement : "is used for"
  stock_movement |o--o| stock_movement : "reverts"
  membership ||--o{ saved_view : "saves"
  lead ||--o{ lead_read : "is read by"
  user ||--o{ lead_read : "reads"
  patient ||--o{ patient_clinical_note : "has"
  appointment ||--o| visit : "runs as"
  patient ||--o{ visit : "has"
  visit }o--o{ diagnosis : "records"
  user ||--o{ prescription_kit : "keeps"
  patient_package |o--o{ appointment : "is used by"
  payment ||--o{ payment_edit : "is changed by"
  day_close ||--o{ day_close_event : "logs"
  invoice |o--o{ pending_credit : "is settled through"
  supplier ||--o{ supplier_credit : "owes"
  medicine |o--o{ supplier_credit : "is returned as"
  lead |o--o{ medical_sale : "buys"
  task ||--o{ task_owner_change : "is reassigned through"
  branch ||--o{ room : "has"
  branch ||--o{ machine : "has"
  room |o--o{ appointment : "hosts"
  machine |o--o{ appointment : "is booked on"
  offering_group |o--o{ offering : "groups"
  patient ||--o| patient_idea : "has"
  branch ||--o{ branch_holiday : "closes on"
```

## Stage 1 — Foundation: the organization, branches and the team

### organization · CHANGED

- **Holds:** The clinic business (tenant). Read by every screen (header, print letterhead); written by Users › Branches (settings).
- **Table (built, ROUTE #1):** `tenancy.organizations` (the clinic profile) + `tenancy.organization_settings` (the clinic settings, with the organization's other settings — RC-201 writes them)
- **Sources:** schema-routes.md:138–149 · PRD.md:9 · D7
- **Added** (a frontend request, D3, unless a decision is named): `specialties` (D7), `timezone` (D7), `currency` (D7), `default_day_float` (payments.md:76, 327), `lead_hold_days` (leads.md:180, 402), `reminder_hour` (D34), `retarget_after_days` (D35), `deleted_record_purge_days` (D38)
- **Open:** none
- **Built (ROUTE #139, D77):** `tenancy.organization_settings` gains `whatsapp_phone_number_id` and `instagram_account_id` (`varchar(32)`, digits only — `chk_organization_settings_whatsapp_phone_number_id` / `_instagram_account_id` `^[0-9]{5,32}$`), each unique across organizations (partial unique indexes over the set values) — the clinic's accounts on the platform Meta app, written through `PATCH /tenancy/organization/settings` (409 `messaging_account_taken`); the webhook finds an account's organization through the SECURITY DEFINER resolver `tenancy.resolve_organization_public_id_for_messaging_account(channel, account_id)`

```mermaid
erDiagram
  organization["tenancy.organizations · CHANGED"] {
    id id PK
    json specialties "ADDED"
    text timezone "ADDED"
    text currency "ADDED"
  }
  organization_settings["tenancy.organization_settings · CHANGED"] {
    id organization_id PK
    money default_day_float "ADDED"
    number lead_hold_days "ADDED"
    number reminder_hour "ADDED"
    number retarget_after_days "ADDED"
    number deleted_record_purge_days "ADDED"
    text whatsapp_phone_number_id "ADDED #139"
    text instagram_account_id "ADDED #139"
  }
  organization ||--o| organization_settings : "settings"
```

### branch · NEW

- **Holds:** A clinic location. Read by header branch picker, every drawer's Branch field, print sheets; written by Users › Branches.
- **Table (built, ROUTE #2):** `app.branches` — code `app/sub-domains/branches/`
- **Sources:** schema-routes.md:154–180 · PRD.md:151 · users.md:79–95, 126–156
- **Added** (a frontend request, D3, unless a decision is named): `maps_link` (leads.md:427–432), `review_link` (leads.md:427–432); soft delete `delete_reason`, `delete_note` (schema-routes.md:126–134)
- **Renamed at build** (repository rules): `address_line1/2` → `address_line_one/two`, `pin` → `postal_code`, `active` → `is_active`, `default_*_id` → `default_*_membership_id` (a membership is the staff member, D5)
- **Open:** none — own branches, Owner and Admin all (D9 → `app.branch_members`); maps and review links for templates (D3)

```mermaid
erDiagram
  branch["app.branches · NEW"] {
    id id PK
    text name
    choice tone
    boolean is_main
    text address_line_one
    text address_line_two
    text area
    text city
    text state
    text postal_code
    text phone
    text email
    text gst_number
    time opens_at
    time closes_at
    json working_days
    id default_doctor_membership_id FK "→ membership"
    id default_front_desk_membership_id FK "→ membership"
    id default_therapist_membership_id FK "→ membership"
    id default_pharmacist_membership_id FK "→ membership"
    boolean is_active
    text maps_link
    text review_link
  }
```

- **Built (ROUTE #125, sub-domain 1):** never deleted — `deleted_at`, `delete_reason`, `delete_note` and their checks dropped; a branch retires with `is_active` (D3, C16); the name-unique and one-main indexes cover every row. The four default-staff fields are keys `(organization_id, default_<role>_membership_id)` → `tenancy.memberships (organization_id, id)` `ON DELETE SET NULL` on the staff column only (K8), each with a partial index `idx_branches_organization_id_default_<role>_membership_id`; each names one of the branch's live members (D10, C10) and is cleared when that member stops working there or leaves (D14, C15). Code `app/sub-domains/branches/` (the branch at the folder root, D54).

### branch_user_accesses · NEW (built, not planned)

- **Holds:** Who works in which branch — one row per (branch, membership). Read by `GET /app/branches/my` (every member's branch picker); written by `PUT /app/branches/{branch_id}/members` and, at row #4, the staff invite and edit.
- **Table (built, ROUTE #2; renamed at ROUTE #125, D9):** `app.branch_members` — code `app/sub-domains/branches/branch-members/`
- **Sources:** D9 · users.md:126–156 (the plan held "branches" on the membership, row #4; built as a link table so each access is a real foreign key, user 2026-10-07)
- **Open:** none
- **Built (ROUTE #125, sub-domain 1):** key `(organization_id, membership_id)` → `tenancy.memberships (organization_id, id)` `ON DELETE CASCADE` (K8) with index `idx_branch_members_organization_id_membership_id`; an ended membership's rows stay but drop out of the members list and `/branches/my`, and a members `PUT` keeps them (D57); `POST /branches` writes the first rows from `membership_ids` (D13, C14).

```mermaid
erDiagram
  branch_members["app.branch_members · NEW"] {
    id branch_id FK "→ branch"
    id membership_id FK "→ membership"
  }
```

### user · CHANGED

- **Holds:** A staff member who signs in. Read by every person picker, avatars, Tasks owner; written by Users › Team.
- **Table (proposal):** `auth.users`
- **Sources:** schema-routes.md:184–207 · PRD.md:150 · users.md:26–40, 99–124 · D4
- **Added** (a frontend request, D3, unless a decision is named): `presence` (C8; shell.md:27), `last_active_at` (schema-routes.md:207)
- **Open:** none — presence per schema-routes (C8); staff fields live on the membership (D3)
- **Built (ROUTE #3):** `presence` varchar(10) NOT NULL DEFAULT `online`, CHECK `chk_users_presence` (`online`, `busy`, `away`); `last_active_at` already on `auth.users` — reused, not added

```mermaid
erDiagram
  user["user · CHANGED"] {
    id id PK
    choice presence "ADDED"
    datetime last_active_at "EXISTING"
  }
```

### membership · CHANGED

- **Holds:** A person's membership of the organization — now holds one or more roles (D5) and the staff profile (D3).
- **Table (proposal):** `tenancy.memberships`
- **Sources:** D4, D5 · users.md:26–40, 99–124
- **Added** (a frontend request, D3, unless a decision is named): `roles` (D5; users.md:110), `seq` (users.md:32), `phone` (users.md:106), `tone` (users.md:109), `working_days` (users.md:113), `starts_at` (users.md:114), `ends_at` (users.md:115), `commission_pct` (users.md:116), `branch_ids` (users.md:112)
- **Open:** none — the first role listed is the main one (D40)
- **Built (ROUTE #4):** `staff_number` integer (trigger `trg_memberships_staff_number`, unique per organization, never reused), `phone` varchar(16), `tone` varchar(10) (`sky`), `working_days` text[] (Mon–Sat), `work_starts_at` / `work_ends_at` time (10:00 / 19:00, ends after starts), `commission_percent` numeric(5,2) 0–100, `delete_reason` / `delete_note`; `roles` → main stays `role_id` + new `tenancy.membership_additional_roles` (membership_id, role_id, organization_id, position 1–9); `branch_ids` → `app.branch_user_accesses` (ROUTE #2); `seq` → `staff_number`, `starts_at`/`ends_at` → `work_starts_at`/`work_ends_at`, `commission_pct` → `commission_percent`
- **Built (ROUTE #124, K2–K8):** `display_name` varchar(120) NOT NULL (the login's first + last name, or its email, copied at join by `trg_memberships_display_name`; kept equal to the profile while live by `trg_users_sync_membership_display_names` on `auth.users`; frozen once ended), `delete_reason` gains `left` and `account_deleted`, unique `(organization_id, id)` (`idx_memberships_organization_id_id`) for the app's composite membership keys
- **Built (ROUTE #126, sub-domain 2):** `status` values lowercase — `invited`, `active`, `suspended` (T17; `chk_memberships_status`, `chk_memberships_joined`, default `invited`, the SQL resolvers that read it); `joined_at` set only by accepting the invite (T10); `trg_memberships_display_name` also fires when an ended membership is live again (restore, re-add — K3, K7); the invite table `tenancy.member_invitations` → **`tenancy.membership_invitations`** (T9 — indexes, checks `chk_membership_invitations_*`, policy, keys and its SQL resolvers renamed); the name sort reads `display_name` and the name-sort SECURITY DEFINER function is gone.

```mermaid
erDiagram
  membership["membership · CHANGED"] {
    id id PK
    id user_id FK "→ user"
    json roles "ADDED → role list"
    number seq "ADDED"
    text phone "ADDED"
    choice tone "ADDED"
    json working_days "ADDED"
    text starts_at "ADDED"
    text ends_at "ADDED"
    number commission_pct "ADDED"
    json branch_ids "ADDED → branch list"
  }
```

### role · CHANGED

- **Holds:** An editable organization role — the 9 clinic roles are seeded (D5); now also carries its tone, purpose, lock and special permissions (D3).
- **Table (proposal):** `tenancy.roles`
- **Sources:** D5, D8 · users.md:42–77
- **Added** (a frontend request, D3, unless a decision is named): `tone` (users.md:11, 49–50), `purpose` (users.md:50), `is_locked` (users.md:61; D40 — only Admin)
- **Open:** none — default matrix D12; special-permission presets D18, D25; only Admin is locked (D40)

- **Built:** `tone` varchar(10) (`sky`), `is_locked` boolean (false); `purpose` → existing `description` · ROUTE #5
- **Built (ROUTE #126, sub-domain 2):** `delete_reason` varchar(20) + `delete_note` varchar(280) with `chk_roles_delete_reason`, `chk_roles_delete_reason_when_deleted`, `chk_roles_delete_note_when_other` (T12 — a role is deleted with why and restorable until the tombstone purge).
```mermaid
erDiagram
  role["role · CHANGED"] {
    id id PK
    choice tone "ADDED"
    text purpose "ADDED"
    boolean is_locked "ADDED"
  }
```

### permission · EXISTING

- **Holds:** The platform's permission catalog (code, name, category). The clinic sections and their actions — and, proposed, the special permissions — are new codes in it (D10), so sections stay a dynamic list, never a fixed one.
- **Table (proposal):** `tenancy.permissions`
- **Sources:** D10 · users.md:61–65, 71
- **Open:** none — no schema change; seeded codes: the 10 sections (D10, P68), the role-named actions (D13), reviews (D16), the 11 special permissions (D18), task rules (D19)

```mermaid
erDiagram
  permission["permission · EXISTING"] {
    id id PK
  }
```

### role_permission · EXISTING

- **Holds:** Access matrix row (role × section). Read by the All sections list, route guards and Users › Roles; written by Users › Roles.
- **Table (proposal):** `tenancy.role_permissions`
- **Sources:** schema-routes.md:211–223 · PRD.md:26 · users.md:61–65 · D10
- **Open:** none — no schema change; a role holds catalog codes, seeded per D12, D13, D16–D19

```mermaid
erDiagram
  role_permission["role_permission · EXISTING"] {
    id id PK
  }
```

### user_preference · NEW

- **Holds:** A member's own UI state in one organization. Read on app load; written by header pin toggles, branch picker, Appearance, dropdown Recent.
- **Table (built, ROUTE #8; renamed at ROUTE #127, U1):** `app.membership_preferences` + `app.membership_preference_branches` — code `app/sub-domains/memberships/membership-preferences/`
- **Sources:** schema-routes.md:227–238 · shell.md:9, 26–27, 43
- **Open:** none — per membership (U1, the branch filter and pins belong to one organization); theme on the server with the rest (U4)
- **Built (ROUTE #127, sub-domain 2):** owned by `membership_id` (unique — the upsert's conflict target, U4) with key `(organization_id, membership_id)` → `tenancy.memberships (organization_id, id)` `ON DELETE CASCADE` (K8); `created_by_user_id` ownership and the soft-delete columns gone; `pinned_sections` Today + the matrix sections (≤ 10), `patient_file_pins` the 11 patient-file sections (≤ 11, default `clinical_notes, appointments, prescriptions, invoices`), `recent_picks` ≤ 60 (newest 3 per `room:field`, trimmed by the server); the branch filter `branch_filter_ids` → `branch_ids` on `app.membership_preference_branches (membership_preference_id, branch_id)`. RLS organization policy ENABLE + FORCE on both, no retention arm; out of the purge list; the leave step deletes the row (K4)

```mermaid
erDiagram
  membership_preferences["app.membership_preferences · NEW"] {
    id membership_id FK "→ membership (unique)"
    json pinned_sections
    choice theme
    json patient_file_pins
    json recent_picks
  }
  membership_preference_branches["app.membership_preference_branches · NEW"] {
    id membership_preference_id FK "→ membership_preferences"
    id branch_id FK "→ branch"
  }
  membership_preferences ||--o{ membership_preference_branches : "filters to"
```

### saved_view · NEW

- **Holds:** A list's filters under a label + the columns it hides — a member's own shortcut on a list.
- **Table (built, ROUTE #9; renamed at ROUTE #127, U1):** `app.membership_saved_views` — code `app/sub-domains/memberships/membership-saved-views/`
- **Sources:** patients.md:129, 274 · payments.md:39 · H:968, 1545
- **Open:** none
- **Built (ROUTE #127, sub-domain 2):** owned by `membership_id` with key `(organization_id, membership_id)` → `tenancy.memberships (organization_id, id)` `ON DELETE CASCADE` (K8); `list_key` one of the registry's lists (`~ '^[a-z_]+$'`), `label` 1–60 unique per member and list case-insensitive (`(membership_id, list_key, lower(label))`), `filters` a JSON object of the list's query parameters, `hidden_columns` ≤ 40; index `(membership_id, list_key, created_at)`; no soft delete (U6 — removed for good); RLS organization policy ENABLE + FORCE, no retention arm; out of the purge list; the leave step deletes a member's views (K4)

```mermaid
erDiagram
  membership_saved_views["app.membership_saved_views · NEW"] {
    id membership_id FK "→ membership"
    text list_key
    text label
    json filters
    json hidden_columns
  }
```

## Stage 2 — Catalogue: what the clinic sells

### offering_group · NEW

- **Holds:** A clinic-defined group for browsing offerings — Facial, Hair, Peel, Laser (D29).
- **Table (proposal):** `app.offering_groups` — domain not chosen yet (Step 4)
- **Sources:** PRD.md:169–173 · D29
- **Open:** none

- **Built:** `app.offering_groups` · ROUTE #10 (2026-10-07) — code `app/sub-domains/offerings/offering-groups/` since ROUTE #128 (OC17)
- **Built (ROUTE #128, sub-domain 3):** columns unchanged (`name` 1–60 unique per organization in any case among live groups, `sort_order` 0–9999); the menu-order index is now `idx_offering_groups_organization_sort_order_name` `(organization_id, sort_order, name, id)` for the default list order (O8); a group live offerings use cannot be deleted (O7 — a 409 from the service, no schema change).
```mermaid
erDiagram
  offering_groups["app.offering_groups · NEW"] {
    id id PK
    text name
    number sort_order
  }
```

### offering · NEW

- **Holds:** A sellable service / package / product. Read by every service picker, invoices, plan card; written by Offerings.
- **Table (proposal):** `app.offerings` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:557–577 · PRD.md:96–100, 139 · offerings.md:25–39, 59–89
- **Added** (a frontend request, D3, unless a decision is named): `group_id` (D29), `offer_price` (offerings.md:70), `branch_ids` (offerings.md:68), `gst_inclusive` (offerings.md:73), `search_terms` (offerings.md:80), `description` (offerings.md:81)
- **Open:** none — a fixed kind (consultation, treatment, package, product; lhr is a treatment) + clinic groups (D29); GST as a number (P71, D3); seeded rates (D27); discounts stop at minPrice (D26)

- **Built:** `app.offerings` · ROUTE #11 (2026-10-07)
- **Built (ROUTE #128, sub-domain 3):** `group_id` → `offering_group_id` (O1 — key `offerings_offering_group_id_offering_groups_id_fk` `ON DELETE SET NULL`, index `idx_offerings_offering_group_id`); `default_doctor_membership_id` and `default_room_id` dropped with their keys and indexes (O6); new CHECK `chk_offerings_min_price_within_offer_price` — with the two existing ones, `min_price` ≤ `offer_price` ≤ `price` (O4); `branch_ids` on `app.offering_branches` (none = every branch, O5). Code `app/sub-domains/offerings/` (the folder root, D54).
```mermaid
erDiagram
  offerings["app.offerings · NEW"] {
    id id PK
    number offering_number
    text name
    choice category
    choice specialty
    choice tone
    money price
    money min_price
    number duration_minutes
    number sessions
    number validity_days
    number gst_percent
    boolean is_active
    id offering_group_id FK "→ offering_group"
    money offer_price
    boolean is_gst_inclusive
    json search_terms
    text description
  }
  offering_branches["app.offering_branches · NEW"] {
    id offering_id FK "→ offering"
    id branch_id FK "→ branch"
  }
  offerings ||--o{ offering_branches : "is offered at (none = every branch)"
```

### offer · NEW

- **Holds:** A limited-time price on offerings. Read by Offerings › Offers, invoice pricing; written by Offer drawer.
- **Table (proposal):** `app.offers` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:581–598 · offerings.md:41–55, 91–112
- **Open:** none

- **Built:** `app.offers` · ROUTE #12 (2026-10-07) — code `app/sub-domains/offerings/offers/` since ROUTE #128 (OC17)
- **Built (ROUTE #128, sub-domain 3):** `is_paused` → `is_active` (default true, O10; the response derives `status` — never stored); `chk_offers_value` → `chk_offers_value_for_kind` (`percent` whole 1–100, `amount` / `fixed` > 0, `extra` whole 1–99 — O11); `chk_offers_code` `^[A-Z0-9]+$` (no empty code) and unique index `idx_offers_organization_code_unique` `(organization_id, code)` on live offers with a code (O11); `idx_offers_organization_starts_on` now `(organization_id, coalesce(starts_on, '-infinity'), id)` on live offers — the `starts_on` sort keeps offers without a start. Links `app.offer_offerings` (1–50 live, active offerings — O12) and `app.offer_branches` (none = every branch — O5) unchanged.
```mermaid
erDiagram
  offers["app.offers · NEW"] {
    id id PK
    text name
    text code "unique among live offers"
    choice kind
    money value
    date starts_on
    date ends_on
    boolean is_active
    choice tone
    text note
  }
  offer_offerings["app.offer_offerings · NEW"] {
    id offer_id FK "→ offer"
    id offering_id FK "→ offering"
  }
  offer_branches["app.offer_branches · NEW"] {
    id offer_id FK "→ offer"
    id branch_id FK "→ branch"
  }
  offers ||--|{ offer_offerings : "applies to (1–50)"
  offers ||--o{ offer_branches : "runs at (none = every branch)"
```

## Stage 3 — People and conversations

### contact · NEW (route review)

- **Holds:** One person — name, numbers, Instagram, preferences, household — shared by their lead, activity, patient file and appointments (CT1). Read by every person picker (`GET /app/contacts?q=`), the contact editor and the hover card; written by the contact editor.
- **Table:** `app.contacts` + `app.contact_phones` + `app.contact_members` — routes-final §4.A–4.B (CT1–CT3, CT9–CT14)
- **Sources:** routes-final §4.A.3, §4.B.3 · D61
- **Open:** none

- **Built (ROUTE #129, sub-domain 4):** `app.contacts` as 4.A.3 — `contact_number` from the record counter (`trg_contacts_contact_number`), `household_contact_id` defaulting to the row itself (`trg_contacts_household`, `ON DELETE RESTRICT`), `search_text` (lower-cased names, email, Instagram, `c-<number>`, every live number's last 10 digits) kept by `trg_contacts_search_text` and `trg_contact_phones_search_text`, `primary_phone` written by the service with the numbers; CHECKs for gender, channel, referral source, the tag list (`array_to_string` against the key pattern, ≤ 12), Instagram ≤ 5, birth date ≤ `CURRENT_DATE`, referrer only with source `patient`, the soft-delete trio; indexes: trigram GIN on `search_text`, `(organization_id, first_name, coalesce(last_name, ''), id)`, `(organization_id, created_at, id)`, `(organization_id, coalesce(last_activity_at, '-infinity'), id)` (all live rows), GIN on `preference_tags`, unique `(id, household_contact_id)`. `app.contact_phones` (no public id) — key `(contact_id, phone)`, composite key `(contact_id, household_contact_id)` → `app.contacts` `ON UPDATE CASCADE ON DELETE CASCADE`, one primary (partial unique), `EXCLUDE USING gist (organization_id =, phone =, household_contact_id <>)` on live numbers (`btree_gist`), `deleted_at` follows the contact. `app.contact_members` — key `(contact_id, membership_id)`, `(organization_id, membership_id)` → `tenancy.memberships` `ON DELETE CASCADE` (K8), index `(organization_id, membership_id, contact_id)`. RLS ENABLE + FORCE on all three; the purge's retention arm on `app.contacts`. The person columns leave `app.leads` (#131) and `app.patients` (#133) with their rows (D61). Code `app/sub-domains/contacts/` (+ `contact-members/`).
```mermaid
erDiagram
  contacts["app.contacts · NEW"] {
    id id PK
    number contact_number
    text first_name
    text last_name
    choice gender
    date date_of_birth
    text email
    text address
    json instagram_handles
    choice default_channel
    json preference_tags
    boolean has_marketing_consent
    datetime notices_stopped_at
    choice referral_source
    id referred_by_contact_id FK "→ contact"
    text referred_by_name
    id household_contact_id FK "→ contact"
    text primary_phone
    datetime last_activity_at
    datetime last_sent_at
    datetime last_received_at
    text search_text
  }
  contact_phones["app.contact_phones · NEW"] {
    id contact_id FK "→ contact"
    id household_contact_id FK "→ contact"
    text phone
    boolean is_primary
    boolean is_on_whatsapp
  }
  contact_members["app.contact_members · NEW"] {
    id contact_id FK "→ contact"
    id membership_id FK "→ membership"
  }
  contacts ||--|{ contact_phones : "has 1–5 numbers (one primary)"
  contacts ||--o{ contact_members : "is handled by"
  contacts |o--o{ contacts : "household / referred by"
```

- **Built (ROUTE #130, sub-domain 4 — 4.C–4.D):** `app.messages` → `app.contact_activities` — append-only (no soft-delete columns, not in the purge list; goes with its contact `ON DELETE CASCADE`), `contact_id`, `type` `varchar(9)` (D62) `whatsapp` · `instagram` · `call_log` · `note` · `system`, `direction`, `body varchar(1000)`, `contact_message_template_id`, `attachment_keys`, `reply_to_contact_activity_id`, `delivery_status` (exactly on a sent message), `provider_message_id` (unique per organization), `failure_reason`, `occurred_at`, `delivered_at` / `read_at` / `failed_at`, `author_membership_id` (composite key to memberships, `RESTRICT` — K2, K8), the twelve record links (`num_nonnulls ≤ 1`, each `SET NULL` to today's table — D63); indexes `(contact_id, occurred_at, id)`, `(contact_id, created_at, id)`, the worker queue `(organization_id, occurred_at) WHERE delivery_status IN ('queued','failed')`, one per link. `app.message_templates` → `app.contact_message_templates` — `type` `whatsapp` · `instagram` (was `channel` with six values), `body varchar(1000)`, the list index `(organization_id, created_at DESC, id)` on live rows. `app.lead_reads` dropped (M3). Code `app/sub-domains/contacts/contact-activities/`, `contact-message-templates/`.
- **Built (ROUTE #133, D69):** `is_private_photo` boolean (default false) — an entry about a private-album photo, hidden from callers without `patient:private_album:read` (M10, PC16); re-set when the photo moves albums
- **Built (ROUTE #139, D77):** `delivery_claimed_at` (timestamptz — a delivery job's claim on a `queued` message, stale after 5 minutes; `chk_contact_activities_delivery_claim` keeps it on queued WhatsApp / Instagram messages only) and `provider_sender_id` (`varchar(64)` — the Instagram-scoped id of a received Instagram message, the reply address; `chk_contact_activities_provider_sender`, index `idx_contact_activities_organization_provider_sender_id`); the RLS policy gains the `global_retention_cleanup` arm (the delivery sweep reads across organizations)
- **Built (ROUTE #140–#142, D78):** `automation_kind` (`varchar(16)` — what a message Clinozy queued is for: `booking_confirm`, `booking_reminder`, `payment_receipt`, `payment_reminder`, `feedback_request`; `chk_contact_activities_automation_kind` keeps it on sent WhatsApp entries with no author) — the booking messages move their appointment's `reminder_status`, a move or cancel stops the unclaimed one (`failure_reason` `reminder_stopped`), and a receipt goes once per payment; no change to `app.appointments` (its `reminder_status` and `is_confirmed_by_reply` were already there, A13)
- **Built (launch-confidence M1, M5 — D32):** `template_parameters` (`text[]`, at most 12, only with an `automation_kind` — `chk_contact_activities_template_parameters`): the notice's WhatsApp template parameters, sent as the approved template outside the person's 24-hour window; `app.contacts.notices_stopped_at` (`timestamptz`): a STOP reply on WhatsApp stops the automated notices to the person until START
```mermaid
erDiagram
  contact_activities["app.contact_activities · NEW"] {
    id id PK
    id contact_id FK "→ contact"
    choice type
    choice direction
    text body
    id contact_message_template_id FK "→ contact_message_template"
    json attachment_keys
    id reply_to_contact_activity_id FK "→ contact_activity"
    choice delivery_status
    text provider_message_id
    text failure_reason
    datetime delivery_claimed_at "ADDED #139"
    text provider_sender_id "ADDED #139"
    datetime occurred_at
    id author_membership_id FK "→ membership"
    id appointment_id FK "→ appointment (one of twelve links)"
  }
  contact_message_templates["app.contact_message_templates · NEW"] {
    id id PK
    text name
    text body
    choice type
  }
  contacts ||--o{ contact_activities : "has a stream"
  contact_message_templates |o--o{ contact_activities : "is used by"
```

### messaging_webhook_event · NEW (built, not planned)

- **Holds:** a Meta webhook update (a WhatsApp or Instagram message, or a delivery report) stored for its organization until the processing job applies it (D77).
- **Built (ROUTE #139, D77):** `app.messaging_webhook_events` — `organization_id`, `channel` (`whatsapp` · `instagram`), `payload` jsonb (the update with its `account_id`), `payload_hash` (sha256 — Meta's retry is the same row: unique `(organization_id, payload_hash)`), `status` (`pending` · `processed` · `failed`), `claimed_at`, `attempt_count` (failed after 5), `failure_reason` ≤ 280, `received_at`, `processed_at`; the pending index `(organization_id, received_at, id)` and `(received_at)` for the 30-day purge of processed and failed rows; ENABLE + FORCE RLS with the organization policy and the `global_retention_cleanup` arm. The webhook splits a callback per organization at ingress — a tenant table, not a system one

```mermaid
erDiagram
  messaging_webhook_events["app.messaging_webhook_events · NEW #139"] {
    id id PK
    id organization_id FK "→ organization"
    choice channel
    json payload
    text payload_hash
    choice status
    datetime claimed_at
    number attempt_count
    text failure_reason
    datetime received_at
    datetime processed_at
  }
```

### patient · NEW

- **Holds:** A registered patient. Read by Patients, Patient file, every patient picker, contact card, print sheets; written by New/Edit patient drawer.
- **Table (proposal):** `app.patients` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:287–317 · PRD.md:60–64, 134 · patients.md · patient-file.md:20–22
- **Added** (a frontend request, D3, unless a decision is named): `referred_by_name` (patients.md:55), `consent_data` (patients.md:79; patient-file.md:510), `consent_photos` (patients.md:79), `consent_marketing` (patients.md:79), `language` (patient-file.md:21), `phones` (patient-file.md:21, 509), `instagram_handles` (patient-file.md:509), `default_channel` (leads.md:415), `preferences` (leads.md:96–101), `household` (leads.md:440–442), `allergies` (today.md:134, 255), `contraindications` (today.md:255)
- **Replaced (schema-routes field → now):** `complaints` → patient_clinical_note, `diagnosis` → patient_clinical_note, `treatment_suggestions` → patient_clinical_note, `future_suggestions` → patient_clinical_note, `consent_given` → consent_data / consent_photos / consent_marketing, `phone2` → phones
- **Open:** none — access per D12, D15, D16

- **Built:** `app.patients` · ROUTE #13 (2026-10-07)
- **Built (ROUTE #133, sub-domain 7 — routes-final 7.A, the clinical side of a contact):** `app.patients` — `contact_id` `NOT NULL` → contacts `ON DELETE RESTRICT` with `idx_patients_organization_contact_unique` (one live file per contact, P1); every person column (names, phones, email, gender, date of birth, address, referral, Instagram, channel, preferences, household, marketing consent, language) and `search_text` gone (P2); `home_branch_id` `RESTRICT`; `types` ≤ 6 of the six; `status`; `conversion` (P4); `doctor_membership_id` a K8 composite key `RESTRICT` (K2); `follow_up_at`; `notes` ≤ 2000; `lead_id` `SET NULL` (P10); the two consents; `allergies`, `contraindications` ≤ 30 each; the 7.A.3 indexes; FORCE RLS without the retention arm and out of the purge list (P7); every table pointing at a patient `ON DELETE RESTRICT` as each is rebuilt (the patient file's six at #133)
```mermaid
erDiagram
  patient["patient · NEW"] {
    id id PK
    number seq
    text first_name
    text last_name
    text phone
    text email
    choice gender
    date date_of_birth
    text address
    id home_branch_id FK "→ branch"
    json types
    choice status
    choice conversion
    choice referral_source
    id referred_by_patient_id FK "→ patient"
    id doctor_id FK "→ user"
    datetime follow_up_at
    text notes
    id lead_id FK "→ lead"
    text referred_by_name
    boolean consent_data
    boolean consent_photos
    boolean consent_marketing
    text language
    json phones
    json instagram_handles
    choice default_channel
    json preferences
    text household
    json allergies
    json contraindications
  }
```

### lead · NEW

- **Holds:** An enquiry and its conversation until the person becomes a patient. Read by Leads, lead drawer, appointment form (connected leads), contact card; written by Leads, appointment check-in (status → clinic_visited), automations (re-target).
- **Table (proposal):** `app.leads` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:242–264 · PRD.md:48–52, 133 · leads.md
- **Added** (a frontend request, D3, unless a decision is named): `last_touch_at` (leads.md:402; H:5738), `phones` (leads.md:96–101), `instagram_handles` (leads.md:96–101), `default_channel` (leads.md:96–101, 415), `preferences` (leads.md:96–101), `household` (leads.md:440–442)
- **Open:** none — Contacted on a first reply or a logged call (P21, D40); re-target leads daily, staff send the first message (D35); contact fields on Lead and Patient (P16, D3)

- **Built:** `app.leads` · ROUTE #14 (2026-10-07)
```mermaid
erDiagram
  lead["lead · NEW"] {
    id id PK
    number seq
    text name
    text phone
    text email
    choice status
    choice source
    json interests
    id owner_id FK "→ user"
    json involved_ids "→ user list"
    datetime follow_up_at
    id branch_id FK "→ branch"
    id patient_id FK "→ patient"
    boolean is_contact_thread
    choice kind
    text retarget_reason
    text notes
    datetime last_touch_at
    json phones
    json instagram_handles
    choice default_channel
    json preferences
    text household
  }
```

- **Built (ROUTE #131, sub-domain 5 — routes-final §5, rebuilt on the contact):** `app.leads` — `lead_number` (the record counter, `trg_leads_lead_number`), `contact_id` → contacts `ON DELETE RESTRICT` (L1; the person columns, `search_text`, `is_contact_thread`, `patient_id`, `last_touch_at` gone), `status` `varchar(14)` default `new` (the 8 statuses), `source` `varchar(9)`, `interests text[]` (`<@` the 6, ≤ 6), `kind` `enquiry` · `retarget` (L5) with `retarget_reason` only on a re-target lead, `owner_membership_id` (K8 composite key, `ON DELETE SET NULL ("owner_membership_id")`), `held_until` (needs an owner — `chk_leads_held_until_owner`), `follow_up_at`, `branch_id`, `notes` ≤ 2000; the one-open-lead-per-contact partial unique index `idx_leads_organization_contact_open_unique` (L6) and the list indexes of 5.3; RLS with the purge arm. `app.lead_involved_memberships` — `membership_id` (L2, K8 composite key `ON DELETE RESTRICT`, K2), key `(lead_id, membership_id)`, index `(organization_id, membership_id, lead_id)`. `app.lead_reads` dropped (L10, with #130). Leads read their contact's summary and activity, and `patient_id` through `patients.lead_id` until patient files point at contacts (#133).
```mermaid
erDiagram
  leads["app.leads · REBUILT"] {
    id id PK
    number lead_number
    id contact_id FK "→ contact (RESTRICT)"
    choice status
    choice source
    json interests
    choice kind
    text retarget_reason
    id owner_membership_id FK "→ membership"
    datetime held_until
    datetime follow_up_at
    id branch_id FK "→ branch"
    text notes
  }
  lead_involved_memberships["app.lead_involved_memberships · CHANGED"] {
    id lead_id FK "→ lead"
    id membership_id FK "→ membership"
  }
  contacts ||--o{ leads : "has (one open at a time)"
  leads ||--o{ lead_involved_memberships : "is worked by"
```

### lead_message · NEW

- **Holds:** One chat line in a lead / contact thread. Read by lead drawer chat, appointment form chat, Offering suggestions › Contact activity; written by lead drawer composer and system events.
- **Table (proposal):** `app.lead_messages` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:268–283 · PRD.md:112 · leads.md:44–55, 109–120
- **Added** (a frontend request, D3, unless a decision is named): `record_type` (leads.md:54; tasks.md:83), `record_id` (leads.md:54; tasks.md:83)
- **Open:** none — real WhatsApp and Instagram (D32, D3); no SMS or email (D33); the provider is chosen at kickoff

- **Built:** `app.lead_messages` · ROUTE #15 (2026-10-07)
```mermaid
erDiagram
  lead_message["lead_message · NEW"] {
    id id PK
    id lead_id FK "→ lead"
    choice channel
    choice direction
    text body
    choice delivery_status
    boolean is_system
    id author_id FK "→ user"
    id task_id FK "→ task"
    datetime sent_at
    text record_type
    id record_id
  }
```

### lead_read · NEW

- **Holds:** Where each viewer last read a lead's conversation (per-viewer unread).
- **Table (proposal):** `app.lead_reads` — domain not chosen yet (Step 4)
- **Sources:** leads.md:32, 36
- **Open:** none

- **Built:** `app.lead_reads` · ROUTE #16 (2026-10-07)
```mermaid
erDiagram
  lead_read["lead_read · NEW"] {
    id id PK
    id lead_id FK "→ lead"
    id user_id FK "→ user"
    datetime last_read_at
  }
```

### message_template · NEW

- **Holds:** A reusable message (greeting, price, free slots, location, reminder, aftercare, follow-up, review) with fill-in placeholders.
- **Table (proposal):** `app.message_templates` — domain not chosen yet (Step 4)
- **Sources:** leads.md:427–432 · _patterns.md:178–183 · H:5743
- **Open:** none — Owner and Admin edit them (D40)

- **Built:** `app.message_templates` · ROUTE #17 (2026-10-07)
```mermaid
erDiagram
  message_template["message_template · NEW"] {
    id id PK
    text name
    text body
    choice channel
  }
```

## Stage 4 — Scheduling and the visit

### branch_holiday · NEW

- **Holds:** A day a branch is closed — no slots are offered (D41).
- **Table (proposal):** `app.branch_holidays` — domain not chosen yet (Step 4)
- **Sources:** D41 · H:2349
- **Open:** none

- **Built:** `app.branch_holidays` · ROUTE #18 (2026-10-07); code moved to `app/sub-domains/branches/branch-holidays/`, served under `/branches/{branch_id}/holidays` · ROUTE #125 (2026-10-08)
```mermaid
erDiagram
  branch_holiday["branch_holiday · NEW"] {
    id id PK
    id branch_id FK "→ branch"
    date date
    text label
  }
```

### room · NEW

- **Holds:** A bookable room of a branch (D28).
- **Table (proposal):** `app.rooms` — domain not chosen yet (Step 4)
- **Sources:** PRD.md:56–57 · D28
- **Open:** none

- **Built:** `app.rooms` · ROUTE #19 (2026-10-07) → **`app.branch_rooms`** (D9), code `app/sub-domains/branches/branch-rooms/`, served under `/branches/{branch_id}/rooms` · ROUTE #125 (2026-10-08)
```mermaid
erDiagram
  room["room · NEW"] {
    id id PK
    id branch_id FK "→ branch"
    text name
    boolean active
  }
```

### machine · NEW

- **Holds:** A bookable machine of a branch, e.g. a laser (D28).
- **Table (proposal):** `app.machines` — domain not chosen yet (Step 4)
- **Sources:** PRD.md:56–57 · D28
- **Open:** none

- **Built:** `app.machines` · ROUTE #20 (2026-10-07) → **`app.branch_machines`** (D9), code `app/sub-domains/branches/branch-machines/`, served under `/branches/{branch_id}/machines` · ROUTE #125 (2026-10-08)
```mermaid
erDiagram
  machine["machine · NEW"] {
    id id PK
    id branch_id FK "→ branch"
    text name
    boolean active
  }
```

### appointment · NEW

- **Holds:** A booking of a person with a doctor. Read by Today, Appointments, patient file, Tasks; written by appointment form, status strip, Cancel visit, check-in.
- **Table (proposal):** `app.appointments` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:321–350 · PRD.md:54–58, 135 · appointments.md
- **Added** (a frontend request, D3, unless a decision is named): `room_id` (D28), `machine_id` (D28), `patient_package_id` (appointments.md:71, 73), `reminder_status` (appointments.md:30, 359–360), `confirmed_by_reply` (appointments.md:360; H:5971), `move_count` (appointments.md:30, 370)
- **Replaced (schema-routes field → now):** `room` → room_id → room (D28)
- **Open:** none — a room and a machine per branch (D28); no-show by staff after the start (D30); a confirm request + one reminder (D34); cancel reasons + rescheduling_later, booked_by_mistake (P9, D40); the package named on the appointment (B3, D40)

- **Built:** `app.appointments` · ROUTE #21 (2026-10-07)
```mermaid
erDiagram
  appointment["appointment · NEW"] {
    id id PK
    number seq
    id patient_id FK "→ patient"
    id lead_id FK "→ lead"
    id branch_id FK "→ branch"
    choice type
    id offering_id FK "→ offering"
    text service_label
    id doctor_id FK "→ user"
    id therapist_id FK "→ user"
    date date
    text start_time
    number duration_min
    choice status
    choice cancel_reason
    text cancel_note
    datetime rescheduled_from
    text reason
    text notes
    datetime follow_up_at
    datetime checked_in_at
    datetime completed_at
    id copied_from_id FK "→ appointment"
    id room_id FK "→ room"
    id machine_id FK "→ machine"
    id patient_package_id FK "→ patient_package"
    choice reminder_status
    boolean confirmed_by_reply
    number move_count
  }
```

- **Built (ROUTE #132, sub-domain 6 — routes-final §6, the visit merged in):** `app.appointments` — `contact_id` → contacts `ON DELETE RESTRICT` (A1; `patient_id`, `lead_id`, their check and `patient_package_id` gone — A12), `branch_room_id` / `branch_machine_id` (A2), `duration_minutes smallint` 5–240 and a multiple of 5 (A13), the generated `time_range tsrange` and the three exclusion constraints `excl_appointments_doctor_time` / `_room_time` / `_machine_time` over live scheduled, confirmed, checked-in and completed bookings, walk-ins exempt (A3, `btree_gist`); `checked_in_at` / `completed_at` set exactly with their status, `visit_stage` (`waiting` · `with_doctor` · `treatment` · `checkout` · `pharmacy`) with `visit_stage_changed_at` exactly while `checked_in`, `visit_paused_at` only then (A5, A10); the doctor and therapist K8 composite keys `ON DELETE RESTRICT` (K2); notes ≤ 2000; the indexes of 6.3 (day view, branch day, doctor date, a contact's visits, the floor) plus each foreign key's. `app.patients.contact_id` (D68 — nullable until #133, one live file per contact).
```mermaid
erDiagram
  appointments["app.appointments · REBUILT"] {
    id id PK
    number appointment_number
    id contact_id FK "→ contact (RESTRICT)"
    id branch_id FK "→ branch"
    choice type
    id offering_id FK "→ offering"
    text service_label
    id doctor_membership_id FK "→ membership"
    id therapist_membership_id FK "→ membership"
    id branch_room_id FK "→ branch_room"
    id branch_machine_id FK "→ branch_machine"
    date appointment_date
    time start_time
    number duration_minutes
    range time_range "generated — EXCLUDE doctor / room / machine"
    choice status
    boolean is_walk_in
    choice visit_stage
    datetime visit_stage_changed_at
    datetime visit_paused_at
    datetime checked_in_at
    datetime completed_at
    id copied_from_appointment_id FK "→ appointment"
  }
  contacts ||--o{ appointments : "is booked"
```

### visit · NEW

- **Holds:** One visit in progress (frontend D18): the floor stage and when it changed, the consult note and the safety checks — shared by Today's Visit sheet and the patient file's visit flow.
- **Table (proposal):** `app.visits` — domain not chosen yet (Step 4)
- **Sources:** today.md:38–46, 78–121, 157–163 · patient-file.md:92–101, 392–404 · frontend D18, D20
- **Open:** none — the server moves a card only on an explicit stage call (P2, D40); lanes (P1, D3)

- **Built:** `app.visits` · ROUTE #22 (2026-10-07)
```mermaid
erDiagram
  visit["visit · NEW"] {
    id id PK
    id appointment_id FK "→ appointment"
    id patient_id FK "→ patient"
    choice stage
    datetime stage_changed_at
    datetime started_at
    datetime paused_at
    datetime completed_at
    datetime last_saved_at
    text consult_complaint
    text consult_findings
    text consult_plan
    json diagnoses
    boolean safety_consent_checked
    boolean safety_before_photos_taken
    boolean safety_allergies_checked
  }
```

## Stage 5 — The clinical record


- **Removed (ROUTE #132, A10):** `app.visits` dropped — the floor stage, its times and pause are columns of `app.appointments`; the consult notes, diagnoses and safety checks move to the patient file (sub-domain 7, #133).

### diagnosis · NEW

- **Holds:** The diagnosis catalogue the consult note picks from.
- **Table (proposal):** `app.diagnosises` — domain not chosen yet (Step 4)
- **Sources:** today.md:84
- **Open:** none — prescribers add entries (D14, D40)

- **Built:** `app.diagnoses` · ROUTE #23 (2026-10-07)
- **Built (ROUTE #133, routes-final 7.E):** renamed **`app.patient_diagnoses`** (P28) — `name` ≤ 120, non-empty, unique per organization in any case among live entries; the name list index; FORCE RLS with the purge arm; pointed at by `patient_clinical_notes.patient_diagnosis_id` `SET NULL`
```mermaid
erDiagram
  diagnosis["diagnosis · NEW"] {
    id id PK
    text name
  }
```

### patient_clinical_note · NEW

- **Holds:** One short clinical note item (complaint, diagnosis, treatment suggestion, future suggestion) with who added it and when — replaces the four free-text fields on Patient.
- **Table (proposal):** `app.patient_clinical_notes` — domain not chosen yet (Step 4)
- **Sources:** patient-file.md:53, 225 · H:780
- **Open:** none — replaces Patient.complaints / diagnosis / treatment_suggestions / future_suggestions (D3)

- **Built:** `app.patient_clinical_notes` · ROUTE #24 (2026-10-07)
- **Built (ROUTE #133, routes-final 7.B):** six kinds (`finding`, `safety_check` added — P12); `appointment_id` `SET NULL`; `patient_diagnosis_id` `SET NULL` with `chk_patient_clinical_notes_patient_diagnosis` (a `diagnosis` note only); text 1–500; `patient_id` `RESTRICT` (P7); indexes `(patient_id, kind, created_at)`, the newest-first list, the visit and catalogue keys
```mermaid
erDiagram
  patient_clinical_note["patient_clinical_note · NEW"] {
    id id PK
    id patient_id FK "→ patient"
    choice kind
    text text
    datetime added_at
    id added_by_id FK "→ user"
  }
```

### prescription · NEW

- **Holds:** A doctor's Rx for a patient. Read by patient file, Rx viewer, print, Medical "Prescriptions to fill"; written by Prescription drawer.
- **Table (proposal):** `app.prescriptions` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:354–370 · PRD.md:116–120, 136 · patient-file.md:105–121 · today.md:78–93
- **Added** (a frontend request, D3, unless a decision is named): `status` (D31; today.md:59, 90–92), `approved_at` (D31), `approved_by_id` (D31), `print_language` (today.md:87; D40)
- **Open:** none — draft, then approved by a prescriber (D31); print language stored per prescription (D40); the prescribe code on Doctor and Admin (D13, D14)

- **Built:** `app.prescriptions` · ROUTE #25 (2026-10-07)
- **Built (ROUTE #133, routes-final 7.C):** renamed **`app.patient_prescriptions`** (P27) — `prescription_number` (counter `trg_patient_prescriptions_prescription_number`); `items` `jsonb` array ≤ 30 (P16); `advice`, `lab_report`, `procedure_today` ≤ 2000; the doctor and the new `approved_by_membership_id` K8 composite keys `RESTRICT` with `chk_patient_prescriptions_approved` (P15); the pharmacy-queue index `(organization_id, status, prescription_date, id)`; `patient_id` `RESTRICT`; invoices, medical sales and the activity stream repointed
```mermaid
erDiagram
  prescription["prescription · NEW"] {
    id id PK
    number seq
    id patient_id FK "→ patient"
    id appointment_id FK "→ appointment"
    id doctor_id FK "→ user"
    date date
    json items
    text advice
    text lab_report
    text procedure_today
    date follow_up_date
    choice status
    datetime approved_at
    id approved_by_id FK "→ user"
    choice print_language
  }
```

### prescription_kit · NEW

- **Holds:** A doctor's one-tap prescription (kit / quick-add): a named set of medicine lines.
- **Table (proposal):** `app.prescription_kits` — domain not chosen yet (Step 4)
- **Sources:** patient-file.md:278 · today.md:86 · H:763, 4810
- **Open:** none

- **Built:** `app.prescription_kits` · ROUTE #26 (2026-10-07)
- **Built (ROUTE #133, routes-final 7.D):** `owner_membership_id` — a K8 composite key `ON DELETE CASCADE` (P17; was the audit column); the name ≤ 80, non-empty, unique per owner in any case among live kits; `items` with the prescription's checks; index `(owner_membership_id, created_at DESC)`; a leaver's kits soft-deleted by the leave step (K4)
```mermaid
erDiagram
  prescription_kit["prescription_kit · NEW"] {
    id id PK
    id doctor_id FK "→ user"
    text name
    json items
  }
```

### patient_image · NEW

- **Holds:** A clinical photo. Read by patient Images tab, appointment form Photos card, viewer; written by upload + Photo details drawer.
- **Table (proposal):** `app.patient_images` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:418–432 · PRD.md:138 · patient-file.md:59–68, 205–219
- **Added** (a frontend request, D3, unless a decision is named): `display_name` (P45, D40)
- **Open:** none — an editable display name (P45, D40); Private album per schema-routes (P46)

- **Built:** `app.patient_images` · ROUTE #27 (2026-10-07)
- **Built (ROUTE #133, routes-final 7.F):** `patient_treatment_id` → treatments `SET NULL` and `stage` (`before` · `after`) — P24; `body_part` `varchar(9)` on the patient file's one 15-part list (TR8); `file_name` from the upload; unique `(organization_id, file_key)` (P25); the tab index `(patient_id, album, taken_on DESC, id)`; `patient_id` `RESTRICT`
```mermaid
erDiagram
  patient_image["patient_image · NEW"] {
    id id PK
    id patient_id FK "→ patient"
    id appointment_id FK "→ appointment"
    choice album
    file file_url
    text file_name
    choice body_part
    date taken_on
    text caption
    text display_name
  }
```

### patient_report · NEW

- **Holds:** Lab / scan / consent document. Read + written in patient file Reports.
- **Table (proposal):** `app.patient_reports` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:436–448 · patient-file.md:143–157
- **Open:** none

- **Built:** `app.patient_reports` · ROUTE #28 (2026-10-07)
- **Built (ROUTE #133, routes-final 7.G):** `file_keys` ≤ 10 (confirmed uploads, P29), `notes` ≤ 1000, the name non-empty; index `(patient_id, report_date DESC, id)`; `patient_id` `RESTRICT`
```mermaid
erDiagram
  patient_report["patient_report · NEW"] {
    id id PK
    id patient_id FK "→ patient"
    choice type
    text name
    date date
    json files
    text notes
  }
```

### patient_note · NEW

- **Holds:** Timeline note on a patient. Read + written in patient file Notes.
- **Table (proposal):** `app.patient_notes` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:468–476 · patient-file.md:81–90
- **Open:** none

- **Built:** `app.patient_notes` · ROUTE #29 (2026-10-07)
- **Dropped (ROUTE #133, P20):** `app.patient_notes` and its routes — a team note is an activity `note` on the contact
```mermaid
erDiagram
  patient_note["patient_note · NEW"] {
    id id PK
    id patient_id FK "→ patient"
    text body
  }
```

## Stage 6 — Billing and money

### invoice · NEW

- **Holds:** A bill (clinic, consultation or medical). Read by Payments, patient file Billing, preview/print, plan card; written by the one invoice drawer (openInv) and Medical sale.
- **Table (proposal):** `app.invoices` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:602–620 · PRD.md:141 · payments.md:132–150
- **Added** (a frontend request, D3, unless a decision is named): `invoice_number` (D23), `financial_year` (D23)
- **Open:** none — numbered per branch GSTIN and financial year, own series without a GSTIN (D23, D40); overall discount before tax, GST-inclusive lines where marked (D20, D21) — to confirm with the accountant

- **Built:** `app.invoices` · ROUTE #30 (2026-10-07)
- **Built (ROUTE #136, routes-final 8.A, code `billing/invoices/`):** `app.invoices` — `invoice_sequence` and `invoice_number` / `financial_year` from the triggers (B11); `contact_id` → contacts `RESTRICT`, required except `medical` (B3, `chk_invoices_contact_unless_medical`; `patient_id` and `medical_contact_id` go); `subtotal`, `discount_total`, `taxable_total`, `gst_total`, `total` (`= taxable_total + gst_total`), `overall_discount`, `paid_amount` (`0 ≤ paid ≤ total`) stored by the save and the payment writes; generated `due_amount` and `payment_status`; `patient_prescription_id` `SET NULL`; the jsonb `items` goes. NEW **`app.invoice_items`** — one row per line: `line_number` (DEFERRABLE unique per invoice), exactly one of `offering_id` / `medicine_id` (`RESTRICT`), the snapshot (`name`, `pack_size`, `rate`, `gst_percent` 0/5/12/18/28, `is_gst_inclusive`), `quantity` 1–999, `discount_percent`, the computed `discount_amount` / `taxable_amount` / `gst_amount` / `amount`, `patient_offering_suggestion_id` `SET NULL`, `batch_number`. Renamed **`app.invoice_members`** (was `invoice_team_memberships`) — key `(invoice_id, membership_id)`, K8 `RESTRICT`. FORCE RLS on all three.
```mermaid
erDiagram
  invoice["invoice · NEW"] {
    id id PK
    number seq
    choice type
    id branch_id FK "→ branch"
    id patient_id FK "→ patient"
    id medical_contact_id FK "→ medical_contact"
    json team_ids "→ user list"
    json items
    money overall_discount
    date date
    text remark
    id prescription_id FK "→ prescription"
    id sale_id FK "→ medical_sale"
    text invoice_number
    text financial_year
  }
```

### patient_package · NEW

- **Holds:** A sold multi-session package. Read by patient file Packages, Offering suggestions (last purchases), Book; written by invoicing a package offering and by treatments using sessions.
- **Table (proposal):** `app.patient_packages` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:452–464 · patient-file.md:70–79, 159–169
- **Open:** none — package before its invoice settled (P33, D3)

- **Built:** `app.patient_packages` · ROUTE #31 (2026-10-07)
- **Built (ROUTE #135, routes-final 7.L):** renamed **`app.patient_offerings`** (code `patients/patient-offerings/`, PK4) — `sessions_total` / `sessions_used` `smallint` with `chk_patient_offerings_sessions_total` (1–999) and `chk_patient_offerings_sessions_used` (`0 ≤ used ≤ total`; the redundant `BETWEEN 0 AND 99` went); `valid_until` nullable (none = no expiry); `patient_id` and `offering_id` `RESTRICT`; indexes the tab `(patient_id, created_at DESC, id)`, the sessions-left `(patient_id, offering_id) WHERE sessions_used < sessions_total`, `(offering_id)`; FORCE RLS with the purge arm. **`invoice_id` stays** (nullable, `SET NULL`) until #136 replaces it with `invoice_item_id` → `app.invoice_items` `CASCADE`, unique (D71); every pointer to it repointed (`patient_treatments.patient_offering_id` `RESTRICT`, `contact_activities.patient_offering_id`)
- **Built (ROUTE #136, D72):** `invoice_item_id` `NOT NULL` → `app.invoice_items` `ON DELETE CASCADE`, unique (one patient offering per line, PK4); `invoice_id` goes — the response reads the invoice through the line.
```mermaid
erDiagram
  patient_package["patient_package · NEW"] {
    id id PK
    id patient_id FK "→ patient"
    id offering_id FK "→ offering"
    id invoice_id FK "→ invoice"
    number sessions_total
    number sessions_used
    date valid_until
  }
```

### offering_suggestion · NEW

- **Holds:** One row of a patient's plan ("Offering suggestions"). Read by appointment form, patient file, Today plan flag, invoice presets; written by the card (add / status / qty / price / link) and by invoice save (planLink).
- **Table (proposal):** `app.offering_suggestions` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:480–496 · PRD.md:123–124, 140 · patient-file.md:53, 56, 515–519
- **Open:** none — A28 settled (derived); ideas come from patient_idea (D39)

- **Built:** `app.offering_suggestions` · ROUTE #32 (2026-10-07)
- **Built (ROUTE #134, TR10):** `patient_check_in_id` → `app.patient_check_ins` `SET NULL` with its index — a check-in's next offerings are `planned` rows linked here (source label `Check-in`, no `reason`); the rest of the plan's rebuild is #135 (7.M)
- **Built (ROUTE #135, routes-final 7.M):** renamed **`app.patient_offering_suggestions`** (code `patients/patient-offering-suggestions/`) — `source_label` and `invoice_links` dropped (PK7, PK8); `suggested_by_membership_id` a K8 composite key `RESTRICT` (K2); `quantity` `smallint` 1–99; `patient_id` and `offering_id` `RESTRICT`; indexes the plan `(patient_id, created_at DESC, id)`, the duplicate check `(patient_id, offering_id) WHERE status <> 'declined'` (PK9), the visit's and the check-in's, `(offering_id)`, the suggester's; FORCE RLS with the purge arm
```mermaid
erDiagram
  offering_suggestion["offering_suggestion · NEW"] {
    id id PK
    id patient_id FK "→ patient"
    id offering_id FK "→ offering"
    number qty
    money price
    choice status
    text source_label
    id appointment_id FK "→ appointment"
    text reason
    id suggested_by_id FK "→ user"
    json invoice_links "→ invoice list"
  }
```

### patient_idea · NEW

- **Holds:** A patient's latest ideas from history — from the AI on a de-identified summary, or the rules as the fallback (D39); agent-os may hold it as a cache instead.
- **Table (proposal):** `app.patient_ideas` — domain not chosen yet (Step 4)
- **Sources:** D39 · schema-routes.md:1635 · H:4355–4367
- **Open:** none — the AI provider is chosen at kickoff (D39); only patients with Data consent; never name, phone, photos or note text

- **Built:** `app.patient_ideas` · ROUTE #33 (2026-10-07)
- **Dropped (ROUTE #133, P20):** `app.patient_ideas` (no routes) until its feature is built
- **Built again (ROUTE #152, D80, routes-final 7.N PI3–PI4):** `app.patient_ideas` — the stored AI
  ideas, a derived cache: one row per idea (at most 4), unique per patient and offering, no soft
  delete; the rules' ideas are computed on read, never stored. The stale mark lives on the patient:
  `app.patients.ideas_stale_since`, set by database triggers.
```mermaid
erDiagram
  patient_idea["app.patient_ideas · NEW"] {
    id id PK
    id organization_id FK "→ organization"
    id patient_id FK "→ patient (cascade)"
    id offering_id FK "→ offering (cascade)"
    number position "1–4"
    text reason "≤ 200"
    datetime created_at
  }
  patient["app.patients · CHANGED"] {
    datetime ideas_stale_since "NEW — the refresh's mark (PI4)"
  }
```

### payment · NEW

- **Holds:** One ledger entry — money in or out (PAY-####). Read by Payments, Medical › Payments, Day close, invoices; written by Receive, Pay, refunds, credit give-back, supplier bill payment.
- **Table (proposal):** `app.payments` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:640–662 · PRD.md:84–88, 142 · payments.md:25–39, 95–130
- **Added** (a frontend request, D3, unless a decision is named): `bill_allocations` (P58, D40), `reference` (payments.md:103), `attachments` (payments.md:124), `checked_at_close` (payments.md:61, 67)
- **Open:** none — reversal per schema-routes (P77); an amount above the due is refused (P78); one payment may cover several supplier bills (P58, D40)

- **Built:** `app.payments` · ROUTE #34 (2026-10-07)
- **Built (ROUTE #136, routes-final 8.C, code `billing/payments/`):** `app.payments` — `kind` (six) fixes `direction` (`chk_payments_kind_direction`, B17); `cash_amount`, `upi_amount`, `card_amount`, `credit_amount` with the sum CHECK (B18; the jsonb `splits` goes), `credit_amount > 0` only with `pending_credit_id`; `contact_id` (required for a receipt), `invoice_id`, `invoice_credit_note_id` (unique), `pending_credit_id`, `reverses_payment_id` (unique, `(kind = 'reversal') = (… IS NOT NULL)`); `payee_name` for expenses and supplier bills, `expense_category` only on an expense; `attachment_keys` ≤ 5; `bill_ref`, `bill_allocations`, `day_close_id`, `is_checked_at_close`, `patient_id` go (B6, B22).
- **Built (ROUTE #137, S11):** `stock_purchase_id` → `app.stock_purchases` `ON DELETE RESTRICT` (`idx_payments_stock_purchase_id`), set only on a `supplier_bill` or its `reversal` (`chk_payments_stock_purchase`) — the typed link sub-domain 8 left for supplier bills; the payment's money keeps the purchase's `paid_amount`.
```mermaid
erDiagram
  payment["payment · NEW"] {
    id id PK
    number seq
    choice direction
    choice kind
    id branch_id FK "→ branch"
    money amount
    json splits
    id patient_id FK "→ patient"
    id invoice_id FK "→ invoice"
    text payee_name
    choice expense_category
    json bill_ref
    id credit_note_id FK "→ credit_note"
    id pending_credit_id FK "→ pending_credit"
    text note
    datetime paid_at
    id day_close_id FK "→ day_close"
    json bill_allocations
    text reference
    file attachments
    boolean checked_at_close
  }
```

### payment_edit · NEW

- **Holds:** One logged change to a payment ("Edited 1× · last ₹600 UPI → ₹700 UPI").
- **Table (proposal):** `app.payment_edits` — domain not chosen yet (Step 4)
- **Sources:** payments.md:29, 109, 129
- **Open:** none

- **Built:** `app.payment_edits` · ROUTE #35 (2026-10-07)
- **Built (ROUTE #136, routes-final 8.C, B20):** `app.payment_edits` — append-only; `changes` jsonb object (`{ field: { from, to } }`), `author_membership_id` K8 `RESTRICT`; written by every `PATCH`, read at `GET /payments/{payment_id}/edits` (the repository folds into `payments.repository`).
```mermaid
erDiagram
  payment_edit["payment_edit · NEW"] {
    id id PK
    id payment_id FK "→ payment"
    datetime edited_at
    id edited_by_id FK "→ user"
    text before
    text after
  }
```

### credit_note · NEW

- **Holds:** Issued for every refund to a patient. Read by Payments and invoice views; written by refund flow.
- **Table (proposal):** `app.credit_notes` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:666–676 · PRD.md:88 · payments.md:179
- **Open:** none — only against an invoice (D22)

- **Built:** `app.credit_notes` · ROUTE #36 (2026-10-07)
- **Built (ROUTE #136, routes-final 8.B, code `billing/invoice-credit-notes/`):** renamed **`app.invoice_credit_notes`** — `credit_note_number` (the counter), `invoice_id` `RESTRICT`, `amount > 0`, `reason` 1–280; written only with its refund payment (B16).
```mermaid
erDiagram
  credit_note["credit_note · NEW"] {
    id id PK
    number seq
    id invoice_id FK "→ invoice"
    money amount
    text reason
  }
```

### pending_credit · NEW

- **Holds:** Money owed either way, not yet settled (Payments › Pending). Read + written by crNew drawer and its actions.
- **Table (proposal):** `app.pending_credits` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:680–695 · PRD.md:143 · payments.md:41–55, 152–180
- **Added** (a frontend request, D3, unless a decision is named): `invoice_id` (payments.md:160), `settle_by` (payments.md:161), `settled_amount` (payments.md:45, 179), `party_kind` (payments.md:45, 157), `note` (payments.md:162)
- **Open:** none — reasons from the one stored set + additions (P35); a give-back with no invoice is a refund payment, not a credit note (D22)

- **Built:** `app.pending_credits` · ROUTE #37 (2026-10-07)
- **Built (ROUTE #136, routes-final 8.D, code `billing/pending-credits/`):** `app.pending_credits` — `contact_id` or `party_name` (B23; `party_kind`, `patient_id`, `settled_payment_id` go), `settled_amount` (`0 ≤ … ≤ amount`, kept by the settlements, B24), `status` open exactly while some is left, `invoice_id` `SET NULL`, `source_payment_id` `SET NULL`, `settle_by` (the open partial index), `note` ≤ 300.
```mermaid
erDiagram
  pending_credit["pending_credit · NEW"] {
    id id PK
    number seq
    choice direction
    text party_name
    id patient_id FK "→ patient"
    money amount
    text reason
    id source_payment_id FK "→ payment"
    choice status
    id settled_payment_id FK "→ payment"
    id invoice_id FK "→ invoice"
    date settle_by
    money settled_amount
    choice party_kind
    text note
  }
```

### day_close · NEW

- **Holds:** One branch-day cash close. Read + written by Day close drawer.
- **Table (proposal):** `app.day_closes` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:699–713 · PRD.md:88 · payments.md:57–80, 182–194
- **Added** (a frontend request, D3, unless a decision is named): `difference_reason` (D24), `reopened_at` (payments.md:191), `reopened_by_id` (payments.md:191), `auto_closed` (payments.md:277, 327, 331), `opening_accepted_by_id` (payments.md:76, 327)
- **Open:** none — a reason when the count differs (D24); a day nobody closed is closed at midnight after it (D40); the close-the-day code on Accountant, Owner, Admin (D13, D18)

- **Built:** `app.day_closes` · ROUTE #38 (2026-10-07)
- **Built (ROUTE #136, routes-final 8.E, code `billing/day-closes/`):** `app.day_closes` — one per branch and day; `opening_source` `carried` · `recounted` (B25), `opening_accepted_by_membership_id` and `closed_by_membership_id` K8 `RESTRICT`; `expected_cash`, `counted_cash`, generated `difference`, the reason when it is not zero; `close_kind` `manual` · `auto` (B26); closed exactly when the close's fields are set; no soft-delete columns; the retention-cleanup read arm for the auto-close sweep (WC-39, D72).
- **Built (ROUTE #141, D78 WC-10):** `summary_sent_at` (timestamptz — the closed day's summary went to the admins on WhatsApp; `chk_day_closes_summary_sent`: only while `closed`, cleared by a reopen) and the pending index `idx_day_closes_summary_pending` (`closed_at`, where closed and not sent)
```mermaid
erDiagram
  day_close["day_close · NEW"] {
    id id PK
    id branch_id FK "→ branch"
    date date
    money opening_cash
    choice opening_source
    datetime opening_accepted_at
    money counted_cash
    datetime closed_at
    id closed_by_id FK "→ user"
    text difference_reason
    datetime reopened_at
    id reopened_by_id FK "→ user"
    boolean auto_closed
    id opening_accepted_by_id FK "→ user"
  }
```

### day_close_event · NEW

- **Holds:** One line of a day's "What happened" log (opened, recounted, closed, reopened, auto-closed).
- **Table (proposal):** `app.day_close_events` — domain not chosen yet (Step 4)
- **Sources:** payments.md:327, 423
- **Open:** none

- **Built:** `app.day_close_events` · ROUTE #39 (2026-10-07)
- **Built (ROUTE #136, routes-final 8.E, B27):** `app.day_close_events` — append-only; `kind` (opened · recounted · closed · auto_closed · reopened), `text`, `membership_id` K8 `RESTRICT`, `occurred_at`; written by each step (the repository folds into `day-closes.repository`).
```mermaid
erDiagram
  day_close_event["day_close_event · NEW"] {
    id id PK
    id day_close_id FK "→ day_close"
    datetime at
    id actor_id FK "→ user"
    text text
  }
```

## Stage 7 — Treatments and feedback

### treatment · NEW

- **Holds:** A procedure session record. Read by patient file Treatments, Tasks (aftercare calls); written by Treatment drawer.
- **Table (proposal):** `app.treatments` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:394–414 · PRD.md:137 · patient-file.md:123–141 · today.md:95–108
- **Added** (a frontend request, D3, unless a decision is named): `status` (today.md:105, 107; P89, D40), `reversed_reason` (today.md:107; D40), `reversed_at` (today.md:107; D40)
- **Open:** none — reversed with a reason, never deleted (P89, D40); the treatments code on Doctor and Therapist (D12, D13)

- **Built:** `app.treatments` · ROUTE #40 (2026-10-07)
- **Built (ROUTE #134, routes-final 7.H):** renamed **`app.patient_treatments`** (code `patients/patient-treatments/`) — no soft-delete columns, out of the purge list, no retention arm (TR6); `patient_package_id` → **`patient_offering_id`** `RESTRICT` (points at `app.patient_packages` until #135 renames it) with `chk_patient_treatments_patient_offering_done` (TR7, TR13); `chk_patient_treatments_reversed_reason`, `…_reversed_at`; `body_parts` on the one 15-part list, ≤ 12; `session_number` `smallint` 1–999; `parameters` an object; `aftercare_call` (`in_two_days`); the doctor and therapist K8 composite keys `RESTRICT` (K2); `patient_id` `RESTRICT`; indexes the tab, the organization list, the not-billed partial index (TR13), the link keys and the team's `(…, performed_at)`
```mermaid
erDiagram
  treatment["treatment · NEW"] {
    id id PK
    id patient_id FK "→ patient"
    id appointment_id FK "→ appointment"
    id offering_id FK "→ offering"
    text name
    choice template
    datetime performed_at
    id doctor_id FK "→ user"
    id therapist_id FK "→ user"
    json body_parts
    number session_no
    json params
    text remark
    choice aftercare_call
    id package_id FK "→ patient_package"
    choice status
    text reversed_reason
    datetime reversed_at
  }
```

### check_in · NEW

- **Holds:** Visit / aftercare check-in feedback. Read by Feedback card, treatments table, Tasks; written by ckNew drawer and task outcome "Doing well".
- **Table (proposal):** `app.check_ins` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:500–519 · PRD.md:125, 148 · patient-file.md:171–187
- **Open:** none — details up to 300 (P37, D40); score nullable (P32, D3)

- **Built:** `app.check_ins` · ROUTE #41 (2026-10-07)
- **Built (ROUTE #134, routes-final 7.I):** renamed **`app.patient_check_ins`** (code `patients/patient-check-ins/`) — `treatment_id` → `patient_treatment_id` `SET NULL`; `context` 1–80, server-filled (TR9); `score` `smallint` 1–10; `followed_note` ≤ 280, `current_state`, `next_plan` ≤ 500; `patient_id` `RESTRICT`; indexes the card `(patient_id, check_in_date DESC, id)`, a session's latest, the call-back partial index (feel `worse` or score ≤ 4); FORCE RLS with the purge arm. **`app.check_in_next_offerings` dropped** — the next offerings are plan rows (`offering_suggestions.patient_check_in_id`, TR10)
```mermaid
erDiagram
  check_in["check_in · NEW"] {
    id id PK
    id patient_id FK "→ patient"
    id appointment_id FK "→ appointment"
    id treatment_id FK "→ treatment"
    text context
    choice feel
    number score
    choice followed
    text followed_note
    text now
    text next_plan
    json next_offering_ids "→ offering list"
    id by_id FK "→ user"
    date date
  }
```

### review · NEW

- **Holds:** A public / internal review. Read by Feedback card, contact card About; written by rvNew drawer.
- **Table (proposal):** `app.reviews` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:523–538 · PRD.md:148 · patient-file.md:189–203
- **Open:** none — Marketing logs reviews through the reviews code (D16)

- **Built:** `app.reviews` · ROUTE #42 (2026-10-07)
- **Built (ROUTE #134, routes-final 7.J):** renamed **`app.patient_reviews`** (code `patients/patient-reviews/`) — `rating` `smallint` 1–5; `chk_patient_reviews_link` (`^https://`, TR11); `file_keys` ≤ 10; `patient_id` `RESTRICT`; indexes `(patient_id, review_date DESC, id)`, the call-back partial index (rating ≤ 3); FORCE RLS with the purge arm
```mermaid
erDiagram
  review["review · NEW"] {
    id id PK
    id patient_id FK "→ patient"
    id appointment_id FK "→ appointment"
    choice source
    number rating
    text text
    text link
    json files
    date date
    id by_id FK "→ user"
  }
```

### feedback_action · NEW

- **Holds:** The follow-up logged against negative feedback. Read + written by the Feedback card "Log action ⌄".
- **Table (proposal):** `app.feedback_actions` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:542–553 · patient-file.md:521
- **Open:** none — additions settled (P34, D3)

- **Built:** `app.feedback_actions` · ROUTE #43 (2026-10-07)
- **Built (ROUTE #134, routes-final 7.K):** renamed **`app.patient_feedback_actions`** (code `patients/patient-feedback-actions/`) — append-only: the `updated_*` and soft-delete columns gone, out of the purge list (TR12); `check_in_id` / `review_id` → `patient_check_in_id` / `patient_review_id` `CASCADE` with `chk_patient_feedback_actions_one_parent` (`num_nonnulls = 1`); `chk_patient_feedback_actions_note_when_other`; `author_membership_id` a K8 composite key `RESTRICT` (K2); indexes per parent `(…, created_at)`
```mermaid
erDiagram
  feedback_action["feedback_action · NEW"] {
    id id PK
    id check_in_id FK "→ check_in"
    id review_id FK "→ review"
    choice action
    text note
    id by_id FK "→ user"
  }
```

## Stage 8 — Medical store

### manufacturer · NEW

- **Holds:** Medicine brand on the pack. Read by medicine pickers, supplier/MR connections; written by Manufacturer drawer.
- **Table (proposal):** `app.manufacturers` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:741–750 · medical.md:89–103, 208–222
- **Open:** none

- **Built:** `app.manufacturers` · ROUTE #44 (2026-10-07)
- **Built (ROUTE #153, sub-domain 11.A):** `app.manufacturers` — `name` varchar(80) stored upper case (`name = upper(name)`), unique among live rows in any case (`idx_manufacturers_organization_name_unique`); `tone` the six swatches (`lav`, `sky`, `butter`, `blush`, `sage`, `mint`); `is_quick`; its suppliers and MRs are `app.supplier_manufacturers` / `app.medical_rep_manufacturers` rows (written from either side); derived `medicine_count`. Delete refused while a live medicine names it. Code `app/sub-domains/medical/manufacturers/`.
```mermaid
erDiagram
  manufacturer["manufacturer · NEW"] {
    id id PK
    text name
    choice tone
    boolean is_quick
  }
```

### supplier · NEW

- **Holds:** Medicine distributor (Medical). Read by PO, medicine rates, Pay bill picker; written by Supplier drawer.
- **Table (proposal):** `app.suppliers` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:754–765 · medical.md:73–87, 190–206
- **Open:** none — one payment may cover several bills (P58, D40)

- **Built:** `app.suppliers` · ROUTE #45 (2026-10-07)
- **Built (ROUTE #153, sub-domain 11.B):** `app.suppliers` — `name` varchar(120) unique among live rows in any case, `phone` varchar(13) `+91` and ten digits, `gst_number` varchar(15) the GSTIN pattern, `is_quick`; `app.supplier_manufacturers` (key `supplier_id`, `manufacturer_id`, both `CASCADE`); derived `payable` (received orders' dues less open credits), `ageing_days`, `order_count`. Code `app/sub-domains/medical/suppliers/`.
```mermaid
erDiagram
  supplier["supplier · NEW"] {
    id id PK
    text name
    text phone
    text gst_number
    json manufacturer_ids "→ manufacturer list"
    boolean is_quick
  }
```

### medical_rep · NEW

- **Holds:** Medical representative. Read + written by Medical › MRs.
- **Table (proposal):** `app.medical_reps` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:769–779 · medical.md:105–119, 224–237
- **Open:** none

- **Built:** `app.medical_reps` · ROUTE #46 (2026-10-07)
- **Built (ROUTE #153, sub-domain 11.F):** `app.medical_reps` — `name` varchar(120) (not unique), `phone`, `next_visit_on` date (the `medical_rep_visit` task rule's date, MD8); `app.medical_rep_manufacturers` (key `medical_rep_id`, `manufacturer_id`); derived `last_visit_on`, `last_samples`, `is_visit_overdue`. Code `app/sub-domains/medical/medical-reps/`.
```mermaid
erDiagram
  medical_rep["medical_rep · NEW"] {
    id id PK
    text name
    text phone
    json manufacturer_ids "→ manufacturer list"
    date next_visit_on
  }
```

### medical_rep_visit · NEW

- **Holds:** 
- **Table (proposal):** `app.medical_rep_visits` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:783–791 · medical.md:239–252
- **Open:** none

- **Built:** `app.medical_rep_visits` · ROUTE #47 (2026-10-07)
- **Built (ROUTE #153, sub-domain 11.G):** `app.medical_rep_visits` — `medical_rep_id` (`CASCADE`), `visit_date`, `next_visit_on` (`> visit_date`), `samples` varchar(120), `notes` varchar(500), `logged_by_membership_id` (K8 key, `RESTRICT`); never changed, soft-deleted. Code `app/sub-domains/medical/medical-reps/medical-rep-visits/`.
```mermaid
erDiagram
  medical_rep_visit["medical_rep_visit · NEW"] {
    id id PK
    id mr_id FK "→ medical_rep"
    date date
    text samples
    text notes
  }
```

### medicine · NEW

- **Holds:** A medicine for sale in the Medical store. Read by Rx / sale / PO pickers, Medicines list; written by Medicine drawer, quick create, PO receive, sale (stock).
- **Table (proposal):** `app.medicines` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:795–812 · PRD.md:144 · medical.md:41–55, 170–188
- **Added** (a frontend request, D3, unless a decision is named): `rx_only` (medical.md:177), `near_expiry_discount_pct` (medical.md:17, 45, 50)
- **Open:** none — expiry is a month, MM/YY (B2, D40); MRP includes GST (D21)

- **Built:** `app.medicines` · ROUTE #48 (2026-10-07)
- **Built (ROUTE #153, sub-domain 11.D):** `app.medicines` — `medicine_number` (counter), `name` varchar(120) unique among live rows in any case, `composition` varchar(160), `manufacturer_id` (`RESTRICT`; required unless quick), `is_prescription_only`, `mrp` numeric(12,2) (`> 0`, or `0` while quick), `gst_percent` smallint (0 · 5 · 12 · 18 · 28), `min_stock` / `max_stock`, `quantity` integer (its batches' sum, MD4), `near_expiry_discount_percent` numeric(5,2), `is_quick`. The `batches` and supplier rates lists became `app.medicine_batches` and `app.medicine_supplier_prices` (below). Code `app/sub-domains/medical/medicines/`.
```mermaid
erDiagram
  medicine["medicine · NEW"] {
    id id PK
    number seq
    text name
    text composition
    id manufacturer_id FK "→ manufacturer"
    money mrp
    number gst_pct
    number min_stock
    number max_stock
    json batches
    json supplier_rates "→ supplier list"
    boolean is_quick
    boolean rx_only
    number near_expiry_discount_pct
  }
```

### medical_purchase_order · NEW

- **Holds:** 
- **Table (proposal):** `app.medical_purchase_orders` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:816–828 · PRD.md:145 · medical.md:57–71, 254–281
- **Open:** none

- **Built:** `app.medical_purchase_orders` · ROUTE #49 (2026-10-07)
- **Built (ROUTE #153, sub-domain 11.E):** `app.medical_purchase_orders` — `purchase_order_number` (counter), `supplier_id` (`RESTRICT`), `supplier_bill_number`, `order_date`, `stage` `ordered` · `received` with `received_at`, `total`, `paid_amount` (kept by supplier-bill payments, `app.payments.medical_purchase_order_id`), `credited_amount` (supplier credits), generated `due_amount` and `payment_status`; the cancel is the soft delete with its own reasons. The `items` list became `app.medical_purchase_order_items` (below). Code `app/sub-domains/medical/medical-purchase-orders/`.
```mermaid
erDiagram
  medical_purchase_order["medical_purchase_order · NEW"] {
    id id PK
    number seq
    id supplier_id FK "→ supplier"
    text supplier_bill_no
    date date
    choice stage
    json items
    money paid
    choice cancel_reason
  }
```

### medical_contact · NEW

- **Holds:** A walk-in customer of the medicine store (not a patient). Read by sale Customer picker, contact card; written by sale save.
- **Table (proposal):** `app.medical_contacts` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:832–840 · medical.md:155
- **Open:** none

- **Built:** `app.medical_contacts` · ROUTE #50 (2026-10-07)
- **Dropped (ROUTE #153, MD6):** a sale's buyer is an `app.contacts` record — `app.medical_contacts`, its routes and its folder are gone.
```mermaid
erDiagram
  medical_contact["medical_contact · NEW"] {
    id id PK
    text name
    text phone
  }
```

### medical_sale · NEW

- **Holds:** 
- **Table (proposal):** `app.medical_sales` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:844–856 · medical.md:25–39, 150–168, 283–295
- **Added** (a frontend request, D3, unless a decision is named): `lead_id` (medical.md:155; payments.md:138)
- **Open:** none — void and return effects settled (P54, P55, D3)

- **Built:** `app.medical_sales` · ROUTE #51 (2026-10-07)
- **Built (ROUTE #153, sub-domain 11.H):** `app.medical_sales` — `sale_number` (counter), `invoice_id` (unique, `RESTRICT` — its `medical` invoice, MD7), `contact_id` and `branch_id` (`RESTRICT`), `patient_prescription_id` (unique among live sales), `sold_at`; the void is the soft delete with its own reasons. `patient_id`, `medical_contact_id`, `lead_id`, `status`, `voided_at` and the `returns` list are gone — the status is derived, returns are `app.medical_sale_returns` (below). Code `app/sub-domains/medical/medical-sales/`.
```mermaid
erDiagram
  medical_sale["medical_sale · NEW"] {
    id id PK
    number seq
    id invoice_id FK "→ invoice"
    id patient_id FK "→ patient"
    id medical_contact_id FK "→ medical_contact"
    id prescription_id FK "→ prescription"
    datetime sold_at
    datetime voided_at
    json returns
    id lead_id FK "→ lead"
  }
```

### supplier_credit · NEW

- **Holds:** A credit a medicine supplier owes the clinic for expiring stock returned to them.
- **Table (proposal):** `app.supplier_credits` — domain not chosen yet (Step 4)
- **Sources:** medical.md:200, 297–309
- **Open:** none

- **Built:** `app.supplier_credits` · ROUTE #52 (2026-10-07)
- **Built (ROUTE #153, sub-domain 11.C):** `app.supplier_credits` — `supplier_id`, `medicine_id`, `medicine_batch_id` (all `RESTRICT`), `quantity`, `rate` (the batch's purchase rate), `amount` (`= quantity × rate`), `applied_amount` (set against the supplier's received orders, MD11), `created_by_membership_id` (K8); no soft delete. Code `app/sub-domains/medical/suppliers/supplier-credits/`.
```mermaid
erDiagram
  supplier_credit["supplier_credit · NEW"] {
    id id PK
    id supplier_id FK "→ supplier"
    id medicine_id FK "→ medicine"
    text batch_no
    number quantity
    money amount
    datetime adjusted_at
  }
```

### medicine_batch · NEW

- **Holds:** One batch of a medicine — its number, expiry month and what is left (MD5).
- **Table:** `app.medicine_batches` — was the medicine's `batches` list (D-plan: embedded `json`)
- **Built (ROUTE #153, sub-domain 11.D):** `medicine_id` (`CASCADE`), `batch_number` varchar(20) unique per medicine in any case, `expiry_month` date (the month's first day), `quantity` integer 0–9999, `purchase_rate` numeric(12,2), `supplier_id` (`SET NULL`), `medical_purchase_order_id` (`SET NULL`); index `(medicine_id, expiry_month, id) WHERE quantity > 0` — the order a sale draws in; public id `mbt_`. `app.invoice_items.medicine_batch_id` (`RESTRICT`) names the batch a sale line drew from.
```mermaid
erDiagram
  medicine_batch["medicine_batch · NEW"] {
    id id PK
    id medicine_id FK
    text batch_number
    date expiry_month
    integer quantity
    money purchase_rate
    id supplier_id FK
    id medical_purchase_order_id FK
  }
```

### medicine_supplier_price · NEW

- **Holds:** What a supplier charges for a medicine (MD13).
- **Table:** `app.medicine_supplier_prices` — was the medicine's supplier rates list
- **Built (ROUTE #153, sub-domain 11.D):** key (`medicine_id`, `supplier_id`), both `CASCADE`; `rate` numeric(12,2) `> 0`, `free_quantity`, `lead_days`; a received order line refreshes the rate.
```mermaid
erDiagram
  medicine_supplier_price["medicine_supplier_price · NEW"] {
    id medicine_id FK
    id supplier_id FK
    money rate
    integer free_quantity
    integer lead_days
  }
```

### medical_purchase_order_item · NEW

- **Holds:** One line of a medical order; becomes a batch when received (MD15, MD16).
- **Table:** `app.medical_purchase_order_items` — was the order's `items` list
- **Built (ROUTE #153, sub-domain 11.E):** `medical_purchase_order_id` (`CASCADE`), `line_number`, `medicine_id` (`RESTRICT`), `quantity`, `free_quantity`, `rate` (`> 0`), `amount` (`= quantity × rate`), `is_received` (null until received), `batch_number`, `expiry_month`, `medicine_batch_id` (`RESTRICT`; required once received); public id `mpoi_`.
```mermaid
erDiagram
  medical_purchase_order_item["medical_purchase_order_item · NEW"] {
    id id PK
    id medical_purchase_order_id FK
    integer line_number
    id medicine_id FK
    integer quantity
    integer free_quantity
    money rate
    money amount
    boolean is_received
    text batch_number
    date expiry_month
    id medicine_batch_id FK
  }
```

### medical_sale_return · NEW

- **Holds:** Medicines brought back on a sale and the refund (MD21).
- **Table:** `app.medical_sale_returns` and its lines `app.medical_sale_return_items` — was the sale's `returns` list
- **Built (ROUTE #153, sub-domain 11.H):** `medical_sale_id` (`RESTRICT`), `reason` (the five), `refund_mode` (cash · upi · card), `note`, `amount` (`> 0`), `invoice_credit_note_id` (unique, `RESTRICT` — its credit note), `returned_by_membership_id` (K8); append-only; public id `msrt_`. Lines: key (`medical_sale_return_id`, `invoice_item_id`), `quantity`, `amount`, `is_restocked`.
```mermaid
erDiagram
  medical_sale_return["medical_sale_return · NEW"] {
    id id PK
    id medical_sale_id FK
    choice reason
    choice refund_mode
    text note
    money amount
    id invoice_credit_note_id FK
    id returned_by_membership_id FK
  }
```

## Stage 9 — Clinic stock

### stock_vendor · NEW

- **Holds:** "Clinic vendor" for consumables (never shared with Medical suppliers).
- **Table (proposal):** `app.stock_vendors` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:860–869 · clinic-stock.md:174–185
- **Open:** none

- **Built:** `app.stock_vendors` · ROUTE #53 (2026-10-07)
- **Built (ROUTE #137, sub-domain 9.E):** `name` unique among live vendors in any case (`idx_stock_vendors_organization_name_unique`), `phone` varchar(13) `~ '^\+91\d{10}$'`, `is_quick`; indexes `(organization_id, name, id)` and `(organization_id, created_at DESC, id)` among live rows; derived `payable` (the open dues of its live purchases, S13); delete refused while one is owed. RLS ENABLE + FORCE with the retention arm. Code `app/sub-domains/stock/stock-vendors/`.
```mermaid
erDiagram
  stock_vendor["stock_vendor · NEW"] {
    id id PK
    text name
    text phone
    boolean is_quick
  }
```

### stock_item · NEW

- **Holds:** A clinic consumable / equipment item.
- **Table (proposal):** `app.stock_items` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:873–890 · PRD.md:147 · clinic-stock.md:25–39, 105–124
- **Added** (a frontend request, D3, unless a decision is named): `last_rate` (Appendix F — no intake line found)
- **Open:** none — the last rate is an Appendix F request (D3)

- **Built:** `app.stock_items` · ROUTE #54 (2026-10-07)
- **Built (ROUTE #137, sub-domain 9.A):** `numeric(12,3)` `size_per_unit`, `quantity` (`≥ 0`, the balance — moved only by the movement ledger, S5), `min_quantity` (1), `max_quantity` (10, `≥ min`), `usage_per_week`; `category` default `consumables`; `(size_per_unit IS NULL) = (measure_unit IS NULL)`; `last_rate` from the latest purchase line; unique `lower(name)` among live items; the low index `(organization_id) WHERE quantity <= min_quantity`; `*_milli` columns gone (S4). Delete only at zero; one with movements is never purged (`RESTRICT`). Code `app/sub-domains/stock/stock-items/`.
```mermaid
erDiagram
  stock_item["stock_item · NEW"] {
    id id PK
    number seq
    text name
    choice category
    choice unit
    number size_per_unit
    choice measure_unit
    number qty_milli
    number min_qty
    number max_qty
    number usage_per_week_milli
    id vendor_id FK "→ stock_vendor"
    money last_rate
  }
```

### stock_purchase · NEW

- **Holds:** 
- **Table (proposal):** `app.stock_purchases` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:894–905 · clinic-stock.md:41–55, 142–157
- **Open:** none — typing paid records the payment (P59, D40)

- **Built:** `app.stock_purchases` · ROUTE #55 (2026-10-07)
- **Built (ROUTE #137, sub-domain 9.D):** `lines` jsonb → NEW `app.stock_purchase_items` (`stock_purchase_id` CASCADE, `line_number` 1–50 — key with the purchase, `stock_item_id` RESTRICT, `quantity numeric(12,3) > 0`, `rate`, `amount`, `organization_id`; RLS ENABLE + FORCE); `bill_amount` (no default — the lines' total unless sent), `paid_amount` `0 ≤ paid ≤ bill` kept by supplier-bill payments (`app.payments.stock_purchase_id`, RESTRICT, S11), generated `due_amount` / `payment_status`; the vendor `RESTRICT`; indexes by date, by vendor and date, and `WHERE due_amount > 0`. Code `app/sub-domains/stock/stock-purchases/`.
```mermaid
erDiagram
  stock_purchase["stock_purchase · NEW"] {
    id id PK
    number seq
    id vendor_id FK "→ stock_vendor"
    text bill_no
    date date
    json lines
    money bill
    money paid
  }
```

### stock_movement · NEW

- **Holds:** Signed stock change; every change is one row.
- **Table (proposal):** `app.stock_movements` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:909–925 · clinic-stock.md:57–71, 89–103, 126–140
- **Added** (a frontend request, D3, unless a decision is named): `note` (clinic-stock.md:134)
- **Open:** none — Undo written as a reversing row (P60)

- **Built:** `app.stock_movements` · ROUTE #56 (2026-10-07)
- **Built (ROUTE #137, sub-domain 9.B):** renamed **`app.stock_item_movements`** (S1); append-only — no `updated_*` or soft delete; `type` adds `opening`; `delta_milli` → `quantity_change numeric(12,3)` (`≠ 0`, the sign by type) and `quantity_after` (`≥ 0`); `patient_id` → `patient_treatment_id` (RESTRICT, `used` only, S14); `stock_purchase_id` (`received` / `reverted`), `stock_count_id` (`adjust`), `reverts_stock_item_movement_id` unique with `revert_reason` exactly on `reverted` (S8), `reverted_by_*` dropped; the K8 author `author_membership_id`; every link RESTRICT; out of the purge list. Code `app/sub-domains/stock/stock-item-movements/` (the ledger `stock-item-movements.ledger.ts`).
```mermaid
erDiagram
  stock_movement["stock_movement · NEW"] {
    id id PK
    id item_id FK "→ stock_item"
    choice type
    number delta_milli
    text used_for
    id patient_id FK "→ patient"
    id purchase_id FK "→ stock_purchase"
    id stock_count_id FK "→ stock_count"
    id reverts_id FK "→ stock_movement"
    id reverted_by_id FK "→ stock_movement"
    choice revert_reason
    text note
  }
```

### stock_count · NEW

- **Holds:** 
- **Table (proposal):** `app.stock_counts` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:929–935 · clinic-stock.md:73–85, 159–172
- **Open:** none

- **Built:** `app.stock_counts` · ROUTE #57 (2026-10-07)
- **Built (ROUTE #137, sub-domain 9.C):** `lines` jsonb → NEW `app.stock_count_lines` (key `(stock_count_id, stock_item_id)`, `system_quantity` / `counted_quantity numeric(12,3) ≥ 0`, `organization_id`; RLS ENABLE + FORCE); the count keeps `counted_at` and the K8 author, loses `updated_*` and the soft-delete columns (never changed or deleted, S9) and the retention arm; out of the purge list. Code `app/sub-domains/stock/stock-counts/`.
```mermaid
erDiagram
  stock_count["stock_count · NEW"] {
    id id PK
    json lines
    datetime counted_at
  }
```

## Stage 10 — Tasks and automation

### task · NEW

- **Holds:** A human follow-up with owner and due time. Read by Tasks, header utility; written by Tasks, autoTask rules, outcomes.
- **Table (proposal):** `app.tasks` — domain not chosen yet (Step 4)
- **Sources:** schema-routes.md:717–737 · PRD.md:90–94, 149 · tasks.md
- **Added** (a frontend request, D3, unless a decision is named): `rule_key` (tasks.md:42–56), `resolved_by_id` (tasks.md:58, 78), `resolved_by_clinozy` (tasks.md:58), `result_text` (tasks.md:78, 185–227), `note` (tasks.md:78), `snooze_label` (tasks.md:178), `priority` (H:1877), `remind_before` (H:1878)
- **Open:** none — Mine = mine + my roles' unowned queue (P5, A23, D40); rules (P26, D3); rule settings by Owner and Admin (D19)

- **Built:** `app.tasks` · ROUTE #58 (2026-10-07)
- **Built (ROUTE #138, 10.A):** `kind` `rule` · `follow_up` · `manual` (TK6) with `rule_key` (the 14 rules, `(kind = 'rule') = (rule_key IS NOT NULL)`); `owner_membership_id` or `owner_role` (one of the two — an owner keeps no queue; the CHECK needs at least one); the person `contact_id` and at most one record — `lead_id`, `appointment_id`, `patient_treatment_id`, `patient_check_in_id`, `patient_review_id`, `invoice_id`, `pending_credit_id` (`num_nonnulls ≤ 1`, TK5) — with the generated `source_key` (`<record>:<id>`, else `contact:<id>`) and the unique partial index `idx_tasks_open_rule_source` on `(organization_id, rule_key, source_key)` for open rule tasks (TK4); `branch_id` copied from the record; the 6 outcomes, `result_text ≤ 200`, `resolved_by_membership_id` (K8 `RESTRICT`), `is_resolved_automatically`, `is_handled_by_clinozy` (Clinozy took the step itself — keeps the rule quiet while the condition holds; launch-confidence R3); `snoozed_until` exactly while snoozed; `should_remind_before`, `patient_id`, `source_type` / `source_id` go; RLS ENABLE + FORCE with the purge's retention arm
```mermaid
erDiagram
  task["task · NEW"] {
    id id PK
    choice kind
    text title
    text why
    id owner_id FK "→ user"
    choice owner_role
    id patient_id FK "→ patient"
    id lead_id FK "→ lead"
    choice source_type
    id source_id
    datetime due_at
    choice status
    datetime snoozed_until
    choice outcome
    datetime resolved_at
    choice rule_key
    id resolved_by_id FK "→ user"
    boolean resolved_by_clinozy
    text result_text
    text note
    text snooze_label
    choice priority
    boolean remind_before
  }
```

### task_owner_change · NEW

- **Holds:** Reassign history of a task ("Was A → B").
- **Table (proposal):** `app.task_owner_changes` — domain not chosen yet (Step 4)
- **Sources:** tasks.md:38, 113
- **Open:** none

- **Built:** `app.task_owner_changes` · ROUTE #59 (2026-10-07)
- **Built (ROUTE #138, TK8):** append-only (no `updated_*`, no soft delete): `from_membership_id` / `from_role`, `to_membership_id` / `to_role` (a member or a queue), `changed_by_membership_id` (null for the leave step) — the three member keys K8 `RESTRICT`; the task's 5 latest answer on it; RLS ENABLE + FORCE
```mermaid
erDiagram
  task_owner_change["task_owner_change · NEW"] {
    id id PK
    id task_id FK "→ task"
    id from_owner_id FK "→ user"
    id to_owner_id FK "→ user"
    datetime changed_at
  }
```

### task_rule_setting · NEW

- **Holds:** Per organization, whether each task rule is on and whether Clinozy handles it automatically.
- **Table (proposal):** `app.task_rule_settings` — domain not chosen yet (Step 4)
- **Sources:** tasks.md:148–162
- **Open:** none — Owner and Admin change them (D19)

- **Built:** `app.task_rule_settings` · ROUTE #60 (2026-10-07)
- **Built (ROUTE #138, TK10):** moved under `tasks/task-rule-settings/`; the soft-delete columns go; unique `(organization_id, rule_key)` (upsert); `chk_task_rule_settings_automatic` — `is_automatic` only on `confirm`, `payment_due`, `feedback`, `gone_quiet`; RLS ENABLE + FORCE
```mermaid
erDiagram
  task_rule_setting["task_rule_setting · NEW"] {
    id id PK
    choice rule_key
    boolean is_on
    boolean is_automatic
  }
```
