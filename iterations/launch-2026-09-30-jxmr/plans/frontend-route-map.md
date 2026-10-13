# Frontend route map — launch-2026-09-30-jxmr

For **clinozy-fe**: every screen operation the design drop planned, the API route that now serves it, every
route the API has today, and the design features the backend dropped — so the frontend can drop them too.

| Source | What it is | Where |
| --- | --- | --- |
| The design's plan | 104 screen operations (`listLeads`, `createInvoice`, …), camelCase, money in paise, uuids | [`intake-files/schema-routes.md` › Operations](../intake-files/schema-routes.md) |
| The route review | the agreed API, numbered `<sub-domain>.<route>` (the **#** column below) | [`routes-final.md`](routes-final.md) |
| The built API | the truth — every route in section 3 | `docs/routes.txt`, the OpenAPI spec (`pnpm docs:generate`, served at `/reference`) |

Section 3 is generated: `pnpm iteration:frontend-map launch-2026-09-30-jxmr` rewrites it from `docs/routes.txt`,
the OpenAPI document and `routes-final.md` (`--check` fails when it is stale); sections 1, 2 and 4 are written by
hand. The prompt that hands this map to the frontend: [frontend-integration-prompt.md](frontend-integration-prompt.md).
This map supersedes [`2026-10-07_routes-by-module_v1.md`](../2026-10-07_routes-by-module_v1.md), a snapshot taken
before the launch rebuilt the app routes. Field-level differences: [`AS-BUILT.md` › Standing
deviations](../AS-BUILT.md#standing-deviations).

## 1. What changes on every call

| Topic | The design said | The API does |
| --- | --- | --- |
| Base path | — | `/api/v1`; the clinic's records under `/api/v1/app` |
| Organization | `:organizationSlug` in the URL | the signed `org` claim in the access token: resolve the slug with `GET /tenancy/organizations/by-slug/:slug`, then `POST /auth/switch-to-organization`; no organization segment in any API path |
| Field names | camelCase | snake_case in bodies, query parameters and errors (`follow_up_at`, `branch_id`) |
| Ids | uuid primary keys, display `seq` numbers | public ids, `<prefix>_<21 characters>` (`con_…`, `appt_…`, `invc_…`) in `id` and every `*_id`; display numbers stay (`invoice_number` "2026-27/0412", `prescription_number`, `patient_number`) |
| Money | integer paise | rupees as decimal numbers with 2 places; every invoice amount is computed by the server |
| Dates and times | ISO UTC, clinic-local dates and times | timestamps ISO 8601 with offset; dates `YYYY-MM-DD`; times `HH:mm` — in the organization's time zone |
| Lists | `{items, nextCursor}`, page size 50, no totals | `{ data: [...], meta: { pagination: { next, has_more, estimated_total } } }`; `limit` (default 25, at most 100) and `after` (the `next` cursor); `estimated_total` on the first page |
| List filters | `created`, `followUp` presets, `branchIds` | explicit ranges — `created_from` / `created_to` (ISO with offset), `<date>_from` / `<date>_to`; several values comma-separated (`status=new,contacted`); the branch filter is a comma-separated id list (up to 20) — `branch_ids` on appointments, `branch_id` on most other lists; `q` searches; `sort` + `order` |
| Writes | — | `X-Idempotency-Key` required on the writes marked **req** below — one key per user action, reused when that same request is retried (the server replays its first answer); a missing key → `422`, the same key with a different body is refused; a `PATCH` may send `expected_updated_at` — a stale save → `409 record_changed` |
| Delete | `DELETE /<resource>/:id` with a reason, Undo within 10 s | `DELETE …?reason=<delete_reason>&note=` → `204`; `POST …/restore` brings it back until the clinic's purge window (7 days by default), then the daily purge erases it |
| Errors | validation · conflict · permission · not found · network | `{ error: { type, code, reason?, detail, errors: [{ field, message }] } }` — `400` validation (field names snake_case), `401`, `403`, `404`, `409` with a `reason` (`slot_taken`, `day_closed`, `record_changed`, …), `422` (idempotency, personal organization), `429`; see `docs/reference/api/response-codes.md` |
| Success status | — | `200` for every method except `DELETE` (`204`) |
| Access | role × section matrix, 9 fixed roles | permission codes per resource (`appointment:read`, `payment:create`, …); Owner plus eight editable roles, several per member; `GET /auth/me/context` returns the caller's codes |
| The person | person fields on Lead, Patient and MedicalContact | one **contact** (`/app/contacts`) holds the person; a lead, a patient file, an appointment, an invoice, a payment and a medical sale point at it with `contact_id` |

## 2. Each design operation → its route

Paths below drop `/api/v1`. "→ §n" points at the route review section that explains a change.

### Sign in and the shell

| Design operation | Route(s) today | Notes |
| --- | --- | --- |
| `signIn` | `POST /auth/login` (`POST /auth/email/send-code` + `POST /auth/email/login`, passkeys and OAuth also available) | MFA answers with a challenge → `POST /auth/mfa/login`; refresh with `POST /auth/refresh` (session cookie + `X-CSRF-Token`) |
| `signOut` | `POST /auth/logout` | |
| `getSession` | `GET /auth/me/context` (identity, active organization, permission codes) · `GET /users/me` · `GET /users/me/organizations` · `GET /app/branches/my` · `GET /app/memberships/me/preferences` | the role home is the frontend's choice from the codes |
| `listBranches` (header picker) | `GET /app/branches/my` | the caller's active branches |
| `commandSearch` (⌘K) | `GET /app/contacts?q=` | one person search — name, any number, contact number; appointments and invoices are found from their own lists' `q` (→ §7 P8) |
| `contactCard` | `GET /app/contacts/:contact_id/preview` | the hover card |
| `updatePreference` | `PATCH /app/memberships/me/preferences` | `pinned_sections`, `theme`, `branch_ids`, `patient_file_pins`, `recent_picks`; one row per membership |
| `setPresence` | `PUT /users/me/presence` | |
| my invitations (not a design operation — D84) | `GET /users/me/membership-invitations` · `POST /tenancy/membership-invitations/:membership_invitation_id/accept` (body `{}` — no token needed) · `…/decline` | after any sign-in, before onboarding or the picker: an invitee with no clinic sees their invitations instead of "create a clinic"; one already in a clinic sees an "Invited" row and badge in the picker and switcher; accept → `POST /auth/switch-to-organization` with the answer's `organization_id`; decline ends the invite and tells the inviter; `end_reason` `declined` / `invitation_expired` on ended members |
| analytics consent (not a design operation — D85) | `GET /users/me/settings` · `PATCH /users/me/settings` (`analytics_consent` + `analytics_consent_version` together) | at sign-in the saved decision wins over the device's (a decision made before signing in is saved to the account); ask again when `analytics_consent_at` is six months old or the policy version moved; sign-out clears the device's decision; Settings › Privacy withdraws it |

### Today

| Design operation | Route(s) today | Notes |
| --- | --- | --- |
| `listTodayFloor` | `GET /app/appointments?appointment_date_from=<today>&appointment_date_to=<today>&branch_ids=…` | the floor stage is on the appointment (`visit_stage`, `status=checked_in` for who is in) |
| `todayPulse` | `GET /app/appointments/daily-counts?date_from=<today>&date_to=<today>&branch_ids=…` | counts per day and status |
| `setAppointmentStatus` | `POST /app/appointments/:appointment_id/{confirm \| check-in \| complete \| no-show \| cancel \| reinstate \| undo-check-in}` and `…/stage`, `…/pause`, `…/resume` for the floor | one route per move, no status body (→ §6 A5); check-in opens the patient file and moves the open lead to `clinic_visited` |

### Leads

| Design operation | Route(s) today | Notes |
| --- | --- | --- |
| `listLeads` | `GET /app/leads` | filters `status`, `source`, `interests`, `ownership`, `is_awaiting_reply`, `team_membership_id`, follow-up and created ranges |
| `getLead` | `GET /app/leads/:lead_id` · `GET /app/contacts/:contact_id/activities` · `GET /app/appointments?contact_id=` | the chat is the contact's activity |
| `createLead` | `POST /app/leads` | `contact_id`, or a new `contact` in the same call; a number already on another contact → `409 contact_phone_exists` |
| `updateLead` | `PATCH /app/leads/:lead_id` · `POST …/claim` · `POST …/release` | `clinic_visited` is set only by a check-in |
| `sendMessage` | `POST /app/contacts/:contact_id/activities/send-message` | also `…/log-call`, `…/add-note`, `…/:contact_activity_id/resend` |
| `bulkMessage` / `bulkExport` | `POST /app/contact-activities/message-batches` / `GET /app/leads/exports` | |

### Appointments

| Design operation | Route(s) today | Notes |
| --- | --- | --- |
| `listAppointmentsRange`, `listAppointments` | `GET /app/appointments` | `appointment_date_from` / `_to`, `doctor_membership_id`, `status`, `type`, `branch_ids`, room and machine |
| `getAppointment` | `GET /app/appointments/:appointment_id` · `GET /app/contacts/:contact_id/preview` · `GET /app/contacts/:contact_id/activities?appointment_id=` · `GET /app/patients/:patient_id/images?appointment_id=` | the response carries the contact summary and its `patient_id` / `lead_id` |
| `availableSlots` | `GET /app/appointments/slots?branch_id=&appointment_date=&duration_minutes=` | optional doctor, room and machine; a holiday answers no slots |
| `createAppointment` | `POST /app/appointments` · `POST /app/appointments/:appointment_id/copy` | for a `contact_id` (no `patientId` / `leadId`); a clash → `409 slot_taken` |
| `updateAppointment` | `PATCH /app/appointments/:appointment_id` | |
| `cancelAppointment` | `POST /app/appointments/:appointment_id/cancel` | |
| `restoreAppointment` | `POST /app/appointments/:appointment_id/reinstate` (undo a cancel) · `POST …/restore` (undo a delete) | |
| `uploadVisitPhotos` | `POST /uploads` → upload → `POST /uploads/:upload_id/confirm` → `POST /app/patients/:patient_id/images` with `file_key` and `appointment_id` | one photo per call; location data is removed before it is filed |

### Patients and the patient file

| Design operation | Route(s) today | Notes |
| --- | --- | --- |
| `listPatients` | `GET /app/patients` | `q` reaches the contact's names and numbers; `types` takes several |
| `createPatient` | `POST /app/patients` | `contact_id`, or a new `contact` in the same call; the person's fields live on the contact |
| `getPatient` | `GET /app/patients/:patient_id` | |
| `updatePatient` | `PATCH /app/patients/:patient_id` (+ `PATCH /app/contacts/:contact_id` for the person) | complaints, diagnosis and suggestions are clinical notes — next row |
| complaints, diagnosis, `treatmentSuggestions`, `futureSuggestions` | `POST /app/patients/:patient_id/clinical-notes` (`kind` `complaint` · `finding` · `diagnosis` · `treatment_suggestion` · `future_suggestion` · `safety_check`) · `GET …/clinical-notes` | notes are never edited; a diagnosis may point at the catalogue (`/app/patient-diagnoses`) |
| `listPrescriptions` | `GET /app/patients/:patient_id/prescriptions` | org-wide: `GET /app/patient-prescriptions` |
| `createPrescription` / `updatePrescription` | `POST` / `PATCH /app/patients/:patient_id/prescriptions[/:patient_prescription_id]` · `POST …/approve` | a draft until a Doctor or Admin approves it; kits at `/app/prescription-kits` |
| `listTreatments` | `GET /app/patients/:patient_id/treatments` | org-wide: `GET /app/patient-treatments` |
| `createTreatment` / `updateTreatment` | `POST` / `PATCH /app/patients/:patient_id/treatments[/:patient_treatment_id]` · `POST …/reverse` | recording a session spends one; reversing gives it back |
| `listImages` | `GET /app/patients/:patient_id/images` | `album`, `appointment_id`, `patient_treatment_id`, `stage`, `body_part`; `meta.album_counts`; each photo's `file_url` shows it — a 15-minute link made on every read, so read the list again rather than keep a link (D86) |
| `uploadImages` / `updateImage` | uploads as above → `POST /app/patients/:patient_id/images` / `PATCH …/images/:patient_image_id` | |
| `listReports` / `createReport` | `GET` / `POST /app/patients/:patient_id/reports` | each report's `files` give every file its name and a 15-minute `file_url` that opens it (inline, saved under its name — D86) |
| `listPackages` | `GET /app/patients/:patient_id/offerings?is_package=true` | every session-based offering bought (drop the filter for all); extend or change sessions with `PATCH …/offerings/:patient_offering_id` |
| `listNotes` / `addNote` | `GET /app/contacts/:contact_id/activities?type=note` / `POST /app/contacts/:contact_id/activities/add-note` | patient notes are notes in the contact's activity (→ §7 P20) |
| `listPatientInvoices` / `listPatientPayments` | `GET /app/invoices?patient_id=` / `GET /app/payments?patient_id=` | |
| `getPlan` | `GET /app/patients/:patient_id/offering-suggestions` · `GET …/offering-ideas` · `GET …/offerings` · `GET /app/contacts/:contact_id/activities` | the ideas are rule-based; AI ideas when the clinic turns them on |
| `addSuggestion` / `updateSuggestion` | `POST` / `PATCH /app/patients/:patient_id/offering-suggestions[/:patient_offering_suggestion_id]` | |
| `linkSuggestionInvoice` / `unlinkSuggestionInvoice` | an invoice line's `patient_offering_suggestion_id` on `POST` / `PATCH /app/invoices` | no link route |
| `listFeedback` | `GET /app/patients/:patient_id/check-ins` · `GET …/reviews` | each returns its `actions` |
| `createCheckIn` / `updateCheckIn` | `POST` / `PATCH /app/patients/:patient_id/check-ins[/:patient_check_in_id]` | |
| `createReview` / `updateReview` | `POST` / `PATCH /app/patients/:patient_id/reviews[/:patient_review_id]` | |
| `logFeedbackAction` | `POST /app/patients/:patient_id/check-ins/:patient_check_in_id/actions` or `…/reviews/:patient_review_id/actions` | an action belongs to one check-in or one review |
| `printPrescription` / `printInvoice` | `GET` the prescription / `GET /app/invoices/:invoice_id` | printed by the frontend; the server renders no PDF |

### Medical store

Rev 2 (D88–D92, ROUTE #186–#195): the store manages its own payments and both sides of its credits; the
frontend shows Payments and Credits as two tabs (`/medical/payments`, `/medical/credits`, D90).

| Design operation | Route(s) today | Notes |
| --- | --- | --- |
| `listSales` | `GET /app/medical-sales` | `created_from` / `created_to` (the Created filter), `sort=contact_name` (the customer A–Z); CSV `GET /app/medical-sales/exports` |
| Send payment reminders (Sales › Unpaid) | `GET /app/medical-sales/dues` | one row per buyer with unpaid sales, largest due first — one answer, no cursor (`limit` 1–100); nothing is sent by the API |
| `listPrescriptionsToFill` | `GET /app/patient-prescriptions?status=approved&is_filled=false` | the pharmacy queue — each row names its `patient` (`id`, `patient_number`, `contact_id`, `name`) |
| `listMedicines` | `GET /app/medicines` | batches and supplier prices inside each medicine; `sort=manufacturer_name` (A–Z) or `margin_percent` (highest first), none last |
| `listPurchaseOrders` | `GET /app/medical-purchase-orders` | `stage`, `payment_status`, `supplier_id`; the order's `supplier` carries `phone` and `gst_number` (the PO print sheet) |
| `listSuppliers` / `listManufacturers` / `listMRs` | `GET /app/suppliers` / `GET /app/manufacturers` / `GET /app/medical-reps` | suppliers: `order_total` on each, `meta.payable_total` over every page; "Pay all received" opens Suppliers filtered `has_payable=true` |
| `listMedicalPayments` | `GET /app/medical-payments` | the store's slice of the ledger (receipts and refunds on medical invoices, supplier bills of medical orders, `medicines` expenses and their reversals); CSV `GET /app/medical-payments/exports` (`medicine:export`); record, change, delete, undo and reverse through `/app/payments…` (their `payment:*` codes) |
| Credits tab — supplier side | `GET /app/supplier-credits` | every credit; a supplier's own: `GET /app/suppliers/:supplier_id/credits` |
| Credits tab — customer side | `GET /app/medical-pending-credits` | the store's customer credits (naming a medical invoice, or left by a store-credit return); add, give back, get back, use on a bill, change and delete through `/app/pending-credits…` (`payment:*`; giving back needs `payment:delete`) |
| `createSale` | `POST /app/medical-sales` | the buyer is a contact; may name the `patient_prescription_id` it fills; batches drawn by earliest expiry; never edited — changed by a return |
| `returnSale` | `POST /app/medical-sales/:medical_sale_id/returns` | **only on a sale paid in full** — otherwise `409 sale_not_paid` (collect first); needs `payment:delete` (`403 missing_permission`); `refund_mode` `cash` · `upi` · `card`, or `credit` — store credit: no money moves, the return's `pending_credit_id` names the `give` credit (M22) |
| `voidSale` | `DELETE /app/medical-sales/:medical_sale_id?reason=` | the void is the delete |
| `createMedicine` / `updateMedicine`, `quickCreateMedicine` | `POST` / `PATCH /app/medicines[/:medicine_id]` | the quick create is the same `POST` with the name **and `is_quick: true`** (M22); near-expiry discount: `POST /app/medicines/near-expiry-discount` |
| `createPO` / `updatePO` | `POST` / `PATCH /app/medical-purchase-orders[/:medical_purchase_order_id]` | |
| `receivePO` | `POST /app/medical-purchase-orders/:medical_purchase_order_id/receive` | `items` may add goods not ordered — lines without `id` (`medicine_id` or `new_medicine_name`, `quantity`, `rate`, batch, expiry); 50 lines at most |
| `cancelPO` | `DELETE /app/medical-purchase-orders/:medical_purchase_order_id?reason=` | the cancel is the delete |
| create / update Supplier, Manufacturer, MR | `POST` / `PATCH /app/suppliers`, `/app/manufacturers`, `/app/medical-reps` | pay a supplier: `POST /app/suppliers/:supplier_id/payments` |
| Return expiring stock (a supplier credit) | `POST /app/suppliers/:supplier_id/credits` | `medicine_batch_id`, `quantity` — the supplier is the path's; read one `GET …/credits/:supplier_credit_id`; void `DELETE …?reason=` (`mistake` · `wrong_quantity` · `supplier_refused` · `other`), undo `POST …/restore` (`medicine:delete`) |
| `logMRVisit` | `POST /app/medical-reps/:medical_rep_id/visits` | |
| a bill on `/invoices` | — | `/app/invoices` refuses `type=medical` and medicine lines (`400 sold_through_store`) — sell through the store |

### Clinic stock

| Design operation | Route(s) today | Notes |
| --- | --- | --- |
| `listStockItems` | `GET /app/stock-items` | |
| `listMovements` | `GET /app/stock-item-movements` (one item: `GET /app/stock-items/:stock_item_id/movements`) | |
| `listStockPurchases` | `GET /app/stock-purchases` | |
| `listVendors` | `GET /app/stock-vendors` | |
| `useStock` | `POST /app/stock-items/:stock_item_id/movements` | use, receive, damage, return or adjust; quantities are decimals; a use names its `patient_treatment_id` |
| `revertMovement` | `POST /app/stock-items/:stock_item_id/movements/:stock_item_movement_id/revert` | |
| `saveStockCount` | `POST /app/stock-counts` | |
| create / update StockItem, StockPurchase, StockVendor | `POST` / `PATCH /app/stock-items`, `/app/stock-purchases`, `/app/stock-vendors` | a purchase is paid by supplier-bill payments (`POST /app/payments`, `kind=supplier_bill`) |

### Payments and invoices

| Design operation | Route(s) today | Notes |
| --- | --- | --- |
| `listLedger` | `GET /app/payments` | `direction`, `kind`, `mode`, `contact_id`, `invoice_id`, paid dates; a payment's edits: `GET …/:payment_id/edits` |
| `listPendingCredits` | `GET /app/pending-credits` | |
| `listOpenSupplierBills` | `GET /app/medical-purchase-orders?stage=received&payment_status=unpaid,partial` + `GET /app/stock-purchases?payment_status=unpaid,partial` | a medical order is billed once received — `stage=received` (M23) |
| `listOpenInvoices` | `GET /app/invoices?payment_status=unpaid,partial` | |
| `getDayClose` | `GET /app/day-closes?branch_id=…&close_date_from=<day>&close_date_to=<day>` → `GET /app/day-closes/:day_close_id` | the day's totals by mode and the expected cash are on the day close |
| `getInvoice` | `GET /app/invoices/:invoice_id` · `GET …/credit-notes` | |
| `receivePayment` | `POST /app/payments` (`kind=receipt`) | `splits` across cash, UPI, card and credit |
| `payExpense` | `POST /app/payments` (`kind=expense` or `supplier_bill`) | |
| `updatePayment` | `PATCH /app/payments/:payment_id` | only on an open day; a settled payment is undone by `POST …/reverse` |
| `refundPayment` | `POST /app/invoices/:invoice_id/credit-notes` | writes the credit note and its refund together; up to what is paid less the invoice's store-credit notes (`409 more_than_paid`); the refund moves its money from the invoice's `paid_amount` to `refunded_amount`, so `due_amount` (total − paid − refunded) does not rise — show paid and refunded apart, never "due" for a refunded bill (D93) |
| create / update PendingCredit | `POST` / `PATCH /app/pending-credits[/:pending_credit_id]` | |
| `settleCredit` | `POST /app/pending-credits/:pending_credit_id/settle` | |
| `acceptOpeningCash` | `POST /app/day-closes` | opens the branch's day: carried from the last close, or recounted |
| `closeDay` | `POST /app/day-closes/:day_close_id/close` | a difference needs a reason; `POST …/reopen` reopens |
| `createInvoice` / `updateInvoice` | `POST` / `PATCH /app/invoices[/:invoice_id]` | the server computes every amount; credit notes list: `GET /app/invoice-credit-notes` |

### Tasks

| Design operation | Route(s) today | Notes |
| --- | --- | --- |
| `listTasks` | `GET /app/tasks` | `tab`, `scope`, `kind`, `rule_key`, owner, record links |
| `getTask` | `GET /app/tasks/:task_id` (+ the contact's activity for its history) | |
| `createTask` / `updateTask` | `POST` / `PATCH /app/tasks[/:task_id]` · `POST …/reassign` · `POST …/snooze` | an owner or a role queue |
| `resolveTask` | `POST /app/tasks/:task_id/resolve` | |
| the rules (on / off, "let the app handle") | `GET` / `PUT /app/task-rule-settings` | |

### Offerings

| Design operation | Route(s) today | Notes |
| --- | --- | --- |
| `listOfferings` | `GET /app/offerings` | groups: `/app/offering-groups` |
| `listOffers` | `GET /app/offers` | `status` derived: live, scheduled, ended, paused |
| create / update Offering | `POST` / `PATCH /app/offerings[/:offering_id]` | |
| create / update Offer | `POST` / `PATCH /app/offers[/:offer_id]` | `is_active=false` pauses |

### Users (the team)

| Design operation | Route(s) today | Notes |
| --- | --- | --- |
| `listUsers` | `GET /tenancy/organization/memberships` (management) · `GET /app/memberships` (pickers) | |
| `createUser` | `POST /tenancy/organization/memberships` | an invitation by email; the person accepts and signs in their own way (no password set by the admin) |
| `updateUser` | `PATCH /tenancy/organization/memberships/:membership_id` · `PUT /app/branches/:branch_id/members` | `role_ids` (the main role first), `working_days` and hours, `status`; branch access per branch |
| `listRolePermissions` | `GET /tenancy/organization/roles` · `GET …/roles/:role_id/permissions` · `GET /tenancy/permissions` (the catalog) | |
| `updateRolePermission` | `PUT /tenancy/organization/roles/:role_id/permissions` | |
| `listBranches` (settings) | `GET /app/branches` | |
| create / update Branch | `POST` / `PATCH /app/branches[/:branch_id]` | rooms, machines and holidays nest under the branch |

### In the API, not in the design's operations

Contacts and their household (`/app/contacts`, `…/members`), message templates
(`/app/contact-message-templates`), saved views (`/app/memberships/me/saved-views`), the diagnosis catalogue
(`/app/patient-diagnoses`), prescription kits, branch rooms, machines and holidays, lead claim and release,
the exports (`…/exports` on most lists), the messaging status (`GET /app/contact-activities/messaging-status`),
and the platform's own routes (MFA, passkeys, sessions, notifications, organization settings, API keys,
webhooks, subscription billing). Section 3 lists them all.

## 3. Every available route

<!-- GENERATED:START -->

445 routes, 309 of them the clinic's under `/api/v1/app`, from `docs/routes.txt`.
Paths drop `/api/v1`; the health and operations routes in the last module sit outside it.
**Gate**: a permission code, `signed in`, `public`, `platform admin` or a token. **Idem** `req`:
`X-Idempotency-Key` required. **Team** `team`: team organizations only (`422` on a personal one).
**#**: the route review number (blank where the review does not name the route). Success is `200`,
or `204` for a `DELETE`. **What it does** is the OpenAPI summary.

| Module | Routes |
| --- | --- |
| [Session and account](#session-and-account) | 48 |
| [Organization and team](#organization-and-team) | 52 |
| [Branches and places](#branches-and-places) | 25 |
| [Offerings](#offerings) | 19 |
| [Contacts and messaging](#contacts-and-messaging) | 22 |
| [Leads](#leads) | 9 |
| [Appointments](#appointments) | 20 |
| [Patients](#patients) | 74 |
| [Billing — invoices, payments, credits, day close](#billing--invoices-payments-credits-day-close) | 34 |
| [Clinic stock](#clinic-stock) | 28 |
| [Tasks](#tasks) | 12 |
| [Medical store](#medical-store) | 57 |
| [Files](#files) | 4 |
| [Notifications and webhooks](#notifications-and-webhooks) | 14 |
| [Subscription billing (the platform)](#subscription-billing-the-platform) | 13 |
| [Platform administration and operations](#platform-administration-and-operations) | 14 |

### Session and account

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/auth/email/login` | public |  |  |  | Log in with an email verification code |
| POST | `/auth/email/send-code` | public |  |  |  | Send email sign-in code |
| POST | `/auth/login` | public |  |  |  | Login with email and password |
| POST | `/auth/logout` | token (access-token) |  |  |  | Logout current session |
| GET | `/auth/me/auth-methods` | signed in |  |  |  | List my auth methods |
| POST | `/auth/me/auth-methods` | signed in |  |  |  | Add auth method |
| DELETE | `/auth/me/auth-methods/:auth_method_id` | signed in |  |  |  | Remove auth method |
| GET | `/auth/me/context` | signed in |  |  |  | Get my session context |
| GET | `/auth/me/mfa` | signed in |  |  |  | List enrolled MFA methods |
| DELETE | `/auth/me/mfa/:mfa_method_id` | signed in |  |  |  | Remove MFA method |
| POST | `/auth/me/mfa/enroll` | signed in |  |  |  | Begin MFA enrollment (phase 1 of 2) |
| POST | `/auth/me/mfa/enroll/confirm` | signed in |  |  |  | Confirm MFA enrollment (phase 2 of 2) |
| POST | `/auth/me/mfa/verify` | signed in |  |  |  | Verify MFA code |
| GET | `/auth/me/sessions` | signed in |  |  |  | List my active sessions |
| DELETE | `/auth/me/sessions` | signed in |  |  |  | Revoke all sessions |
| DELETE | `/auth/me/sessions/:session_id` | signed in |  |  |  | Revoke a specific session |
| GET | `/auth/me/webauthn/credentials` | signed in |  |  |  | List registered passkeys |
| DELETE | `/auth/me/webauthn/credentials/:credential_id` | signed in |  |  |  | Revoke a passkey |
| POST | `/auth/me/webauthn/register/options` | signed in |  |  |  | Begin passkey registration |
| POST | `/auth/me/webauthn/register/verify` | signed in |  |  |  | Complete passkey registration |
| POST | `/auth/mfa/login` | public |  |  |  | Complete MFA during login |
| GET | `/auth/oauth/:provider` | public |  |  |  | Initiate OAuth flow |
| GET | `/auth/oauth/:provider/callback` | public |  |  |  | OAuth callback |
| GET | `/auth/oauth/providers` | public |  |  |  | List available OAuth providers |
| POST | `/auth/password/change` | signed in |  |  |  | Change current password |
| POST | `/auth/password/forgot` | public |  |  |  | Request password reset |
| POST | `/auth/password/reset` | public |  |  |  | Reset password with token |
| POST | `/auth/refresh` | token (session-cookie) |  |  |  | Refresh access token |
| POST | `/auth/step-up` | signed in |  |  |  | Step-up (re-authenticate) |
| POST | `/auth/switch-to-organization` | signed in |  |  |  | Switch active organization |
| POST | `/auth/switch-to-personal` | signed in |  |  |  | Switch to personal organization |
| POST | `/auth/webauthn/authenticate/options` | public |  |  |  | Begin passkey authentication |
| POST | `/auth/webauthn/authenticate/verify` | public |  |  |  | Complete passkey authentication |
| GET | `/users/me` | signed in |  |  |  | Get current user profile |
| PATCH | `/users/me` | signed in |  |  |  | Update current user profile |
| DELETE | `/users/me` | signed in |  |  |  | Delete my account |
| PUT | `/users/me/avatar` | signed in |  |  |  | Upload avatar |
| DELETE | `/users/me/avatar` | signed in |  |  |  | Remove avatar |
| POST | `/users/me/data-export` | signed in |  |  |  | Request GDPR data export |
| GET | `/users/me/data-export/:data_export_id` | signed in |  |  |  | Get GDPR data export status |
| GET | `/users/me/membership-invitations` | signed in |  |  |  | List my invitations |
| GET | `/users/me/notification-preferences` | signed in |  |  |  | Get my notification preferences |
| PUT | `/users/me/notification-preferences` | signed in |  |  |  | Replace notification preferences |
| POST | `/users/me/onboarding/complete` | signed in |  |  |  | Mark onboarding complete |
| GET | `/users/me/organizations` | signed in |  |  |  | List my organizations |
| PUT | `/users/me/presence` | signed in |  |  |  | Set my presence |
| GET | `/users/me/settings` | signed in |  |  |  | Get my settings |
| PATCH | `/users/me/settings` | signed in |  |  |  | Update my settings |

### Organization and team

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/memberships` | `organization:read` |  |  | 2.1 | List memberships (picker) |
| GET | `/app/memberships/me/preferences` | `organization:read` |  |  | 2.21 | Get my preferences |
| PATCH | `/app/memberships/me/preferences` | `organization:read` |  |  | 2.22 | Save my preferences |
| GET | `/app/memberships/me/saved-views` | `organization:read` |  |  | 2.23 | List my saved views |
| POST | `/app/memberships/me/saved-views` | `organization:read` | req |  | 2.24 | Save a view |
| GET | `/app/memberships/me/saved-views/:membership_saved_view_id` | `organization:read` |  |  | 2.25 | Get my saved view |
| PATCH | `/app/memberships/me/saved-views/:membership_saved_view_id` | `organization:read` |  |  | 2.26 | Update my saved view |
| DELETE | `/app/memberships/me/saved-views/:membership_saved_view_id` | `organization:read` |  |  | 2.27 | Remove my saved view |
| GET | `/app/roles` | `organization:read` |  |  |  | List roles (directory) |
| POST | `/tenancy/membership-invitations/:membership_invitation_id/accept` | signed in | req |  | 2.11 | Accept invitation |
| POST | `/tenancy/membership-invitations/:membership_invitation_id/decline` | signed in | req |  |  | Decline invitation |
| GET | `/tenancy/organization` | signed in |  |  |  | Get active organization |
| PATCH | `/tenancy/organization` | `organization:update` |  |  |  | Update organization |
| DELETE | `/tenancy/organization` | `organization:delete` |  | team |  | Delete organization |
| GET | `/tenancy/organization/api-keys` | `api-key:read` |  |  |  | List API keys |
| POST | `/tenancy/organization/api-keys` | `api-key:manage` | req |  |  | Create API key |
| GET | `/tenancy/organization/api-keys/:api_key_id` | `api-key:read` |  |  |  | Get API key |
| PATCH | `/tenancy/organization/api-keys/:api_key_id` | `api-key:manage` |  |  |  | Update API key |
| DELETE | `/tenancy/organization/api-keys/:api_key_id` | `api-key:manage` |  |  |  | Delete API key |
| POST | `/tenancy/organization/api-keys/:api_key_id/rotate` | `api-key:manage` |  |  |  | Rotate API key |
| GET | `/tenancy/organization/audit-logs` | `audit-log:read` |  |  |  | List organization audit logs |
| POST | `/tenancy/organization/leave` | signed in |  |  |  | Leave organization |
| PUT | `/tenancy/organization/logo` | `organization:update` |  |  |  | Upload organization logo |
| DELETE | `/tenancy/organization/logo` | `organization:update` |  |  |  | Remove organization logo |
| GET | `/tenancy/organization/memberships` | `membership:read` |  |  | 2.2 | List memberships |
| POST | `/tenancy/organization/memberships` | `membership:create` | req | team | 2.3 | Add member by email |
| GET | `/tenancy/organization/memberships/:membership_id` | `membership:read` |  |  | 2.4 | Get membership |
| PATCH | `/tenancy/organization/memberships/:membership_id` | `membership:update` |  |  | 2.5 | Update membership |
| DELETE | `/tenancy/organization/memberships/:membership_id` | `membership:delete` |  |  | 2.6 | Remove membership |
| DELETE | `/tenancy/organization/memberships/:membership_id/invitation` | `membership:delete` |  |  | 2.9 | Revoke invitation |
| POST | `/tenancy/organization/memberships/:membership_id/invitation/resend` | `membership:update` | req |  | 2.10 | Resend invitation |
| GET | `/tenancy/organization/memberships/:membership_id/permissions` | `membership:read` |  |  | 2.8 | Get membership permissions |
| POST | `/tenancy/organization/memberships/:membership_id/restore` | `membership:delete` | req | team | 2.7 | Restore membership |
| GET | `/tenancy/organization/notification-policies` | `notification-policy:read` |  |  |  | List notification policies |
| POST | `/tenancy/organization/notification-policies` | `notification-policy:manage` | req |  |  | Create notification policy |
| GET | `/tenancy/organization/notification-policies/:notification_policy_id` | `notification-policy:read` |  |  |  | Get notification policy |
| PATCH | `/tenancy/organization/notification-policies/:notification_policy_id` | `notification-policy:manage` |  |  |  | Update notification policy |
| DELETE | `/tenancy/organization/notification-policies/:notification_policy_id` | `notification-policy:manage` |  |  |  | Delete notification policy |
| GET | `/tenancy/organization/roles` | `role:read` |  |  | 2.12 | List roles |
| POST | `/tenancy/organization/roles` | `role:create` | req | team | 2.13 | Create role |
| GET | `/tenancy/organization/roles/:role_id` | `role:read` |  |  | 2.14 | Get role |
| PATCH | `/tenancy/organization/roles/:role_id` | `role:update` |  |  | 2.15 | Update role |
| DELETE | `/tenancy/organization/roles/:role_id` | `role:delete` |  |  | 2.16 | Delete role |
| GET | `/tenancy/organization/roles/:role_id/permissions` | `role:read` |  |  | 2.18 | List role permissions |
| PUT | `/tenancy/organization/roles/:role_id/permissions` | `role:update` |  |  | 2.19 | Replace role permissions |
| POST | `/tenancy/organization/roles/:role_id/restore` | `role:delete` | req |  | 2.17 | Restore role |
| GET | `/tenancy/organization/settings` | `organization:read` |  |  |  | Get organization settings |
| PATCH | `/tenancy/organization/settings` | `organization:update` |  |  |  | Update organization settings |
| POST | `/tenancy/organization/transfer-ownership` | signed in | req | team |  | Transfer organization ownership |
| POST | `/tenancy/organizations` | signed in | req |  |  | Create organization |
| GET | `/tenancy/organizations/by-slug/:slug` | signed in |  |  |  | Get organization by slug |
| GET | `/tenancy/permissions` | signed in |  |  | 2.20 | List all permissions |

### Branches and places

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/branches` | `branch:read` |  |  | 1.1 | List branches |
| POST | `/app/branches` | `branch:create` | req |  | 1.3 | Create branch |
| GET | `/app/branches/:branch_id` | `branch:read` |  |  | 1.4 | Get branch |
| PATCH | `/app/branches/:branch_id` | `branch:update` |  |  | 1.5 | Update branch |
| GET | `/app/branches/:branch_id/holidays` | `organization:read` |  |  | 1.20 | List a branch's branch holidays |
| POST | `/app/branches/:branch_id/holidays` | `branch:create` | req |  | 1.21 | Add a branch holiday |
| GET | `/app/branches/:branch_id/holidays/:branch_holiday_id` | `organization:read` |  |  | 1.22 | Get branch holiday |
| PATCH | `/app/branches/:branch_id/holidays/:branch_holiday_id` | `branch:update` |  |  | 1.23 | Update branch holiday |
| DELETE | `/app/branches/:branch_id/holidays/:branch_holiday_id` | `branch:delete` |  |  | 1.24 | Delete branch holiday |
| POST | `/app/branches/:branch_id/holidays/:branch_holiday_id/restore` | `branch:delete` | req |  | 1.25 | Restore branch holiday |
| GET | `/app/branches/:branch_id/machines` | `organization:read` |  |  | 1.14 | List a branch's machines |
| POST | `/app/branches/:branch_id/machines` | `branch:create` | req |  | 1.15 | Add a machine |
| GET | `/app/branches/:branch_id/machines/:branch_machine_id` | `organization:read` |  |  | 1.16 | Get machine |
| PATCH | `/app/branches/:branch_id/machines/:branch_machine_id` | `branch:update` |  |  | 1.17 | Update machine |
| DELETE | `/app/branches/:branch_id/machines/:branch_machine_id` | `branch:delete` |  |  | 1.18 | Delete machine |
| POST | `/app/branches/:branch_id/machines/:branch_machine_id/restore` | `branch:delete` | req |  | 1.19 | Restore machine |
| GET | `/app/branches/:branch_id/members` | `branch:update` |  |  | 1.6 | List branch members |
| PUT | `/app/branches/:branch_id/members` | `branch:update` |  |  | 1.7 | Replace branch members |
| GET | `/app/branches/:branch_id/rooms` | `organization:read` |  |  | 1.8 | List a branch's rooms |
| POST | `/app/branches/:branch_id/rooms` | `branch:create` | req |  | 1.9 | Add a room |
| GET | `/app/branches/:branch_id/rooms/:branch_room_id` | `organization:read` |  |  | 1.10 | Get room |
| PATCH | `/app/branches/:branch_id/rooms/:branch_room_id` | `branch:update` |  |  | 1.11 | Update room |
| DELETE | `/app/branches/:branch_id/rooms/:branch_room_id` | `branch:delete` |  |  | 1.12 | Delete room |
| POST | `/app/branches/:branch_id/rooms/:branch_room_id/restore` | `branch:delete` | req |  | 1.13 | Restore room |
| GET | `/app/branches/my` | `organization:read` |  |  | 1.2 | List my branches |

### Offerings

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/offering-groups` | `organization:read` |  |  | 3.1 | List offering groups |
| POST | `/app/offering-groups` | `offering:create` | req |  | 3.2 | Create offering group |
| GET | `/app/offering-groups/:offering_group_id` | `organization:read` |  |  | 3.3 | Get offering group |
| PATCH | `/app/offering-groups/:offering_group_id` | `offering:update` |  |  | 3.4 | Update offering group |
| DELETE | `/app/offering-groups/:offering_group_id` | `offering:delete` |  |  | 3.5 | Delete offering group |
| POST | `/app/offering-groups/:offering_group_id/restore` | `offering:delete` | req |  | 3.6 | Restore offering group |
| GET | `/app/offerings` | `organization:read` |  |  | 3.7 | List offerings |
| POST | `/app/offerings` | `offering:create` | req |  | 3.9 | Create offering |
| GET | `/app/offerings/:offering_id` | `organization:read` |  |  | 3.10 | Get offering |
| PATCH | `/app/offerings/:offering_id` | `offering:update` |  |  | 3.11 | Update offering |
| DELETE | `/app/offerings/:offering_id` | `offering:delete` |  |  | 3.12 | Delete offering |
| POST | `/app/offerings/:offering_id/restore` | `offering:delete` | req |  | 3.13 | Restore offering |
| GET | `/app/offerings/exports` | `offering:export` |  |  | 3.8 | Export offerings |
| GET | `/app/offers` | `organization:read` |  |  | 3.14 | List offers |
| POST | `/app/offers` | `offering:create` | req |  | 3.15 | Create offer |
| GET | `/app/offers/:offer_id` | `organization:read` |  |  | 3.16 | Get offer |
| PATCH | `/app/offers/:offer_id` | `offering:update` |  |  | 3.17 | Update offer |
| DELETE | `/app/offers/:offer_id` | `offering:delete` |  |  | 3.18 | Delete offer |
| POST | `/app/offers/:offer_id/restore` | `offering:delete` | req |  | 3.19 | Restore offer |

### Contacts and messaging

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/app/contact-activities/message-batches` | `contact_activity:create` | req |  | 4.16 | Send contact message batch |
| GET | `/app/contact-message-templates` | `organization:read` |  |  | 4.17 | List contact message templates |
| POST | `/app/contact-message-templates` | `contact_activity:create` | req |  | 4.18 | Create contact message template |
| GET | `/app/contact-message-templates/:contact_message_template_id` | `organization:read` |  |  | 4.19 | Get contact message template |
| PATCH | `/app/contact-message-templates/:contact_message_template_id` | `contact_activity:update` |  |  | 4.20 | Update contact message template |
| DELETE | `/app/contact-message-templates/:contact_message_template_id` | `contact_activity:delete` |  |  | 4.21 | Delete contact message template |
| POST | `/app/contact-message-templates/:contact_message_template_id/restore` | `contact_activity:delete` | req |  | 4.22 | Restore contact message template |
| GET | `/app/contacts` | `contact:read` |  |  | 4.1 | List contacts |
| POST | `/app/contacts` | `contact:create` | req |  | 4.2 | Create contact |
| GET | `/app/contacts/:contact_id` | `contact:read` |  |  | 4.3 | Get contact |
| PATCH | `/app/contacts/:contact_id` | `contact:update` |  |  | 4.4 | Update contact |
| DELETE | `/app/contacts/:contact_id` | `contact:delete` |  |  | 4.5 | Delete contact |
| GET | `/app/contacts/:contact_id/activities` | `contact_activity:read` |  |  | 4.10 | List contact activities |
| GET | `/app/contacts/:contact_id/activities/:contact_activity_id` | `contact_activity:read` |  |  | 4.14 | Get contact activity |
| POST | `/app/contacts/:contact_id/activities/:contact_activity_id/resend` | `contact_activity:update` | req |  | 4.15 | Resend contact message |
| POST | `/app/contacts/:contact_id/activities/add-note` | `contact_activity:create` | req |  | 4.13 | Add contact note |
| POST | `/app/contacts/:contact_id/activities/log-call` | `contact_activity:create` | req |  | 4.12 | Log contact call |
| POST | `/app/contacts/:contact_id/activities/send-message` | `contact_activity:create` | req |  | 4.11 | Send contact message |
| GET | `/app/contacts/:contact_id/members` | `contact:read` |  |  | 4.8 | List contact members |
| PUT | `/app/contacts/:contact_id/members` | `contact:update` |  |  | 4.9 | Replace contact members |
| GET | `/app/contacts/:contact_id/preview` | `contact:read` |  |  | 4.7 | Preview contact |
| POST | `/app/contacts/:contact_id/restore` | `contact:delete` | req |  | 4.6 | Restore contact |

### Leads

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/leads` | `lead:read` |  |  | 5.1 | List leads |
| POST | `/app/leads` | `lead:create` | req |  | 5.3 | Create lead |
| GET | `/app/leads/:lead_id` | `lead:read` |  |  | 5.4 | Get lead |
| PATCH | `/app/leads/:lead_id` | `lead:update` |  |  | 5.5 | Update lead |
| DELETE | `/app/leads/:lead_id` | `lead:delete` |  |  | 5.6 | Delete lead |
| POST | `/app/leads/:lead_id/claim` | `lead:update` | req |  | 5.8 | Claim lead |
| POST | `/app/leads/:lead_id/release` | `lead:update` | req |  | 5.9 | Release lead |
| POST | `/app/leads/:lead_id/restore` | `lead:delete` | req |  | 5.7 | Restore lead |
| GET | `/app/leads/exports` | `lead:export` |  |  | 5.2 | Export leads |

### Appointments

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/appointments` | `appointment:read` |  |  | 6.1 | List appointments |
| POST | `/app/appointments` | `appointment:create` | req |  | 6.5 | Book an appointment |
| GET | `/app/appointments/:appointment_id` | `appointment:read` |  |  | 6.6 | Get appointment |
| PATCH | `/app/appointments/:appointment_id` | `appointment:update` |  |  | 6.7 | Change or move appointment |
| DELETE | `/app/appointments/:appointment_id` | `appointment:delete` |  |  | 6.8 | Delete appointment |
| POST | `/app/appointments/:appointment_id/cancel` | `appointment:update` | req |  | 6.14 | Cancel appointment |
| POST | `/app/appointments/:appointment_id/check-in` | `appointment:update` | req |  | 6.11 | Check in |
| POST | `/app/appointments/:appointment_id/complete` | `appointment:update` | req |  | 6.12 | Complete appointment |
| POST | `/app/appointments/:appointment_id/confirm` | `appointment:update` | req |  | 6.10 | Confirm appointment |
| POST | `/app/appointments/:appointment_id/copy` | `appointment:create` | req |  | 6.17 | Copy appointment |
| POST | `/app/appointments/:appointment_id/no-show` | `appointment:update` | req |  | 6.13 | Mark no-show |
| POST | `/app/appointments/:appointment_id/pause` | `appointment:update` | req |  | 6.19 | Pause visit |
| POST | `/app/appointments/:appointment_id/reinstate` | `appointment:update` | req |  | 6.15 | Reinstate appointment |
| POST | `/app/appointments/:appointment_id/restore` | `appointment:delete` | req |  | 6.9 | Restore appointment |
| POST | `/app/appointments/:appointment_id/resume` | `appointment:update` | req |  | 6.20 | Resume visit |
| POST | `/app/appointments/:appointment_id/stage` | `appointment:update` | req |  | 6.18 | Move floor stage |
| POST | `/app/appointments/:appointment_id/undo-check-in` | `appointment:update` | req |  | 6.16 | Undo check-in |
| GET | `/app/appointments/daily-counts` | `appointment:read` |  |  | 6.4 | Daily appointment counts |
| GET | `/app/appointments/exports` | `appointment:export` |  |  | 6.2 | Export appointments |
| GET | `/app/appointments/slots` | `appointment:read` |  |  | 6.3 | Free slots for a day |

### Patients

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/patient-diagnoses` | `organization:read` |  |  | 7.27 | List the diagnosis catalogue |
| POST | `/app/patient-diagnoses` | `patient_prescription:create` | req |  | 7.28 | Add a diagnosis |
| GET | `/app/patient-diagnoses/:patient_diagnosis_id` | `organization:read` |  |  | 7.29 | Get a diagnosis |
| PATCH | `/app/patient-diagnoses/:patient_diagnosis_id` | `patient_prescription:update` |  |  | 7.30 | Rename a diagnosis |
| DELETE | `/app/patient-diagnoses/:patient_diagnosis_id` | `patient_prescription:delete` |  |  | 7.31 | Delete a diagnosis |
| POST | `/app/patient-diagnoses/:patient_diagnosis_id/restore` | `patient_prescription:delete` | req |  | 7.32 | Restore a diagnosis |
| GET | `/app/patient-prescriptions` | `patient_prescription:read` |  |  | 7.13 | List prescriptions — the pharmacy queue |
| GET | `/app/patient-treatments` | `patient_treatment:read` |  |  | 7.45 | List every patient's treatments |
| GET | `/app/patients` | `patient:read` |  |  | 7.1 | List patients |
| POST | `/app/patients` | `patient:create` | req |  | 7.3 | Create patient |
| GET | `/app/patients/:patient_id` | `patient:read` |  |  | 7.4 | Get patient |
| PATCH | `/app/patients/:patient_id` | `patient:update` |  |  | 7.5 | Update patient |
| DELETE | `/app/patients/:patient_id` | `patient:delete` |  |  | 7.6 | Delete patient |
| GET | `/app/patients/:patient_id/check-ins` | `patient:read` |  |  | 7.51 | List a patient's check-ins |
| POST | `/app/patients/:patient_id/check-ins` | `patient:update` | req |  | 7.52 | Log a check-in |
| GET | `/app/patients/:patient_id/check-ins/:patient_check_in_id` | `patient:read` |  |  | 7.53 | Get a check-in |
| PATCH | `/app/patients/:patient_id/check-ins/:patient_check_in_id` | `patient:update` |  |  | 7.54 | Change a check-in |
| DELETE | `/app/patients/:patient_id/check-ins/:patient_check_in_id` | `patient:update` |  |  | 7.55 | Delete a check-in |
| POST | `/app/patients/:patient_id/check-ins/:patient_check_in_id/actions` | `patient:update` | req |  | 7.63 | Log a check-in action |
| POST | `/app/patients/:patient_id/check-ins/:patient_check_in_id/restore` | `patient:update` | req |  | 7.56 | Restore a check-in |
| GET | `/app/patients/:patient_id/clinical-notes` | `patient:clinical_record:read` |  |  | 7.8 | List a patient's clinical notes |
| POST | `/app/patients/:patient_id/clinical-notes` | `patient:update` + `patient:clinical_record:read` | req |  | 7.9 | Add a clinical note |
| GET | `/app/patients/:patient_id/clinical-notes/:patient_clinical_note_id` | `patient:clinical_record:read` |  |  | 7.10 | Get a clinical note |
| DELETE | `/app/patients/:patient_id/clinical-notes/:patient_clinical_note_id` | `patient:update` + `patient:clinical_record:read` |  |  | 7.11 | Delete a clinical note |
| POST | `/app/patients/:patient_id/clinical-notes/:patient_clinical_note_id/restore` | `patient:update` + `patient:clinical_record:read` | req |  | 7.12 | Restore a clinical note |
| GET | `/app/patients/:patient_id/images` | `patient:clinical_record:read` |  |  | 7.33 | List a patient's photos |
| POST | `/app/patients/:patient_id/images` | `patient:update` + `patient:clinical_record:read` | req |  | 7.34 | Add a photo |
| GET | `/app/patients/:patient_id/images/:patient_image_id` | `patient:clinical_record:read` |  |  | 7.35 | Get a photo |
| PATCH | `/app/patients/:patient_id/images/:patient_image_id` | `patient:update` + `patient:clinical_record:read` |  |  | 7.36 | Change or move a photo |
| DELETE | `/app/patients/:patient_id/images/:patient_image_id` | `patient:update` + `patient:clinical_record:read` |  |  | 7.37 | Delete a photo |
| POST | `/app/patients/:patient_id/images/:patient_image_id/restore` | `patient:update` + `patient:clinical_record:read` | req |  | 7.38 | Restore a photo |
| GET | `/app/patients/:patient_id/offering-ideas` | `patient:read` |  |  | 7.74 | A patient's ideas from history |
| GET | `/app/patients/:patient_id/offering-suggestions` | `patient:read` |  |  | 7.68 | List a patient's plan |
| POST | `/app/patients/:patient_id/offering-suggestions` | `patient:update` | req |  | 7.69 | Add to the plan |
| GET | `/app/patients/:patient_id/offering-suggestions/:patient_offering_suggestion_id` | `patient:read` |  |  | 7.70 | Get a plan row |
| PATCH | `/app/patients/:patient_id/offering-suggestions/:patient_offering_suggestion_id` | `patient:update` |  |  | 7.71 | Change a plan row |
| DELETE | `/app/patients/:patient_id/offering-suggestions/:patient_offering_suggestion_id` | `patient:update` |  |  | 7.72 | Remove from the plan |
| POST | `/app/patients/:patient_id/offering-suggestions/:patient_offering_suggestion_id/restore` | `patient:update` | req |  | 7.73 | Restore a plan row |
| GET | `/app/patients/:patient_id/offerings` | `patient:read` |  |  | 7.65 | List what a patient bought |
| GET | `/app/patients/:patient_id/offerings/:patient_offering_id` | `patient:read` |  |  | 7.66 | Get a bought offering |
| PATCH | `/app/patients/:patient_id/offerings/:patient_offering_id` | `payment:update` |  |  | 7.67 | Change a bought offering |
| GET | `/app/patients/:patient_id/prescriptions` | `patient_prescription:read` |  |  | 7.14 | List a patient's prescriptions |
| POST | `/app/patients/:patient_id/prescriptions` | `patient_prescription:create` | req |  | 7.15 | Write a prescription |
| GET | `/app/patients/:patient_id/prescriptions/:patient_prescription_id` | `patient_prescription:read` |  |  | 7.16 | Get a prescription |
| PATCH | `/app/patients/:patient_id/prescriptions/:patient_prescription_id` | `patient_prescription:update` |  |  | 7.17 | Change a draft prescription |
| DELETE | `/app/patients/:patient_id/prescriptions/:patient_prescription_id` | `patient_prescription:delete` |  |  | 7.19 | Delete a draft prescription |
| POST | `/app/patients/:patient_id/prescriptions/:patient_prescription_id/approve` | `patient_prescription:update` | req |  | 7.18 | Approve a prescription |
| POST | `/app/patients/:patient_id/prescriptions/:patient_prescription_id/restore` | `patient_prescription:delete` | req |  | 7.20 | Restore a draft prescription |
| GET | `/app/patients/:patient_id/reports` | `patient:clinical_record:read` |  |  | 7.39 | List a patient's reports |
| POST | `/app/patients/:patient_id/reports` | `patient:update` + `patient:clinical_record:read` | req |  | 7.40 | Add a report |
| GET | `/app/patients/:patient_id/reports/:patient_report_id` | `patient:clinical_record:read` |  |  | 7.41 | Get a report |
| PATCH | `/app/patients/:patient_id/reports/:patient_report_id` | `patient:update` + `patient:clinical_record:read` |  |  | 7.42 | Change a report |
| DELETE | `/app/patients/:patient_id/reports/:patient_report_id` | `patient:update` + `patient:clinical_record:read` |  |  | 7.43 | Delete a report |
| POST | `/app/patients/:patient_id/reports/:patient_report_id/restore` | `patient:update` + `patient:clinical_record:read` | req |  | 7.44 | Restore a report |
| POST | `/app/patients/:patient_id/restore` | `patient:delete` | req |  | 7.7 | Restore patient |
| GET | `/app/patients/:patient_id/reviews` | `patient:read` |  |  | 7.57 | List a patient's reviews |
| POST | `/app/patients/:patient_id/reviews` | `patient_review:create` | req |  | 7.58 | Log a review |
| GET | `/app/patients/:patient_id/reviews/:patient_review_id` | `patient:read` |  |  | 7.59 | Get a review |
| PATCH | `/app/patients/:patient_id/reviews/:patient_review_id` | `patient_review:update` |  |  | 7.60 | Change a review |
| DELETE | `/app/patients/:patient_id/reviews/:patient_review_id` | `patient_review:delete` |  |  | 7.61 | Delete a review |
| POST | `/app/patients/:patient_id/reviews/:patient_review_id/actions` | `patient_review:update` | req |  | 7.64 | Log a review action |
| POST | `/app/patients/:patient_id/reviews/:patient_review_id/restore` | `patient_review:delete` | req |  | 7.62 | Restore a review |
| GET | `/app/patients/:patient_id/treatments` | `patient_treatment:read` |  |  | 7.46 | List a patient's treatments |
| POST | `/app/patients/:patient_id/treatments` | `patient_treatment:create` | req |  | 7.47 | Record a treatment session |
| GET | `/app/patients/:patient_id/treatments/:patient_treatment_id` | `patient_treatment:read` |  |  | 7.48 | Get a treatment session |
| PATCH | `/app/patients/:patient_id/treatments/:patient_treatment_id` | `patient_treatment:update` |  |  | 7.49 | Change a treatment session |
| POST | `/app/patients/:patient_id/treatments/:patient_treatment_id/reverse` | `patient_treatment:update` | req |  | 7.50 | Reverse a treatment session |
| GET | `/app/patients/exports` | `patient:export` |  |  | 7.2 | Export patients |
| GET | `/app/prescription-kits` | `patient_prescription:create` |  |  | 7.21 | List prescription kits |
| POST | `/app/prescription-kits` | `patient_prescription:create` | req |  | 7.22 | Create prescription kit |
| GET | `/app/prescription-kits/:prescription_kit_id` | `patient_prescription:create` |  |  | 7.23 | Get prescription kit |
| PATCH | `/app/prescription-kits/:prescription_kit_id` | `patient_prescription:create` |  |  | 7.24 | Update prescription kit |
| DELETE | `/app/prescription-kits/:prescription_kit_id` | `patient_prescription:create` |  |  | 7.25 | Delete prescription kit |
| POST | `/app/prescription-kits/:prescription_kit_id/restore` | `patient_prescription:create` | req |  | 7.26 | Restore prescription kit |

### Billing — invoices, payments, credits, day close

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/day-closes` | `payment:read` |  |  | 8.28 | List day closes |
| POST | `/app/day-closes` | `payment:update` | req |  | 8.29 | Open the day |
| GET | `/app/day-closes/:day_close_id` | `payment:read` |  |  | 8.30 | Get a day close |
| POST | `/app/day-closes/:day_close_id/close` | `payment:update` | req |  | 8.31 | Close the day |
| POST | `/app/day-closes/:day_close_id/reopen` | `payment:delete` | req |  | 8.32 | Reopen a closed day |
| GET | `/app/invoice-credit-notes` | `payment:read` |  |  | 8.8 | List credit notes |
| GET | `/app/invoices` | `payment:read` |  |  | 8.1 | List invoices |
| POST | `/app/invoices` | `payment:create` | req |  | 8.3 | Bill |
| GET | `/app/invoices/:invoice_id` | `payment:read` |  |  | 8.4 | Get an invoice |
| PATCH | `/app/invoices/:invoice_id` | `payment:update` |  |  | 8.5 | Change an invoice |
| DELETE | `/app/invoices/:invoice_id` | `payment:delete` |  |  | 8.6 | Delete an unpaid invoice |
| GET | `/app/invoices/:invoice_id/credit-notes` | `payment:read` |  |  | 8.9 | List an invoice's credit notes |
| POST | `/app/invoices/:invoice_id/credit-notes` | `payment:delete` | req |  | 8.10 | Refund with a credit note |
| GET | `/app/invoices/:invoice_id/credit-notes/:invoice_credit_note_id` | `payment:read` |  |  | 8.11 | Get a credit note |
| POST | `/app/invoices/:invoice_id/preview` | `payment:update` |  |  |  | Preview a change to an invoice |
| POST | `/app/invoices/:invoice_id/restore` | `payment:delete` | req |  | 8.7 | Restore an invoice |
| GET | `/app/invoices/exports` | `payment:export` |  |  | 8.2 | Export invoices |
| POST | `/app/invoices/preview` | `payment:create` |  |  |  | Preview a bill |
| GET | `/app/payments` | `payment:read` |  |  | 8.12 | List payments |
| POST | `/app/payments` | `payment:create` | req |  | 8.14 | Receive or pay |
| GET | `/app/payments/:payment_id` | `payment:read` |  |  | 8.15 | Get a payment |
| PATCH | `/app/payments/:payment_id` | `payment:update` |  |  | 8.16 | Change a payment |
| DELETE | `/app/payments/:payment_id` | `payment:delete` |  |  | 8.19 | Delete a payment |
| GET | `/app/payments/:payment_id/edits` | `payment:read` |  |  | 8.17 | List a payment's changes |
| POST | `/app/payments/:payment_id/restore` | `payment:delete` | req |  | 8.20 | Restore a payment |
| POST | `/app/payments/:payment_id/reverse` | `payment:delete` | req |  | 8.18 | Reverse a settled payment |
| GET | `/app/payments/exports` | `payment:export` |  |  | 8.13 | Export payments |
| GET | `/app/pending-credits` | `payment:read` |  |  | 8.21 | List pending credits |
| POST | `/app/pending-credits` | `payment:create` | req |  | 8.22 | Add a pending credit |
| GET | `/app/pending-credits/:pending_credit_id` | `payment:read` |  |  | 8.23 | Get a pending credit |
| PATCH | `/app/pending-credits/:pending_credit_id` | `payment:update` |  |  | 8.24 | Change a pending credit |
| DELETE | `/app/pending-credits/:pending_credit_id` | `payment:delete` |  |  | 8.25 | Delete a pending credit |
| POST | `/app/pending-credits/:pending_credit_id/restore` | `payment:delete` | req |  | 8.26 | Restore a pending credit |
| POST | `/app/pending-credits/:pending_credit_id/settle` | `payment:create` | req |  | 8.27 | Settle a pending credit |

### Clinic stock

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/stock-counts` | `stock_item:read` |  |  | 9.13 | List stock counts |
| POST | `/app/stock-counts` | `stock_item:update` | req |  | 9.14 | Save a stock count |
| GET | `/app/stock-counts/:stock_count_id` | `stock_item:read` |  |  | 9.15 | Get a stock count |
| GET | `/app/stock-item-movements` | `stock_item:read` |  |  | 9.8 | List stock movements |
| GET | `/app/stock-items` | `stock_item:read` |  |  | 9.1 | List stock items |
| POST | `/app/stock-items` | `stock_item:create` | req |  | 9.3 | Add a stock item |
| GET | `/app/stock-items/:stock_item_id` | `stock_item:read` |  |  | 9.4 | Get a stock item |
| PATCH | `/app/stock-items/:stock_item_id` | `stock_item:update` |  |  | 9.5 | Change a stock item |
| DELETE | `/app/stock-items/:stock_item_id` | `stock_item:delete` |  |  | 9.6 | Delete a stock item |
| GET | `/app/stock-items/:stock_item_id/movements` | `stock_item:read` |  |  | 9.9 | List a stock item's movements |
| POST | `/app/stock-items/:stock_item_id/movements` | `stock_item:update` | req |  | 9.10 | Move stock |
| GET | `/app/stock-items/:stock_item_id/movements/:stock_item_movement_id` | `stock_item:read` |  |  | 9.11 | Get a stock movement |
| POST | `/app/stock-items/:stock_item_id/movements/:stock_item_movement_id/revert` | `stock_item:update` | req |  | 9.12 | Revert a stock movement |
| POST | `/app/stock-items/:stock_item_id/restore` | `stock_item:delete` | req |  | 9.7 | Restore a stock item |
| GET | `/app/stock-items/exports` | `stock_item:export` |  |  | 9.2 | Export stock items |
| GET | `/app/stock-purchases` | `stock_item:read` |  |  | 9.16 | List stock purchases |
| POST | `/app/stock-purchases` | `stock_item:create` | req |  | 9.18 | Record a stock purchase |
| GET | `/app/stock-purchases/:stock_purchase_id` | `stock_item:read` |  |  | 9.19 | Get a stock purchase |
| PATCH | `/app/stock-purchases/:stock_purchase_id` | `stock_item:update` |  |  | 9.20 | Change a stock purchase |
| DELETE | `/app/stock-purchases/:stock_purchase_id` | `stock_item:delete` |  |  | 9.21 | Delete a stock purchase |
| POST | `/app/stock-purchases/:stock_purchase_id/restore` | `stock_item:delete` | req |  | 9.22 | Restore a stock purchase |
| GET | `/app/stock-purchases/exports` | `stock_item:export` |  |  | 9.17 | Export stock purchases |
| GET | `/app/stock-vendors` | `stock_item:read` |  |  | 9.23 | List stock vendors |
| POST | `/app/stock-vendors` | `stock_item:create` | req |  | 9.24 | Add a stock vendor |
| GET | `/app/stock-vendors/:stock_vendor_id` | `stock_item:read` |  |  | 9.25 | Get a stock vendor |
| PATCH | `/app/stock-vendors/:stock_vendor_id` | `stock_item:update` |  |  | 9.26 | Change a stock vendor |
| DELETE | `/app/stock-vendors/:stock_vendor_id` | `stock_item:delete` |  |  | 9.27 | Delete a stock vendor |
| POST | `/app/stock-vendors/:stock_vendor_id/restore` | `stock_item:delete` | req |  | 9.28 | Restore a stock vendor |

### Tasks

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/task-rule-settings` | `task:read` |  |  | 10.11 | List task rules |
| PUT | `/app/task-rule-settings` | `organization:update` |  |  | 10.12 | Save task rules |
| GET | `/app/tasks` | `task:read` |  |  | 10.1 | List tasks |
| POST | `/app/tasks` | `task:create` | req |  | 10.3 | Add a task |
| GET | `/app/tasks/:task_id` | `task:read` |  |  | 10.4 | Get a task |
| PATCH | `/app/tasks/:task_id` | `task:update` |  |  | 10.5 | Change a task |
| DELETE | `/app/tasks/:task_id` | `task:delete` |  |  | 10.9 | Delete a task |
| POST | `/app/tasks/:task_id/reassign` | `task:update` | req |  | 10.8 | Reassign a task |
| POST | `/app/tasks/:task_id/resolve` | `task:update` | req |  | 10.7 | Resolve a task |
| POST | `/app/tasks/:task_id/restore` | `task:delete` | req |  | 10.10 | Restore a task |
| POST | `/app/tasks/:task_id/snooze` | `task:update` | req |  | 10.6 | Snooze a task |
| GET | `/app/tasks/exports` | `task:export` |  |  | 10.2 | Export tasks |

### Medical store

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/app/manufacturers` | `medicine:read` |  |  | 11.1 | List manufacturers |
| POST | `/app/manufacturers` | `medicine:create` | req |  | 11.2 | Add a manufacturer |
| GET | `/app/manufacturers/:manufacturer_id` | `medicine:read` |  |  | 11.3 | Get a manufacturer |
| PATCH | `/app/manufacturers/:manufacturer_id` | `medicine:update` |  |  | 11.4 | Change a manufacturer |
| DELETE | `/app/manufacturers/:manufacturer_id` | `medicine:delete` |  |  | 11.5 | Delete a manufacturer |
| POST | `/app/manufacturers/:manufacturer_id/restore` | `medicine:delete` | req |  | 11.6 | Restore a manufacturer |
| GET | `/app/medical-payments` | `medicine:read` |  |  | 11.51 | List the medical store's payments |
| GET | `/app/medical-payments/exports` | `medicine:export` |  |  | 11.53 | Export the medical store's payments |
| GET | `/app/medical-pending-credits` | `medicine:read` |  |  | 11.56 | List the medical store's customer credits |
| GET | `/app/medical-purchase-orders` | `medicine:read` |  |  | 11.25 | List medical purchase orders |
| POST | `/app/medical-purchase-orders` | `medicine:create` | req |  | 11.27 | Create a medical purchase order |
| GET | `/app/medical-purchase-orders/:medical_purchase_order_id` | `medicine:read` |  |  | 11.28 | Get a medical purchase order |
| PATCH | `/app/medical-purchase-orders/:medical_purchase_order_id` | `medicine:update` |  |  | 11.29 | Change a medical purchase order |
| DELETE | `/app/medical-purchase-orders/:medical_purchase_order_id` | `medicine:delete` |  |  | 11.30 | Cancel a medical purchase order |
| POST | `/app/medical-purchase-orders/:medical_purchase_order_id/receive` | `medicine:update` | req |  | 11.32 | Receive a medical purchase order |
| POST | `/app/medical-purchase-orders/:medical_purchase_order_id/restore` | `medicine:delete` | req |  | 11.31 | Undo a medical purchase order cancel |
| GET | `/app/medical-purchase-orders/exports` | `medicine:export` |  |  | 11.26 | Export medical purchase orders |
| GET | `/app/medical-reps` | `medicine:read` |  |  | 11.33 | List medical reps |
| POST | `/app/medical-reps` | `medicine:create` | req |  | 11.34 | Add a medical rep |
| GET | `/app/medical-reps/:medical_rep_id` | `medicine:read` |  |  | 11.35 | Get a medical rep |
| PATCH | `/app/medical-reps/:medical_rep_id` | `medicine:update` |  |  | 11.36 | Change a medical rep |
| DELETE | `/app/medical-reps/:medical_rep_id` | `medicine:delete` |  |  | 11.37 | Delete a medical rep |
| POST | `/app/medical-reps/:medical_rep_id/restore` | `medicine:delete` | req |  | 11.38 | Restore a medical rep |
| GET | `/app/medical-reps/:medical_rep_id/visits` | `medicine:read` |  |  | 11.39 | List an MR's visits |
| POST | `/app/medical-reps/:medical_rep_id/visits` | `medicine:create` | req |  | 11.40 | Log an MR visit |
| GET | `/app/medical-reps/:medical_rep_id/visits/:medical_rep_visit_id` | `medicine:read` |  |  | 11.41 | Get an MR visit |
| DELETE | `/app/medical-reps/:medical_rep_id/visits/:medical_rep_visit_id` | `medicine:delete` |  |  | 11.42 | Delete an MR visit |
| POST | `/app/medical-reps/:medical_rep_id/visits/:medical_rep_visit_id/restore` | `medicine:delete` | req |  | 11.43 | Restore an MR visit |
| GET | `/app/medical-sales` | `medicine:read` |  |  | 11.44 | List medical sales |
| POST | `/app/medical-sales` | `medicine:create` | req |  | 11.46 | Create a medical sale |
| GET | `/app/medical-sales/:medical_sale_id` | `medicine:read` |  |  | 11.47 | Get a medical sale |
| DELETE | `/app/medical-sales/:medical_sale_id` | `medicine:delete` |  |  | 11.48 | Void a medical sale |
| POST | `/app/medical-sales/:medical_sale_id/restore` | `medicine:delete` | req |  | 11.49 | Undo a medical sale void |
| POST | `/app/medical-sales/:medical_sale_id/returns` | `payment:delete` | req |  | 11.50 | Return from patient |
| GET | `/app/medical-sales/dues` | `medicine:read` |  |  | 11.52 | List who owes on medical sales |
| GET | `/app/medical-sales/exports` | `medicine:export` |  |  | 11.45 | Export medical sales |
| GET | `/app/medicines` | `medicine:read` |  |  | 11.17 | List medicines |
| POST | `/app/medicines` | `medicine:create` | req |  | 11.19 | Add a medicine |
| GET | `/app/medicines/:medicine_id` | `medicine:read` |  |  | 11.20 | Get a medicine |
| PATCH | `/app/medicines/:medicine_id` | `medicine:update` |  |  | 11.21 | Change a medicine |
| DELETE | `/app/medicines/:medicine_id` | `medicine:delete` |  |  | 11.22 | Delete a medicine |
| POST | `/app/medicines/:medicine_id/restore` | `medicine:delete` | req |  | 11.23 | Restore a medicine |
| GET | `/app/medicines/exports` | `medicine:export` |  |  | 11.18 | Export medicines |
| POST | `/app/medicines/near-expiry-discount` | `medicine:update` | req |  | 11.24 | Set the near-expiry discount |
| GET | `/app/supplier-credits` | `medicine:read` |  |  | 11.14 | List supplier credits |
| GET | `/app/suppliers` | `medicine:read` |  |  | 11.7 | List suppliers |
| POST | `/app/suppliers` | `medicine:create` | req |  | 11.8 | Add a supplier |
| GET | `/app/suppliers/:supplier_id` | `medicine:read` |  |  | 11.9 | Get a supplier |
| PATCH | `/app/suppliers/:supplier_id` | `medicine:update` |  |  | 11.10 | Change a supplier |
| DELETE | `/app/suppliers/:supplier_id` | `medicine:delete` |  |  | 11.11 | Delete a supplier |
| GET | `/app/suppliers/:supplier_id/credits` | `medicine:read` |  |  | 11.57 | List a supplier's credits |
| POST | `/app/suppliers/:supplier_id/credits` | `medicine:update` | req |  | 11.15 | Return stock to a supplier |
| GET | `/app/suppliers/:supplier_id/credits/:supplier_credit_id` | `medicine:read` |  |  | 11.16 | Get a supplier credit |
| DELETE | `/app/suppliers/:supplier_id/credits/:supplier_credit_id` | `medicine:delete` |  |  | 11.54 | Void a supplier credit |
| POST | `/app/suppliers/:supplier_id/credits/:supplier_credit_id/restore` | `medicine:delete` | req |  | 11.55 | Undo a supplier credit void |
| POST | `/app/suppliers/:supplier_id/payments` | `payment:create` | req |  | 11.13 | Pay a supplier |
| POST | `/app/suppliers/:supplier_id/restore` | `medicine:delete` | req |  | 11.12 | Restore a supplier |

### Files

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/uploads` | signed in | req |  |  | Request pre-signed upload URL |
| GET | `/uploads/:upload_id` | signed in |  |  |  | Get upload metadata |
| DELETE | `/uploads/:upload_id` | signed in |  |  |  | Delete upload |
| POST | `/uploads/:upload_id/confirm` | signed in |  |  |  | Confirm uploaded object |

### Notifications and webhooks

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/notify/notifications` | signed in |  |  |  | List my notifications |
| GET | `/notify/notifications/:notification_id` | signed in |  |  |  | Get notification |
| DELETE | `/notify/notifications/:notification_id` | signed in |  |  |  | Delete notification |
| PATCH | `/notify/notifications/:notification_id/read` | signed in |  |  |  | Mark notification as read |
| POST | `/notify/notifications/mark-all-read` | signed in |  |  |  | Mark all notifications as read |
| GET | `/notify/notifications/unread-count` | signed in |  |  |  | Get unread notification count |
| GET | `/notify/webhook-events` | `webhook:read` |  |  |  | List dispatchable webhook event types |
| GET | `/notify/webhooks` | `webhook:read` |  |  |  | List webhooks |
| POST | `/notify/webhooks` | `webhook:manage` | req |  |  | Create webhook |
| GET | `/notify/webhooks/:webhook_id` | `webhook:read` |  |  |  | Get webhook |
| PATCH | `/notify/webhooks/:webhook_id` | `webhook:manage` |  |  |  | Update webhook |
| DELETE | `/notify/webhooks/:webhook_id` | `webhook:manage` |  |  |  | Delete webhook |
| GET | `/notify/webhooks/:webhook_id/delivery-attempts` | `webhook:read` |  |  |  | List webhook delivery attempts |
| POST | `/notify/webhooks/:webhook_id/test` | `webhook:manage` |  |  |  | Send test webhook |

### Subscription billing (the platform)

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/billing/invoices` | `subscription:read` |  |  |  | List billing invoices |
| GET | `/billing/payment-methods` | `subscription:read` |  |  |  | List payment methods |
| POST | `/billing/payment-methods/setup` | `subscription:manage` | req | team |  | Create payment method setup |
| GET | `/billing/plans` | public |  |  |  | List available plans |
| GET | `/billing/plans/:plan_id` | public |  |  |  | Get plan details |
| GET | `/billing/subscriptions` | `subscription:read` |  |  |  | List subscriptions |
| POST | `/billing/subscriptions` | `subscription:manage` | req | team |  | Create subscription |
| GET | `/billing/subscriptions/:subscription_id` | `subscription:read` |  |  |  | Get subscription |
| POST | `/billing/subscriptions/:subscription_id/cancel` | `subscription:manage` | req | team |  | Cancel subscription |
| POST | `/billing/subscriptions/:subscription_id/change-plan` | `subscription:manage` | req | team |  | Change subscription plan |
| GET | `/billing/subscriptions/:subscription_id/payment-setup` | `subscription:read` |  |  |  | Get payment setup for incomplete subscription |
| POST | `/billing/subscriptions/:subscription_id/resume` | `subscription:manage` | req | team |  | Resume cancelled subscription |
| POST | `/billing/webhook` | public |  |  |  | Stripe webhook receiver |

### Platform administration and operations

| Method | Path | Gate | Idem | Team | # | What it does |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/audit/logs` | platform admin |  |  |  | List audit logs (admin) |
| GET | `/mcp` | platform admin |  |  |  | MCP streamable HTTP (GET) |
| POST | `/mcp` | platform admin |  |  |  | MCP streamable HTTP (POST) |
| GET | `/users` | platform admin |  |  |  | List all users (admin) |
| GET | `/users/:user_id` | platform admin |  |  |  | Get user by ID (admin) |
| PATCH | `/users/:user_id` | platform admin |  |  |  | Update user (admin) |
| DELETE | `/users/:user_id` | platform admin |  |  |  | Delete user (admin) |
| POST | `/users/:user_id/suspend` | platform admin |  |  |  | Suspend user (admin) |
| POST | `/users/:user_id/unsuspend` | platform admin |  |  |  | Unsuspend user (admin) |
| GET | `/internal/ops/circuit-breakers` | token (metrics) |  |  |  | List the outbound circuit breakers (operations only) |
| POST | `/internal/ops/circuit-breakers/:circuit_name/reset` | token (ops-admin) |  |  |  | Reset one circuit breaker (operations only) |
| GET | `/livez` | public |  |  |  | Liveness probe |
| GET | `/readyz` | public |  |  |  | Readiness probe |
| GET | `/metrics` | token (metrics) |  |  |  | Prometheus metrics (operations only) |

<!-- GENERATED:END -->

## 4. In the design, dropped — remove from the frontend

What the design drop (or its prototype) has and the backend decided not to build. Nothing in the API
serves these, so the screens should lose them. The decision ids point into [`routes-final.md`](routes-final.md)
(letter + number, by sub-domain) and [`decisions.md`](decisions.md) (`D…`).

| # | Design feature | Where in the design | Decision | In the frontend |
| --- | --- | --- | --- | --- |
| 1 | ⌘K results for appointments and invoices | `commandSearch` (Patient, Lead, Appointment, Invoice) | P8 — the global search goes; one person search | ⌘K searches people (`GET /app/contacts?q=`); appointments and invoices are found in their own lists |
| 2 | A separate patient timeline | patient file overview | P8, M10 — the contact's activity is the timeline, with `system` entries from every module | show the contact's activity instead |
| 3 | Patient notes (`PatientNote`, `addNote`, `listNotes`) | patient file | P20 — `app.patient_notes` and its routes dropped | a team note is a `note` in the contact's activity |
| 4 | Per-member unread markers on lead chats ("mark as read") | leads list and drawer | M3, L10 — no read markers | show **awaiting reply** (`is_awaiting_reply`; the contact's last received is newer than its last sent) |
| 5 | A "convert to patient" action on a lead | leads | L8 — conversion is automatic | none; a check-in opens the patient file and moves the open lead to `clinic_visited` |
| 6 | Contact-thread leads (`isContactThread`, kind `contact_thread`) | `listLeads` excludes them | L5 — gone; an appointment points at a contact | drop the kind and the filter |
| 7 | "Not a patient yet → Create patient record" at check-in | PRD flow 1, step 4 | A14, L8 — the check-in creates the file itself | drop the step |
| 8 | SMS and email channels | enum `channel` (`sms`, `email`) | M2, D33 — WhatsApp and Instagram send; calls and notes are logged | channels are `whatsapp`, `instagram`, `call_log`, `note` (`system` is the server's) |
| 9 | A contact's language preference | contact / patient fields | CT14, P2 — `language` goes; preferences become tags | drop the field; preferences are `preference_tags` |
| 10 | An offering's default doctor and default room | offering drawer (`defaultDoctorId`, `room`) | O6 — an offering links only to its group, branches and offers | drop both fields |
| 11 | The "Bill below the offer price" switch | Users › Roles special permissions | O16 — anyone who bills may go below the offer price, down to `min_price`; nobody below it | drop the switch; `400 below_lowest_price` is the only floor |
| 12 | The other special-permission switches — "Change prices & offers", "Close the day", "Reverse settled payments", "Give refunds & credit notes", "Void sales & delete invoices", "See every branch", "Read clinical notes", "Export lists", "Change roles & access" | Users › Roles | O2, B2, MD2 and each module's code set — folded into per-resource codes | edit a role's codes (`GET /tenancy/permissions`, `PUT …/roles/:role_id/permissions`); "See the lowest price" stays, as `offering:lower_price:read` |
| 13 | The fixed list of 9 roles and the role × section matrix | `RolePermission`, enum `role` | D5, D10 — Owner plus eight editable roles, several per member, custom roles | the roles screen lists the organization's roles and their codes |
| 14 | An admin setting a staff member's password | user drawer (`password` on create, reset) | D4 — an invitation by email | drop the password fields; "New user" sends the invitation |
| 15 | Signing out a member set Inactive | users.md | standing deviation — refused at once in that organization; their sessions stay (they may belong to other organizations) | no forced sign-out; a `403` in that organization |
| 16 | "Mark as checked" on a payment | Payments ledger | B22 — the design neither stores it nor needs it to close | drop the action |
| 17 | A configured default float for the day | DayClose `default_float` | B25 — the opening cash is carried from the last close, or recounted | drop the setting; offer carried or recount |
| 18 | An editable "paid" amount on a stock purchase | clinic-stock purchase drawer | S11, D73 — supplier-bill payments that point at the purchase pay it | "Paid" records a payment (it takes the paying branch) |
| 19 | Setting a medical order's `paid` stage by hand | medical purchases | MD15, MD7 — `ordered` → `received`; paid through supplier payments | drop the stage switch; show `payment_status` |
| 20 | Completing a visit spends a package session | PRD.md:46 | TR7, TR13 — a session is spent by the treatment recorded for it (or billed after it) | record the treatment; reversing it gives the session back |
| 21 | "Let Clinozy handle" on any rule | tasks.md | TK10 — only `confirm`, `payment_due`, `feedback` (a WhatsApp message) and `gone_quiet` (a re-target lead), when the task falls due | show the switch only where `can_be_automatic` |
| 22 | Seven task kinds and 17 rule keys (incl. `onboarding`) | enum `task_kind`, tasks.md | TK6 — kinds `rule` · `follow_up` · `manual`; 14 rule keys plus `medical_rep_visit` | use the API's kinds and rule keys |
| 23 | AI drafts — reply drafts, conversation summaries, dictated notes, aftercare drafts, owner questions | prototype notes (Clinozy.dc.html:2371–2376) | D44 — none at launch; only the ideas from history | remove them |
| 24 | Trial import → reconcile → go-live | prototype blueprint (Clinozy.dc.html:2322) | D40 — no legacy import | remove it |
| 25 | A "Verify your email" banner | PRD nice-to-have | D40 / A31 — the platform already verifies email | remove it from the clinic screens |
| 26 | Server-made PDFs and a share action for Rx, invoice and photos | patient-file.md:400 | standing deviation — no PDF rendering and no share route | print in the browser; share is one WhatsApp message with the files as `attachment_keys` (`…/activities/send-message`) |
| 27 | A photo hidden until its location data is cleaned | today.md:262 | standing deviation — location is removed before the photo is filed | no "processing" state |

Built differently but not dropped — prescriptions are drafts until approved, deletes restore for 7 days,
offers pause with `is_active`, and the other field-level changes — are in [`AS-BUILT.md` › Standing
deviations](../AS-BUILT.md#standing-deviations).
