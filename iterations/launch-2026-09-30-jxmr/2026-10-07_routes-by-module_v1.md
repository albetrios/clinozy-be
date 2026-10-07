# Clinozy API — every route, by module

Generated 2026-10-07 from the running code (`docs/openapi/openapi.json` + `docs/routes.txt`) on branch `feat/clinic-launch-api` (uncommitted work). **435 routes**, **305 under `/api/v1/app`**.

## How to read it

- **Path** — prefix `/api/v1`; `{x_id}` are public ids (`<prefix>_<21 chars>`).
- **Type** — `list (paginated)` · `get` · `create` · `create (child)` · `update` (PATCH, partial; `expected_updated_at` refuses a stale save → 409) · `replace` (PUT) · `delete` (soft, `?reason=&note=`, 204) · `restore` · `action` (a verb on one record, POST) · `action (collection)` · `view` (a read of one record) · `read` · `export (CSV in JSON)`.
- **Gate** — `PERM: <code>` (permission), `AUTH` (signed in), `PUBLIC`; **Idem** `req` = `X-Idempotency-Key` required.
- **Query** — `*` required. Every paginated list also takes `limit` (1–100, default 25) and `after` (the cursor from `meta.pagination.next`); `estimated_total` comes on the first page. Branch-scoped app lists take `branch_ids` (comma-separated, ≤ 20) and show only the caller's branches without `branch:read`; every app list takes `created_from` / `created_to` (ISO with offset).
- **Body** — `*` required; money is rupees (number, 2 decimals); datetimes ISO 8601 with offset; dates `YYYY-MM-DD`; times `HH:mm`.
- Responses: `{ data, meta }`; lists `{ data: [...], meta: { pagination: { per_page, next, has_more, estimated_total } } }`; errors `{ error: { type, code, reason?, detail, errors[] } }`.

## App tables and their connections

Every `app.*` table has `id`, `public_id` (the API `id`), `organization_id` (RLS), `created_at`, `updated_at`, `created_by_user_id`, `updated_by_user_id`, `deleted_at`, `delete_reason`, `delete_note`. Arrows are references; the delete rule is what happens to the row when the referenced record is erased by the purge (`cascade` owned child · `no action` kept, blocks the purge · `set null` pointer cleared).

| Table | Prefix | Routes at | References (delete rule) | Lists of ids (link table) |
| --- | --- | --- | --- | --- |
| `app.user_preferences` | `upref` | hand-built | — | `branch_filter_ids` → branches (`user_preference_branches`) |
| `app.saved_views` | `svw` | `/app/saved-views` | — | — |
| `app.offering_groups` | `ogr` | `/app/offering-groups` | — | — |
| `app.offerings` | `off` | `/app/offerings` | `default_doctor_membership_id` → memberships (set null)<br>`default_room_id` → rooms (set null)<br>`group_id` → offering_groups (set null) | `branch_ids` → branches (`offering_branches`) |
| `app.offers` | `ofr` | `/app/offers` | — | `offering_ids` → offerings (`offer_offerings`)<br>`branch_ids` → branches (`offer_branches`) |
| `app.patients` | `pat` | `/app/patients` | `home_branch_id` → branches (no action)<br>`referred_by_patient_id` → patients (set null)<br>`doctor_membership_id` → memberships (set null)<br>`lead_id` → leads (set null) | — |
| `app.leads` | `lead` | `/app/leads` | `owner_membership_id` → memberships (set null)<br>`branch_id` → branches (set null)<br>`patient_id` → patients (set null) | `involved_membership_ids` → memberships (`lead_involved_memberships`) |
| `app.messages` | `msg` | `/app/messages` | `lead_id` → leads (cascade)<br>`patient_id` → patients (cascade)<br>`medical_contact_id` → medical_contacts (cascade)<br>`message_template_id` → message_templates (set null)<br>`reply_to_message_id` → messages (set null)<br>`author_membership_id` → memberships (set null)<br>`task_id` → tasks (set null) | — |
| `app.lead_reads` | `lread` | no routes (written by its parent) | `lead_id` → leads (cascade) | — |
| `app.message_templates` | `mtpl` | `/app/message-templates` | — | — |
| `app.branch_holidays` | `bhol` | `/app/branch-holidays` + `/app/branches/{…}/holidays` | `branch_id` → branches (cascade) | — |
| `app.rooms` | `room` | `/app/rooms` + `/app/branches/{…}/rooms` | `branch_id` → branches (cascade) | — |
| `app.machines` | `mach` | `/app/machines` + `/app/branches/{…}/machines` | `branch_id` → branches (cascade) | — |
| `app.appointments` | `appt` | `/app/appointments` | `patient_id` → patients (no action)<br>`lead_id` → leads (no action)<br>`branch_id` → branches (no action)<br>`offering_id` → offerings (set null)<br>`doctor_membership_id` → memberships (no action)<br>`therapist_membership_id` → memberships (set null)<br>`room_id` → rooms (set null)<br>`machine_id` → machines (set null)<br>`copied_from_appointment_id` → appointments (set null)<br>`patient_package_id` → patient_packages (set null) | — |
| `app.visits` | `vis` | `/app/visits` | `appointment_id` → appointments (no action)<br>`patient_id` → patients (no action) | — |
| `app.diagnoses` | `dgn` | `/app/diagnoses` | — | — |
| `app.patient_clinical_notes` | `pcn` | `/app/patient-clinical-notes` + `/app/patients/{…}/clinical-notes` | `patient_id` → patients (no action) | — |
| `app.prescriptions` | `rx` | `/app/prescriptions` + `/app/patients/{…}/prescriptions` | `patient_id` → patients (no action)<br>`appointment_id` → appointments (set null)<br>`doctor_membership_id` → memberships (no action) | — |
| `app.prescription_kits` | `rxk` | `/app/prescription-kits` | — | — |
| `app.patient_images` | `pimg` | `/app/patient-images` + `/app/patients/{…}/images` | `patient_id` → patients (no action)<br>`appointment_id` → appointments (set null) | — |
| `app.patient_reports` | `prep` | `/app/patient-reports` + `/app/patients/{…}/reports` | `patient_id` → patients (no action) | — |
| `app.patient_notes` | `pnote` | `/app/patient-notes` + `/app/patients/{…}/notes` | `patient_id` → patients (no action) | — |
| `app.invoices` | `invc` | `/app/invoices` | `branch_id` → branches (no action)<br>`patient_id` → patients (no action)<br>`prescription_id` → prescriptions (set null)<br>`medical_contact_id` → medical_contacts (set null)<br>`medical_sale_id` → medical_sales (set null) | `team_membership_ids` → memberships (`invoice_team_memberships`) |
| `app.patient_packages` | `ppkg` | `/app/patient-packages` + `/app/patients/{…}/packages` | `patient_id` → patients (no action)<br>`offering_id` → offerings (no action)<br>`invoice_id` → invoices (set null) | — |
| `app.offering_suggestions` | `osug` | `/app/offering-suggestions` + `/app/patients/{…}/offering-suggestions` | `patient_id` → patients (no action)<br>`offering_id` → offerings (no action)<br>`appointment_id` → appointments (set null) | — |
| `app.patient_ideas` | `pidea` | no routes (written by its parent) | `patient_id` → patients (no action) | — |
| `app.payments` | `pay` | `/app/payments` | `branch_id` → branches (no action)<br>`patient_id` → patients (set null)<br>`invoice_id` → invoices (set null)<br>`credit_note_id` → credit_notes (set null)<br>`pending_credit_id` → pending_credits (set null)<br>`day_close_id` → day_closes (set null) | — |
| `app.payment_edits` | `pedit` | no routes (written by its parent) | `payment_id` → payments (cascade) | — |
| `app.credit_notes` | `cn` | `/app/credit-notes` | `invoice_id` → invoices (no action) | — |
| `app.pending_credits` | `pcr` | `/app/pending-credits` | `patient_id` → patients (set null)<br>`source_payment_id` → payments (set null)<br>`settled_payment_id` → payments (set null)<br>`invoice_id` → invoices (set null) | — |
| `app.day_closes` | `dcl` | `/app/day-closes` | `branch_id` → branches (no action) | — |
| `app.day_close_events` | `dce` | no routes (written by its parent) | `day_close_id` → day_closes (cascade) | — |
| `app.treatments` | `trt` | `/app/treatments` + `/app/patients/{…}/treatments` | `patient_id` → patients (no action)<br>`appointment_id` → appointments (set null)<br>`offering_id` → offerings (set null)<br>`doctor_membership_id` → memberships (set null)<br>`therapist_membership_id` → memberships (set null)<br>`patient_package_id` → patient_packages (set null) | — |
| `app.check_ins` | `chk` | `/app/check-ins` + `/app/patients/{…}/check-ins` | `patient_id` → patients (no action)<br>`appointment_id` → appointments (set null)<br>`treatment_id` → treatments (set null) | `next_offering_ids` → offerings (`check_in_next_offerings`) |
| `app.reviews` | `rev` | `/app/reviews` + `/app/patients/{…}/reviews` | `patient_id` → patients (no action)<br>`appointment_id` → appointments (set null) | — |
| `app.feedback_actions` | `fba` | `/app/feedback-actions` | `check_in_id` → check_ins (cascade)<br>`review_id` → reviews (cascade) | — |
| `app.manufacturers` | `mfr` | `/app/manufacturers` | — | — |
| `app.suppliers` | `sup` | `/app/suppliers` | — | `manufacturer_ids` → manufacturers (`supplier_manufacturers`) |
| `app.medical_reps` | `mrep` | `/app/medical-reps` | — | `manufacturer_ids` → manufacturers (`medical_rep_manufacturers`) |
| `app.medical_rep_visits` | `mrv` | `/app/medical-rep-visits` + `/app/medical-reps/{…}/visits` | `medical_rep_id` → medical_reps (cascade) | — |
| `app.medicines` | `med` | `/app/medicines` | `manufacturer_id` → manufacturers (no action) | — |
| `app.medical_purchase_orders` | `mpo` | `/app/medical-purchase-orders` | `supplier_id` → suppliers (no action) | — |
| `app.medical_contacts` | `mcon` | `/app/medical-contacts` | — | — |
| `app.medical_sales` | `msal` | `/app/medical-sales` | `invoice_id` → invoices (set null)<br>`patient_id` → patients (no action)<br>`medical_contact_id` → medical_contacts (no action)<br>`prescription_id` → prescriptions (set null)<br>`lead_id` → leads (set null) | — |
| `app.supplier_credits` | `scr` | `/app/supplier-credits` | `supplier_id` → suppliers (no action)<br>`medicine_id` → medicines (set null) | — |
| `app.stock_vendors` | `svnd` | `/app/stock-vendors` | — | — |
| `app.stock_items` | `sitm` | `/app/stock-items` | `stock_vendor_id` → stock_vendors (set null) | — |
| `app.stock_purchases` | `spur` | `/app/stock-purchases` | `stock_vendor_id` → stock_vendors (no action) | — |
| `app.stock_movements` | `smov` | `/app/stock-movements` | `stock_item_id` → stock_items (no action)<br>`patient_id` → patients (set null)<br>`stock_purchase_id` → stock_purchases (set null)<br>`stock_count_id` → stock_counts (set null)<br>`reverts_stock_movement_id` → stock_movements (set null)<br>`reverted_by_stock_movement_id` → stock_movements (set null) | — |
| `app.stock_counts` | `scnt` | `/app/stock-counts` | — | — |
| `app.tasks` | `task` | `/app/tasks` | `owner_membership_id` → memberships (set null)<br>`patient_id` → patients (set null)<br>`lead_id` → leads (set null) | — |
| `app.task_owner_changes` | `toc` | no routes (written by its parent) | `task_id` → tasks (cascade)<br>`from_membership_id` → memberships (set null)<br>`to_membership_id` → memberships (set null) | — |
| `app.task_rule_settings` | `trs` | hand-built | — | — |

Also: `app.branches` (`brn`) + `app.branch_user_accesses` (branch ↔ membership), `app.record_counters` (running numbers, no routes).

## App (305 routes)

### Appointment (11)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/appointments` | list (paginated) | List appointments | PERM: appointment:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|appointment_date)<br>`order`: enum(asc|desc)<br>`patient_id`: string<br>`lead_id`: string<br>`branch_id`: string<br>`type`: enum(consultation|follow_up|treatment|package_session|other)<br>`doctor_membership_id`: string<br>`room_id`: string<br>`machine_id`: string<br>`appointment_date_from`: string date<br>`appointment_date_to`: string date<br>`status`: enum(scheduled|confirmed|checked_in|completed|cancelled|no_show)<br>`created_from`: string date-time<br>`created_to`: string date-time<br>`branch_ids`: string | — |
| POST | `/app/appointments` | create | Create appointment | PERM: appointment:create | req | — | `patient_id`: string ≤28 (null clears)<br>`lead_id`: string ≤28 (null clears)<br>`branch_id`*: string ≤28<br>`type`: enum(consultation|follow_up|treatment|package_session|other)<br>`offering_id`: string ≤28 (null clears)<br>`service_label`*: string ≤120<br>`doctor_membership_id`*: string ≤28<br>`therapist_membership_id`: string ≤28 (null clears)<br>`room_id`: string ≤28 (null clears)<br>`machine_id`: string ≤28 (null clears)<br>`appointment_date`*: string date<br>`start_time`*: string /^([01]\d|2[0-3]):[0-5]\d$/<br>`duration_minutes`: integer 5–240<br>`reason`: string ≤160 (null clears)<br>`notes`: string ≤2000 (null clears)<br>`follow_up_at`: string date-time (null clears)<br>`patient_package_id`: string ≤28 (null clears) |
| GET | `/app/appointments/exports` | export (CSV in JSON) | Export appointments | PERM: list:export | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|appointment_date)<br>`order`: enum(asc|desc)<br>`patient_id`: string<br>`lead_id`: string<br>`branch_id`: string<br>`type`: enum(consultation|follow_up|treatment|package_session|other)<br>`doctor_membership_id`: string<br>`room_id`: string<br>`machine_id`: string<br>`appointment_date_from`: string date<br>`appointment_date_to`: string date<br>`status`: enum(scheduled|confirmed|checked_in|completed|cancelled|no_show)<br>`created_from`: string date-time<br>`created_to`: string date-time<br>`branch_ids`: string | — |
| GET | `/app/appointments/{appointment_id}` | get | Get appointment | PERM: appointment:read | - | — | — |
| PATCH | `/app/appointments/{appointment_id}` | update | Update appointment | PERM: appointment:update | - | — | `patient_id`: string ≤28 (null clears)<br>`lead_id`: string ≤28 (null clears)<br>`branch_id`: string ≤28<br>`type`: enum(consultation|follow_up|treatment|package_session|other)<br>`offering_id`: string ≤28 (null clears)<br>`service_label`: string ≤120<br>`doctor_membership_id`: string ≤28<br>`therapist_membership_id`: string ≤28 (null clears)<br>`room_id`: string ≤28 (null clears)<br>`machine_id`: string ≤28 (null clears)<br>`appointment_date`: string date<br>`start_time`: string /^([01]\d|2[0-3]):[0-5]\d$/<br>`duration_minutes`: integer 5–240<br>`reason`: string ≤160 (null clears)<br>`notes`: string ≤2000 (null clears)<br>`follow_up_at`: string date-time (null clears)<br>`patient_package_id`: string ≤28 (null clears)<br>`expected_updated_at`: string date-time |
| DELETE | `/app/appointments/{appointment_id}` | delete | Delete appointment | PERM: appointment:delete | - | — | — |
| POST | `/app/appointments/{appointment_id}/cancel` | action | Cancel appointment | PERM: appointment:update | req | — | `cancel_reason`*: enum(patient_asked|unreachable|doctor_unavailable|resource_unavailable|rescheduling_later|booked_by_mistake|other)<br>`cancel_note`: string ≤280 |
| POST | `/app/appointments/{appointment_id}/reinstate` | action | Reinstate appointment | PERM: appointment:update | req | — | — |
| POST | `/app/appointments/{appointment_id}/restore` | restore | Restore appointment | PERM: appointment:delete | req | — | — |
| POST | `/app/appointments/{appointment_id}/status` | action | Set appointment status | PERM: appointment:update | req | — | `status`*: enum(confirmed|checked_in|completed|no_show) |
| POST | `/app/appointments/{appointment_id}/undo-check-in` | action | Undo check-in | PERM: appointment:update | req | — | — |

### Branch (7)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/branches` | read | List branches | PERM: branch:read | - | — | — |
| POST | `/app/branches` | create | Create branch | PERM: branch:create | req | — | `name`*: string ≤60<br>`tone`: enum(butter|lav|sky|sage|blush|mint|peach|plum|lime|slate|stone)<br>`is_main`: boolean<br>`address_line_one`*: string ≤120<br>`address_line_two`: string ≤120 (null clears)<br>`area`*: string ≤60<br>`city`*: string ≤60<br>`state`: string ≤60<br>`postal_code`*: string /^\d{6}$/<br>`phone`*: string /^\+91\d{10}$/<br>`email`*: string email<br>`gst_number`: string /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/ (null clears)<br>`opens_at`: string /^([01]\d|2[0-3]):[0-5]\d$/<br>`closes_at`: string /^([01]\d|2[0-3]):[0-5]\d$/<br>`working_days`: enum(mon|tue|wed|thu|fri|sat|sun)[]<br>`default_doctor_membership_id`: string ≤28 (null clears)<br>`default_front_desk_membership_id`: string ≤28 (null clears)<br>`default_therapist_membership_id`: string ≤28 (null clears)<br>`default_pharmacist_membership_id`: string ≤28 (null clears)<br>`is_active`: boolean<br>`maps_link`: string uri (null clears)<br>`review_link`: string uri (null clears) |
| GET | `/app/branches/my` | read | List my branches | PERM: organization:read | - | — | — |
| GET | `/app/branches/{branch_id}` | get | Get branch | PERM: branch:read | - | — | — |
| PATCH | `/app/branches/{branch_id}` | update | Update branch | PERM: branch:update | - | — | `name`: string ≤60<br>`tone`: enum(butter|lav|sky|sage|blush|mint|peach|plum|lime|slate|stone)<br>`is_main`: boolean<br>`address_line_one`: string ≤120<br>`address_line_two`: string ≤120 (null clears)<br>`area`: string ≤60<br>`city`: string ≤60<br>`state`: string ≤60<br>`postal_code`: string /^\d{6}$/<br>`phone`: string /^\+91\d{10}$/<br>`email`: string email<br>`gst_number`: string /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/ (null clears)<br>`opens_at`: string /^([01]\d|2[0-3]):[0-5]\d$/<br>`closes_at`: string /^([01]\d|2[0-3]):[0-5]\d$/<br>`working_days`: enum(mon|tue|wed|thu|fri|sat|sun)[]<br>`default_doctor_membership_id`: string ≤28 (null clears)<br>`default_front_desk_membership_id`: string ≤28 (null clears)<br>`default_therapist_membership_id`: string ≤28 (null clears)<br>`default_pharmacist_membership_id`: string ≤28 (null clears)<br>`is_active`: boolean<br>`maps_link`: string uri (null clears)<br>`review_link`: string uri (null clears) |
| GET | `/app/branches/{branch_id}/user-accesses` | view | List branch user accesses | PERM: branch:update | - | — | — |
| PUT | `/app/branches/{branch_id}/user-accesses` | replace | Replace branch user accesses | PERM: branch:update | - | — | `membership_ids`*: string ≤28[] |

### Branch resource (18)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/branch-holidays/{branch_holiday_id}` | get | Get branch holiday | PERM: organization:read | - | — | — |
| PATCH | `/app/branch-holidays/{branch_holiday_id}` | update | Update branch holiday | PERM: branch_holiday:update | - | — | `holiday_date`: string date<br>`label`: string ≤60<br>`expected_updated_at`: string date-time |
| DELETE | `/app/branch-holidays/{branch_holiday_id}` | delete | Delete branch holiday | PERM: branch_holiday:delete | - | — | — |
| POST | `/app/branch-holidays/{branch_holiday_id}/restore` | restore | Restore branch holiday | PERM: branch_holiday:delete | req | — | — |
| GET | `/app/branches/{branch_id}/holidays` | list (paginated) | List a branch's branch holidays | PERM: organization:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|holiday_date)<br>`order`: enum(asc|desc)<br>`holiday_date_from`: string date<br>`holiday_date_to`: string date<br>`created_from`: string date-time<br>`created_to`: string date-time<br>`branch_ids`: string | — |
| POST | `/app/branches/{branch_id}/holidays` | create (child) | Add a branch holiday | PERM: branch_holiday:create | req | — | `holiday_date`*: string date<br>`label`*: string ≤60 |
| GET | `/app/branches/{branch_id}/machines` | list (paginated) | List a branch's machines | PERM: organization:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|name)<br>`order`: enum(asc|desc)<br>`is_active`: enum(true|false)<br>`created_from`: string date-time<br>`created_to`: string date-time<br>`branch_ids`: string | — |
| POST | `/app/branches/{branch_id}/machines` | create (child) | Add a machine | PERM: machine:create | req | — | `name`*: string ≤60<br>`is_active`: boolean |
| GET | `/app/branches/{branch_id}/rooms` | list (paginated) | List a branch's rooms | PERM: organization:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|name)<br>`order`: enum(asc|desc)<br>`is_active`: enum(true|false)<br>`created_from`: string date-time<br>`created_to`: string date-time<br>`branch_ids`: string | — |
| POST | `/app/branches/{branch_id}/rooms` | create (child) | Add a room | PERM: room:create | req | — | `name`*: string ≤60<br>`is_active`: boolean |
| GET | `/app/machines/{machine_id}` | get | Get machine | PERM: organization:read | - | — | — |
| PATCH | `/app/machines/{machine_id}` | update | Update machine | PERM: machine:update | - | — | `name`: string ≤60<br>`is_active`: boolean<br>`expected_updated_at`: string date-time |
| DELETE | `/app/machines/{machine_id}` | delete | Delete machine | PERM: machine:delete | - | — | — |
| POST | `/app/machines/{machine_id}/restore` | restore | Restore machine | PERM: machine:delete | req | — | — |
| GET | `/app/rooms/{room_id}` | get | Get room | PERM: organization:read | - | — | — |
| PATCH | `/app/rooms/{room_id}` | update | Update room | PERM: room:update | - | — | `name`: string ≤60<br>`is_active`: boolean<br>`expected_updated_at`: string date-time |
| DELETE | `/app/rooms/{room_id}` | delete | Delete room | PERM: room:delete | - | — | — |
| POST | `/app/rooms/{room_id}/restore` | restore | Restore room | PERM: room:delete | req | — | — |

### Feedback (18)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/check-ins/{check_in_id}` | get | Get check-in | PERM: patient:read | - | — | — |
| PATCH | `/app/check-ins/{check_in_id}` | update | Update check-in | PERM: patient:update | - | — | `appointment_id`: string ≤28 (null clears)<br>`treatment_id`: string ≤28 (null clears)<br>`context`: string ≤80<br>`feel`: enum(much_better|better|same|worse)<br>`score`: integer 1–10<br>`followed`: enum(fully|mostly|partly|not_at_all) (null clears)<br>`followed_note`: string ≤280 (null clears)<br>`current_state`: string ≤500 (null clears)<br>`next_plan`: string ≤500 (null clears)<br>`next_offering_ids`: string ≤28[]<br>`check_in_date`: string date<br>`expected_updated_at`: string date-time |
| DELETE | `/app/check-ins/{check_in_id}` | delete | Delete check-in | PERM: patient:update | - | — | — |
| POST | `/app/check-ins/{check_in_id}/restore` | restore | Restore check-in | PERM: patient:update | req | — | — |
| GET | `/app/feedback-actions` | list (paginated) | List feedback actions | PERM: patient:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at)<br>`order`: enum(asc|desc)<br>`check_in_id`: string<br>`review_id`: string<br>`action`: enum(doctor_called|asked_revisit|free_review_booked|plan_changed|replied_google|replied_instagram|replied_whatsapp|refund_credit|other)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/feedback-actions` | create | Create feedback action | PERM: patient:update | req | — | `check_in_id`: string ≤28 (null clears)<br>`review_id`: string ≤28 (null clears)<br>`action`*: enum(doctor_called|asked_revisit|free_review_booked|plan_changed|replied_google|replied_instagram|replied_whatsapp|refund_credit|other)<br>`note`: string ≤280 (null clears) |
| GET | `/app/feedback-actions/{feedback_action_id}` | get | Get feedback action | PERM: patient:read | - | — | — |
| PATCH | `/app/feedback-actions/{feedback_action_id}` | update | Update feedback action | PERM: patient:update | - | — | `check_in_id`: string ≤28 (null clears)<br>`review_id`: string ≤28 (null clears)<br>`action`: enum(doctor_called|asked_revisit|free_review_booked|plan_changed|replied_google|replied_instagram|replied_whatsapp|refund_credit|other)<br>`note`: string ≤280 (null clears)<br>`expected_updated_at`: string date-time |
| DELETE | `/app/feedback-actions/{feedback_action_id}` | delete | Delete feedback action | PERM: patient:update | - | — | — |
| POST | `/app/feedback-actions/{feedback_action_id}/restore` | restore | Restore feedback action | PERM: patient:update | req | — | — |
| GET | `/app/patients/{patient_id}/check-ins` | list (paginated) | List a patient's check-ins | PERM: patient:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|check_in_date)<br>`order`: enum(asc|desc)<br>`feel`: enum(much_better|better|same|worse)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/patients/{patient_id}/check-ins` | create (child) | Add a check-in | PERM: patient:update | req | — | `appointment_id`: string ≤28 (null clears)<br>`treatment_id`: string ≤28 (null clears)<br>`context`*: string ≤80<br>`feel`*: enum(much_better|better|same|worse)<br>`score`*: integer 1–10<br>`followed`: enum(fully|mostly|partly|not_at_all) (null clears)<br>`followed_note`: string ≤280 (null clears)<br>`current_state`: string ≤500 (null clears)<br>`next_plan`: string ≤500 (null clears)<br>`next_offering_ids`: string ≤28[]<br>`check_in_date`*: string date |
| GET | `/app/patients/{patient_id}/reviews` | list (paginated) | List a patient's reviews | PERM: review:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|review_date)<br>`order`: enum(asc|desc)<br>`source`: enum(google|video|instagram|internal_form|whatsapp)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/patients/{patient_id}/reviews` | create (child) | Add a review | PERM: review:create | req | — | `appointment_id`: string ≤28 (null clears)<br>`source`*: enum(google|video|instagram|internal_form|whatsapp)<br>`rating`: integer 1–5 (null clears)<br>`text`: string ≤2000 (null clears)<br>`link`: string ≤500 (null clears)<br>`file_keys`: string ≤512[]<br>`review_date`*: string date |
| GET | `/app/reviews/{review_id}` | get | Get review | PERM: review:read | - | — | — |
| PATCH | `/app/reviews/{review_id}` | update | Update review | PERM: review:update | - | — | `appointment_id`: string ≤28 (null clears)<br>`source`: enum(google|video|instagram|internal_form|whatsapp)<br>`rating`: integer 1–5 (null clears)<br>`text`: string ≤2000 (null clears)<br>`link`: string ≤500 (null clears)<br>`file_keys`: string ≤512[]<br>`review_date`: string date<br>`expected_updated_at`: string date-time |
| DELETE | `/app/reviews/{review_id}` | delete | Delete review | PERM: review:delete | - | — | — |
| POST | `/app/reviews/{review_id}/restore` | restore | Restore review | PERM: review:delete | req | — | — |

### Invoice (19)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/invoices` | list (paginated) | List invoices | PERM: invoice:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|invoice_date)<br>`order`: enum(asc|desc)<br>`type`: enum(clinic|medical|consultation)<br>`branch_id`: string<br>`patient_id`: string<br>`invoice_date_from`: string date<br>`invoice_date_to`: string date<br>`created_from`: string date-time<br>`created_to`: string date-time<br>`branch_ids`: string | — |
| POST | `/app/invoices` | create | Create invoice | PERM: invoice:create | req | — | `type`: enum(clinic|medical|consultation)<br>`branch_id`*: string ≤28<br>`patient_id`: string ≤28 (null clears)<br>`team_membership_ids`: string ≤28[]<br>`items`: object[]<br>`overall_discount`: number 0–9999999999.99<br>`invoice_date`*: string date<br>`remark`: string ≤500 (null clears)<br>`prescription_id`: string ≤28 (null clears)<br>`medical_contact_id`: string ≤28 (null clears) |
| GET | `/app/invoices/exports` | export (CSV in JSON) | Export invoices | PERM: list:export | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|invoice_date)<br>`order`: enum(asc|desc)<br>`type`: enum(clinic|medical|consultation)<br>`branch_id`: string<br>`patient_id`: string<br>`invoice_date_from`: string date<br>`invoice_date_to`: string date<br>`created_from`: string date-time<br>`created_to`: string date-time<br>`branch_ids`: string | — |
| GET | `/app/invoices/{invoice_id}` | get | Get invoice | PERM: invoice:read | - | — | — |
| PATCH | `/app/invoices/{invoice_id}` | update | Update invoice | PERM: invoice:update | - | — | `type`: enum(clinic|medical|consultation)<br>`branch_id`: string ≤28<br>`patient_id`: string ≤28 (null clears)<br>`team_membership_ids`: string ≤28[]<br>`items`: object[]<br>`overall_discount`: number 0–9999999999.99<br>`invoice_date`: string date<br>`remark`: string ≤500 (null clears)<br>`prescription_id`: string ≤28 (null clears)<br>`medical_contact_id`: string ≤28 (null clears)<br>`expected_updated_at`: string date-time |
| DELETE | `/app/invoices/{invoice_id}` | delete | Delete invoice | PERM: sale:void | - | — | — |
| POST | `/app/invoices/{invoice_id}/restore` | restore | Restore invoice | PERM: sale:void | req | — | — |
| GET | `/app/offering-suggestions/{offering_suggestion_id}` | get | Get offering suggestion | PERM: patient:read | - | — | — |
| PATCH | `/app/offering-suggestions/{offering_suggestion_id}` | update | Update offering suggestion | PERM: patient:update | - | — | `offering_id`: string ≤28<br>`quantity`: integer 1–99<br>`price`: number 0–9999999999.99 (null clears)<br>`status`: enum(planned|accepted|next_time|declined)<br>`source_label`: string ≤80<br>`appointment_id`: string ≤28 (null clears)<br>`reason`: string ≤200 (null clears)<br>`expected_updated_at`: string date-time |
| DELETE | `/app/offering-suggestions/{offering_suggestion_id}` | delete | Delete offering suggestion | PERM: patient:update | - | — | — |
| POST | `/app/offering-suggestions/{offering_suggestion_id}/restore` | restore | Restore offering suggestion | PERM: patient:update | req | — | — |
| GET | `/app/patient-packages/{patient_package_id}` | get | Get patient package | PERM: patient:read | - | — | — |
| PATCH | `/app/patient-packages/{patient_package_id}` | update | Update patient package | PERM: patient:update | - | — | `offering_id`: string ≤28<br>`invoice_id`: string ≤28 (null clears)<br>`sessions_total`: integer 1–99<br>`valid_until`: string date (null clears)<br>`expected_updated_at`: string date-time |
| DELETE | `/app/patient-packages/{patient_package_id}` | delete | Delete patient package | PERM: payment:delete | - | — | — |
| POST | `/app/patient-packages/{patient_package_id}/restore` | restore | Restore patient package | PERM: payment:delete | req | — | — |
| GET | `/app/patients/{patient_id}/offering-suggestions` | list (paginated) | List a patient's offering suggestions | PERM: patient:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at)<br>`order`: enum(asc|desc)<br>`status`: enum(planned|accepted|next_time|declined)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/patients/{patient_id}/offering-suggestions` | create (child) | Add a offering suggestion | PERM: patient:update | req | — | `offering_id`*: string ≤28<br>`quantity`: integer 1–99<br>`price`: number 0–9999999999.99 (null clears)<br>`status`: enum(planned|accepted|next_time|declined)<br>`source_label`*: string ≤80<br>`appointment_id`: string ≤28 (null clears)<br>`reason`: string ≤200 (null clears) |
| GET | `/app/patients/{patient_id}/packages` | list (paginated) | List a patient's patient packages | PERM: patient:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at)<br>`order`: enum(asc|desc)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/patients/{patient_id}/packages` | create (child) | Add a patient package | PERM: payment:create | req | — | `offering_id`*: string ≤28<br>`invoice_id`: string ≤28 (null clears)<br>`sessions_total`*: integer 1–99<br>`valid_until`: string date (null clears) |

### Lead (16)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/leads` | list (paginated) | List leads | PERM: lead:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|name|follow_up_at|last_touch_at)<br>`order`: enum(asc|desc)<br>`status`: enum(new|contacted|follow_up|clinic_visited|no_response|not_interested|invalid|lost)<br>`source`: enum(instagram|google|whatsapp|facebook|walk_in|referral|retarget)<br>`owner_membership_id`: string<br>`follow_up_at_from`: string date-time<br>`follow_up_at_to`: string date-time<br>`branch_id`: string<br>`patient_id`: string<br>`is_contact_thread`: enum(true|false)<br>`kind`: enum(enquiry|retarget|contact_thread)<br>`created_from`: string date-time<br>`created_to`: string date-time<br>`branch_ids`: string | — |
| POST | `/app/leads` | create | Create lead | PERM: lead:create | req | — | `name`*: string ≤120<br>`phone`*: string /^\+91\d{10}$/<br>`email`: string email (null clears)<br>`status`: enum(new|contacted|follow_up|clinic_visited|no_response|not_interested|invalid|lost) (null clears)<br>`source`: enum(instagram|google|whatsapp|facebook|walk_in|referral|retarget) (null clears)<br>`interests`: enum(others|clinical|peel|lhr|hydrafacial|prp)[]<br>`owner_membership_id`: string ≤28 (null clears)<br>`involved_membership_ids`: string ≤28[]<br>`follow_up_at`: string date-time (null clears)<br>`branch_id`: string ≤28 (null clears)<br>`patient_id`: string ≤28 (null clears)<br>`notes`: string ≤2000 (null clears)<br>`phones`: string ≤16[]<br>`instagram_handles`: string ≤60[]<br>`default_channel`: enum(whatsapp|call|sms|instagram|email|note) (null clears)<br>`preferences`: object<br>`household`: string ≤240 (null clears) |
| GET | `/app/leads/exports` | export (CSV in JSON) | Export leads | PERM: list:export | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|name|follow_up_at|last_touch_at)<br>`order`: enum(asc|desc)<br>`status`: enum(new|contacted|follow_up|clinic_visited|no_response|not_interested|invalid|lost)<br>`source`: enum(instagram|google|whatsapp|facebook|walk_in|referral|retarget)<br>`owner_membership_id`: string<br>`follow_up_at_from`: string date-time<br>`follow_up_at_to`: string date-time<br>`branch_id`: string<br>`patient_id`: string<br>`is_contact_thread`: enum(true|false)<br>`kind`: enum(enquiry|retarget|contact_thread)<br>`created_from`: string date-time<br>`created_to`: string date-time<br>`branch_ids`: string | — |
| GET | `/app/leads/{lead_id}` | get | Get lead | PERM: lead:read | - | — | — |
| PATCH | `/app/leads/{lead_id}` | update | Update lead | PERM: lead:update | - | — | `name`: string ≤120<br>`phone`: string /^\+91\d{10}$/<br>`email`: string email (null clears)<br>`status`: enum(new|contacted|follow_up|clinic_visited|no_response|not_interested|invalid|lost) (null clears)<br>`source`: enum(instagram|google|whatsapp|facebook|walk_in|referral|retarget) (null clears)<br>`interests`: enum(others|clinical|peel|lhr|hydrafacial|prp)[]<br>`owner_membership_id`: string ≤28 (null clears)<br>`involved_membership_ids`: string ≤28[]<br>`follow_up_at`: string date-time (null clears)<br>`branch_id`: string ≤28 (null clears)<br>`patient_id`: string ≤28 (null clears)<br>`notes`: string ≤2000 (null clears)<br>`phones`: string ≤16[]<br>`instagram_handles`: string ≤60[]<br>`default_channel`: enum(whatsapp|call|sms|instagram|email|note) (null clears)<br>`preferences`: object<br>`household`: string ≤240 (null clears)<br>`expected_updated_at`: string date-time |
| DELETE | `/app/leads/{lead_id}` | delete | Delete lead | PERM: lead:delete | - | — | — |
| POST | `/app/leads/{lead_id}/claim` | action | Claim lead | PERM: lead:update | req | — | — |
| POST | `/app/leads/{lead_id}/reads` | action | Mark lead read | PERM: lead:read | req | — | — |
| POST | `/app/leads/{lead_id}/release` | action | Release lead | PERM: lead:update | req | — | — |
| POST | `/app/leads/{lead_id}/restore` | restore | Restore lead | PERM: lead:delete | req | — | — |
| GET | `/app/message-templates` | list (paginated) | List message templates | PERM: lead:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|name)<br>`order`: enum(asc|desc)<br>`channel`: enum(whatsapp|call|sms|instagram|email|note)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/message-templates` | create | Create message template | PERM: message_template:create | req | — | `name`*: string ≤60<br>`body`*: string ≤1000<br>`channel`: enum(whatsapp|call|sms|instagram|email|note) |
| GET | `/app/message-templates/{message_template_id}` | get | Get message template | PERM: lead:read | - | — | — |
| PATCH | `/app/message-templates/{message_template_id}` | update | Update message template | PERM: message_template:update | - | — | `name`: string ≤60<br>`body`: string ≤1000<br>`channel`: enum(whatsapp|call|sms|instagram|email|note)<br>`expected_updated_at`: string date-time |
| DELETE | `/app/message-templates/{message_template_id}` | delete | Delete message template | PERM: message_template:delete | - | — | — |
| POST | `/app/message-templates/{message_template_id}/restore` | restore | Restore message template | PERM: message_template:delete | req | — | — |

### Medical store (58)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/manufacturers` | list (paginated) | List manufacturers | PERM: manufacturer:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|name)<br>`order`: enum(asc|desc)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/manufacturers` | create | Create manufacturer | PERM: manufacturer:create | req | — | `name`*: string ≤80<br>`tone`: enum(butter|lav|sky|sage|blush|mint|peach|plum|lime|slate|stone)<br>`is_quick`: boolean |
| GET | `/app/manufacturers/{manufacturer_id}` | get | Get manufacturer | PERM: manufacturer:read | - | — | — |
| PATCH | `/app/manufacturers/{manufacturer_id}` | update | Update manufacturer | PERM: manufacturer:update | - | — | `name`: string ≤80<br>`tone`: enum(butter|lav|sky|sage|blush|mint|peach|plum|lime|slate|stone)<br>`is_quick`: boolean<br>`expected_updated_at`: string date-time |
| DELETE | `/app/manufacturers/{manufacturer_id}` | delete | Delete manufacturer | PERM: manufacturer:delete | - | — | — |
| POST | `/app/manufacturers/{manufacturer_id}/restore` | restore | Restore manufacturer | PERM: manufacturer:delete | req | — | — |
| GET | `/app/medical-contacts` | list (paginated) | List medical contacts | PERM: medical_sale:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|name)<br>`order`: enum(asc|desc)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/medical-contacts` | create | Create medical contact | PERM: medical_sale:create | req | — | `name`*: string ≤120<br>`phone`: string /^\+91\d{10}$/ (null clears) |
| GET | `/app/medical-contacts/{medical_contact_id}` | get | Get medical contact | PERM: medical_sale:read | - | — | — |
| PATCH | `/app/medical-contacts/{medical_contact_id}` | update | Update medical contact | PERM: medical_sale:update | - | — | `name`: string ≤120<br>`phone`: string /^\+91\d{10}$/ (null clears)<br>`expected_updated_at`: string date-time |
| DELETE | `/app/medical-contacts/{medical_contact_id}` | delete | Delete medical contact | PERM: medical_sale:delete | - | — | — |
| POST | `/app/medical-contacts/{medical_contact_id}/restore` | restore | Restore medical contact | PERM: medical_sale:delete | req | — | — |
| GET | `/app/medical-purchase-orders` | list (paginated) | List purchase orders | PERM: medical_purchase_order:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|order_date)<br>`order`: enum(asc|desc)<br>`supplier_id`: string<br>`order_date_from`: string date<br>`order_date_to`: string date<br>`stage`: enum(ordered|received|paid|cancelled)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/medical-purchase-orders` | create | Create purchase order | PERM: medical_purchase_order:create | req | — | `supplier_id`*: string ≤28<br>`supplier_bill_number`: string ≤30 (null clears)<br>`order_date`*: string date<br>`items`: object[] |
| GET | `/app/medical-purchase-orders/exports` | export (CSV in JSON) | Export purchase orders | PERM: list:export | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|order_date)<br>`order`: enum(asc|desc)<br>`supplier_id`: string<br>`order_date_from`: string date<br>`order_date_to`: string date<br>`stage`: enum(ordered|received|paid|cancelled)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| GET | `/app/medical-purchase-orders/{medical_purchase_order_id}` | get | Get purchase order | PERM: medical_purchase_order:read | - | — | — |
| PATCH | `/app/medical-purchase-orders/{medical_purchase_order_id}` | update | Update purchase order | PERM: medical_purchase_order:update | - | — | `supplier_id`: string ≤28<br>`supplier_bill_number`: string ≤30 (null clears)<br>`order_date`: string date<br>`items`: object[]<br>`expected_updated_at`: string date-time |
| DELETE | `/app/medical-purchase-orders/{medical_purchase_order_id}` | delete | Delete purchase order | PERM: medical_purchase_order:delete | - | — | — |
| POST | `/app/medical-purchase-orders/{medical_purchase_order_id}/cancel` | action | Cancel purchase order | PERM: medical_purchase_order:update | req | — | `cancel_reason`*: enum(mistake|duplicate|not_needed|other) |
| POST | `/app/medical-purchase-orders/{medical_purchase_order_id}/receive` | action | Receive purchase order | PERM: medical_purchase_order:update | req | — | — |
| POST | `/app/medical-purchase-orders/{medical_purchase_order_id}/restore` | restore | Restore purchase order | PERM: medical_purchase_order:delete | req | — | — |
| GET | `/app/medical-rep-visits/{medical_rep_visit_id}` | get | Get medical rep visit | PERM: medical_rep:read | - | — | — |
| PATCH | `/app/medical-rep-visits/{medical_rep_visit_id}` | update | Update medical rep visit | PERM: medical_rep:update | - | — | `visit_date`: string date<br>`samples`: string ≤120 (null clears)<br>`notes`: string ≤500 (null clears)<br>`expected_updated_at`: string date-time |
| DELETE | `/app/medical-rep-visits/{medical_rep_visit_id}` | delete | Delete medical rep visit | PERM: medical_rep:update | - | — | — |
| POST | `/app/medical-rep-visits/{medical_rep_visit_id}/restore` | restore | Restore medical rep visit | PERM: medical_rep:update | req | — | — |
| GET | `/app/medical-reps` | list (paginated) | List medical reps | PERM: medical_rep:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|name|next_visit_on)<br>`order`: enum(asc|desc)<br>`next_visit_on_from`: string date<br>`next_visit_on_to`: string date<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/medical-reps` | create | Create medical rep | PERM: medical_rep:create | req | — | `name`*: string ≤120<br>`phone`: string /^\+91\d{10}$/ (null clears)<br>`manufacturer_ids`: string ≤28[]<br>`next_visit_on`: string date (null clears) |
| GET | `/app/medical-reps/{medical_rep_id}` | get | Get medical rep | PERM: medical_rep:read | - | — | — |
| PATCH | `/app/medical-reps/{medical_rep_id}` | update | Update medical rep | PERM: medical_rep:update | - | — | `name`: string ≤120<br>`phone`: string /^\+91\d{10}$/ (null clears)<br>`manufacturer_ids`: string ≤28[]<br>`next_visit_on`: string date (null clears)<br>`expected_updated_at`: string date-time |
| DELETE | `/app/medical-reps/{medical_rep_id}` | delete | Delete medical rep | PERM: medical_rep:delete | - | — | — |
| POST | `/app/medical-reps/{medical_rep_id}/restore` | restore | Restore medical rep | PERM: medical_rep:delete | req | — | — |
| GET | `/app/medical-reps/{medical_rep_id}/visits` | list (paginated) | List a medical rep's medical rep visits | PERM: medical_rep:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|visit_date)<br>`order`: enum(asc|desc)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/medical-reps/{medical_rep_id}/visits` | create (child) | Add a medical rep visit | PERM: medical_rep:update | req | — | `visit_date`*: string date<br>`samples`: string ≤120 (null clears)<br>`notes`: string ≤500 (null clears) |
| GET | `/app/medical-sales` | list (paginated) | List medical sales | PERM: medical_sale:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|sold_at)<br>`order`: enum(asc|desc)<br>`patient_id`: string<br>`medical_contact_id`: string<br>`status`: enum(sold|voided)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/medical-sales` | create | Create medical sale | PERM: medical_sale:create | req | — | `patient_id`: string ≤28 (null clears)<br>`medical_contact_id`: string ≤28 (null clears)<br>`prescription_id`: string ≤28 (null clears)<br>`lead_id`: string ≤28 (null clears) |
| GET | `/app/medical-sales/exports` | export (CSV in JSON) | Export medical sales | PERM: list:export | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|sold_at)<br>`order`: enum(asc|desc)<br>`patient_id`: string<br>`medical_contact_id`: string<br>`status`: enum(sold|voided)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| GET | `/app/medical-sales/{medical_sale_id}` | get | Get medical sale | PERM: medical_sale:read | - | — | — |
| DELETE | `/app/medical-sales/{medical_sale_id}` | delete | Delete medical sale | PERM: medical_sale:delete | - | — | — |
| POST | `/app/medical-sales/{medical_sale_id}/restore` | restore | Restore medical sale | PERM: medical_sale:delete | req | — | — |
| POST | `/app/medical-sales/{medical_sale_id}/void` | action | Void sale | PERM: sale:void | req | — | — |
| GET | `/app/medicines` | list (paginated) | List medicines | PERM: medicine:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|name)<br>`order`: enum(asc|desc)<br>`manufacturer_id`: string<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/medicines` | create | Create medicine | PERM: medicine:create | req | — | `name`*: string ≤120<br>`composition`: string ≤160 (null clears)<br>`manufacturer_id`*: string ≤28<br>`mrp`*: number 0–9999999999.99<br>`gst_percent`: enum(0) or enum(5) or enum(12) or enum(18) or enum(28)<br>`min_stock`: integer 0–9999<br>`max_stock`: integer 0–9999<br>`batches`: object[]<br>`supplier_rates`: object[]<br>`is_quick`: boolean<br>`is_prescription_only`: boolean<br>`near_expiry_discount_percent`: number 0–100 |
| GET | `/app/medicines/exports` | export (CSV in JSON) | Export medicines | PERM: list:export | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|name)<br>`order`: enum(asc|desc)<br>`manufacturer_id`: string<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| GET | `/app/medicines/{medicine_id}` | get | Get medicine | PERM: medicine:read | - | — | — |
| PATCH | `/app/medicines/{medicine_id}` | update | Update medicine | PERM: medicine:update | - | — | `name`: string ≤120<br>`composition`: string ≤160 (null clears)<br>`manufacturer_id`: string ≤28<br>`mrp`: number 0–9999999999.99<br>`gst_percent`: enum(0) or enum(5) or enum(12) or enum(18) or enum(28)<br>`min_stock`: integer 0–9999<br>`max_stock`: integer 0–9999<br>`batches`: object[]<br>`supplier_rates`: object[]<br>`is_quick`: boolean<br>`is_prescription_only`: boolean<br>`near_expiry_discount_percent`: number 0–100<br>`expected_updated_at`: string date-time |
| DELETE | `/app/medicines/{medicine_id}` | delete | Delete medicine | PERM: medicine:delete | - | — | — |
| POST | `/app/medicines/{medicine_id}/restore` | restore | Restore medicine | PERM: medicine:delete | req | — | — |
| GET | `/app/supplier-credits` | list (paginated) | List supplier credits | PERM: supplier:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at)<br>`order`: enum(asc|desc)<br>`supplier_id`: string<br>`medicine_id`: string<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/supplier-credits` | create | Create supplier credit | PERM: supplier:update | req | — | `supplier_id`*: string ≤28<br>`medicine_id`: string ≤28 (null clears)<br>`batch_number`: string ≤20 (null clears)<br>`quantity`*: integer 1–99999<br>`amount`*: number 0–9999999999.99 |
| GET | `/app/supplier-credits/{supplier_credit_id}` | get | Get supplier credit | PERM: supplier:read | - | — | — |
| DELETE | `/app/supplier-credits/{supplier_credit_id}` | delete | Delete supplier credit | PERM: supplier:update | - | — | — |
| POST | `/app/supplier-credits/{supplier_credit_id}/restore` | restore | Restore supplier credit | PERM: supplier:update | req | — | — |
| GET | `/app/suppliers` | list (paginated) | List suppliers | PERM: supplier:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|name)<br>`order`: enum(asc|desc)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/suppliers` | create | Create supplier | PERM: supplier:create | req | — | `name`*: string ≤120<br>`phone`: string /^\+91\d{10}$/ (null clears)<br>`gst_number`: string /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/ (null clears)<br>`manufacturer_ids`: string ≤28[]<br>`is_quick`: boolean |
| GET | `/app/suppliers/{supplier_id}` | get | Get supplier | PERM: supplier:read | - | — | — |
| PATCH | `/app/suppliers/{supplier_id}` | update | Update supplier | PERM: supplier:update | - | — | `name`: string ≤120<br>`phone`: string /^\+91\d{10}$/ (null clears)<br>`gst_number`: string /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/ (null clears)<br>`manufacturer_ids`: string ≤28[]<br>`is_quick`: boolean<br>`expected_updated_at`: string date-time |
| DELETE | `/app/suppliers/{supplier_id}` | delete | Delete supplier | PERM: supplier:delete | - | — | — |
| POST | `/app/suppliers/{supplier_id}/restore` | restore | Restore supplier | PERM: supplier:delete | req | — | — |

### Membership (1)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/users` | read | List users | PERM: organization:read | - | `q`: string<br>`role_id`: string<br>`branch_id`: string | — |

### Message (5)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/messages` | list (paginated) | List messages | PERM: lead:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|sent_at)<br>`order`: enum(asc|desc)<br>`lead_id`: string<br>`patient_id`: string<br>`medical_contact_id`: string<br>`channel`: enum(whatsapp|call|sms|instagram|email|note)<br>`direction`: enum(sent|received)<br>`kind`: enum(text|template|media|call_log|note|system)<br>`delivery_status`: enum(queued|sent|delivered|read|failed)<br>`sent_at_from`: string date-time<br>`sent_at_to`: string date-time<br>`task_id`: string<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/messages` | create | Create message | PERM: lead:update | req | — | `lead_id`: string ≤28 (null clears)<br>`patient_id`: string ≤28 (null clears)<br>`medical_contact_id`: string ≤28 (null clears)<br>`channel`: enum(whatsapp|call|sms|instagram|email|note)<br>`kind`: enum(text|template|media|call_log|note|system)<br>`body`*: string ≤4096<br>`message_template_id`: string ≤28 (null clears)<br>`attachment_keys`: string ≤512[]<br>`reply_to_message_id`: string ≤28 (null clears)<br>`record_type`: enum(appointment|invoice|payment|prescription|patient_package|review|check_in|task) (null clears)<br>`record_id`: string ≤28 (null clears)<br>`task_id`: string ≤28 (null clears) |
| POST | `/app/messages/batches` | action (collection) | Send a message to many contacts | PERM: lead:update | req | — | `contact_ids`*: string ≤28[]<br>`channel`*: enum(whatsapp|call|sms|instagram|email|note)<br>`body`*: string ≤4096<br>`message_template_id`: string ≤28 |
| GET | `/app/messages/{message_id}` | get | Get message | PERM: lead:read | - | — | — |
| POST | `/app/messages/{message_id}/resend` | action | Resend message | PERM: lead:update | req | — | — |

### Offering (19)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/offering-groups` | list (paginated) | List offering groups | PERM: organization:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|name|sort_order)<br>`order`: enum(asc|desc)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/offering-groups` | create | Create offering group | PERM: offering_group:create | req | — | `name`*: string ≤60<br>`sort_order`: integer 0–9999 |
| GET | `/app/offering-groups/{offering_group_id}` | get | Get offering group | PERM: organization:read | - | — | — |
| PATCH | `/app/offering-groups/{offering_group_id}` | update | Update offering group | PERM: offering_group:update | - | — | `name`: string ≤60<br>`sort_order`: integer 0–9999<br>`expected_updated_at`: string date-time |
| DELETE | `/app/offering-groups/{offering_group_id}` | delete | Delete offering group | PERM: offering_group:delete | - | — | — |
| POST | `/app/offering-groups/{offering_group_id}/restore` | restore | Restore offering group | PERM: offering_group:delete | req | — | — |
| GET | `/app/offerings` | list (paginated) | List offerings | PERM: organization:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|name)<br>`order`: enum(asc|desc)<br>`category`: enum(consultation|treatment|package|lhr|product)<br>`specialty`: enum(skin|hair|dental|gynac|physio|general)<br>`is_active`: enum(true|false)<br>`group_id`: string<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/offerings` | create | Create offering | PERM: offering:create | req | — | `name`*: string ≤120<br>`category`: enum(consultation|treatment|package|lhr|product)<br>`specialty`: enum(skin|hair|dental|gynac|physio|general)<br>`tone`: enum(butter|lav|sky|sage|blush|mint|peach|plum|lime|slate|stone)<br>`price`*: number 0–9999999999.99<br>`min_price`: number 0–9999999999.99<br>`duration_minutes`: integer 5–480<br>`sessions`: integer 1–99<br>`validity_days`: integer 0–1095<br>`default_doctor_membership_id`: string ≤28 (null clears)<br>`default_room_id`: string ≤28 (null clears)<br>`gst_percent`: enum(0) or enum(5) or enum(12) or enum(18) or enum(28)<br>`is_active`: boolean<br>`group_id`: string ≤28 (null clears)<br>`offer_price`: number 0–9999999999.99 (null clears)<br>`branch_ids`: string ≤28[]<br>`is_gst_inclusive`: boolean<br>`search_terms`: string ≤60[]<br>`description`: string ≤1000 (null clears) |
| GET | `/app/offerings/exports` | export (CSV in JSON) | Export offerings | PERM: list:export | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|name)<br>`order`: enum(asc|desc)<br>`category`: enum(consultation|treatment|package|lhr|product)<br>`specialty`: enum(skin|hair|dental|gynac|physio|general)<br>`is_active`: enum(true|false)<br>`group_id`: string<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| GET | `/app/offerings/{offering_id}` | get | Get offering | PERM: organization:read | - | — | — |
| PATCH | `/app/offerings/{offering_id}` | update | Update offering | PERM: offering:update | - | — | `name`: string ≤120<br>`category`: enum(consultation|treatment|package|lhr|product)<br>`specialty`: enum(skin|hair|dental|gynac|physio|general)<br>`tone`: enum(butter|lav|sky|sage|blush|mint|peach|plum|lime|slate|stone)<br>`price`: number 0–9999999999.99<br>`min_price`: number 0–9999999999.99<br>`duration_minutes`: integer 5–480<br>`sessions`: integer 1–99<br>`validity_days`: integer 0–1095<br>`default_doctor_membership_id`: string ≤28 (null clears)<br>`default_room_id`: string ≤28 (null clears)<br>`gst_percent`: enum(0) or enum(5) or enum(12) or enum(18) or enum(28)<br>`is_active`: boolean<br>`group_id`: string ≤28 (null clears)<br>`offer_price`: number 0–9999999999.99 (null clears)<br>`branch_ids`: string ≤28[]<br>`is_gst_inclusive`: boolean<br>`search_terms`: string ≤60[]<br>`description`: string ≤1000 (null clears)<br>`expected_updated_at`: string date-time |
| DELETE | `/app/offerings/{offering_id}` | delete | Delete offering | PERM: offering:delete | - | — | — |
| POST | `/app/offerings/{offering_id}/restore` | restore | Restore offering | PERM: offering:delete | req | — | — |
| GET | `/app/offers` | list (paginated) | List offers | PERM: offer:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|name|starts_on)<br>`order`: enum(asc|desc)<br>`kind`: enum(percent|amount|fixed|extra)<br>`starts_on_from`: string date<br>`starts_on_to`: string date<br>`is_paused`: enum(true|false)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/offers` | create | Create offer | PERM: price:manage | req | — | `name`*: string ≤80<br>`code`: string ≤16 (null clears)<br>`kind`: enum(percent|amount|fixed|extra)<br>`value`*: number 0–9999999999.99<br>`offering_ids`*: string ≤28[]<br>`branch_ids`: string ≤28[]<br>`starts_on`: string date (null clears)<br>`ends_on`: string date (null clears)<br>`is_paused`: boolean<br>`tone`: enum(butter|lav|sky|sage|blush|mint|peach|plum|lime|slate|stone)<br>`note`: string ≤280 (null clears) |
| GET | `/app/offers/{offer_id}` | get | Get offer | PERM: offer:read | - | — | — |
| PATCH | `/app/offers/{offer_id}` | update | Update offer | PERM: price:manage | - | — | `name`: string ≤80<br>`code`: string ≤16 (null clears)<br>`kind`: enum(percent|amount|fixed|extra)<br>`value`: number 0–9999999999.99<br>`offering_ids`: string ≤28[]<br>`branch_ids`: string ≤28[]<br>`starts_on`: string date (null clears)<br>`ends_on`: string date (null clears)<br>`is_paused`: boolean<br>`tone`: enum(butter|lav|sky|sage|blush|mint|peach|plum|lime|slate|stone)<br>`note`: string ≤280 (null clears)<br>`expected_updated_at`: string date-time |
| DELETE | `/app/offers/{offer_id}` | delete | Delete offer | PERM: price:manage | - | — | — |
| POST | `/app/offers/{offer_id}/restore` | restore | Restore offer | PERM: price:manage | req | — | — |

### Patient (7)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/patients` | list (paginated) | List patients | PERM: patient:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|first_name|follow_up_at)<br>`order`: enum(asc|desc)<br>`gender`: enum(female|male|other)<br>`home_branch_id`: string<br>`status`: enum(new|regular|vip|inactive)<br>`conversion`: enum(converted|not_converted)<br>`referral_source`: enum(patient|doctor|instagram|google|walk_in|other)<br>`doctor_membership_id`: string<br>`follow_up_at_from`: string date-time<br>`follow_up_at_to`: string date-time<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/patients` | create | Create patient | PERM: patient:create | req | — | `first_name`*: string ≤60<br>`last_name`: string ≤60 (null clears)<br>`phone`*: string /^\+91\d{10}$/<br>`phones`: string ≤16[]<br>`email`: string email (null clears)<br>`gender`: enum(female|male|other) (null clears)<br>`date_of_birth`: string date (null clears)<br>`address`: string ≤240 (null clears)<br>`home_branch_id`*: string ≤28<br>`types`: enum(aesthetic|clinical|lhr|dental|physio|gynac)[]<br>`status`: enum(new|regular|vip|inactive)<br>`conversion`: enum(converted|not_converted)<br>`referral_source`: enum(patient|doctor|instagram|google|walk_in|other) (null clears)<br>`referred_by_patient_id`: string ≤28 (null clears)<br>`referred_by_name`: string ≤120 (null clears)<br>`doctor_membership_id`: string ≤28 (null clears)<br>`follow_up_at`: string date-time (null clears)<br>`notes`: string ≤2000 (null clears)<br>`lead_id`: string ≤28 (null clears)<br>`has_data_consent`: boolean<br>`has_photo_consent`: boolean<br>`has_marketing_consent`: boolean<br>`language`: string ≤20 (null clears)<br>`instagram_handles`: string ≤60[]<br>`default_channel`: enum(whatsapp|call|sms|instagram|email|note) (null clears)<br>`preferences`: object<br>`household`: string ≤240 (null clears)<br>`allergies`: string ≤120[]<br>`contraindications`: string ≤120[] |
| GET | `/app/patients/exports` | export (CSV in JSON) | Export patients | PERM: list:export | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|first_name|follow_up_at)<br>`order`: enum(asc|desc)<br>`gender`: enum(female|male|other)<br>`home_branch_id`: string<br>`status`: enum(new|regular|vip|inactive)<br>`conversion`: enum(converted|not_converted)<br>`referral_source`: enum(patient|doctor|instagram|google|walk_in|other)<br>`doctor_membership_id`: string<br>`follow_up_at_from`: string date-time<br>`follow_up_at_to`: string date-time<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| GET | `/app/patients/{patient_id}` | get | Get patient | PERM: patient:read | - | — | — |
| PATCH | `/app/patients/{patient_id}` | update | Update patient | PERM: patient:update | - | — | `first_name`: string ≤60<br>`last_name`: string ≤60 (null clears)<br>`phone`: string /^\+91\d{10}$/<br>`phones`: string ≤16[]<br>`email`: string email (null clears)<br>`gender`: enum(female|male|other) (null clears)<br>`date_of_birth`: string date (null clears)<br>`address`: string ≤240 (null clears)<br>`home_branch_id`: string ≤28<br>`types`: enum(aesthetic|clinical|lhr|dental|physio|gynac)[]<br>`status`: enum(new|regular|vip|inactive)<br>`conversion`: enum(converted|not_converted)<br>`referral_source`: enum(patient|doctor|instagram|google|walk_in|other) (null clears)<br>`referred_by_patient_id`: string ≤28 (null clears)<br>`referred_by_name`: string ≤120 (null clears)<br>`doctor_membership_id`: string ≤28 (null clears)<br>`follow_up_at`: string date-time (null clears)<br>`notes`: string ≤2000 (null clears)<br>`lead_id`: string ≤28 (null clears)<br>`has_data_consent`: boolean<br>`has_photo_consent`: boolean<br>`has_marketing_consent`: boolean<br>`language`: string ≤20 (null clears)<br>`instagram_handles`: string ≤60[]<br>`default_channel`: enum(whatsapp|call|sms|instagram|email|note) (null clears)<br>`preferences`: object<br>`household`: string ≤240 (null clears)<br>`allergies`: string ≤120[]<br>`contraindications`: string ≤120[]<br>`expected_updated_at`: string date-time |
| DELETE | `/app/patients/{patient_id}` | delete | Delete patient | PERM: patient:delete | - | — | — |
| POST | `/app/patients/{patient_id}/restore` | restore | Restore patient | PERM: patient:delete | req | — | — |

### Patient file (43)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/diagnoses` | list (paginated) | List diagnoses | PERM: patient:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|name)<br>`order`: enum(asc|desc)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/diagnoses` | create | Create diagnosis | PERM: prescription:create | req | — | `name`*: string ≤120 |
| GET | `/app/diagnoses/{diagnosis_id}` | get | Get diagnosis | PERM: patient:read | - | — | — |
| PATCH | `/app/diagnoses/{diagnosis_id}` | update | Update diagnosis | PERM: prescription:update | - | — | `name`: string ≤120<br>`expected_updated_at`: string date-time |
| DELETE | `/app/diagnoses/{diagnosis_id}` | delete | Delete diagnosis | PERM: prescription:delete | - | — | — |
| POST | `/app/diagnoses/{diagnosis_id}/restore` | restore | Restore diagnosis | PERM: prescription:delete | req | — | — |
| GET | `/app/patient-clinical-notes/{patient_clinical_note_id}` | get | Get clinical note | PERM: clinical_record:read | - | — | — |
| DELETE | `/app/patient-clinical-notes/{patient_clinical_note_id}` | delete | Delete clinical note | PERM: patient:update | - | — | — |
| POST | `/app/patient-clinical-notes/{patient_clinical_note_id}/restore` | restore | Restore clinical note | PERM: patient:update | req | — | — |
| GET | `/app/patient-images/{patient_image_id}` | get | Get patient image | PERM: clinical_record:read | - | — | — |
| PATCH | `/app/patient-images/{patient_image_id}` | update | Update patient image | PERM: patient:update | - | — | `appointment_id`: string ≤28 (null clears)<br>`album`: enum(general|private|lhr)<br>`file_name`: string ≤120<br>`body_part`: enum(face|scalp|hair|body|chest|back|underarm|legs|arms|other) (null clears)<br>`taken_on`: string date<br>`caption`: string ≤200 (null clears)<br>`display_name`: string ≤60 (null clears)<br>`expected_updated_at`: string date-time |
| DELETE | `/app/patient-images/{patient_image_id}` | delete | Delete patient image | PERM: patient:update | - | — | — |
| POST | `/app/patient-images/{patient_image_id}/restore` | restore | Restore patient image | PERM: patient:update | req | — | — |
| GET | `/app/patient-notes/{patient_note_id}` | get | Get patient note | PERM: patient:read | - | — | — |
| PATCH | `/app/patient-notes/{patient_note_id}` | update | Update patient note | PERM: patient:update | - | — | `body`: string ≤2000<br>`expected_updated_at`: string date-time |
| DELETE | `/app/patient-notes/{patient_note_id}` | delete | Delete patient note | PERM: patient:update | - | — | — |
| POST | `/app/patient-notes/{patient_note_id}/restore` | restore | Restore patient note | PERM: patient:update | req | — | — |
| GET | `/app/patient-reports/{patient_report_id}` | get | Get patient report | PERM: patient:read | - | — | — |
| PATCH | `/app/patient-reports/{patient_report_id}` | update | Update patient report | PERM: patient:update | - | — | `type`: enum(lab|scan|consent|other)<br>`name`: string ≤120<br>`report_date`: string date<br>`file_keys`: string ≤512[]<br>`notes`: string ≤1000 (null clears)<br>`expected_updated_at`: string date-time |
| DELETE | `/app/patient-reports/{patient_report_id}` | delete | Delete patient report | PERM: patient:update | - | — | — |
| POST | `/app/patient-reports/{patient_report_id}/restore` | restore | Restore patient report | PERM: patient:update | req | — | — |
| GET | `/app/patients/{patient_id}/clinical-notes` | list (paginated) | List a patient's clinical notes | PERM: clinical_record:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at)<br>`order`: enum(asc|desc)<br>`kind`: enum(complaint|diagnosis|treatment_suggestion|future_suggestion)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/patients/{patient_id}/clinical-notes` | create (child) | Add a clinical note | PERM: patient:update | req | — | `kind`*: enum(complaint|diagnosis|treatment_suggestion|future_suggestion)<br>`text`*: string ≤500 |
| GET | `/app/patients/{patient_id}/images` | list (paginated) | List a patient's patient images | PERM: clinical_record:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|taken_on)<br>`order`: enum(asc|desc)<br>`appointment_id`: string<br>`album`: enum(general|private|lhr)<br>`body_part`: enum(face|scalp|hair|body|chest|back|underarm|legs|arms|other)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/patients/{patient_id}/images` | create (child) | Add a patient image | PERM: patient:update | req | — | `appointment_id`: string ≤28 (null clears)<br>`album`: enum(general|private|lhr)<br>`file_key`*: string ≤512<br>`file_name`*: string ≤120<br>`body_part`: enum(face|scalp|hair|body|chest|back|underarm|legs|arms|other) (null clears)<br>`taken_on`*: string date<br>`caption`: string ≤200 (null clears)<br>`display_name`: string ≤60 (null clears) |
| GET | `/app/patients/{patient_id}/notes` | list (paginated) | List a patient's patient notes | PERM: patient:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at)<br>`order`: enum(asc|desc)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/patients/{patient_id}/notes` | create (child) | Add a patient note | PERM: patient:update | req | — | `body`*: string ≤2000 |
| GET | `/app/patients/{patient_id}/prescriptions` | list (paginated) | List a patient's prescriptions | PERM: prescription:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|prescription_date)<br>`order`: enum(asc|desc)<br>`patient_id`: string<br>`appointment_id`: string<br>`doctor_membership_id`: string<br>`prescription_date_from`: string date<br>`prescription_date_to`: string date<br>`status`: enum(draft|approved)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/patients/{patient_id}/prescriptions` | create (child) | Add a prescription | PERM: prescription:create | req | — | `appointment_id`: string ≤28 (null clears)<br>`doctor_membership_id`*: string ≤28<br>`prescription_date`*: string date<br>`items`: object[]<br>`advice`: string ≤2000 (null clears)<br>`lab_report`: string ≤2000 (null clears)<br>`procedure_today`: string ≤2000 (null clears)<br>`follow_up_date`: string date (null clears)<br>`print_language`: enum(english|gujarati|hindi) |
| GET | `/app/patients/{patient_id}/reports` | list (paginated) | List a patient's patient reports | PERM: patient:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|report_date)<br>`order`: enum(asc|desc)<br>`type`: enum(lab|scan|consent|other)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/patients/{patient_id}/reports` | create (child) | Add a patient report | PERM: patient:update | req | — | `type`: enum(lab|scan|consent|other)<br>`name`*: string ≤120<br>`report_date`*: string date<br>`file_keys`: string ≤512[]<br>`notes`: string ≤1000 (null clears) |
| GET | `/app/prescription-kits` | list (paginated) | List prescription kits | PERM: prescription:create | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|name)<br>`order`: enum(asc|desc)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/prescription-kits` | create | Create prescription kit | PERM: prescription:create | req | — | `name`*: string ≤80<br>`items`: object[] |
| GET | `/app/prescription-kits/{prescription_kit_id}` | get | Get prescription kit | PERM: prescription:create | - | — | — |
| PATCH | `/app/prescription-kits/{prescription_kit_id}` | update | Update prescription kit | PERM: prescription:create | - | — | `name`: string ≤80<br>`items`: object[]<br>`expected_updated_at`: string date-time |
| DELETE | `/app/prescription-kits/{prescription_kit_id}` | delete | Delete prescription kit | PERM: prescription:create | - | — | — |
| POST | `/app/prescription-kits/{prescription_kit_id}/restore` | restore | Restore prescription kit | PERM: prescription:create | req | — | — |
| GET | `/app/prescriptions` | list (paginated) | List prescriptions | PERM: prescription:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|prescription_date)<br>`order`: enum(asc|desc)<br>`patient_id`: string<br>`appointment_id`: string<br>`doctor_membership_id`: string<br>`prescription_date_from`: string date<br>`prescription_date_to`: string date<br>`status`: enum(draft|approved)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| GET | `/app/prescriptions/{prescription_id}` | get | Get prescription | PERM: prescription:read | - | — | — |
| PATCH | `/app/prescriptions/{prescription_id}` | update | Update prescription | PERM: prescription:update | - | — | `appointment_id`: string ≤28 (null clears)<br>`doctor_membership_id`: string ≤28<br>`prescription_date`: string date<br>`items`: object[]<br>`advice`: string ≤2000 (null clears)<br>`lab_report`: string ≤2000 (null clears)<br>`procedure_today`: string ≤2000 (null clears)<br>`follow_up_date`: string date (null clears)<br>`print_language`: enum(english|gujarati|hindi)<br>`expected_updated_at`: string date-time |
| DELETE | `/app/prescriptions/{prescription_id}` | delete | Delete prescription | PERM: prescription:delete | - | — | — |
| POST | `/app/prescriptions/{prescription_id}/approve` | action | Approve prescription | PERM: prescription:update | req | — | — |
| POST | `/app/prescriptions/{prescription_id}/restore` | restore | Restore prescription | PERM: prescription:delete | req | — | — |

### Payment (21)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/credit-notes` | list (paginated) | List credit notes | PERM: payment:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at)<br>`order`: enum(asc|desc)<br>`invoice_id`: string<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| GET | `/app/credit-notes/{credit_note_id}` | get | Get credit note | PERM: payment:read | - | — | — |
| GET | `/app/day-closes` | list (paginated) | List day closes | PERM: day_close:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|close_date)<br>`order`: enum(asc|desc)<br>`branch_id`: string<br>`close_date_from`: string date<br>`close_date_to`: string date<br>`status`: enum(open|closed)<br>`created_from`: string date-time<br>`created_to`: string date-time<br>`branch_ids`: string | — |
| POST | `/app/day-closes` | create | Create day close | PERM: day_close:create | req | — | `branch_id`*: string ≤28<br>`close_date`*: string date<br>`opening_cash`*: number 0–9999999999.99 |
| GET | `/app/day-closes/{day_close_id}` | get | Get day close | PERM: day_close:read | - | — | — |
| POST | `/app/day-closes/{day_close_id}/close` | action | Close the day | PERM: day_close:close | req | — | `counted_cash`*: number 0–9999999999.99<br>`difference_reason`: string ≤280 |
| POST | `/app/day-closes/{day_close_id}/reopen` | action | Reopen the day | PERM: day_close:close | req | — | — |
| GET | `/app/payments` | list (paginated) | List payments | PERM: payment:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|paid_at)<br>`order`: enum(asc|desc)<br>`direction`: enum(received|paid)<br>`kind`: enum(receipt|refund|expense|supplier_bill|money_back|reversal)<br>`branch_id`: string<br>`patient_id`: string<br>`invoice_id`: string<br>`expense_category`: enum(medicines|consumables|salary|rent|marketing|utilities|maintenance|misc)<br>`paid_at_from`: string date-time<br>`paid_at_to`: string date-time<br>`day_close_id`: string<br>`created_from`: string date-time<br>`created_to`: string date-time<br>`branch_ids`: string | — |
| POST | `/app/payments` | create | Create payment | PERM: payment:create | req | — | `direction`*: enum(received|paid)<br>`kind`*: enum(receipt|refund|expense|supplier_bill|money_back|reversal)<br>`branch_id`*: string ≤28<br>`amount`*: number 0–9999999999.99<br>`splits`: object[]<br>`patient_id`: string ≤28 (null clears)<br>`invoice_id`: string ≤28 (null clears)<br>`payee_name`: string ≤120 (null clears)<br>`expense_category`: enum(medicines|consumables|salary|rent|marketing|utilities|maintenance|misc) (null clears)<br>`bill_ref`: {kind: enum(medical_po|stock_po|other), purchase_id: string ≤28, bill_number: string ≤30} (null clears)<br>`pending_credit_id`: string ≤28 (null clears)<br>`note`: string ≤280 (null clears)<br>`paid_at`: string date-time<br>`bill_allocations`: object[]<br>`reference`: string ≤60 (null clears)<br>`attachment_keys`: string ≤512[] |
| GET | `/app/payments/exports` | export (CSV in JSON) | Export payments | PERM: list:export | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|paid_at)<br>`order`: enum(asc|desc)<br>`direction`: enum(received|paid)<br>`kind`: enum(receipt|refund|expense|supplier_bill|money_back|reversal)<br>`branch_id`: string<br>`patient_id`: string<br>`invoice_id`: string<br>`expense_category`: enum(medicines|consumables|salary|rent|marketing|utilities|maintenance|misc)<br>`paid_at_from`: string date-time<br>`paid_at_to`: string date-time<br>`day_close_id`: string<br>`created_from`: string date-time<br>`created_to`: string date-time<br>`branch_ids`: string | — |
| GET | `/app/payments/{payment_id}` | get | Get payment | PERM: payment:read | - | — | — |
| PATCH | `/app/payments/{payment_id}` | update | Update payment | PERM: payment:update | - | — | `direction`: enum(received|paid)<br>`kind`: enum(receipt|refund|expense|supplier_bill|money_back|reversal)<br>`branch_id`: string ≤28<br>`amount`: number 0–9999999999.99<br>`splits`: object[]<br>`patient_id`: string ≤28 (null clears)<br>`invoice_id`: string ≤28 (null clears)<br>`payee_name`: string ≤120 (null clears)<br>`expense_category`: enum(medicines|consumables|salary|rent|marketing|utilities|maintenance|misc) (null clears)<br>`bill_ref`: {kind: enum(medical_po|stock_po|other), purchase_id: string ≤28, bill_number: string ≤30} (null clears)<br>`pending_credit_id`: string ≤28 (null clears)<br>`note`: string ≤280 (null clears)<br>`paid_at`: string date-time<br>`bill_allocations`: object[]<br>`reference`: string ≤60 (null clears)<br>`attachment_keys`: string ≤512[]<br>`expected_updated_at`: string date-time |
| DELETE | `/app/payments/{payment_id}` | delete | Delete payment | PERM: payment:delete | - | — | — |
| POST | `/app/payments/{payment_id}/checked` | action | Tick payment at day close | PERM: day_close:update | req | — | — |
| POST | `/app/payments/{payment_id}/restore` | restore | Restore payment | PERM: payment:delete | req | — | — |
| GET | `/app/pending-credits` | list (paginated) | List pending credits | PERM: payment:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|settle_by)<br>`order`: enum(asc|desc)<br>`direction`: enum(give|take)<br>`party_kind`: enum(patient|supplier|staff|other)<br>`patient_id`: string<br>`status`: enum(open|given_back|got_back|used)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/pending-credits` | create | Create pending credit | PERM: payment:create | req | — | `direction`*: enum(give|take)<br>`party_kind`: enum(patient|supplier|staff|other)<br>`party_name`*: string ≤120<br>`patient_id`: string ≤28 (null clears)<br>`amount`*: number 0–9999999999.99<br>`reason`*: string ≤280<br>`source_payment_id`: string ≤28 (null clears)<br>`invoice_id`: string ≤28 (null clears)<br>`settle_by`: string date (null clears)<br>`note`: string ≤280 (null clears) |
| GET | `/app/pending-credits/{pending_credit_id}` | get | Get pending credit | PERM: payment:read | - | — | — |
| PATCH | `/app/pending-credits/{pending_credit_id}` | update | Update pending credit | PERM: payment:update | - | — | `direction`: enum(give|take)<br>`party_kind`: enum(patient|supplier|staff|other)<br>`party_name`: string ≤120<br>`patient_id`: string ≤28 (null clears)<br>`amount`: number 0–9999999999.99<br>`reason`: string ≤280<br>`source_payment_id`: string ≤28 (null clears)<br>`invoice_id`: string ≤28 (null clears)<br>`settle_by`: string date (null clears)<br>`note`: string ≤280 (null clears)<br>`expected_updated_at`: string date-time |
| DELETE | `/app/pending-credits/{pending_credit_id}` | delete | Delete pending credit | PERM: payment:delete | - | — | — |
| POST | `/app/pending-credits/{pending_credit_id}/restore` | restore | Restore pending credit | PERM: payment:delete | req | — | — |

### Preference (2)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/user-preferences` | read | Get my preferences | PERM: organization:read | - | — | — |
| PATCH | `/app/user-preferences` | update | Update my preferences | PERM: organization:read | - | — | `pinned_sections`: enum(today|leads|appointments|patients|medical|stock|payments|tasks|offerings|users)[]<br>`branch_filter_ids`: string ≤28[]<br>`theme`: enum(light|dark|system)<br>`patient_file_pins`: enum(overview|timeline|prescriptions|treatments|images|reports|packages|invoices|payments|notes|team)[]<br>`recent_picks`: string ≤160[]<br>`expected_updated_at`: string date-time |

### Saved view (6)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/saved-views` | list (paginated) | List saved views | PERM: organization:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|label)<br>`order`: enum(asc|desc)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/saved-views` | create | Create saved view | PERM: organization:read | req | — | `list_key`*: string ≤40<br>`label`*: string ≤60<br>`filters`: object<br>`hidden_columns`: string ≤60[] |
| GET | `/app/saved-views/{saved_view_id}` | get | Get saved view | PERM: organization:read | - | — | — |
| PATCH | `/app/saved-views/{saved_view_id}` | update | Update saved view | PERM: organization:read | - | — | `label`: string ≤60<br>`filters`: object<br>`hidden_columns`: string ≤60[]<br>`expected_updated_at`: string date-time |
| DELETE | `/app/saved-views/{saved_view_id}` | delete | Delete saved view | PERM: organization:read | - | — | — |
| POST | `/app/saved-views/{saved_view_id}/restore` | restore | Restore saved view | PERM: organization:read | req | — | — |

### Search (3)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/contacts` | read | List contacts | PERM: organization:read | - | `q`: string<br>`phone`: string<br>`kind`: enum(patient|lead|medical_contact) | — |
| GET | `/app/contacts/{contact_id}/preview` | view | Preview contact | PERM: organization:read | - | — | — |
| GET | `/app/searches` | read | Search records | PERM: organization:read | - | `q`*: string | — |

### Stock (28)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/stock-counts` | list (paginated) | List stock counts | PERM: stock_item:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|counted_at)<br>`order`: enum(asc|desc)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/stock-counts` | create | Create stock count | PERM: stock_item:update | req | — | `lines`: object[] |
| GET | `/app/stock-counts/{stock_count_id}` | get | Get stock count | PERM: stock_item:read | - | — | — |
| DELETE | `/app/stock-counts/{stock_count_id}` | delete | Delete stock count | PERM: stock_item:update | - | — | — |
| POST | `/app/stock-counts/{stock_count_id}/restore` | restore | Restore stock count | PERM: stock_item:update | req | — | — |
| GET | `/app/stock-items` | list (paginated) | List stock items | PERM: stock_item:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|name)<br>`order`: enum(asc|desc)<br>`category`: enum(creams_serums|peels|masks|consumables|equipment|other)<br>`stock_vendor_id`: string<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/stock-items` | create | Create stock item | PERM: stock_item:create | req | — | `name`*: string ≤120<br>`category`: enum(creams_serums|peels|masks|consumables|equipment|other)<br>`unit`: enum(piece|tube|bottle|kit|pack|box|vial|ampoule|sachet|jar|roll|pair|…)<br>`size_per_unit_milli`: integer -9007199254740991–9007199254740991 (null clears)<br>`measure_unit`: enum(ml|g|pcs|units) (null clears)<br>`min_quantity`: integer 0–99999<br>`max_quantity`: integer 0–99999<br>`usage_per_week_milli`: integer 0–9007199254740991<br>`stock_vendor_id`: string ≤28 (null clears) |
| GET | `/app/stock-items/exports` | export (CSV in JSON) | Export stock items | PERM: list:export | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|name)<br>`order`: enum(asc|desc)<br>`category`: enum(creams_serums|peels|masks|consumables|equipment|other)<br>`stock_vendor_id`: string<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| GET | `/app/stock-items/{stock_item_id}` | get | Get stock item | PERM: stock_item:read | - | — | — |
| PATCH | `/app/stock-items/{stock_item_id}` | update | Update stock item | PERM: stock_item:update | - | — | `name`: string ≤120<br>`category`: enum(creams_serums|peels|masks|consumables|equipment|other)<br>`unit`: enum(piece|tube|bottle|kit|pack|box|vial|ampoule|sachet|jar|roll|pair|…)<br>`size_per_unit_milli`: integer -9007199254740991–9007199254740991 (null clears)<br>`measure_unit`: enum(ml|g|pcs|units) (null clears)<br>`min_quantity`: integer 0–99999<br>`max_quantity`: integer 0–99999<br>`usage_per_week_milli`: integer 0–9007199254740991<br>`stock_vendor_id`: string ≤28 (null clears)<br>`expected_updated_at`: string date-time |
| DELETE | `/app/stock-items/{stock_item_id}` | delete | Delete stock item | PERM: stock_item:delete | - | — | — |
| POST | `/app/stock-items/{stock_item_id}/restore` | restore | Restore stock item | PERM: stock_item:delete | req | — | — |
| GET | `/app/stock-movements` | list (paginated) | List stock movements | PERM: stock_item:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at)<br>`order`: enum(asc|desc)<br>`stock_item_id`: string<br>`type`: enum(used|received|adjust|damaged|returned|reverted)<br>`patient_id`: string<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/stock-movements` | create | Create stock movement | PERM: stock_item:update | req | — | `stock_item_id`*: string ≤28<br>`type`: enum(used|received|adjust|damaged|returned|reverted)<br>`delta_milli`*: integer -9007199254740991–9007199254740991<br>`used_for`: string ≤80 (null clears)<br>`patient_id`: string ≤28 (null clears)<br>`note`: string ≤280 (null clears) |
| GET | `/app/stock-movements/{stock_movement_id}` | get | Get stock movement | PERM: stock_item:read | - | — | — |
| GET | `/app/stock-purchases` | list (paginated) | List stock purchases | PERM: stock_purchase:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|purchase_date)<br>`order`: enum(asc|desc)<br>`stock_vendor_id`: string<br>`purchase_date_from`: string date<br>`purchase_date_to`: string date<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/stock-purchases` | create | Create stock purchase | PERM: stock_purchase:create | req | — | `stock_vendor_id`*: string ≤28<br>`bill_number`: string ≤30 (null clears)<br>`purchase_date`*: string date<br>`lines`: object[]<br>`bill_amount`: number 0–9999999999.99<br>`paid_amount`: number 0–9999999999.99 |
| GET | `/app/stock-purchases/exports` | export (CSV in JSON) | Export stock purchases | PERM: list:export | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|purchase_date)<br>`order`: enum(asc|desc)<br>`stock_vendor_id`: string<br>`purchase_date_from`: string date<br>`purchase_date_to`: string date<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| GET | `/app/stock-purchases/{stock_purchase_id}` | get | Get stock purchase | PERM: stock_purchase:read | - | — | — |
| PATCH | `/app/stock-purchases/{stock_purchase_id}` | update | Update stock purchase | PERM: stock_purchase:update | - | — | `stock_vendor_id`: string ≤28<br>`bill_number`: string ≤30 (null clears)<br>`purchase_date`: string date<br>`lines`: object[]<br>`bill_amount`: number 0–9999999999.99<br>`paid_amount`: number 0–9999999999.99<br>`expected_updated_at`: string date-time |
| DELETE | `/app/stock-purchases/{stock_purchase_id}` | delete | Delete stock purchase | PERM: stock_purchase:delete | - | — | — |
| POST | `/app/stock-purchases/{stock_purchase_id}/restore` | restore | Restore stock purchase | PERM: stock_purchase:delete | req | — | — |
| GET | `/app/stock-vendors` | list (paginated) | List stock vendors | PERM: stock_vendor:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|name)<br>`order`: enum(asc|desc)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/stock-vendors` | create | Create stock vendor | PERM: stock_vendor:create | req | — | `name`*: string ≤120<br>`phone`: string /^\+91\d{10}$/ (null clears)<br>`is_quick`: boolean |
| GET | `/app/stock-vendors/{stock_vendor_id}` | get | Get stock vendor | PERM: stock_vendor:read | - | — | — |
| PATCH | `/app/stock-vendors/{stock_vendor_id}` | update | Update stock vendor | PERM: stock_vendor:update | - | — | `name`: string ≤120<br>`phone`: string /^\+91\d{10}$/ (null clears)<br>`is_quick`: boolean<br>`expected_updated_at`: string date-time |
| DELETE | `/app/stock-vendors/{stock_vendor_id}` | delete | Delete stock vendor | PERM: stock_vendor:delete | - | — | — |
| POST | `/app/stock-vendors/{stock_vendor_id}/restore` | restore | Restore stock vendor | PERM: stock_vendor:delete | req | — | — |

### Task (11)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/task-rule-settings` | read | List task rules | PERM: task:read | - | — | — |
| PUT | `/app/task-rule-settings` | replace | Save task rules | PERM: task_rule:update | - | — | `rules`*: object[] |
| GET | `/app/tasks` | list (paginated) | List tasks | PERM: task:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|due_at)<br>`order`: enum(asc|desc)<br>`kind`: enum(manual|follow_up|aftercare_call|callback|payment_reminder|confirm_visit|review_request)<br>`rule_key`: enum(reply|failed_message|follow_up|call_back|claim|confirm|arrive|rebook|feedback|aftercare|next_visit|gone_quiet|…)<br>`owner_membership_id`: string<br>`owner_role`: enum(admin|doctor|therapist|front_desk|counsellor|pharmacist|accountant|marketing|owner)<br>`patient_id`: string<br>`lead_id`: string<br>`due_at_from`: string date-time<br>`due_at_to`: string date-time<br>`status`: enum(open|snoozed|done)<br>`priority`: enum(low|normal|high)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/tasks` | create | Create task | PERM: task:create | req | — | `kind`: enum(manual|follow_up|aftercare_call|callback|payment_reminder|confirm_visit|review_request)<br>`title`*: string ≤120<br>`why`: string ≤280 (null clears)<br>`owner_membership_id`: string ≤28 (null clears)<br>`owner_role`: enum(admin|doctor|therapist|front_desk|counsellor|pharmacist|accountant|marketing|owner)<br>`patient_id`: string ≤28 (null clears)<br>`lead_id`: string ≤28 (null clears)<br>`due_at`*: string date-time<br>`priority`: enum(low|normal|high)<br>`should_remind_before`: boolean |
| GET | `/app/tasks/exports` | export (CSV in JSON) | Export tasks | PERM: list:export | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|due_at)<br>`order`: enum(asc|desc)<br>`kind`: enum(manual|follow_up|aftercare_call|callback|payment_reminder|confirm_visit|review_request)<br>`rule_key`: enum(reply|failed_message|follow_up|call_back|claim|confirm|arrive|rebook|feedback|aftercare|next_visit|gone_quiet|…)<br>`owner_membership_id`: string<br>`owner_role`: enum(admin|doctor|therapist|front_desk|counsellor|pharmacist|accountant|marketing|owner)<br>`patient_id`: string<br>`lead_id`: string<br>`due_at_from`: string date-time<br>`due_at_to`: string date-time<br>`status`: enum(open|snoozed|done)<br>`priority`: enum(low|normal|high)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| GET | `/app/tasks/{task_id}` | get | Get task | PERM: task:read | - | — | — |
| PATCH | `/app/tasks/{task_id}` | update | Update task | PERM: task:update | - | — | `kind`: enum(manual|follow_up|aftercare_call|callback|payment_reminder|confirm_visit|review_request)<br>`title`: string ≤120<br>`why`: string ≤280 (null clears)<br>`owner_membership_id`: string ≤28 (null clears)<br>`owner_role`: enum(admin|doctor|therapist|front_desk|counsellor|pharmacist|accountant|marketing|owner)<br>`patient_id`: string ≤28 (null clears)<br>`lead_id`: string ≤28 (null clears)<br>`due_at`: string date-time<br>`priority`: enum(low|normal|high)<br>`should_remind_before`: boolean<br>`expected_updated_at`: string date-time |
| DELETE | `/app/tasks/{task_id}` | delete | Delete task | PERM: task:delete | - | — | — |
| POST | `/app/tasks/{task_id}/resolve` | action | Resolve task | PERM: task:update | req | — | `outcome`: enum(log_check_in|doing_well|no_answer|happy|done)<br>`result_text`: string ≤280<br>`note`: string ≤280 |
| POST | `/app/tasks/{task_id}/restore` | restore | Restore task | PERM: task:delete | req | — | — |
| POST | `/app/tasks/{task_id}/snooze` | action | Snooze task | PERM: task:update | req | — | `snoozed_until`*: string date-time<br>`snooze_label`: string ≤40 |

### Treatment (6)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/patients/{patient_id}/treatments` | list (paginated) | List a patient's treatments | PERM: patient:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|performed_at)<br>`order`: enum(asc|desc)<br>`patient_id`: string<br>`appointment_id`: string<br>`performed_at_from`: string date-time<br>`performed_at_to`: string date-time<br>`doctor_membership_id`: string<br>`therapist_membership_id`: string<br>`status`: enum(done|reversed)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| POST | `/app/patients/{patient_id}/treatments` | create (child) | Add a treatment | PERM: treatment:create | req | — | `appointment_id`: string ≤28 (null clears)<br>`offering_id`: string ≤28 (null clears)<br>`name`*: string ≤120<br>`template`: enum(skin|dental|physio|gynac|general)<br>`performed_at`: string date-time<br>`doctor_membership_id`: string ≤28 (null clears)<br>`therapist_membership_id`: string ≤28 (null clears)<br>`body_parts`: enum(face|scalp|hair|body|chest|back|underarm|legs|arms|other)[]<br>`session_number`: integer 1–99<br>`parameters`: object<br>`remark`: string ≤2000 (null clears)<br>`aftercare_call`: enum(none|next_day|in_two_days|in_week)<br>`patient_package_id`: string ≤28 (null clears) |
| GET | `/app/treatments` | list (paginated) | List treatments | PERM: patient:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at|performed_at)<br>`order`: enum(asc|desc)<br>`patient_id`: string<br>`appointment_id`: string<br>`performed_at_from`: string date-time<br>`performed_at_to`: string date-time<br>`doctor_membership_id`: string<br>`therapist_membership_id`: string<br>`status`: enum(done|reversed)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| GET | `/app/treatments/{treatment_id}` | get | Get treatment | PERM: patient:read | - | — | — |
| PATCH | `/app/treatments/{treatment_id}` | update | Update treatment | PERM: treatment:update | - | — | `appointment_id`: string ≤28 (null clears)<br>`offering_id`: string ≤28 (null clears)<br>`name`: string ≤120<br>`template`: enum(skin|dental|physio|gynac|general)<br>`performed_at`: string date-time<br>`doctor_membership_id`: string ≤28 (null clears)<br>`therapist_membership_id`: string ≤28 (null clears)<br>`body_parts`: enum(face|scalp|hair|body|chest|back|underarm|legs|arms|other)[]<br>`session_number`: integer 1–99<br>`parameters`: object<br>`remark`: string ≤2000 (null clears)<br>`aftercare_call`: enum(none|next_day|in_two_days|in_week)<br>`patient_package_id`: string ≤28 (null clears)<br>`expected_updated_at`: string date-time |
| POST | `/app/treatments/{treatment_id}/reverse` | action | Reverse treatment | PERM: treatment:update | req | — | `reversed_reason`*: string ≤280 |

### Visit (6)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/visits` | list (paginated) | List visits | PERM: appointment:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(created_at)<br>`order`: enum(asc|desc)<br>`appointment_id`: string<br>`patient_id`: string<br>`stage`: enum(waiting|with_doctor|treatment|checkout|pharmacy|done)<br>`created_from`: string date-time<br>`created_to`: string date-time | — |
| GET | `/app/visits/{visit_id}` | get | Get visit | PERM: appointment:read | - | — | — |
| PATCH | `/app/visits/{visit_id}` | update | Update visit | PERM: patient:update | - | — | `consult_complaint`: string ≤4000 (null clears)<br>`consult_findings`: string ≤4000 (null clears)<br>`consult_plan`: string ≤4000 (null clears)<br>`diagnoses`: string ≤120[]<br>`is_safety_consent_checked`: boolean<br>`is_safety_before_photos_taken`: boolean<br>`is_safety_allergies_checked`: boolean<br>`expected_updated_at`: string date-time |
| POST | `/app/visits/{visit_id}/pause` | action | Pause visit | PERM: appointment:update | req | — | — |
| POST | `/app/visits/{visit_id}/resume` | action | Resume visit | PERM: appointment:update | req | — | — |
| POST | `/app/visits/{visit_id}/stage` | action | Move visit stage | PERM: appointment:update | req | — | `stage`*: enum(waiting|with_doctor|treatment|checkout|pharmacy|done) |

## Auth (33 routes)

### Auth (4)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/auth/login` | action (collection) | Login with email and password | PUBLIC | - | — | `email`*: string email<br>`password`*: string ≤128 |
| POST | `/auth/logout` | action (collection) | Logout current session | TOKEN: access-token | - | — | — |
| GET | `/auth/me/context` | read | Get my session context | AUTH | - | — | — |
| POST | `/auth/step-up` | action (collection) | Step-up (re-authenticate) | AUTH | - | — | — |

### Auth Method (3)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/auth/me/auth-methods` | read | List my auth methods | AUTH | - | — | — |
| POST | `/auth/me/auth-methods` | create | Add auth method | AUTH | - | — | `method_type`*: enum(EMAIL_CODE)<br>`is_primary`*: boolean |
| DELETE | `/auth/me/auth-methods/{auth_method_id}` | delete | Remove auth method | AUTH | - | — | — |

### Email Login (2)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/auth/email/login` | action (collection) | Log in with an email verification code | PUBLIC | - | — | `email`*: string email<br>`code`*: string /^[A-Za-z0-9]+$/ ≤6 |
| POST | `/auth/email/send-code` | action (collection) | Send email sign-in code | PUBLIC | - | — | `email`*: string email |

### MFA (6)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/auth/me/mfa` | read | List enrolled MFA methods | AUTH | - | — | — |
| POST | `/auth/me/mfa/enroll` | action (collection) | Begin MFA enrollment (phase 1 of 2) | AUTH | - | — | `method_type`*: enum(MFA_TOTP) |
| POST | `/auth/me/mfa/enroll/confirm` | action (collection) | Confirm MFA enrollment (phase 2 of 2) | AUTH | - | — | — |
| POST | `/auth/me/mfa/verify` | action (collection) | Verify MFA code | AUTH | - | — | `code`*: string /^\d+$/ ≤6 |
| DELETE | `/auth/me/mfa/{mfa_method_id}` | delete | Remove MFA method | AUTH | - | — | — |
| POST | `/auth/mfa/login` | action (collection) | Complete MFA during login | PUBLIC | - | — | `mfa_session_token`*: string ≤128<br>`totp_code`: string /^\d+$/ ≤6<br>`recovery_code`: string ≤64 |

### OAuth (3)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/auth/oauth/providers` | read | List available OAuth providers | PUBLIC | - | — | — |
| GET | `/auth/oauth/{provider}` | get | Initiate OAuth flow | PUBLIC | - | — | — |
| GET | `/auth/oauth/{provider}/callback` | view | OAuth callback | PUBLIC | - | `code`*: string<br>`state`*: string<br>`iss`: string<br>`scope`: string<br>`authuser`: string<br>`hd`: string<br>`prompt`: string | — |

### Organization (2)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/auth/switch-to-organization` | action (collection) | Switch active organization | AUTH | - | — | — |
| POST | `/auth/switch-to-personal` | action (collection) | Switch to personal organization | AUTH | - | — | — |

### Password (3)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/auth/password/change` | action (collection) | Change current password | AUTH | - | — | `current_password`*: string ≤128<br>`new_password`*: string ≤128 |
| POST | `/auth/password/forgot` | action (collection) | Request password reset | PUBLIC | - | — | `email`*: string email |
| POST | `/auth/password/reset` | action (collection) | Reset password with token | PUBLIC | - | — | `token`*: string ≤512<br>`password`*: string ≤128 |

### Session (3)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/auth/me/sessions` | read | List my active sessions | AUTH | - | — | — |
| DELETE | `/auth/me/sessions` | delete | Revoke all sessions | AUTH | - | — | — |
| DELETE | `/auth/me/sessions/{session_id}` | delete | Revoke a specific session | AUTH | - | — | — |

### Token (1)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/auth/refresh` | action (collection) | Refresh access token | TOKEN: session-cookie | - | — | — |

### WebAuthn (6)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/auth/me/webauthn/credentials` | read | List registered passkeys | AUTH | - | — | — |
| DELETE | `/auth/me/webauthn/credentials/{credential_id}` | delete | Revoke a passkey | AUTH | - | — | — |
| POST | `/auth/me/webauthn/register/options` | action (collection) | Begin passkey registration | AUTH | - | — | — |
| POST | `/auth/me/webauthn/register/verify` | action (collection) | Complete passkey registration | AUTH | - | — | `challenge_token`*: string ≤128<br>`response`*: {id: string ≤65536, rawId: string ≤65536, response: object, authenticatorAttachment: enum(cross-platform|platform), clientExtensionResults: object, type: enum(public-key)} |
| POST | `/auth/webauthn/authenticate/options` | action (collection) | Begin passkey authentication | PUBLIC | - | — | `email`*: string email |
| POST | `/auth/webauthn/authenticate/verify` | action (collection) | Complete passkey authentication | PUBLIC | - | — | `challenge_token`*: string ≤128<br>`response`*: {id: string ≤65536, rawId: string ≤65536, response: object, authenticatorAttachment: enum(cross-platform|platform), clientExtensionResults: object, type: enum(public-key)} |

## Users (me) (20 routes)

### Notification Preferences (2)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/users/me/notification-preferences` | read | Get my notification preferences | AUTH | - | — | — |
| PUT | `/users/me/notification-preferences` | replace | Replace notification preferences | AUTH | - | — | `preferences`*: object[] |

### Organization (1)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/users/me/organizations` | list (paginated) | List my organizations | AUTH | - | `limit` 1–100 (25) · `after` cursor | — |

### Privacy (2)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/users/me/data-export` | action (collection) | Request GDPR data export | AUTH | - | — | — |
| GET | `/users/me/data-export/{data_export_id}` | get | Get GDPR data export status | AUTH | - | — | — |

### User (7)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/users/me` | read | Get current user profile | AUTH | - | — | — |
| PATCH | `/users/me` | update | Update current user profile | AUTH | - | — | `first_name`: string ≤100 (null clears)<br>`last_name`: string ≤100 (null clears)<br>`job_title`: string ≤150 (null clears)<br>`avatar_key`: string ≤512 |
| DELETE | `/users/me` | delete | Delete my account | AUTH | - | — | — |
| PUT | `/users/me/avatar` | replace | Upload avatar | AUTH | - | — | `avatar_key`*: string ≤512 |
| DELETE | `/users/me/avatar` | delete | Remove avatar | AUTH | - | — | — |
| POST | `/users/me/onboarding/complete` | action (collection) | Mark onboarding complete | AUTH | - | — | — |
| PUT | `/users/me/presence` | replace | Set my presence | AUTH | - | — | `presence`*: enum(online|busy|away) |

### User Management (6)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/users` | list (paginated) | List all users (admin) | ROLE: super_admin | - | `limit` 1–100 (25) · `after` cursor<br>`status`: enum(ACTIVE|SUSPENDED|DELETED)<br>`search`: string<br>`include_total`*: enum(true|false) | — |
| GET | `/users/{user_id}` | get | Get user by ID (admin) | ROLE: super_admin | - | — | — |
| PATCH | `/users/{user_id}` | update | Update user (admin) | ROLE: super_admin | - | — | `first_name`: string ≤100 (null clears)<br>`last_name`: string ≤100 (null clears)<br>`status`: enum(ACTIVE|SUSPENDED) |
| DELETE | `/users/{user_id}` | delete | Delete user (admin) | ROLE: super_admin | - | — | — |
| POST | `/users/{user_id}/suspend` | action | Suspend user (admin) | ROLE: super_admin | - | — | — |
| POST | `/users/{user_id}/unsuspend` | action | Unsuspend user (admin) | ROLE: super_admin | - | — | — |

### User Settings (2)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/users/me/settings` | read | Get my settings | AUTH | - | — | — |
| PATCH | `/users/me/settings` | update | Update my settings | AUTH | - | — | `is_dark_mode_enabled`: boolean<br>`is_notifications_enabled`: boolean<br>`language`: string ≤10<br>`preferred_locales`: string ≤10[] |

## Tenancy (41 routes)

### API Key (6)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/tenancy/organization/api-keys` | list (paginated) | List API keys | PERM: api-key:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(name|created_at)<br>`order`: enum(asc|desc) | — |
| POST | `/tenancy/organization/api-keys` | create | Create API key | PERM: api-key:manage | req | — | `name`*: string ≤255<br>`scopes`*: string ≤100[]<br>`expires_in_days`: integer 1–365 (null clears) |
| GET | `/tenancy/organization/api-keys/{api_key_id}` | get | Get API key | PERM: api-key:read | - | — | — |
| PATCH | `/tenancy/organization/api-keys/{api_key_id}` | update | Update API key | PERM: api-key:manage | - | — | `name`: string ≤255<br>`status`: enum(ACTIVE|REVOKED) |
| DELETE | `/tenancy/organization/api-keys/{api_key_id}` | delete | Delete API key | PERM: api-key:manage | - | — | — |
| POST | `/tenancy/organization/api-keys/{api_key_id}/rotate` | action | Rotate API key | PERM: api-key:manage | - | — | — |

### Audit Log (1)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/tenancy/organization/audit-logs` | list (paginated) | List organization audit logs | PERM: audit-log:read | - | `limit` 1–100 (25) · `after` cursor<br>`organization_id`: string<br>`actor_user_id`: string<br>`resource_type`: string<br>`action`: string<br>`from`: string date-time<br>`to`: string date-time<br>`include_total`*: enum(true|false) | — |

### Invitation (3)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/tenancy/invitations/{invitation_id}/accept` | action | Accept invitation | AUTH | - | — | `token`*: string ≤512 |
| DELETE | `/tenancy/organization/invitations/{invitation_id}` | delete | Revoke invitation | PERM: invitation:manage | - | — | — |
| POST | `/tenancy/organization/invitations/{invitation_id}/resend` | action | Resend invitation | PERM: invitation:manage | - | — | `expires_in_days`*: integer 1–365 |

### Membership (9)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/tenancy/organization/leave` | action (collection) | Leave organization | AUTH | - | — | — |
| GET | `/tenancy/organization/memberships` | list (paginated) | List memberships | PERM: membership:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(name|created_at)<br>`order`: enum(asc|desc) | — |
| POST | `/tenancy/organization/memberships` | create | Add member by email | PERM: membership:manage | req | — | `email`*: string email<br>`role_ids`*: string ≤28[]<br>`expires_in_days`*: integer 1–365<br>`phone`: string /^\+91\d{10}$/ (null clears)<br>`tone`: enum(butter|lav|sky|sage|blush|mint|peach|plum|lime|slate|stone)<br>`branch_ids`: string ≤28[]<br>`working_days`: enum(mon|tue|wed|thu|fri|sat|sun)[]<br>`work_starts_at`: string /^([01]\d|2[0-3]):[0-5]\d$/<br>`work_ends_at`: string /^([01]\d|2[0-3]):[0-5]\d$/<br>`commission_percent`: number 0–100 |
| GET | `/tenancy/organization/memberships/{membership_id}` | get | Get membership | PERM: membership:read | - | — | — |
| PATCH | `/tenancy/organization/memberships/{membership_id}` | update | Update membership | PERM: membership:manage | - | — | `status`: enum(INVITED|ACTIVE|SUSPENDED)<br>`role_ids`: string ≤28[]<br>`phone`: string /^\+91\d{10}$/ (null clears)<br>`tone`: enum(butter|lav|sky|sage|blush|mint|peach|plum|lime|slate|stone)<br>`branch_ids`: string ≤28[]<br>`working_days`: enum(mon|tue|wed|thu|fri|sat|sun)[]<br>`work_starts_at`: string /^([01]\d|2[0-3]):[0-5]\d$/<br>`work_ends_at`: string /^([01]\d|2[0-3]):[0-5]\d$/<br>`commission_percent`: number 0–100 |
| DELETE | `/tenancy/organization/memberships/{membership_id}` | delete | Remove membership | PERM: membership:manage | - | — | — |
| GET | `/tenancy/organization/memberships/{membership_id}/permissions` | view | Get membership permissions | PERM: membership:read | - | — | — |
| POST | `/tenancy/organization/memberships/{membership_id}/restore` | restore | Restore membership | PERM: membership:manage | - | — | — |
| POST | `/tenancy/organization/transfer-ownership` | action (collection) | Transfer organization ownership | AUTH | req | — | `new_owner_user_id`*: string ≤28 |

### Notification Policy (5)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/tenancy/organization/notification-policies` | read | List notification policies | PERM: notification-policy:read | - | — | — |
| POST | `/tenancy/organization/notification-policies` | create | Create notification policy | PERM: notification-policy:manage | req | — | `notification_type`*: enum(system.welcome|system.maintenance|security.alert|billing.usage_threshold|billing.payment_succeeded|billing.payment_failed|membership.invite_accepted|subscription.updated|webhook.delivery_failed)<br>`channel`*: enum(EMAIL|SMS|WEB_PUSH|IN_APP)<br>`default_enabled`*: boolean<br>`is_mandatory`*: boolean<br>`muted_until`: string date-time (null clears) |
| GET | `/tenancy/organization/notification-policies/{notification_policy_id}` | get | Get notification policy | PERM: notification-policy:read | - | — | — |
| PATCH | `/tenancy/organization/notification-policies/{notification_policy_id}` | update | Update notification policy | PERM: notification-policy:manage | - | — | `default_enabled`: boolean<br>`is_mandatory`: boolean<br>`muted_until`: string date-time (null clears) |
| DELETE | `/tenancy/organization/notification-policies/{notification_policy_id}` | delete | Delete notification policy | PERM: notification-policy:manage | - | — | — |

### Organization (7)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/tenancy/organization` | read | Get active organization | AUTH | - | — | — |
| PATCH | `/tenancy/organization` | update | Update organization | PERM: organization:update | - | — | `name`: string ≤255<br>`slug`: string /^[a-z0-9]+(?:-[a-z0-9]+)*$/ ≤100<br>`status`: enum(ACTIVE|SUSPENDED|ARCHIVED)<br>`specialties`: enum(skin|hair|dental|gynac|physio|general)[]<br>`timezone`: string ≤64 |
| DELETE | `/tenancy/organization` | delete | Delete organization | PERM: organization:delete | - | — | — |
| PUT | `/tenancy/organization/logo` | replace | Upload organization logo | PERM: organization:update | - | — | `key`*: string ≤512 |
| DELETE | `/tenancy/organization/logo` | delete | Remove organization logo | PERM: organization:update | - | — | — |
| POST | `/tenancy/organizations` | action (collection) | Create organization | AUTH | req | — | `name`*: string ≤255<br>`slug`*: string /^[a-z0-9]+(?:-[a-z0-9]+)*$/ ≤100 |
| GET | `/tenancy/organizations/by-slug/{slug}` | get | Get organization by slug | AUTH | - | — | — |

### Organization Settings (2)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/tenancy/organization/settings` | read | Get organization settings | PERM: organization:read | - | — | — |
| PATCH | `/tenancy/organization/settings` | update | Update organization settings | PERM: organization:update | - | — | `is_email_notifications_enabled`: boolean<br>`default_locale`: enum(en|es)<br>`default_day_float`: number 0–9999999999.99<br>`lead_hold_days`: integer 1–30<br>`reminder_hour`: integer 0–23<br>`retarget_after_days`: integer 7–730<br>`deleted_record_purge_days`: integer 1–90<br>`security_policy`: object |

### Permission (3)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/tenancy/organization/roles/{role_id}/permissions` | view | List role permissions | PERM: role:read | - | — | — |
| PUT | `/tenancy/organization/roles/{role_id}/permissions` | replace | Replace role permissions | PERM: role:manage | - | — | `permission_codes`*: string ≤100[] |
| GET | `/tenancy/permissions` | read | List all permissions | AUTH | - | — | — |

### Role (5)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/tenancy/organization/roles` | list (paginated) | List roles | PERM: role:read | - | `limit` 1–100 (25) · `after` cursor<br>`q`: string<br>`sort`: enum(name|created_at)<br>`order`: enum(asc|desc) | — |
| POST | `/tenancy/organization/roles` | create | Create role | PERM: role:manage | req | — | `name`*: string ≤100<br>`description`: string ≤500 (null clears)<br>`permission_codes`: string ≤100[]<br>`tone`: enum(butter|lav|sky|sage|blush|mint|peach|plum|lime|slate|stone)<br>`copy_from_role_id`: string ≤28 |
| GET | `/tenancy/organization/roles/{role_id}` | get | Get role | PERM: role:read | - | — | — |
| PATCH | `/tenancy/organization/roles/{role_id}` | update | Update role | PERM: role:manage | - | — | `name`: string ≤100<br>`description`: string ≤500 (null clears)<br>`tone`: enum(butter|lav|sky|sage|blush|mint|peach|plum|lime|slate|stone) |
| DELETE | `/tenancy/organization/roles/{role_id}` | delete | Delete role | PERM: role:manage | - | — | — |

## Billing (13 routes)

### Plan (2)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/billing/plans` | read | List available plans | PUBLIC | - | — | — |
| GET | `/billing/plans/{plan_id}` | get | Get plan details | PUBLIC | - | — | — |

### Stripe Webhook (1)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/billing/webhook` | action (collection) | Stripe webhook receiver | PUBLIC | - | — | — |

### Subscription (10)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/billing/invoices` | list (paginated) | List billing invoices | PERM: subscription:read | - | `limit` 1–100 (25) · `after` cursor | — |
| GET | `/billing/payment-methods` | read | List payment methods | PERM: subscription:read | - | — | — |
| POST | `/billing/payment-methods/setup` | action (collection) | Create payment method setup | PERM: subscription:manage | req | — | — |
| GET | `/billing/subscriptions` | read | List subscriptions | PERM: subscription:read | - | — | — |
| POST | `/billing/subscriptions` | create | Create subscription | PERM: subscription:manage | req | — | `plan_id`*: string ≤255<br>`billing_cycle`*: enum(monthly|yearly) |
| GET | `/billing/subscriptions/{subscription_id}` | get | Get subscription | PERM: subscription:read | - | — | — |
| POST | `/billing/subscriptions/{subscription_id}/cancel` | action | Cancel subscription | PERM: subscription:manage | req | — | — |
| POST | `/billing/subscriptions/{subscription_id}/change-plan` | action | Change subscription plan | PERM: subscription:manage | req | — | `plan_id`*: string ≤255 |
| GET | `/billing/subscriptions/{subscription_id}/payment-setup` | view | Get payment setup for incomplete subscription | PERM: subscription:read | - | — | — |
| POST | `/billing/subscriptions/{subscription_id}/resume` | action | Resume cancelled subscription | PERM: subscription:manage | req | — | — |

## Notify (14 routes)

### Notification (6)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/notify/notifications` | list (paginated) | List my notifications | AUTH | - | `limit` 1–100 (25) · `after` cursor<br>`include_total`*: enum(true|false) | — |
| POST | `/notify/notifications/mark-all-read` | action (collection) | Mark all notifications as read | AUTH | - | — | — |
| GET | `/notify/notifications/unread-count` | read | Get unread notification count | AUTH | - | — | — |
| GET | `/notify/notifications/{notification_id}` | get | Get notification | AUTH | - | — | — |
| DELETE | `/notify/notifications/{notification_id}` | delete | Delete notification | AUTH | - | — | — |
| PATCH | `/notify/notifications/{notification_id}/read` | update | Mark notification as read | AUTH | - | — | — |

### Webhook (8)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/notify/webhook-events` | read | List dispatchable webhook event types | PERM: webhook:read | - | — | — |
| GET | `/notify/webhooks` | read | List webhooks | PERM: webhook:read | - | — | — |
| POST | `/notify/webhooks` | create | Create webhook | PERM: webhook:manage | req | — | `url`*: string uri ≤2048<br>`secret`: string ≤255<br>`events`*: string ≤100[]<br>`is_enabled`*: boolean |
| GET | `/notify/webhooks/{webhook_id}` | get | Get webhook | PERM: webhook:read | - | — | — |
| PATCH | `/notify/webhooks/{webhook_id}` | update | Update webhook | PERM: webhook:manage | - | — | `url`: string uri ≤2048<br>`secret`: string ≤255<br>`events`: string ≤100[]<br>`is_enabled`: boolean |
| DELETE | `/notify/webhooks/{webhook_id}` | delete | Delete webhook | PERM: webhook:manage | - | — | — |
| GET | `/notify/webhooks/{webhook_id}/delivery-attempts` | view | List webhook delivery attempts | PERM: webhook:read | - | — | — |
| POST | `/notify/webhooks/{webhook_id}/test` | action | Send test webhook | PERM: webhook:manage | - | — | — |

## Uploads (4 routes)

### Upload (4)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/uploads` | action (collection) | Request pre-signed upload URL | AUTH | req | — | `purpose`*: enum(avatar|organization-logo|user-file|organization-file)<br>`for`*: enum(user|organization)<br>`organization_id`: string ≤255<br>`content_type`*: string ≤100<br>`file_name`*: string ≤255<br>`file_size`*: integer 0–10485760 |
| GET | `/uploads/{upload_id}` | get | Get upload metadata | AUTH | - | — | — |
| DELETE | `/uploads/{upload_id}` | delete | Delete upload | AUTH | - | — | — |
| POST | `/uploads/{upload_id}/confirm` | action | Confirm uploaded object | AUTH | - | — | — |

## Audit (1 routes)

### Audit Log (1)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/audit/logs` | list (paginated) | List audit logs (admin) | ROLE: super_admin | - | `limit` 1–100 (25) · `after` cursor<br>`organization_id`: string<br>`actor_user_id`: string<br>`resource_type`: string<br>`action`: string<br>`from`: string date-time<br>`to`: string date-time<br>`include_total`*: enum(true|false) | — |

## Mcp (2 routes)

### MCP (2)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/mcp` | read | MCP streamable HTTP (GET) | ROLE: super_admin | - | — | — |
| POST | `/mcp` | create | MCP streamable HTTP (POST) | ROLE: super_admin | - | — | — |

## Root (2 routes)

### General (2)

| Method | Path | Type | Summary | Gate | Idem | Query params | Body fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/livez` | read | GET /livez | PUBLIC | - | — | — |
| GET | `/readyz` | read | GET /readyz | PUBLIC | - | — | — |

