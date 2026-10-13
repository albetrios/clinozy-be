# schema-routes.md — Clinozy

Scope: every screen in `Clinozy.dc.html` (Today, Leads, Appointments, Patients, Patient file, Medical, Clinic stock, Payments, Tasks, Offerings, Users) plus sign-in and splash.
Conventions used throughout:
- **Money** = `number (int, ≥0)` in **paise** (INR minor unit, 1 ₹ = 100). Currency is always `INR` (single-currency clinic). Signed amounts only where stated.
- **Phone** = `string`, E.164, pattern `^\+91[6-9]\d{9}$`, stored `"+919825044120"`, shown `"+91 98250 44120"`.
- **Timestamps** = `string (ISO 8601 UTC datetime)`. **Calendar dates** (DOB, appointment day, expiry) = `string`, pattern `YYYY-MM-DD`, clinic-local (Asia/Kolkata). **Clock times** = `string`, pattern `HH:mm`, 24h, clinic-local.
- Every entity carries `organizationId`, `createdAt`, `updatedAt`, `createdBy` (server-set) — listed once in **Entity: _Common** and not repeated.
- **Drawers:** the design renders every create / show / edit as a right-side drawer. In the Route map these are `dialog-over:<route>` (the drawer is the dialog shape). Delete has no URL; it opens a confirm drawer (reason required) — the convention's "inline confirm" slot.
- IDs: numeric display ids in the design (`#2841`, `PT-0412`, `PAY-5512`) are **`number (int, ≥0)` per-organization sequences** (`seq`) shown with a prefix; the primary key is `string (uuid)`.

---

# Route map

| Route (full path) | Screen | Kind | Parent layout | Access | Params | Notes |
| ----------------- | ------ | ---- | ------------- | ------ | ------ | ----- |
| `/login` | Sign in | page | auth shell | public | n/a | Signed-out state in the design ("Signed out" dialog + sign-in) |
| `/` | — | redirect | n/a | authenticated | n/a | → `/organization/:organizationSlug/<role home>` of the last-used org |
| `/organization/:organizationSlug` | — | redirect | app shell | member of org | `:organizationSlug → Organization.slug` | → role home (see below). Splash plays on first load of this layout |
| `/organization/:organizationSlug/today` | Today | page | app shell | any role | `:organizationSlug` | Query `?branch=<id,…>` (header branch picker, multi) |
| `/organization/:organizationSlug/leads` | Leads list | page | app shell | Front desk, Counsellor, Marketing, Admin, Owner | `:organizationSlug` | Query: `q`, `status`, `source`, `interest`, `owner`, `created`, `followUp`, `sort` |
| `/organization/:organizationSlug/leads/create` | New lead drawer | dialog-over:`/leads` | app shell | leads.create | — | Query `?name=&phone=` prefill (from ⌘K / contact card "+ Lead") |
| `/organization/:organizationSlug/leads/:leadId` | Lead drawer (detail + chat) | dialog-over:`/leads` | app shell | leads.view | `:leadId → Lead.id` | Same drawer is the edit surface (draft + Save) |
| `/organization/:organizationSlug/leads/:leadId/edit` | Lead drawer | redirect | app shell | leads.edit | `:leadId → Lead.id` | → `/leads/:leadId` (show and edit are one drawer) |
| `/organization/:organizationSlug/appointments` | Appointments (day / week / list) | page | app shell | Front desk, Doctor, Therapist, Counsellor, Admin, Owner | — | Query `view=day\|week\|list` (default `day`), `date=YYYY-MM-DD` (default today), `doctor`, `status`, `type`, `created`, `followUp` |
| `/organization/:organizationSlug/appointments/create` | Appointment form (create) | dialog-over:`/appointments` | app shell | appointments.create | — | Query `?date=&time=&doctor=&who=<patientId\|leadId>&copyOf=<appointmentId>` |
| `/organization/:organizationSlug/appointments/:appointmentId` | Appointment form (edit mode, status strip) | dialog-over:`/appointments` | app shell | appointments.view | `:appointmentId → Appointment.id` | Show = edit form |
| `/organization/:organizationSlug/appointments/:appointmentId/edit` | — | redirect | app shell | appointments.edit | `:appointmentId` | → `/appointments/:appointmentId` |
| `/organization/:organizationSlug/patients` | Patients list | page | app shell | any clinical/desk role | — | Query `view=all\|today\|dues\|follow`, `q`, `type`, `status`, `created`, `followUp`, `sort` |
| `/organization/:organizationSlug/patients/create` | New patient drawer | dialog-over:`/patients` | app shell | patients.create | — | Query `?name=&phone=&fromLead=<leadId>` |
| `/organization/:organizationSlug/patients/:patientId` | Patient file | redirect | app shell | patients.view | `:patientId → Patient.id` | → `/patients/:patientId/overview` |
| `/organization/:organizationSlug/patients/:patientId/:section` | Patient file (section tab) | page | app shell | patients.view (+ billing.view for billing sections) | `:section ∈ enum: patient_file_section` | Unknown section → `overview` |
| `/organization/:organizationSlug/patients/:patientId/edit` | Edit patient drawer | dialog-over:`/patients/:patientId/overview` | app shell | patients.edit | `:patientId` | |
| `/organization/:organizationSlug/patients/:patientId/prescriptions/create` | Prescription drawer (1040) | dialog-over:`/patients/:patientId/prescriptions` | app shell | Doctor, Admin | `:patientId` | |
| `/organization/:organizationSlug/patients/:patientId/prescriptions/:prescriptionId` | Prescription viewer | dialog-over:`/patients/:patientId/prescriptions` | app shell | patients.view | `:prescriptionId → Prescription.id` | Print from here |
| `/organization/:organizationSlug/patients/:patientId/prescriptions/:prescriptionId/edit` | Prescription drawer | dialog-over:`/patients/:patientId/prescriptions` | app shell | Doctor, Admin | `:prescriptionId` | |
| `/organization/:organizationSlug/patients/:patientId/treatments/create` | Treatment drawer | dialog-over:`/patients/:patientId/treatments` | app shell | Doctor, Therapist | `:patientId` | |
| `/organization/:organizationSlug/patients/:patientId/treatments/:treatmentId/edit` | Treatment drawer | dialog-over:`/patients/:patientId/treatments` | app shell | Doctor, Therapist | `:treatmentId → Treatment.id` | Show = edit |
| `/organization/:organizationSlug/patients/:patientId/images/:imageId` | Full-screen photo viewer | dialog-over:`/patients/:patientId/images` | full-bleed overlay | patients.view (Private album: Doctor, Admin) | `:imageId → PatientImage.id` | |
| `/organization/:organizationSlug/patients/:patientId/images/:imageId/edit` | Photo details drawer | dialog-over:`/patients/:patientId/images` | app shell | patients.edit | `:imageId` | |
| `/organization/:organizationSlug/patients/:patientId/reports/create` | Report drawer | dialog-over:`/patients/:patientId/reports` | app shell | patients.edit | `:patientId` | |
| `/organization/:organizationSlug/patients/:patientId/reports/:reportId` | Report viewer | dialog-over:`/patients/:patientId/reports` | app shell | patients.view | `:reportId → PatientReport.id` | |
| `/organization/:organizationSlug/patients/:patientId/check-ins/create` | Check-in drawer (ckNew, 3 steps) | dialog-over:`/patients/:patientId/overview` | app shell | patients.edit | `:patientId` | Query `?appointment=&treatment=` |
| `/organization/:organizationSlug/patients/:patientId/check-ins/:checkInId/edit` | Check-in drawer | dialog-over:`/patients/:patientId/overview` | app shell | patients.edit | `:checkInId → CheckIn.id` | |
| `/organization/:organizationSlug/patients/:patientId/reviews/create` | Review drawer (rvNew) | dialog-over:`/patients/:patientId/overview` | app shell | patients.edit | `:patientId` | Query `?source=<review_source>&appointment=` |
| `/organization/:organizationSlug/patients/:patientId/reviews/:reviewId/edit` | Review drawer | dialog-over:`/patients/:patientId/overview` | app shell | patients.edit | `:reviewId → Review.id` | |
| `/organization/:organizationSlug/medical` | — | redirect | app shell | Pharmacist, Accountant, Admin, Owner | — | → `/medical/sales` |
| `/organization/:organizationSlug/medical/sales` | Medical › Sales | page | app shell | medical.view | — | Query `status=all\|unpaid\|returned`, `q`, `created` |
| `/organization/:organizationSlug/medical/sales/create` | Invoice drawer (type Medical, "New sale") | dialog-over:`/medical/sales` | app shell | medical.create | — | Query `?prescription=<prescriptionId>&customer=` |
| `/organization/:organizationSlug/medical/sales/:saleId` | Sale view drawer (read-only) | dialog-over:`/medical/sales` | app shell | medical.view | `:saleId → MedicalSale.id` | Sales are never edited |
| `/organization/:organizationSlug/medical/sales/:saleId/return` | Return medicines drawer | dialog-over:`/medical/sales` | app shell | medical.edit | `:saleId` | |
| `/organization/:organizationSlug/medical/medicines` | Medical › Medicines (stock) | page | app shell | medical.view | — | Query `stock=all\|low`, `expiry=any\|30\|60\|90`, `manufacturer`, `q` |
| `/organization/:organizationSlug/medical/medicines/create` | Medicine drawer | dialog-over:`/medical/medicines` | app shell | medical.create | — | `?name=` prefill |
| `/organization/:organizationSlug/medical/medicines/:medicineId/edit` | Medicine drawer | dialog-over:`/medical/medicines` | app shell | medical.edit | `:medicineId → Medicine.id` | Row click opens this |
| `/organization/:organizationSlug/medical/purchases` | Medical › Purchases | page | app shell | medical.view | — | Query `stage`, `supplier`, `q`, `created` |
| `/organization/:organizationSlug/medical/purchases/create` | PO drawer (840) | dialog-over:`/medical/purchases` | app shell | medical.create | — | `?supplier=` |
| `/organization/:organizationSlug/medical/purchases/:purchaseOrderId` | PO view (read-only when Received/Paid) | dialog-over:`/medical/purchases` | app shell | medical.view | `:purchaseOrderId → MedicalPurchaseOrder.id` | |
| `/organization/:organizationSlug/medical/purchases/:purchaseOrderId/edit` | PO drawer | dialog-over:`/medical/purchases` | app shell | medical.edit | `:purchaseOrderId` | Only while stage = ordered; else redirect → show |
| `/organization/:organizationSlug/medical/purchases/:purchaseOrderId/receive` | "Tick what arrived" drawer | dialog-over:`/medical/purchases` | app shell | medical.edit | `:purchaseOrderId` | |
| `/organization/:organizationSlug/medical/suppliers` | Medical › Suppliers | page | app shell | medical.view | — | `q` |
| `/organization/:organizationSlug/medical/suppliers/create` | Supplier drawer | dialog-over:`/medical/suppliers` | app shell | medical.create | — | |
| `/organization/:organizationSlug/medical/suppliers/:supplierId/edit` | Supplier drawer (+ Account) | dialog-over:`/medical/suppliers` | app shell | medical.edit | `:supplierId → Supplier.id` | |
| `/organization/:organizationSlug/medical/manufacturers` | Medical › Manufacturers | page | app shell | medical.view | — | `q` |
| `/organization/:organizationSlug/medical/manufacturers/create` | Manufacturer drawer | dialog-over:`/medical/manufacturers` | app shell | medical.create | — | |
| `/organization/:organizationSlug/medical/manufacturers/:manufacturerId/edit` | Manufacturer drawer | dialog-over:`/medical/manufacturers` | app shell | medical.edit | `:manufacturerId → Manufacturer.id` | |
| `/organization/:organizationSlug/medical/mrs` | Medical › MRs | page | app shell | medical.view | — | `q` |
| `/organization/:organizationSlug/medical/mrs/create` | MR drawer | dialog-over:`/medical/mrs` | app shell | medical.create | — | |
| `/organization/:organizationSlug/medical/mrs/:mrId/edit` | MR drawer | dialog-over:`/medical/mrs` | app shell | medical.edit | `:mrId → MedicalRep.id` | |
| `/organization/:organizationSlug/medical/mrs/:mrId/visits/create` | "Log MR visit" drawer (560) | dialog-over:`/medical/mrs` | app shell | medical.edit | `:mrId` | |
| `/organization/:organizationSlug/medical/payments` | Medical › Payments (ledger filtered to Medical) | page | app shell | medical.view + billing.view | — | Same query as `/payments` with `scope=medical` fixed |
| `/organization/:organizationSlug/stock` | — | redirect | app shell | Therapist, Front desk, Admin, Owner | — | → `/stock/items` |
| `/organization/:organizationSlug/stock/items` | Clinic stock › Items | page | app shell | stock.view | — | `category`, `q` |
| `/organization/:organizationSlug/stock/items/create` | Item drawer | dialog-over:`/stock/items` | app shell | stock.create | — | |
| `/organization/:organizationSlug/stock/items/:itemId/edit` | Item drawer | dialog-over:`/stock/items` | app shell | stock.edit | `:itemId → StockItem.id` | "Use" is a popover (no URL) |
| `/organization/:organizationSlug/stock/items/check` | Stock check drawer (840) | dialog-over:`/stock/items` | app shell | stock.edit | — | |
| `/organization/:organizationSlug/stock/movements` | Clinic stock › Movements | page | app shell | stock.view | — | `type`, `item`, `created` |
| `/organization/:organizationSlug/stock/purchases` | Clinic stock › Purchases | page | app shell | stock.view | — | `vendor`, `created` |
| `/organization/:organizationSlug/stock/purchases/create` | Purchase drawer (840) | dialog-over:`/stock/purchases` | app shell | stock.create | — | `?reorder=low` preset |
| `/organization/:organizationSlug/stock/purchases/:purchaseId/edit` | Purchase drawer | dialog-over:`/stock/purchases` | app shell | stock.edit | `:purchaseId → StockPurchase.id` | |
| `/organization/:organizationSlug/stock/vendors` | Clinic stock › Vendors | page | app shell | stock.view | — | `q` |
| `/organization/:organizationSlug/stock/vendors/create` | Clinic vendor drawer | dialog-over:`/stock/vendors` | app shell | stock.create | — | |
| `/organization/:organizationSlug/stock/vendors/:vendorId/edit` | Clinic vendor drawer | dialog-over:`/stock/vendors` | app shell | stock.edit | `:vendorId → StockVendor.id` | |
| `/organization/:organizationSlug/payments` | Payments (ledger) | page | app shell | Front desk, Accountant, Admin, Owner | — | Query `direction`, `mode`, `created`, `followUp`, `q`, `sort` |
| `/organization/:organizationSlug/payments/receive` | Receive payment drawer (560) | dialog-over:`/payments` | app shell | billing.create | — | `?patient=&invoice=` |
| `/organization/:organizationSlug/payments/pay` | Pay / expense drawer | dialog-over:`/payments` | app shell | billing.create | — | `?bill=<md\|is>:<poId>` |
| `/organization/:organizationSlug/payments/:paymentId/edit` | Receive or Pay drawer (edit) | dialog-over:`/payments` | app shell | billing.edit | `:paymentId → Payment.id` | Only while its day is not closed |
| `/organization/:organizationSlug/payments/pending` | Payments › Pending (credits) | page | app shell | billing.view | — | `direction`, `status` |
| `/organization/:organizationSlug/payments/pending/create` | Pending credit drawer (crNew) | dialog-over:`/payments/pending` | app shell | billing.create | — | `?direction=give\|take` |
| `/organization/:organizationSlug/payments/pending/:creditId/edit` | Pending credit drawer | dialog-over:`/payments/pending` | app shell | billing.edit | `:creditId → PendingCredit.id` | Only while status = open |
| `/organization/:organizationSlug/payments/day-close` | Day close drawer (1040) | dialog-over:`/payments` | app shell | Accountant, Admin, Owner | — | `?date=YYYY-MM-DD` (default today), `?branch=` |
| `/organization/:organizationSlug/invoices/create` | Invoice drawer | dialog-over:`<referrer>` (default `/payments`) | app shell | billing.create | — | `?type=clinic\|consultation\|medical&patient=` |
| `/organization/:organizationSlug/invoices/:invoiceId` | Invoice preview (Print) | dialog-over:`<referrer>` | app shell | billing.view | `:invoiceId → Invoice.id` | |
| `/organization/:organizationSlug/invoices/:invoiceId/edit` | Invoice drawer | dialog-over:`<referrer>` | app shell | billing.edit | `:invoiceId` | |
| `/organization/:organizationSlug/tasks` | Tasks | page | app shell | any role (Owner/Admin: all owners) | — | `tab=queue\|snoozed\|done` (default `queue`) |
| `/organization/:organizationSlug/tasks/create` | Task drawer | dialog-over:`/tasks` | app shell | tasks.create | — | |
| `/organization/:organizationSlug/tasks/:taskId` | Task drawer (+ activity) | dialog-over:`/tasks` | app shell | tasks.view | `:taskId → Task.id` | Show = edit |
| `/organization/:organizationSlug/offerings` | Offerings | page | app shell | Admin, Owner, Counsellor | — | `category`, `specialty`, `q` |
| `/organization/:organizationSlug/offerings/create` | Offering drawer | dialog-over:`/offerings` | app shell | offerings.create | — | `?name=` |
| `/organization/:organizationSlug/offerings/:offeringId/edit` | Offering drawer | dialog-over:`/offerings` | app shell | offerings.edit | `:offeringId → Offering.id` | |
| `/organization/:organizationSlug/offerings/offers` | Offerings › Offers | page | app shell | offerings.view | — | `status` (derived: live / scheduled / ended / paused) |
| `/organization/:organizationSlug/offerings/offers/create` | Offer drawer | dialog-over:`/offerings/offers` | app shell | offerings.create | — | |
| `/organization/:organizationSlug/offerings/offers/:offerId/edit` | Offer drawer | dialog-over:`/offerings/offers` | app shell | offerings.edit | `:offerId → Offer.id` | |
| `/organization/:organizationSlug/users` | Users › Team | page | app shell | Admin, Owner | — | `role`, `branch`, `q` |
| `/organization/:organizationSlug/users/create` | User drawer | dialog-over:`/users` | app shell | Admin, Owner | — | |
| `/organization/:organizationSlug/users/:userId/edit` | User drawer | dialog-over:`/users` | app shell | Admin, Owner | `:userId → User.id` | |
| `/organization/:organizationSlug/users/roles` | Users › Roles & access | page | app shell | Admin, Owner | — | |
| `/organization/:organizationSlug/users/branches` | Users › Branches | page | app shell | Admin, Owner | — | |
| `/organization/:organizationSlug/users/branches/create` | Branch drawer | dialog-over:`/users/branches` | app shell | Admin, Owner | — | |
| `/organization/:organizationSlug/users/branches/:branchId/edit` | Branch drawer | dialog-over:`/users/branches` | app shell | Admin, Owner | `:branchId → Branch.id` | |

Not URL-addressable (popovers, no route): ⌘K command menu, All sections list, branch picker, contact hover card, filters, dropdowns, stock "Use" popover, Browse catalog popover, delete confirm drawer, toasts.

- **Default route after sign-in:** role home — Front desk / Doctor / Therapist / Counsellor / Owner / Admin → `/organization/:organizationSlug/today`; Pharmacist → `/medical/sales`; Accountant → `/payments`; Marketing → `/leads`.
- **Not-found behaviour:** unknown org slug → `/` (org picker = first org of the user); unknown path inside an org → role home + toast "Page not found"; unknown record id in a dialog route → the parent list renders, drawer does not open, toast "<Record> not found · it may have been deleted".
- **Deep-link rules:** every `dialog-over` route is addressable; a direct hit renders the parent route listed in Kind behind it, then opens the drawer. Stacked child drawers (e.g. "New supplier" from inside a PO) are **not** URL-addressable — the URL stays on the parent drawer. `<referrer>` for invoices = the route the user came from; direct hit → `/payments`.

---

# Entities

## Entity: _Common

Fields present on every entity below (not repeated per table).

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| organizationId | string (uuid) | yes | no | — | FK Organization | yes | from route slug |
| createdAt | string (ISO 8601 UTC datetime) | yes | no | now | — | yes | "Created" filter reads this |
| updatedAt | string (ISO 8601 UTC datetime) | yes | no | now | — | yes | "Updated" column |
| createdById | string (uuid) | yes | no | current user | FK User | yes | "by" avatar |
| deletedAt | string (ISO 8601 UTC datetime) \| null | no | yes | null | — | yes | soft delete (Undo toast restores within 10 s) |
| deleteReason | enum: delete_reason \| null | no | yes | null | required when deletedAt set | no | from confirm drawer |
| deleteNote | string \| null | no | yes | null | 0–280 chars, trimmed; required when reason = other | no | |

Derived/display-only values (never stored): n/a — common audit fields only.

## Entity: Organization

The clinic business (tenant). Read by every screen (header, print letterhead); written by Users › Branches (settings).

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| slug | string | yes | no | — | 3–48 chars, `^[a-z0-9-]+$`, unique | no | `:organizationSlug` |
| name | string | yes | no | — | 1–120 chars, trimmed | no | "Cresence Skin" |
| specialties | array<enum: offering_specialty> (max 6) | yes | no | ["skin"] | ≥1 | no | |
| timezone | string | yes | no | "Asia/Kolkata" | IANA tz | no | |
| currency | string | yes | no | "INR" | fixed "INR" | yes | |
| saveFailureSimulation | n/a | — | — | — | — | — | n/a — prototype-only behaviour, not a field |

Derived/display-only values (never stored): n/a.

## Entity: Branch

A clinic location. Read by header branch picker, every drawer's Branch field, print sheets; written by Users › Branches.

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| name | string | yes | no | — | 1–60 chars, unique per org | no | "Adajan" |
| tone | enum: tone | yes | no | "sage" | — | no | branch chip colour |
| isMain | boolean | yes | no | false | exactly one true per org | no | |
| addressLine1 | string | yes | no | — | 1–120 chars | no | |
| addressLine2 | string \| null | no | yes | null | 0–120 chars | no | |
| area | string | yes | no | — | 1–60 chars | no | |
| city | string | yes | no | — | 1–60 chars | no | |
| state | string | yes | no | "Gujarat" | 1–60 chars | no | |
| pin | string | yes | no | — | `^\d{6}$` | no | |
| phone | string | yes | no | — | E.164 +91 | no | |
| email | string (email) | yes | no | — | ≤120 chars | no | |
| gstNumber | string \| null | no | yes | null | `^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$` | no | |
| opensAt | string | yes | no | "10:00" | HH:mm | no | |
| closesAt | string | yes | no | "20:00" | HH:mm, > opensAt | no | |
| workingDays | array<enum: weekday> (max 7) | yes | no | mon–sat | ≥1 | no | |
| defaultDoctorId | string (uuid) \| null | no | yes | null | FK User (role doctor) | no | |
| defaultDeskId | string (uuid) \| null | no | yes | null | FK User | no | |
| defaultTherapistId | string (uuid) \| null | no | yes | null | FK User | no | |
| defaultPharmacistId | string (uuid) \| null | no | yes | null | FK User | no | |
| active | boolean | yes | no | true | — | no | |

Derived/display-only values (never stored): staff count → count(User where branchIds ∋ id); branch picker hidden → count(active branches) = 1.

## Entity: User

A staff member who signs in. Read by every person picker, avatars, Tasks owner; written by Users › Team.

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| seq | number (int, ≥0) | yes | no | next | unique per org | yes | shown "#12" |
| firstName | string | yes | no | — | 1–60 chars, trimmed | no | UI takes one "Name" field and splits on first space |
| lastName | string \| null | no | yes | null | 0–60 chars | no | |
| initials | string | yes | no | from name | 2 chars, uppercase | yes | avatar "RS" |
| email | string (email) | yes | no | — | ≤120 chars, unique per org | no | sign-in id |
| phone | string \| null | no | yes | null | E.164 +91 | no | |
| password | string | on create | no | — | 8–72 chars; write-only | no | never returned |
| roles | array<enum: role> (max 7) | yes | no | — | ≥1 | no | "Front desk · Admin" |
| branchIds | array<string (uuid)> (max 20) | yes | no | — | ≥1, FK Branch | no | |
| tone | enum: tone | yes | no | "sky" | — | no | avatar tint |
| workingDays | array<enum: weekday> (max 7) | yes | no | mon–sat | — | no | |
| startsAt | string | yes | no | "10:00" | HH:mm | no | |
| endsAt | string | yes | no | "19:00" | HH:mm | no | |
| commissionPct | number (int, ≥0) | yes | no | 0 | 0–100 | no | |
| active | boolean | yes | no | true | — | no | |
| presence | enum: presence | yes | no | "online" | — | no | user menu Status |
| lastActiveAt | string (ISO 8601 UTC datetime) \| null | no | yes | null | — | yes | |

Derived/display-only values (never stored): "Online now" / "Replied yesterday" / "Viewed 25 Sep" → presence + lastActiveAt relative to now; short name "Dr. Reenal" → firstName (+ "Dr." kept if present).

## Entity: RolePermission

Access matrix row (role × section). Read by the All sections list, route guards and Users › Roles; written by Users › Roles.

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| role | enum: role | yes | no | — | unique with section | no | |
| section | enum: section | yes | no | — | — | no | |
| canView | boolean | yes | no | per role preset | — | no | |
| canCreate | boolean | yes | no | per role preset | requires canView | no | |
| canEdit | boolean | yes | no | per role preset | requires canView | no | |
| canDelete | boolean | yes | no | per role preset | requires canEdit | no | |

Derived/display-only values (never stored): effective permission of a user = OR across all their roles.

## Entity: UserPreference

Per-user UI state. Read on app load; written by header pin toggles, branch picker, Appearance, dropdown Recent.

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| userId | string (uuid) | yes | no | — | PK, FK User | yes | |
| pinnedSections | array<enum: section> (max 11) | yes | no | [appointments, leads, patients, payments] | order = nav order | no | |
| branchFilter | array<string (uuid)> (max 20) | yes | no | [] (= All branches) | FK Branch | no | |
| theme | enum: theme | yes | no | "light" | — | no | |
| patientFilePins | array<enum: patient_file_section> (max 11) | yes | no | [overview, prescriptions, treatments, images, invoices] | — | no | |
| recentPicks | array<string> (max 60) | yes | no | [] | entries `room:fieldLabel:value`, last 3 per key | no | prototype keeps this in localStorage `cz.ddRec` |

Derived/display-only values (never stored): n/a.

## Entity: Lead

An enquiry and its conversation until the person becomes a patient. Read by Leads, lead drawer, appointment form (connected leads), contact card; written by Leads, appointment check-in (status → clinic_visited), automations (re-target).

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| seq | number (int, ≥0) | yes | no | next | unique per org | yes | "#2371" |
| name | string | yes | no | — | 1–120 chars, trimmed | no | |
| phone | string | yes | no | — | E.164 +91 | no | |
| email | string (email) \| null | no | yes | null | ≤120 chars | no | |
| status | enum: lead_status \| null | no | yes | "new" | null only when isContactThread | no | |
| source | enum: lead_source \| null | no | yes | null | null only when isContactThread | no | |
| interests | array<enum: lead_interest> (max 6) | yes | no | [] | — | no | "Interested in" |
| ownerId | string (uuid) \| null | no | yes | null | FK User | no | "Assigned" |
| involvedIds | array<string (uuid)> (max 10) | yes | no | [] | FK User | no | "& involved" |
| followUpAt | string (ISO 8601 UTC datetime) \| null | no | yes | null | — | no | Follow-up date filter |
| branchId | string (uuid) \| null | no | yes | null | FK Branch | no | |
| patientId | string (uuid) \| null | no | yes | null | FK Patient | no | set when converted / re-target |
| isContactThread | boolean | yes | no | false | — | yes | true = hidden thread created by an appointment for a non-lead; excluded from every lead list, count and task rule |
| kind | enum: lead_kind | yes | no | "enquiry" | — | yes | |
| retargetReason | string \| null | no | yes | null | 0–160 chars | yes | "No visit for 148 days · LHR 3 of 6 sessions left" |
| notes | string \| null | no | yes | null | 0–2000 chars | no | |

Derived/display-only values (never stored): "Today 07:00" / "Yesterday" → createdAt relative; last message preview → latest LeadMessage.body; unread → messages after the viewer's last read.

## Entity: LeadMessage

One chat line in a lead / contact thread. Read by lead drawer chat, appointment form chat, Offering suggestions › Contact activity; written by lead drawer composer and system events.

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| leadId | string (uuid) | yes | no | — | FK Lead | no | |
| channel | enum: channel | yes | no | "whatsapp" | — | no | |
| direction | enum: message_direction | yes | no | "sent" | — | no | Sent / Got |
| body | string | yes | no | — | 1–1000 chars | no | composer maxLength 1000 |
| deliveryStatus | enum: delivery_status | yes | no | "queued" | — | yes | |
| isSystem | boolean | yes | no | false | — | yes | e.g. "Moved to Clinic visited at check-in" |
| authorId | string (uuid) \| null | no | yes | null | FK User; null for received / system | yes | |
| taskId | string (uuid) \| null | no | yes | null | FK Task | no | "✓ Counsellor to explain package" |
| sentAt | string (ISO 8601 UTC datetime) | yes | no | now | — | yes | |

Derived/display-only values (never stored): n/a.

## Entity: Patient

A registered patient. Read by Patients, Patient file, every patient picker, contact card, print sheets; written by New/Edit patient drawer.

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| seq | number (int, ≥0) | yes | no | next | unique per org | yes | shown "PT-0412" / "#3508" |
| firstName | string | yes | no | — | 1–60 chars, trimmed | no | |
| lastName | string \| null | no | yes | null | 0–60 chars | no | |
| phone | string | yes | no | — | E.164 +91 | no | "primary · WhatsApp" |
| phone2 | string \| null | no | yes | null | E.164 +91 | no | Secondary mobile |
| email | string (email) \| null | no | yes | null | ≤120 chars | no | |
| gender | enum: gender \| null | no | yes | null | — | no | |
| dateOfBirth | string \| null | no | yes | null | YYYY-MM-DD, not in future | no | |
| address | string \| null | no | yes | null | 0–240 chars | no | "Area, city" |
| homeBranchId | string (uuid) | yes | no | main branch | FK Branch | no | |
| types | array<enum: patient_type> (max 6) | yes | no | [] | — | no | |
| status | enum: patient_status | yes | no | "new" | — | no | |
| conversion | enum: patient_conversion | yes | no | "not_converted" | — | no | |
| referralSource | enum: referral_source \| null | no | yes | null | — | no | |
| referredByPatientId | string (uuid) \| null | no | yes | null | FK Patient; only when referralSource = patient | no | |
| consentGiven | boolean | yes | no | false | — | no | |
| doctorId | string (uuid) \| null | no | yes | null | FK User | no | usual doctor |
| followUpAt | string (ISO 8601 UTC datetime) \| null | no | yes | null | — | no | |
| notes | string \| null | no | yes | null | 0–2000 chars | no | "Anything the team should know" |
| complaints | string \| null | no | yes | null | 0–4000 chars | no | Clinical bento card |
| diagnosis | string \| null | no | yes | null | 0–4000 chars | no | |
| treatmentSuggestions | string \| null | no | yes | null | 0–4000 chars | no | |
| futureSuggestions | string \| null | no | yes | null | 0–4000 chars | no | |
| leadId | string (uuid) \| null | no | yes | null | FK Lead (origin) | no | |

Derived/display-only values (never stored): age → today − dateOfBirth (years); "In clinic today" view → has Appointment today with status checked_in; "With dues" → Σ invoice due > 0; "Since Sep 2024" → createdAt month; lastVisit → latest completed Appointment.date.

## Entity: Appointment

A booking of a person with a doctor. Read by Today, Appointments, patient file, Tasks; written by appointment form, status strip, Cancel visit, check-in.

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| seq | number (int, ≥0) | yes | no | next | unique per org | yes | "#2841" |
| patientId | string (uuid) \| null | no | yes | null | FK Patient; exactly one of patientId / leadId | no | |
| leadId | string (uuid) \| null | no | yes | null | FK Lead (incl. contact thread) | no | |
| branchId | string (uuid) | yes | no | user's branch | FK Branch | no | |
| type | enum: appointment_type | yes | no | "consultation" | — | no | |
| offeringId | string (uuid) \| null | no | yes | null | FK Offering | no | "Service" |
| serviceLabel | string | yes | no | from offering | 1–120 chars | no | free text when no offering |
| doctorId | string (uuid) | yes | no | patient.doctorId | FK User | no | |
| therapistId | string (uuid) \| null | no | yes | null | FK User | no | |
| room | enum: room \| null | no | yes | null | — | no | |
| date | string | yes | no | today | YYYY-MM-DD | no | |
| startTime | string | yes | no | — | HH:mm, inside branch hours | no | |
| durationMin | number (int, ≥0) | yes | no | type default | 5–240, step 5 | no | "Length" |
| status | enum: appointment_status | yes | no | "scheduled" | transitions per appointment_status | no | |
| cancelReason | enum: cancel_reason \| null | no | yes | null | required when status = cancelled | no | |
| cancelNote | string \| null | no | yes | null | 0–280 chars | no | |
| rescheduledFrom | string (ISO 8601 UTC datetime) \| null | no | yes | null | — | yes | "Rescheduled · was …" |
| reason | string \| null | no | yes | null | 0–160 chars | no | |
| notes | string \| null | no | yes | null | 0–2000 chars | no | |
| followUpAt | string (ISO 8601 UTC datetime) \| null | no | yes | null | — | no | |
| checkedInAt | string (ISO 8601 UTC datetime) \| null | no | yes | null | — | yes | |
| completedAt | string (ISO 8601 UTC datetime) \| null | no | yes | null | — | yes | |
| copiedFromId | string (uuid) \| null | no | yes | null | FK Appointment | yes | Copy action |

Derived/display-only values (never stored): end time → startTime + durationMin; "Plan ready · N offerings" → count(OfferingSuggestion where appointmentId = id or patient plan non-empty); "Plan pending" → none; floor stage on Today → status + open invoice/Rx; date locked → status ∈ {checked_in, completed}.

## Entity: Prescription

A doctor's Rx for a patient. Read by patient file, Rx viewer, print, Medical "Prescriptions to fill"; written by Prescription drawer.

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| seq | number (int, ≥0) | yes | no | next | — | yes | "#500" |
| patientId | string (uuid) | yes | no | — | FK Patient | no | |
| appointmentId | string (uuid) \| null | no | yes | null | FK Appointment | no | |
| doctorId | string (uuid) | yes | no | current user if doctor | FK User | no | |
| date | string | yes | no | today | YYYY-MM-DD | no | |
| items | array<PrescriptionItem> (max 30) | yes | no | [] | ≥1 on save ("Add a medicine") | no | embedded |
| advice | string \| null | no | yes | null | 0–2000 chars | no | "Advice for the patient" |
| labReport | string \| null | no | yes | null | 0–2000 chars | no | |
| procedureToday | string \| null | no | yes | null | 0–2000 chars | no | |
| followUpDate | string \| null | no | yes | null | YYYY-MM-DD | no | |

Derived/display-only values (never stored): filled → exists MedicalSale where prescriptionId = id.

## Entity: PrescriptionItem (embedded in Prescription.items)

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| medicineId | string (uuid) \| null | no | yes | null | FK Medicine; null = typed text not yet matched | no | unknown names auto-create a quick Medicine on save |
| medicineName | string | yes | no | — | 1–120 chars | no | |
| doseMorning | number (int, ≥0) | yes | no | 0 | 0–2 | no | Dose taps |
| doseAfternoon | number (int, ≥0) | yes | no | 0 | 0–2 | no | |
| doseNight | number (int, ≥0) | yes | no | 0 | 0–2 | no | |
| sos | boolean | yes | no | false | — | no | |
| meal | enum: rx_meal \| null | no | yes | null | — | no | Before / After |
| timing | enum: rx_timing \| null | no | yes | null | replaces meal pill when set | no | "⌄ more" |
| timingText | string \| null | no | yes | null | 0–40 chars | no | typed timing |
| bodyPart | enum: body_part \| null | no | yes | null | — | no | "Where" |
| bodyPartText | string \| null | no | yes | null | 0–40 chars | no | typed |
| qty | number (int, ≥0) | yes | no | 1 | 1–999 | no | |
| remarks | string \| null | no | yes | null | 0–200 chars | no | "N days" recomputes qty |

Derived/display-only values (never stored): dose string "1-0-1" → morning-afternoon-night; qty suggestion → days × (doses per day).

## Entity: Treatment

A procedure session record. Read by patient file Treatments, Tasks (aftercare calls); written by Treatment drawer.

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| patientId | string (uuid) | yes | no | — | FK Patient | no | |
| appointmentId | string (uuid) \| null | no | yes | null | FK Appointment | no | |
| offeringId | string (uuid) \| null | no | yes | null | FK Offering | no | |
| name | string | yes | no | — | 1–120 chars | no | "Chemical peel · session 1" |
| template | enum: treatment_template | yes | no | "skin" | — | no | |
| performedAt | string (ISO 8601 UTC datetime) | yes | no | now | — | no | |
| doctorId | string (uuid) \| null | no | yes | null | FK User | no | |
| therapistId | string (uuid) \| null | no | yes | null | FK User | no | |
| bodyParts | array<enum: body_part> (max 12) | yes | no | [] | — | no | |
| sessionNo | number (int, ≥0) | yes | no | 1 | 1–99 | no | |
| params | object | yes | no | {} | keys per template (type, skinType, machine, power, wavelength, BP, weight, findings…); each value string 0–80 chars | no | template-specific |
| remark | string \| null | no | yes | null | 0–2000 chars | no | Aftercare |
| aftercareCall | enum: aftercare_call | yes | no | "next_day" | — | no | |
| packageId | string (uuid) \| null | no | yes | null | FK PatientPackage | no | uses a session |

Derived/display-only values (never stored): Feedback column → latest CheckIn where treatmentId = id, else "Call next day"; aftercare due date → performedAt + aftercareCall offset.

## Entity: PatientImage

A clinical photo. Read by patient Images tab, appointment form Photos card, viewer; written by upload + Photo details drawer.

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| patientId | string (uuid) | yes | no | — | FK Patient | no | |
| appointmentId | string (uuid) \| null | no | yes | null | FK Appointment | no | "Visit" |
| album | enum: image_album | yes | no | "general" | — | no | |
| fileUrl | string | yes | no | — | https URL | yes | |
| fileName | string | yes | no | — | 1–120 chars | yes | "IMG_4974" |
| bodyPart | enum: body_part \| null | no | yes | null | — | no | |
| takenOn | string | yes | no | today | YYYY-MM-DD | no | |
| caption | string \| null | no | yes | null | 0–200 chars | no | |

Derived/display-only values (never stored): date group label "· 24 Sep · Hydrafacial" → takenOn + appointment.serviceLabel.

## Entity: PatientReport

Lab / scan / consent document. Read + written in patient file Reports.

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| patientId | string (uuid) | yes | no | — | FK Patient | no | |
| type | enum: report_type | yes | no | "lab" | — | no | |
| name | string | yes | no | — | 1–120 chars | no | |
| date | string | yes | no | today | YYYY-MM-DD | no | |
| files | array<string> (max 10) | yes | no | [] | https URLs; PDF/JPG/PNG ≤ 10 MB each | no | |
| notes | string \| null | no | yes | null | 0–1000 chars | no | |

Derived/display-only values (never stored): n/a.

## Entity: PatientPackage

A sold multi-session package. Read by patient file Packages, Offering suggestions (last purchases), Book; written by invoicing a package offering and by treatments using sessions.

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| patientId | string (uuid) | yes | no | — | FK Patient | no | |
| offeringId | string (uuid) | yes | no | — | FK Offering (category package) | no | |
| invoiceId | string (uuid) | yes | no | — | FK Invoice | yes | |
| sessionsTotal | number (int, ≥0) | yes | no | offering.sessions | 1–99 | yes | |
| sessionsUsed | number (int, ≥0) | yes | no | 0 | ≤ sessionsTotal | yes | |
| validUntil | string | yes | no | invoice date + offering.validityDays | YYYY-MM-DD | yes | |

Derived/display-only values (never stored): "n of m used" → sessionsUsed / sessionsTotal; next session → next Appointment linked to package.

## Entity: PatientNote

Timeline note on a patient. Read + written in patient file Notes.

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| patientId | string (uuid) | yes | no | — | FK Patient | no | |
| body | string | yes | no | — | 1–2000 chars | no | |

Derived/display-only values (never stored): n/a.

## Entity: OfferingSuggestion

One row of a patient's plan ("Offering suggestions"). Read by appointment form, patient file, Today plan flag, invoice presets; written by the card (add / status / qty / price / link) and by invoice save (planLink).

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| patientId | string (uuid) | yes | no | — | FK Patient | no | one plan per patient |
| offeringId | string (uuid) | yes | no | — | FK Offering | no | |
| qty | number (int, ≥0) | yes | no | 1 | 1–99 | no | |
| price | number (int, ≥0) \| null | no | yes | null | paise, line final; null = list price | no | red when < min × qty |
| status | enum: suggestion_status | yes | no | "planned" | — | no | |
| sourceLabel | string | yes | no | — | 1–80 chars | yes | "Appt #2790 · Consultation" / "Patient file" / "Counselling call" |
| appointmentId | string (uuid) \| null | no | yes | null | FK Appointment | no | |
| reason | string \| null | no | yes | null | 0–200 chars | no | "why" |
| suggestedById | string (uuid) | yes | no | current user | FK User | yes | |
| invoiceLinks | array<SuggestionInvoiceLink> (max 20) | yes | no | [] | {invoiceId: uuid FK Invoice, invoiceLineIndex: int ≥0, qty: int ≥1} | yes/no | auto on invoice save; manual "Link invoice" |

Derived/display-only values (never stored): invoiced qty → Σ invoiceLinks.qty; "✓ Invoiced" → invoiced qty ≥ qty; plan total → Σ (price ?? offering.price × qty) over status ∈ {planned, accepted}; "₹X invoiced" → Σ linked line amounts; Ideas from history → computed server-side from notes / complaints / visits (not stored).

## Entity: CheckIn

Visit / aftercare check-in feedback. Read by Feedback card, treatments table, Tasks; written by ckNew drawer and task outcome "Doing well".

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| patientId | string (uuid) | yes | no | — | FK Patient | no | |
| appointmentId | string (uuid) \| null | no | yes | null | FK Appointment | no | |
| treatmentId | string (uuid) \| null | no | yes | null | FK Treatment | no | |
| context | string | yes | no | — | 1–80 chars | no | "Day-2 call after LHR" |
| feel | enum: checkin_feel | yes | no | — | — | no | |
| score | number (int, ≥0) | yes | no | — | 1–10 | no | |
| followed | enum: checkin_followed \| null | no | yes | null | — | no | |
| followedNote | string \| null | no | yes | null | 0–280 chars | no | |
| now | string \| null | no | yes | null | 0–500 chars | no | "how it is now" |
| nextPlan | string \| null | no | yes | null | 0–500 chars | no | |
| nextOfferingIds | array<string (uuid)> (max 10) | yes | no | [] | FK Offering; each creates a planned OfferingSuggestion | no | |
| byId | string (uuid) | yes | no | current user | FK User | yes | |
| date | string | yes | no | today | YYYY-MM-DD | no | |

Derived/display-only values (never stored): trend ▲▼ → score − previous check-in score; needsAction → feel = worse OR score ≤ 4.

## Entity: Review

A public / internal review. Read by Feedback card, contact card About; written by rvNew drawer.

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| patientId | string (uuid) | yes | no | — | FK Patient | no | |
| appointmentId | string (uuid) \| null | no | yes | null | FK Appointment | no | |
| source | enum: review_source | yes | no | — | — | no | |
| rating | number (int, ≥0) \| null | no | yes | null | 1–5 | no | |
| text | string \| null | no | yes | null | 0–2000 chars | no | |
| link | string \| null | no | yes | null | https URL ≤ 500 chars | no | |
| files | array<string> (max 10) | yes | no | [] | https URLs | no | video / screenshot |
| date | string | yes | no | today | YYYY-MM-DD | no | |
| byId | string (uuid) | yes | no | current user | FK User | yes | |

Derived/display-only values (never stored): needsAction → rating ≤ 3.

## Entity: FeedbackAction

The follow-up logged against negative feedback. Read + written by the Feedback card "Log action ⌄".

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| checkInId | string (uuid) \| null | no | yes | null | FK CheckIn; exactly one of checkInId / reviewId | no | |
| reviewId | string (uuid) \| null | no | yes | null | FK Review | no | |
| action | enum: feedback_action | yes | no | — | — | no | |
| note | string \| null | no | yes | null | 0–280 chars; required when action = other | no | |
| byId | string (uuid) | yes | no | current user | FK User | yes | |

Derived/display-only values (never stored): n/a.

## Entity: Offering

A sellable service / package / product. Read by every service picker, invoices, plan card; written by Offerings.

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| seq | number (int, ≥0) | yes | no | next | — | yes | "#274" |
| name | string | yes | no | — | 1–120 chars, unique per org | no | "LHR Full Face" |
| category | enum: offering_category | yes | no | "treatment" | — | no | |
| specialty | enum: offering_specialty | yes | no | "skin" | — | no | |
| tone | enum: tone | yes | no | "sage" | — | no | |
| price | number (int, ≥0) | yes | no | — | paise | no | list price |
| minPrice | number (int, ≥0) | yes | no | 0 | paise, ≤ price | no | |
| durationMin | number (int, ≥0) | yes | no | 30 | 5–480 | no | |
| sessions | number (int, ≥0) | yes | no | 1 | 1–99 | no | |
| validityDays | number (int, ≥0) | yes | no | 0 | 0–1095; 0 = no expiry | no | packages |
| defaultDoctorId | string (uuid) \| null | no | yes | null | FK User | no | |
| room | enum: room \| null | no | yes | null | — | no | |
| gstPct | number (int, ≥0) | yes | no | 0 | one of 0, 5, 12, 18, 28 | no | |
| active | boolean | yes | no | true | — | no | |

Derived/display-only values (never stored): effective price today → min over live Offers applying to it and branch.

## Entity: Offer

A limited-time price on offerings. Read by Offerings › Offers, invoice pricing; written by Offer drawer.

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| name | string | yes | no | — | 1–80 chars | no | "Navratri glow" |
| code | string \| null | no | yes | null | 0–16 chars, `^[A-Z0-9]*$` | no | "GLOW20" |
| kind | enum: offer_kind | yes | no | "percent" | — | no | |
| value | number (int, ≥0) | yes | no | — | percent: 1–100; amount/fixed: paise; extra: 1–20 sessions | no | |
| offeringIds | array<string (uuid)> (max 50) | yes | no | — | ≥1, FK Offering | no | |
| branchIds | array<string (uuid)> (max 20) | yes | no | all | ≥1, FK Branch | no | |
| startsOn | string | yes | no | today | YYYY-MM-DD | no | |
| endsOn | string | yes | no | — | YYYY-MM-DD, ≥ startsOn | no | |
| paused | boolean | yes | no | false | — | no | |
| tone | enum: tone | yes | no | "blush" | — | no | |
| note | string \| null | no | yes | null | 0–280 chars | no | |

Derived/display-only values (never stored): state → paused ? paused : today < startsOn ? scheduled : today > endsOn ? ended : live.

## Entity: Invoice

A bill (clinic, consultation or medical). Read by Payments, patient file Billing, preview/print, plan card; written by the one invoice drawer (openInv) and Medical sale.

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| seq | number (int, ≥0) | yes | no | next | — | yes | "#787" / "INV-787" / "S-983" |
| type | enum: invoice_type | yes | no | "clinic" | locked "medical" for sales | no | |
| branchId | string (uuid) | yes | no | user's branch | FK Branch | no | |
| patientId | string (uuid) \| null | no | yes | null | FK Patient; null only for type medical walk-in | no | |
| medicalContactId | string (uuid) \| null | no | yes | null | FK MedicalContact (walk-in) | no | |
| teamIds | array<string (uuid)> (max 10) | yes | no | [] | FK User | no | "Team" / "Prescribed by" |
| items | array<InvoiceItem> (max 50) | yes | no | [] | ≥1 on save | no | embedded |
| overallDiscount | number (int, ≥0) | yes | no | 0 | paise, ≤ subtotal | no | |
| date | string | yes | no | today | YYYY-MM-DD | no | |
| remark | string \| null | no | yes | null | 0–500 chars | no | |
| prescriptionId | string (uuid) \| null | no | yes | null | FK Prescription | no | Rx → sell |
| saleId | string (uuid) \| null | no | yes | null | FK MedicalSale | yes | |

Derived/display-only values (never stored): subtotal → Σ qty × rate; discount → Σ line discount + overallDiscount; GST → Σ line GST on post-discount base; bill → subtotal − discount + GST; paid → Σ Payment(direction received, invoiceId) − refunds; due → bill − paid; "dueSince N days" → today − date while due > 0; status pill → due = 0 ? paid : paid > 0 ? partial : unpaid.

## Entity: InvoiceItem (embedded in Invoice.items)

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| offeringId | string (uuid) \| null | no | yes | null | FK Offering (clinic/consultation) | no | |
| medicineId | string (uuid) \| null | no | yes | null | FK Medicine (medical) | no | |
| name | string | yes | no | — | 1–120 chars | no | |
| packSize | string \| null | no | yes | null | 0–30 chars | no | print column |
| qty | number (int, ≥0) | yes | no | 1 | 1–999 | no | stepper |
| rate | number (int, ≥0) | yes | no | offering price / MRP | paise | no | |
| discountPct | number (int, ≥0) | yes | no | 0 | 0–100 | no | |
| gstPct | number (int, ≥0) | yes | no | 0 | 0, 5, 12, 18, 28 | no | |
| batchNo | string \| null | no | yes | null | 0–20 chars | yes | medical, earliest expiry |

Derived/display-only values (never stored): line net → qty × rate × (1 − discount%) × (1 + GST%).

## Entity: Payment

One ledger entry — money in or out (PAY-####). Read by Payments, Medical › Payments, Day close, invoices; written by Receive, Pay, refunds, credit give-back, supplier bill payment.

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| seq | number (int, ≥0) | yes | no | next | shared sequence | yes | "PAY-5512"; legacy TX-/RF-/EX- display as PAY- |
| direction | enum: payment_direction | yes | no | — | — | no | Received / Paid |
| kind | enum: payment_kind | yes | no | — | — | no | |
| branchId | string (uuid) | yes | no | user's branch | FK Branch | no | |
| amount | number (int, ≥0) | yes | no | — | paise, > 0 ("Enter an amount") | no | |
| splits | array<PaymentSplit> (max 4) | yes | no | [{mode, amount}] | {mode: enum payment_mode, amount: paise > 0}; Σ = amount | no | split modes |
| patientId | string (uuid) \| null | no | yes | null | FK Patient (received / refund) | no | |
| invoiceId | string (uuid) \| null | no | yes | null | FK Invoice | no | "Against invoice" chip |
| payeeName | string \| null | no | yes | null | 1–120 chars; required when direction = paid ("Add who was paid and the amount") | no | |
| expenseCategory | enum: expense_category \| null | no | yes | null | required when kind = expense | no | |
| billRef | object \| null | no | yes | null | {kind: enum bill_kind, purchaseId: uuid, billNo: string ≤ 30} | no | Pay against a supplier bill |
| creditNoteId | string (uuid) \| null | no | yes | null | FK CreditNote (refund) | yes | |
| pendingCreditId | string (uuid) \| null | no | yes | null | FK PendingCredit | no | |
| note | string \| null | no | yes | null | 0–280 chars | no | refund / money-back reason |
| paidAt | string (ISO 8601 UTC datetime) | yes | no | now | — | no | "When" |
| dayCloseId | string (uuid) \| null | no | yes | null | FK DayClose | yes | set at close; row becomes read-only |

Derived/display-only values (never stored): signed amount "± ₹" → direction; "From / to" text → patient / payee + invoice / "Medical PO #431 · bill 1631"; editable → dayCloseId = null.

## Entity: CreditNote

Issued for every refund to a patient. Read by Payments and invoice views; written by refund flow.

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| seq | number (int, ≥0) | yes | no | next | — | yes | "CN-001" |
| invoiceId | string (uuid) | yes | no | — | FK Invoice (never edited) | no | |
| amount | number (int, ≥0) | yes | no | — | paise, ≤ invoice paid | no | |
| reason | string | yes | no | — | 1–280 chars | no | |

Derived/display-only values (never stored): n/a.

## Entity: PendingCredit

Money owed either way, not yet settled (Payments › Pending). Read + written by crNew drawer and its actions.

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| seq | number (int, ≥0) | yes | no | next | — | yes | "CR-2" |
| direction | enum: credit_direction | yes | no | — | — | no | Give / Take |
| partyName | string | yes | no | — | 1–120 chars | no | |
| patientId | string (uuid) \| null | no | yes | null | FK Patient | no | |
| amount | number (int, ≥0) | yes | no | — | paise > 0 | no | |
| reason | string | yes | no | — | 1–280 chars | no | |
| sourcePaymentId | string (uuid) \| null | no | yes | null | FK Payment | no | |
| status | enum: credit_status | yes | no | "open" | — | yes | |
| settledPaymentId | string (uuid) \| null | no | yes | null | FK Payment | yes | |

Derived/display-only values (never stored): n/a.

## Entity: DayClose

One branch-day cash close. Read + written by Day close drawer.

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| branchId | string (uuid) | yes | no | — | FK Branch; unique with date | no | |
| date | string | yes | no | today | YYYY-MM-DD | no | |
| openingCash | number (int, ≥0) | yes | no | last close's counted cash | paise | no | "Accept ₹X" |
| openingSource | enum: opening_source | yes | no | "carried" | — | yes | |
| openingAcceptedAt | string (ISO 8601 UTC datetime) \| null | no | yes | null | — | yes | gate state |
| countedCash | number (int, ≥0) \| null | no | yes | null | paise | no | |
| closedAt | string (ISO 8601 UTC datetime) \| null | no | yes | null | — | yes | |
| closedById | string (uuid) \| null | no | yes | null | FK User | yes | |

Derived/display-only values (never stored): expected cash → openingCash + Σ cash received − Σ cash paid for date; difference → countedCash − expected; state → openingAcceptedAt null ? gate : closedAt null ? open : closed.

## Entity: Task

A human follow-up with owner and due time. Read by Tasks, header utility; written by Tasks, autoTask rules, outcomes.

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| kind | enum: task_kind | yes | no | "manual" | — | no | |
| title | string | yes | no | — | 1–120 chars | no | "Day-2 check call after peel" |
| why | string \| null | no | yes | null | 0–280 chars | no | |
| ownerId | string (uuid) \| null | no | yes | null | FK User; null = role queue | no | |
| ownerRole | enum: role \| null | no | yes | null | — | no | "Front desk" |
| patientId | string (uuid) \| null | no | yes | null | FK Patient | no | |
| leadId | string (uuid) \| null | no | yes | null | FK Lead | no | |
| sourceType | enum: task_source \| null | no | yes | null | — | yes | |
| sourceId | string (uuid) \| null | no | yes | null | polymorphic by sourceType | yes | |
| dueAt | string (ISO 8601 UTC datetime) | yes | no | — | — | no | |
| status | enum: task_status | yes | no | "open" | — | no | |
| snoozedUntil | string (ISO 8601 UTC datetime) \| null | no | yes | null | — | no | "No answer" = +3 h |
| outcome | enum: task_outcome \| null | no | yes | null | — | no | |
| resolvedAt | string (ISO 8601 UTC datetime) \| null | no | yes | null | — | yes | |

Derived/display-only values (never stored): overdue → status open AND dueAt < now; "Overdue · 26 Sep" label → dueAt; rule tasks (aftercare calls, call-backs) are generated server-side and disappear when their condition is met.

## Entity: Manufacturer

Medicine brand on the pack. Read by medicine pickers, supplier/MR connections; written by Manufacturer drawer.

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| name | string | yes | no | — | 1–80 chars, unique | no | "ALVI" |
| tone | enum: tone | yes | no | hashed | — | no | dot colour |
| isQuick | boolean | yes | no | false | — | yes | created inline from a picker |

Derived/display-only values (never stored): "N medicines" → count(Medicine where manufacturerId); suppliers / MRs → via SupplierManufacturer / MedicalRep.manufacturerIds.

## Entity: Supplier

Medicine distributor (Medical). Read by PO, medicine rates, Pay bill picker; written by Supplier drawer.

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| name | string | yes | no | — | 1–120 chars | no | "Agency name" |
| phone | string \| null | no | yes | null | E.164 +91 | no | quick records flag "Add phone" |
| gstNumber | string \| null | no | yes | null | GSTIN pattern | no | |
| manufacturerIds | array<string (uuid)> (max 50) | yes | no | [] | FK Manufacturer | no | |
| isQuick | boolean | yes | no | false | — | yes | |

Derived/display-only values (never stored): payable → Σ (PO bill − paid) for stage received; "N days" → today − oldest unpaid received PO date.

## Entity: MedicalRep

Medical representative. Read + written by Medical › MRs.

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| name | string | yes | no | — | 1–120 chars | no | "Alvio Pharma · Rakesh" |
| phone | string \| null | no | yes | null | E.164 +91 | no | |
| manufacturerIds | array<string (uuid)> (max 20) | yes | no | [] | FK Manufacturer | no | "Represents" |
| nextVisitOn | string \| null | no | yes | null | YYYY-MM-DD | no | |

Derived/display-only values (never stored): last visit → latest MRVisit.date; samples → latest MRVisit.samples.

## Entity: MRVisit

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| mrId | string (uuid) | yes | no | — | FK MedicalRep | no | |
| date | string | yes | no | today | YYYY-MM-DD | no | |
| samples | string \| null | no | yes | null | 0–120 chars | no | "5 samples" |
| notes | string \| null | no | yes | null | 0–500 chars | no | |

Derived/display-only values (never stored): n/a.

## Entity: Medicine

A medicine for sale in the Medical store. Read by Rx / sale / PO pickers, Medicines list; written by Medicine drawer, quick create, PO receive, sale (stock).

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| seq | number (int, ≥0) | yes | no | next | — | yes | "#458" |
| name | string | yes | no | — | 1–120 chars | no | |
| composition | string \| null | no | yes | null | 0–160 chars | no | quick flag "Needs MRP and composition" |
| manufacturerId | string (uuid) | yes | no | — | FK Manufacturer | no | |
| mrp | number (int, ≥0) | yes | no | — | paise > 0 ("Enter the MRP") | no | |
| gstPct | number (int, ≥0) | yes | no | 12 | 0, 5, 12, 18, 28 | no | |
| minStock | number (int, ≥0) | yes | no | 2 | ≤ maxStock | no | |
| maxStock | number (int, ≥0) | yes | no | 10 | ≤ 9999 | no | |
| batches | array<MedicineBatch> (max 50) | yes | no | [] | {batchNo: string 1–20, expiry: string `MM/YY`, qty: int ≥0, purchaseRate: paise} | no | |
| supplierRates | array<SupplierRate> (max 20) | yes | no | [] | {supplierId: uuid FK Supplier, rate: paise > 0 (req), free: int ≥0, leadDays: int ≥0} | no | |
| isQuick | boolean | yes | no | false | — | yes | |

Derived/display-only values (never stored): stock → Σ batches.qty; nearest expiry → min batches.expiry where qty > 0; low stock → stock ≤ minStock; margin % → (MRP − cheapest rate) / MRP.

## Entity: MedicalPurchaseOrder

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| seq | number (int, ≥0) | yes | no | next | — | yes | "PO #431" |
| supplierId | string (uuid) | yes | no | — | FK Supplier ("Pick a supplier") | no | |
| supplierBillNo | string \| null | no | yes | null | 0–30 chars | no | "1631" |
| date | string | yes | no | today | YYYY-MM-DD | no | |
| stage | enum: po_stage | yes | no | "ordered" | — | yes | |
| items | array<PurchaseItem> (max 50) | yes | no | [] | {medicineId: uuid, qty: int ≥1, free: int ≥0, rate: paise > 0 (req), batchNo: string ≤ 20 \| null, expiry: `MM/YY` \| null, received: boolean} | no | |
| paid | number (int, ≥0) | yes | no | 0 | paise | yes | from Payments |
| cancelReason | enum: delete_reason \| null | no | yes | null | — | no | |

Derived/display-only values (never stored): bill → Σ qty × rate; due → bill − paid; "N days pending" → today − date while due > 0.

## Entity: MedicalContact

A walk-in customer of the medicine store (not a patient). Read by sale Customer picker, contact card; written by sale save.

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| name | string | yes | no | — | 1–120 chars | no | |
| phone | string \| null | no | yes | null | E.164 +91 | no | |

Derived/display-only values (never stored): n/a.

## Entity: MedicalSale

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| seq | number (int, ≥0) | yes | no | next | — | yes | "S-983" |
| invoiceId | string (uuid) | yes | no | — | FK Invoice (type medical) | yes | |
| patientId | string (uuid) \| null | no | yes | null | FK Patient | no | |
| medicalContactId | string (uuid) \| null | no | yes | null | FK MedicalContact; one of the two required | no | |
| prescriptionId | string (uuid) \| null | no | yes | null | FK Prescription | no | |
| soldAt | string (ISO 8601 UTC datetime) | yes | no | now | — | yes | |
| voidedAt | string (ISO 8601 UTC datetime) \| null | no | yes | null | only if unpaid and no returns | yes | |
| returns | array<SaleReturn> (max 20) | yes | no | [] | {items: [{medicineId, batchNo, qty ≥1}], amount: paise, reason: string 1–280, at: ISO datetime} | no | |

Derived/display-only values (never stored): status → voided ? void : returns ? returned : invoice.due = 0 ? paid : unpaid.

## Entity: StockVendor

"Clinic vendor" for consumables (never shared with Medical suppliers).

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| name | string | yes | no | — | 1–120 chars | no | |
| phone | string \| null | no | yes | null | E.164 +91 | no | |
| isQuick | boolean | yes | no | false | — | yes | |

Derived/display-only values (never stored): payable → Σ (purchase bill − paid).

## Entity: StockItem

A clinic consumable / equipment item.

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| seq | number (int, ≥0) | yes | no | next | — | yes | "#167" |
| name | string | yes | no | — | 1–120 chars ("Add a name") | no | |
| category | enum: stock_category | yes | no | "creams_serums" | — | no | |
| unit | enum: stock_unit | yes | no | "piece" | — | no | |
| sizePerUnit | number (int, ≥0) \| null | no | yes | null | milli-units (×1000), > 0 | no | "1 tube = 30 g" |
| measureUnit | enum: measure_unit \| null | no | yes | null | required when sizePerUnit set | no | |
| qtyMilli | number (int, ≥0) | yes | no | 0 | stock × 1000 (decimals allowed in UI) | yes | via movements |
| minQty | number (int, ≥0) | yes | no | 1 | — | no | |
| maxQty | number (int, ≥0) | yes | no | 10 | ≥ minQty | no | |
| usagePerWeekMilli | number (int, ≥0) | yes | no | 0 | ×1000 | no | |
| vendorId | string (uuid) \| null | no | yes | null | FK StockVendor | no | |

Derived/display-only values (never stored): "2.5 tube · 75 g" → qtyMilli/1000 + unit and × sizePerUnit; low → qty ≤ minQty; weeks left → qty / usagePerWeek.

## Entity: StockPurchase

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| seq | number (int, ≥0) | yes | no | next | — | yes | "#16" |
| vendorId | string (uuid) | yes | no | — | FK StockVendor ("Pick a supplier") | no | |
| billNo | string \| null | no | yes | null | 0–30 chars | no | "SW-77" |
| date | string | yes | no | today | YYYY-MM-DD | no | |
| lines | array<StockPurchaseLine> (max 50) | yes | no | [] | {itemId: uuid, qtyMilli: int > 0, rate: paise} | no | |
| bill | number (int, ≥0) | yes | no | Σ lines | paise | no | editable |
| paid | number (int, ≥0) | yes | no | 0 | paise ≤ bill | no | |

Derived/display-only values (never stored): due → bill − paid.

## Entity: StockMovement

Signed stock change; every change is one row.

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| itemId | string (uuid) | yes | no | — | FK StockItem | no | |
| type | enum: stock_movement_type | yes | no | "used" | — | no | |
| deltaMilli | number (int) | yes | no | — | signed, ≠ 0 (exception to ≥0 vocabulary) | no | |
| usedFor | string \| null | no | yes | null | 0–80 chars | no | "LHR · Dharti Galani" |
| patientId | string (uuid) \| null | no | yes | null | FK Patient | no | |
| purchaseId | string (uuid) \| null | no | yes | null | FK StockPurchase | yes | |
| stockCountId | string (uuid) \| null | no | yes | null | FK StockCount | yes | |
| revertsId | string (uuid) \| null | no | yes | null | FK StockMovement | yes | |
| revertedById | string (uuid) \| null | no | yes | null | FK StockMovement | yes | original marked Reverted |
| revertReason | enum: revert_reason \| null | no | yes | null | — | no | |

Derived/display-only values (never stored): "After" line in Use popover → item qty + delta.

## Entity: StockCount

| Field | Type | Required | Nullable | Default | Constraints | Server-set? | Notes |
| ----- | ---- | -------- | -------- | ------- | ----------- | ----------- | ----- |
| id | string (uuid) | yes | no | — | — | yes | |
| lines | array<StockCountLine> (max 500) | yes | no | [] | {itemId: uuid, systemMilli: int ≥0, countedMilli: int ≥0} | no | only changed lines write Adjust movements |
| countedAt | string (ISO 8601 UTC datetime) | yes | no | now | — | yes | |

Derived/display-only values (never stored): difference pill → counted − system.

---

# Relationships

| From | To | Cardinality | Via field | On delete | Notes |
| ---- | -- | ----------- | --------- | --------- | ----- |
| Organization | every entity | 1:N | organizationId | cascade | tenant |
| Branch | User | M:N | User.branchIds | restrict | cannot delete a branch with staff |
| Branch | Appointment / Invoice / Payment / DayClose | 1:N | branchId | restrict | |
| User | RolePermission | N:M (via role) | User.roles ↔ RolePermission.role | n/a — enum join | |
| User | UserPreference | 1:1 | userId | cascade | |
| Lead | LeadMessage | 1:N | leadId | cascade | |
| Lead | Patient | N:1 | Lead.patientId | null | |
| Lead | Appointment | 1:N | Appointment.leadId | restrict | |
| User | Lead (owner / involved) | 1:N / M:N | ownerId / involvedIds | null / remove id | |
| Patient | Appointment | 1:N | Appointment.patientId | restrict (soft delete patient only) | |
| Patient | Prescription / Treatment / PatientImage / PatientReport / PatientNote / PatientPackage / CheckIn / Review / OfferingSuggestion | 1:N | patientId | cascade (soft) | |
| Patient | Invoice | 1:N | Invoice.patientId | restrict | money records never cascade |
| Patient | Patient (referrer) | N:1 | referredByPatientId | null | |
| Appointment | Prescription / Treatment / PatientImage / CheckIn / Review / OfferingSuggestion | 1:N | appointmentId | null | |
| Appointment | Appointment (copy) | N:1 | copiedFromId | null | |
| User | Appointment (doctor) | 1:N | doctorId | restrict | |
| Prescription | Medicine | M:N | items[].medicineId | null (keeps medicineName) | |
| Prescription | MedicalSale | 1:N | MedicalSale.prescriptionId | null | |
| Treatment | CheckIn | 1:N | CheckIn.treatmentId | null | |
| Treatment | PatientPackage | N:1 | packageId | null | |
| CheckIn / Review | FeedbackAction | 1:N | checkInId / reviewId | cascade | |
| Offering | OfferingSuggestion / PatientPackage | 1:N | offeringId | restrict | |
| Offering | Offer | M:N | Offer.offeringIds | remove id | |
| Offering | Appointment / Invoice item | 1:N | offeringId | null (keeps label) | |
| OfferingSuggestion | Invoice | M:N | invoiceLinks[].invoiceId | remove link | |
| Invoice | Payment | 1:N | Payment.invoiceId | restrict | |
| Invoice | CreditNote | 1:N | CreditNote.invoiceId | restrict | |
| Invoice | MedicalSale | 1:1 | MedicalSale.invoiceId / Invoice.saleId | restrict | |
| Invoice | PatientPackage | 1:N | PatientPackage.invoiceId | restrict | |
| Payment | CreditNote | N:1 | creditNoteId | restrict | |
| Payment | PendingCredit | N:1 | pendingCreditId / sourcePaymentId | null | |
| Payment | MedicalPurchaseOrder / StockPurchase | N:1 | billRef.purchaseId | restrict | |
| DayClose | Payment | 1:N | Payment.dayCloseId | restrict | closed day locks rows |
| Task | Patient / Lead / any source | N:1 | patientId / leadId / sourceId | null | |
| Manufacturer | Medicine | 1:N | Medicine.manufacturerId | restrict (Delete hidden while it has medicines) | |
| Manufacturer | Supplier | M:N | Supplier.manufacturerIds | remove id | |
| Manufacturer | MedicalRep | M:N | MedicalRep.manufacturerIds | remove id | |
| Supplier | MedicalPurchaseOrder | 1:N | supplierId | restrict (Delete hidden while dues / open POs) | |
| Supplier | Medicine (rates) | M:N | Medicine.supplierRates[].supplierId | remove rate | |
| MedicalRep | MRVisit | 1:N | mrId | cascade | |
| Medicine | MedicalPurchaseOrder items / Invoice items | 1:N | medicineId | restrict | |
| MedicalContact | MedicalSale / Invoice | 1:N | medicalContactId | restrict | |
| StockVendor | StockPurchase / StockItem | 1:N | vendorId | restrict / null | |
| StockItem | StockMovement | 1:N | itemId | restrict | |
| StockMovement | StockMovement (revert) | 1:1 | revertsId / revertedById | restrict | |
| StockCount | StockMovement | 1:N | stockCountId | restrict | |

---

# Enums

## Enum: role
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| admin | Admin | full settings access |
| doctor | Doctor | clinical; writes Rx |
| therapist | Therapist | treatments, stock use |
| front_desk | Front desk | bookings, billing |
| counsellor | Counsellor | leads, plans |
| pharmacist | Pharmacist | Medical store |
| accountant | Accountant | Payments, day close |
| marketing | Marketing | leads only |
| owner | Owner | everything |

## Enum: section
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| today | Today | clinic floor |
| leads | Leads | |
| appointments | Appointments | |
| patients | Patients | |
| medical | Medical | medicine store |
| stock | Clinic stock | consumables |
| payments | Payments | |
| tasks | Tasks | |
| offerings | Offerings | |
| users | Users | |

## Enum: tone
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| butter | n/a — colour, no label | pastel yellow |
| lav | n/a — colour | lavender |
| sky | n/a — colour | blue |
| sage | n/a — colour | green |
| blush | n/a — colour | pink-red |
| mint | n/a — colour | teal |
| peach | n/a — colour | orange |
| plum | n/a — colour | magenta |
| lime | n/a — colour | yellow-green |
| slate | n/a — colour | grey-blue |
| stone | n/a — colour | neutral |

## Enum: theme
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| light | Light | |
| dark | Dark | |
| system | System | follows OS |

## Enum: presence
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| online | Online | user menu Status |
| busy | Busy | |
| away | Away | |

## Enum: weekday
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| mon | Mon | 0 in prototype |
| tue | Tue | |
| wed | Wed | |
| thu | Thu | |
| fri | Fri | |
| sat | Sat | |
| sun | Sun | |

## Enum: lead_status
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| new | New | created |
| contacted | Contacted | first reply sent |
| follow_up | Follow-up | follow-up scheduled |
| clinic_visited | Clinic visited | auto at appointment check-in |
| no_response | No response | |
| not_interested | Not interested | close reason |
| invalid | Invalid | wrong number / spam |
| lost | Lost | went elsewhere |

## Enum: lead_source
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| instagram | Instagram | |
| google | Google | |
| whatsapp | WhatsApp | |
| facebook | Facebook | |
| walk_in | Walk-in | |
| referral | Referral | |
| retarget | Re-target | system-created for lapsed patients |

## Enum: lead_interest
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| others | Others | |
| clinical | Clinical | |
| peel | Peel | |
| lhr | LHR | laser hair removal |
| hydrafacial | Hydrafacial | |
| prp | PRP | |

## Enum: lead_kind
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| enquiry | n/a — not shown | normal lead |
| retarget | Re-target | lapsed patient win-back |
| contact_thread | n/a — hidden | appointment-only chat thread |

## Enum: channel
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| whatsapp | WhatsApp | |
| call | Call | |
| sms | SMS | |
| instagram | Instagram | |
| email | Email | |
| note | Note | internal |

## Enum: message_direction
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| sent | Sent | outbound |
| received | Got | inbound |

## Enum: delivery_status
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| queued | Sending | |
| sent | Sent | |
| delivered | Delivered | |
| read | Read | |
| failed | Failed | |

## Enum: appointment_type
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| consultation | Consultation | 20 min · "First visit or doctor review" |
| follow_up | Follow-up | 15 min · "Short review after a treatment or Rx" |
| treatment | Treatment | 60 min · "A single session, billed on the visit" |
| package_session | Package session | 45 min · "Uses one session from a paid package" |
| other | Other | 30 min · "Anything that is not one of the above" |

## Enum: appointment_status
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| scheduled | Scheduled | "Slot held · confirm request sent on WhatsApp"; → confirmed, checked_in, cancelled, no_show; reschedule keeps/returns here |
| confirmed | Confirmed | patient said yes; → checked_in, scheduled (reschedule), cancelled, no_show |
| checked_in | Checked in | arrived; locks date/time; moves open leads to clinic_visited; → completed |
| completed | Completed | patients only; terminal |
| cancelled | Cancelled | requires cancel_reason; terminal (Restore → previous) |
| no_show | No show | terminal |

## Enum: cancel_reason
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| patient_asked | Patient asked | side: Patient |
| unreachable | Could not reach patient | side: Patient |
| doctor_unavailable | Doctor unavailable | side: Clinic |
| resource_unavailable | Machine or room unavailable | side: Clinic |
| other | Other | note required |

## Enum: room
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| room_1 | Room 1 | |
| room_2 | Room 2 | |
| laser_room | Laser room | |
| any | Any room | |

## Enum: gender
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| female | Female | "F" in lists |
| male | Male | "M" |
| other | Other | |

## Enum: patient_type
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| aesthetic | Aesthetic | |
| clinical | Clinical | |
| lhr | LHR | |
| dental | Dental | |
| physio | Physio | |
| gynac | Gynac | |

## Enum: patient_status
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| new | New | |
| regular | Regular | |
| vip | VIP | |
| inactive | Inactive | |

## Enum: patient_conversion
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| converted | T-Converted | took a treatment |
| not_converted | T-Not converted | consult only |

## Enum: referral_source
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| patient | Patient | sets referredByPatientId |
| doctor | Doctor | |
| instagram | Instagram | |
| google | Google | |
| walk_in | Walk-in | |
| other | Other | |

## Enum: patient_file_section
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| overview | Clinical notes | bento + plan + feedback |
| timeline | Timeline | |
| prescriptions | Prescriptions | |
| treatments | Treatments | |
| images | Images | |
| reports | Reports | |
| packages | Packages | |
| invoices | Invoices | Billing (peach) |
| payments | Payments | Billing (peach) |
| notes | Notes | |
| team | Team | |

## Enum: rx_meal
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| before | Before | before meal |
| after | After | after meal |

## Enum: rx_timing
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| empty_stomach | Empty stomach | |
| with_meal | With meal | |
| morning | Morning | |
| night | Night | |
| morning_night | Morning & night | |
| thrice_week | Thrice a week | |
| once_week | Once a week | |
| alternate_days | Alternate days | |

## Enum: body_part
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| face | Face | |
| scalp | Scalp | |
| hair | Hair | |
| body | Body | |
| chest | Chest | |
| back | Back | |
| underarm | Underarm | |
| legs | Legs | |
| arms | Arms | |
| other | Other | free text in bodyPartText |

## Enum: treatment_template
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| skin | Skin · laser | |
| dental | Dental | |
| physio | Physio | |
| gynac | Gynac | |
| general | General | |

## Enum: aftercare_call
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| none | No call | |
| next_day | Next day | default |
| in_2_days | In 2 days | |
| in_week | In a week | |

## Enum: image_album
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| general | General | |
| private | Private | restricted |
| lhr | LHR | |

## Enum: report_type
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| lab | Lab | |
| scan | Scan | |
| consent | Consent | |
| other | Other | |

## Enum: suggestion_status
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| planned | Planned | default; counts in total |
| accepted | Accepted | patient agreed / auto on invoice link; counts |
| next_time | Next time | excluded from total |
| declined | Declined | excluded from total |

## Enum: checkin_feel
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| much_better | Much better | |
| better | Better | "Doing well" outcome |
| same | Same | |
| worse | Worse | creates doctor call-back task |

## Enum: checkin_followed
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| fully | Fully | |
| mostly | Mostly | |
| partly | Partly | |
| not_at_all | Not at all | |

## Enum: review_source
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| google | Google | |
| video | Video | testimonial file |
| instagram | Instagram | |
| internal_form | Feedback form | stored label "Internal form" in prototype |
| whatsapp | WhatsApp | |

## Enum: feedback_action
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| doctor_called | Doctor called | |
| asked_revisit | Asked to visit again | |
| free_review_booked | Free review visit booked | |
| plan_changed | Plan changed | |
| replied_google | Replied on Google | |
| replied_instagram | Replied on Instagram | |
| replied_whatsapp | Replied on WhatsApp | |
| refund_credit | Refund / credit given | |
| other | Other | note required |

## Enum: offering_category
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| consultation | Consultation | |
| treatment | Treatment | |
| package | Package | creates PatientPackage on invoice |
| lhr | LHR | |
| product | Product | |

## Enum: offering_specialty
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| skin | Skin | |
| hair | Hair | |
| dental | Dental | |
| gynac | Gynac | |
| physio | Physio | |
| general | General | |

## Enum: offer_kind
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| percent | % off | value = percent |
| amount | ₹ off | value = paise |
| fixed | Fixed price | value = paise |
| extra | Extra sessions | value = sessions |

## Enum: invoice_type
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| clinic | Clinic | treatments / packages |
| medical | Medical | medicine sale |
| consultation | Consultation | |

## Enum: payment_mode
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| cash | Cash | counts in day close |
| upi | UPI | |
| card | Card | |
| credit | Credit | settled from a PendingCredit ("Use on next bill") |

## Enum: payment_direction
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| received | Received | money in (Receive) |
| paid | Paid | money out (Pay) |

## Enum: payment_kind
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| receipt | Received | against an invoice |
| refund | Refund to patient | always with a CreditNote |
| expense | Paid | clinic spend |
| supplier_bill | Paid | against a PO bill |
| money_back | Money back | vendor returned money |
| reversal | Undo | reverses an entry |

## Enum: expense_category
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| medicines | Medicines | shows in Medical › Payments |
| consumables | Consumables | |
| salary | Salary | |
| rent | Rent | |
| marketing | Marketing | |
| utilities | Utilities | |
| maintenance | Maintenance | |
| misc | Misc | |

## Enum: bill_kind
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| medical_po | Medical POs | group in Supplier bill dd |
| stock_po | Clinic stock POs | |
| other | Other spend | no bill |

## Enum: credit_direction
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| give | Give | "We give back" |
| take | Take | "They owe us" |

## Enum: credit_status
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| open | Open | editable |
| given_back | Given back | "Give back" action |
| got_back | Got it back | "Got it back" action |
| used | Used on bill | "Use on next bill" |

## Enum: opening_source
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| carried | Carried from last close | |
| default_float | Default float | first close / no history |

## Enum: po_stage
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| ordered | Ordered | editable; "Cancel order" |
| received | Received | read-only; payable |
| paid | Paid | settled |
| cancelled | Cancelled | via confirm drawer |

## Enum: stock_category
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| creams_serums | Creams & Serums | |
| peels | Peels & Neutralisers | |
| masks | Masks | |
| consumables | Consumables | |
| equipment | Equipment | |
| other | Other clinic stock | |

## Enum: stock_unit
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| piece | piece | |
| tube | tube | |
| bottle | bottle | |
| kit | kit | |
| pack | pack | |
| box | box | |
| vial | vial | |
| ampoule | ampoule | |
| sachet | sachet | |
| jar | jar | |
| roll | roll | |
| pair | pair | |
| ml | ml | |
| g | g | |
| litre | litre | |

## Enum: measure_unit
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| ml | ml | |
| g | g | |
| pcs | pcs | |
| units | units | |

## Enum: stock_movement_type
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| used | Used | − ; "Use" popover |
| received | Received | + ; purchase |
| adjust | Adjust | ± ; stock check |
| damaged | Damaged | − |
| returned | Returned | − ; back to vendor |
| reverted | Reverted | ↺ ; linked reversal |

## Enum: revert_reason
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| mistake | Logged by mistake | |
| wrong_item | Wrong item | |
| wrong_qty | Wrong quantity | |
| other | Other | note required |

## Enum: delete_reason
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| mistake | Created by mistake | |
| duplicate | Duplicate | |
| not_needed | No longer needed | |
| other | Other | note required |

## Enum: task_kind
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| manual | Task | user-created |
| follow_up | Follow-up | lead / patient follow-up date |
| aftercare_call | Aftercare call | from Treatment.aftercareCall |
| callback | Doctor call-back | negative feedback |
| payment_reminder | Payment reminder | due invoices |
| confirm_visit | Confirm visit | scheduled appointments |
| review_request | Review request | happy check-in |

## Enum: task_source
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| lead | Leads | |
| appointment | Appointments | |
| treatment | Treatments | |
| check_in | Feedback | |
| review | Feedback | |
| invoice | Payments | |

## Enum: task_status
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| open | Queue | |
| snoozed | Snoozed | snoozedUntil set |
| done | Done | resolved |

## Enum: task_outcome
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| log_check_in | Log check-in | opens check-in |
| doing_well | Doing well | writes a Better check-in |
| no_answer | No answer | snooze 3 h |
| happy | Happy | opens review log |
| done | Done | generic |

---

# Operations

Shared list contract (applies to every list read below unless a row says otherwise):
- **Pagination:** cursor, page size 50, `{items, nextCursor: string | null}`; infinite scroll until a page returns < 50 items; no totals.
- **Search:** `q` string 0–80 chars, 300 ms debounce, server-side contains-match on the listed fields.
- **Created filter:** `created ∈ any | today | yesterday | last_7 | last_30 | this_month | range(from,to)` on createdAt.
- **Follow-up filter** (where listed): `followUp ∈ any | overdue | today | tomorrow | next_7 | not_set | range(from,to)`.
- **Branch scope:** every read takes `branchIds` from the header branch picker (empty = all).
- **Distinguished errors (every write):** `validation` (field + message; drawer stays open, field outlined, toast names first missing field) · `conflict` (stale version / slot taken → toast + keep draft) · `permission` (toast "You don't have access to do this") · `not_found` (drawer closes, toast "<Record> not found") · `network` (footer "Not saved · your changes are kept", "Retry save"). Writes are **not optimistic** unless the row says so; the button shows "Saving…".
- **Delete (every entity):** `DELETE /<resource>/:id` with `{reason: delete_reason, note}` → soft delete; toast with "Undo" (10 s) = `POST /<resource>/:id/restore`. Optimistic: yes (row hides immediately, returns on error).

## Screen: Sign in (/login)
### Reads
| Operation | Entity | Params (filters, sort, pagination) | Refetch triggers |
| --------- | ------ | ---------------------------------- | ---------------- |
| n/a | — | n/a — no data before sign-in | — |
### Writes
| Operation | Input fields | Success result + UI effect | Error cases the UI distinguishes | Optimistic? |
| --------- | ------------ | -------------------------- | -------------------------------- | ----------- |
| signIn | email, password | session + user + org list → redirect to role home, toast "Welcome back, <first name>" | invalid credentials, inactive user, network | no |
| signOut | — | session cleared → "Signed out" dialog | network | yes |

## Screen: Shell (every org route)
### Reads
| Operation | Entity | Params (filters, sort, pagination) | Refetch triggers |
| --------- | ------ | ---------------------------------- | ---------------- |
| getSession | User, Organization, RolePermission, UserPreference | — | on load, org switch |
| listBranches | Branch | active only, sort name asc, no pagination (≤ 20) | branch saved |
| commandSearch | Patient, Lead, Appointment, Invoice | `q` ≥ 2 chars (name, phone digits, seq); 10 per type | each keystroke (250 ms) |
| contactCard | Patient / Lead / MedicalContact | by name or id | hover (fetch first, then show) |
### Writes
| Operation | Input fields | Success result + UI effect | Error cases the UI distinguishes | Optimistic? |
| --------- | ------------ | -------------------------- | -------------------------------- | ----------- |
| updatePreference | pinnedSections, branchFilter, theme, patientFilePins, recentPicks | saved silently | network (retry silently) | yes |
| setPresence | presence | toast "Status · <label>" | network | yes |

## Screen: Today (/today)
### Reads
| Operation | Entity | Params (filters, sort, pagination) | Refetch triggers |
| --------- | ------------------ | ---------------------------------- | ---------------- |
| listTodayFloor | Appointment (+ patient, open invoice, unfilled Rx) | date = today, branchIds; sort startTime asc; no pagination (one day) | status change, any appointment save, 60 s poll |
| todayPulse | derived | counts by stage for today | same as above |
### Writes
| Operation | Input fields | Success result + UI effect | Error cases the UI distinguishes | Optimistic? |
| --------- | ------------ | -------------------------- | -------------------------------- | ----------- |
| setAppointmentStatus | appointmentId, status | card moves stage | conflict (invalid transition), permission, network | yes |

## Screen: Leads (/leads, /leads/create, /leads/:leadId)
### Reads
| Operation | Entity | Params (filters, sort, pagination) | Refetch triggers |
| --------- | ------ | ---------------------------------- | ---------------- |
| listLeads | Lead | filters: status (enum lead_status, multi), source (multi), interests (multi), ownerId, created, followUp; `q` on name, phone, seq; sort createdAt desc (sortable: name, status, source, followUpAt, createdAt); excludes isContactThread | filter apply, search, lead save |
| getLead | Lead + LeadMessage (cursor 50, sentAt asc) + connected Appointments | leadId | open, new message |
### Writes
| Operation | Input fields | Success result + UI effect | Error cases the UI distinguishes | Optimistic? |
| --------- | ------------ | -------------------------- | -------------------------------- | ----------- |
| createLead | name, phone, email, source, interests, ownerId, involvedIds, followUpAt, branchId, notes (server-set: id, seq, status new, kind) | Lead → drawer switches to it, toast | validation, conflict (phone already a lead → offer open existing), permission, network | no |
| updateLead | any createLead field + status | Lead → draft cleared | validation, conflict, permission, not_found, network | no |
| sendMessage | leadId, channel, body | LeadMessage (deliveryStatus queued) appended | validation (empty / > 1000), network (bubble shows Failed + retry) | yes |
| bulkMessage / bulkExport | leadIds[] | toast "WhatsApp drafted for N people" / file | permission, network | no |

## Screen: Appointments (/appointments, create, :appointmentId)
### Reads
| Operation | Entity | Params (filters, sort, pagination) | Refetch triggers |
| --------- | ------ | ---------------------------------- | ---------------- |
| listAppointmentsRange | Appointment | view day/week: date range, doctorId, status, type, branchIds; no pagination (range-bounded); sort startTime asc | date nav, filter apply, save |
| listAppointments (list view) | Appointment | status, type, doctorId, created, followUp; `q` on name, phone, seq; sort date+startTime asc; cursor 50 | filter, search, save |
| getAppointment | Appointment + contact + connected leads + plan + photos + chat | appointmentId | open, save |
| availableSlots | derived | date, doctorId, durationMin, branchId | date / doctor / length change |
### Writes
| Operation | Input fields | Success result + UI effect | Error cases the UI distinguishes | Optimistic? |
| --------- | ------------ | -------------------------- | -------------------------------- | ----------- |
| createAppointment | patientId \| leadId (or new contact name+phone → contact-thread Lead), type, offeringId/serviceLabel, doctorId, durationMin, reason, notes, date, startTime, branchId (server-set: id, seq, status scheduled) | Appointment → edit mode, toast; reminder queued | validation, conflict (slot taken), permission, network | no |
| updateAppointment | same fields + status; date/time change on scheduled/confirmed sets status scheduled + rescheduledFrom | Appointment; check-in moves open leads to clinic_visited + system LeadMessage | validation, conflict (invalid transition / slot / locked after check-in), permission, not_found, network | no |
| cancelAppointment | appointmentId, cancelReason, cancelNote | status cancelled, slot released | validation (reason), conflict, network | no |
| restoreAppointment | appointmentId | previous status | conflict (slot now taken) | no |
| uploadVisitPhotos | appointmentId, album, files[] | PatientImage[] with appointmentId | validation (type/size), conflict (not checked in), network | no |

## Screen: Patients (/patients, /patients/create)
### Reads
| Operation | Entity | Params (filters, sort, pagination) | Refetch triggers |
| --------- | ------ | ---------------------------------- | ---------------- |
| listPatients | Patient | view (all / today / dues / follow), types, status, created, followUp; `q` on name, phone, seq; sort updatedAt desc (sortable: name, seq, lastVisit, updatedAt) | filter, search, save |
### Writes
| Operation | Input fields | Success result + UI effect | Error cases the UI distinguishes | Optimistic? |
| --------- | ------------ | -------------------------- | -------------------------------- | ----------- |
| createPatient | firstName, lastName, phone, phone2, gender, dateOfBirth, address, homeBranchId, types, status, referralSource, referredByPatientId, consentGiven, notes, first photos (server-set: id, seq, conversion) | Patient → opens patient file | validation ("Add name and mobile"), conflict (phone exists → open existing), permission, network | no |

## Screen: Patient file (/patients/:patientId/:section and its dialogs)
### Reads
| Operation | Entity | Params (filters, sort, pagination) | Refetch triggers |
| --------- | ------ | ---------------------------------- | ---------------- |
| getPatient | Patient + rail facts (next visit, dues, feedback) | patientId | open, any child save |
| listPrescriptions | Prescription | patientId; sort date desc; cursor 50 | Rx save |
| listTreatments | Treatment (+ latest CheckIn) | patientId; sort performedAt desc; cursor 50 | save |
| listImages | PatientImage | patientId, album, appointmentId (All / Not attached / visit); sort takenOn desc; cursor 60 | upload |
| listReports / listPackages / listNotes | PatientReport / PatientPackage / PatientNote | patientId; sort date desc; cursor 50 | save |
| listPatientInvoices / listPatientPayments | Invoice / Payment | patientId; sort date desc; cursor 50 | billing save |
| getPlan | OfferingSuggestion + ideas (derived) + last 6 purchases + last 5 LeadMessages | patientId | plan / invoice save |
| listFeedback | CheckIn + Review + FeedbackAction | patientId, type filter; sort date desc; page 6 ("Load more") | save |
### Writes
| Operation | Input fields | Success result + UI effect | Error cases the UI distinguishes | Optimistic? |
| --------- | ------------ | -------------------------- | -------------------------------- | ----------- |
| updatePatient | any createPatient field + complaints, diagnosis, treatmentSuggestions, futureSuggestions | Patient | validation, conflict, permission, network | no |
| createPrescription / updatePrescription | doctorId, date, items[], advice, labReport, procedureToday, followUpDate, appointmentId (server: unknown medicine names → quick Medicine) | Prescription; "Save & sell" also opens /medical/sales/create?prescription= | validation ("Add a medicine"), permission, network | no |
| createTreatment / updateTreatment | Treatment fields except id | Treatment; aftercare task scheduled | validation, permission, network | no |
| uploadImages / updateImage | album, files, appointmentId, bodyPart, caption | PatientImage | validation (type/size), network | no |
| createReport | type, name, date, files, notes | PatientReport | validation (PDF/JPG/PNG ≤ 10 MB), network | no |
| addNote | body | PatientNote | validation, network | yes |
| addSuggestion / updateSuggestion | offeringId, qty, price, status, reason, appointmentId | OfferingSuggestion | validation (price < min × qty warns, not blocks), network | yes |
| linkSuggestionInvoice / unlinkSuggestionInvoice | suggestionId, invoiceId, lineIndex, qty | updated invoiceLinks | conflict (line already linked), network | no |
| createCheckIn / updateCheckIn | CheckIn input fields | CheckIn; worse or ≤ 4 → callback Task; nextOfferingIds → planned suggestions | validation, network | no |
| createReview / updateReview | Review input fields | Review; rating ≤ 3 → callback Task | validation (link URL), network | no |
| logFeedbackAction | checkInId \| reviewId, action, note | FeedbackAction → green "✓ action · by" pill | validation (note for other), network | yes |
| printPrescription / printInvoice | id | n/a — client print of A4 sheet, no write | n/a | n/a |

## Screen: Medical (/medical/*)
### Reads
| Operation | Entity | Params (filters, sort, pagination) | Refetch triggers |
| --------- | ------ | ---------------------------------- | ---------------- |
| listSales | MedicalSale (+ invoice totals) | status (all / unpaid / returned), created; `q` on customer, seq; sort soldAt desc | save, return, void |
| listPrescriptionsToFill | Prescription | not linked to any MedicalSale; sort date desc; limit 20 | sale save |
| listMedicines | Medicine | stock (all / low), expiry (any / 30 / 60 / 90 days), manufacturerId; `q` on name, composition; sort name asc (sortable: stock, nearest expiry, MRP) | save, receive, sale |
| listPurchaseOrders | MedicalPurchaseOrder | stage, supplierId, created; `q` on seq, bill no, supplier; sort date desc | save, receive, pay |
| listSuppliers / listManufacturers / listMRs | Supplier / Manufacturer / MedicalRep (+ connections, derived payable) | `q` on name; sort name asc | save |
| listMedicalPayments | Payment | scope medical (invoice type medical OR billRef.kind medical_po OR expenseCategory medicines) + ledger filters | save |
### Writes
| Operation | Input fields | Success result + UI effect | Error cases the UI distinguishes | Optimistic? |
| --------- | ------------ | -------------------------- | -------------------------------- | ----------- |
| createSale | patientId \| medicalContactId (or new name → MedicalContact), items [{medicineId, qty}], mode, paidNow, prescriptionId (server: batches by earliest expiry, Invoice, Payment if paid) | MedicalSale + Invoice | validation, conflict (insufficient stock → names medicine), permission, network | no |
| returnSale | saleId, items [{medicineId, batchNo, qty}], reason | SaleReturn; stock restored; refund Payment + CreditNote if paid | validation (qty ≤ sold), network | no |
| voidSale | saleId, reason | voidedAt set | conflict (paid or has returns), network | no |
| createMedicine / updateMedicine | name, composition, manufacturerId, mrp, gstPct, minStock, maxStock, batches, supplierRates | Medicine | validation ("Add a name", "Enter the MRP", "Enter a rate for <supplier>"), network | no |
| quickCreateMedicine | name | Medicine (isQuick) selected in picker | conflict (name exists) | yes |
| createPO / updatePO | supplierId, supplierBillNo, date, items | MedicalPurchaseOrder (stage ordered) | validation ("Pick a supplier", required rate), conflict (not ordered any more), network | no |
| receivePO | poId, items [{received, qty, free, batchNo, expiry}] | stage received; batches added | validation, conflict | no |
| cancelPO | poId, reason | stage cancelled | conflict (already received) | no |
| create/update Supplier, Manufacturer, MR | entity input fields | record | validation ("Add a name"), conflict (delete while in use → hidden) | no |
| logMRVisit | mrId, date, samples, notes | MRVisit | validation | no |

## Screen: Clinic stock (/stock/*)
### Reads
| Operation | Entity | Params (filters, sort, pagination) | Refetch triggers |
| --------- | ------ | ---------------------------------- | ---------------- |
| listStockItems | StockItem | category; `q` on name; sort name asc (sortable: stock, category) | save, use, count |
| listMovements | StockMovement | type, itemId, created; sort createdAt desc | use, revert, purchase |
| listStockPurchases | StockPurchase | vendorId, created; sort date desc | save |
| listVendors | StockVendor | `q`; sort name asc | save |
### Writes
| Operation | Input fields | Success result + UI effect | Error cases the UI distinguishes | Optimistic? |
| --------- | ------------ | -------------------------- | -------------------------------- | ----------- |
| useStock | itemId, deltaMilli (negative), usedFor, patientId | StockMovement (used); toast "Undo" | validation (> stock), network | yes |
| revertMovement | movementId, revertReason, note | linked reverted StockMovement | conflict (already reverted), network | no |
| saveStockCount | lines[] | StockCount + adjust movements for changed lines | validation, network | no |
| create/update StockItem | name, category, unit, sizePerUnit, measureUnit, minQty, maxQty, usagePerWeekMilli, vendorId, opening qty | StockItem | validation ("Add a name") | no |
| create/update StockPurchase | vendorId, billNo, date, lines, bill, paid | StockPurchase + received movements | validation ("Pick a supplier") | no |
| create/update StockVendor | name, phone | StockVendor | validation | no |

## Screen: Payments (/payments/*, /invoices/*)
### Reads
| Operation | Entity | Params (filters, sort, pagination) | Refetch triggers |
| --------- | ------ | ---------------------------------- | ---------------- |
| listLedger | Payment | direction, kind, mode, expenseCategory, created, followUp, dayClose date (while Day close open); `q` on seq, party, invoice seq; sort paidAt desc | any payment write |
| listPendingCredits | PendingCredit | direction, status; sort createdAt desc | credit write |
| listOpenSupplierBills | MedicalPurchaseOrder (received, due > 0) + StockPurchase (bill > paid) | `q` on PO #, supplier, bill no; sort date asc (oldest first) | pay save |
| listOpenInvoices | Invoice | patientId, due > 0; sort date asc | receive save |
| getDayClose | DayClose + day totals | branchId, date | accept, close, any payment |
| getInvoice | Invoice (+ payments, credit notes) | invoiceId | save |
### Writes
| Operation | Input fields | Success result + UI effect | Error cases the UI distinguishes | Optimistic? |
| --------- | ------------ | -------------------------- | -------------------------------- | ----------- |
| receivePayment | branchId, patientId, invoiceId, splits, paidAt (server: id, seq, direction received) | Payment; invoice due recalculated | validation ("Enter an amount", amount > due), conflict (day closed), network | no |
| payExpense | billRef \| payeeName, amount, splits, expenseCategory, note | Payment; PO paid += amount, stage paid when settled | validation ("Add who was paid and the amount"), conflict (day closed), network | no |
| updatePayment | same as create | Payment | conflict (day closed → read-only) | no |
| refundPayment | invoiceId, amount, reason | CreditNote + Payment (refund) | validation (≤ paid), network | no |
| create/update PendingCredit | direction, partyName, patientId, amount, reason | PendingCredit | validation | no |
| settleCredit | creditId, action (give_back / got_back / use_on_bill) | status updated + Payment | conflict ("Nothing due for <name> to adjust against"), network | no |
| acceptOpeningCash | branchId, date, openingCash | DayClose.openingAcceptedAt | conflict (already accepted) | no |
| closeDay | branchId, date, countedCash | DayClose.closedAt; payments locked | conflict (already closed), permission | no |
| createInvoice / updateInvoice | type, branchId, patientId, teamIds, items, overallDiscount, date, remark (server: seq, totals, plan links, packages) | Invoice; matching plan rows → accepted | validation (≥1 item), conflict (edited after payment beyond total), network | no |

## Screen: Tasks (/tasks)
### Reads
| Operation | Entity | Params (filters, sort, pagination) | Refetch triggers |
| --------- | ------ | ---------------------------------- | ---------------- |
| listTasks | Task | tab (open / snoozed / done-today), ownerId (me, or all for Owner/Admin); sort dueAt asc; cursor 50 | outcome, save, 60 s poll |
| getTask | Task + source record + activity (LeadMessage) | taskId | open |
### Writes
| Operation | Input fields | Success result + UI effect | Error cases the UI distinguishes | Optimistic? |
| --------- | ------------ | -------------------------- | -------------------------------- | ----------- |
| createTask / updateTask | title, why, ownerId / ownerRole, patientId, leadId, dueAt | Task | validation | no |
| resolveTask | taskId, outcome | status done or snoozed (+3 h for no_answer); may open check-in / review drawer | conflict (already resolved) | yes |

## Screen: Offerings (/offerings/*)
### Reads
| Operation | Entity | Params (filters, sort, pagination) | Refetch triggers |
| --------- | ------ | ---------------------------------- | ---------------- |
| listOfferings | Offering (+ live offers) | category, specialty; `q` on name; sort updatedAt desc (sortable: name, price, category) | save |
| listOffers | Offer | state (derived live / scheduled / ended / paused); sort startsOn desc | save |
### Writes
| Operation | Input fields | Success result + UI effect | Error cases the UI distinguishes | Optimistic? |
| --------- | ------------ | -------------------------- | -------------------------------- | ----------- |
| create/update Offering | name, category, specialty, tone, price, minPrice, durationMin, sessions, validityDays, defaultDoctorId, room, gstPct, active | Offering; stacked create returns it to the parent picker | validation (minPrice ≤ price), conflict (name exists) | no |
| create/update Offer | name, code, kind, value, offeringIds, branchIds, startsOn, endsOn, paused, tone, note | Offer | validation (endsOn ≥ startsOn, value range), conflict (code exists) | no |

## Screen: Users (/users/*)
### Reads
| Operation | Entity | Params (filters, sort, pagination) | Refetch triggers |
| --------- | ------ | ---------------------------------- | ---------------- |
| listUsers | User | roles, branchIds; `q` on name, email, phone; sort name asc | save |
| listRolePermissions | RolePermission | all (≤ 9 roles × 10 sections), no pagination | save |
| listBranches (settings) | Branch | incl. inactive; sort isMain desc, name asc | save |
### Writes
| Operation | Input fields | Success result + UI effect | Error cases the UI distinguishes | Optimistic? |
| --------- | ------------ | -------------------------- | -------------------------------- | ----------- |
| createUser / updateUser | firstName, lastName, email, phone, password (create / reset only), roles, branchIds, tone, workingDays, startsAt, endsAt, commissionPct, active | User | validation, conflict (email exists), permission | no |
| updateRolePermission | role, section, canView, canCreate, canEdit, canDelete | RolePermission | permission (cannot remove own admin), network | yes |
| create/update Branch | Branch input fields | Branch | validation (PIN, GSTIN), conflict (name exists; only one main) | no |

---

Routes: 93. Entities: 40 (+ 2 embedded in their parent). Enums: 58. Operations: 104. Fields marked n/a: 36. Gaps I could not resolve: (1) the design uses right drawers, not centred dialogs — mapped to `dialog-over`; (2) Delete opens a confirm drawer with a reason instead of an inline confirm — kept, because the owner requires it; (3) the prototype has no real routes, so every URL above is derived from the screen and record structure; (4) `presence`, `delivery_status`, `body_part`, `task_kind`/`task_source` and `stock_unit` values beyond those visible in seed data are completions of partially shown lists — confirm; (5) money minor unit (paise) and signed `deltaMilli` are engineering decisions, not visible in the UI; (6) Sign-in screen UI beyond the "Signed out" state is not designed.
