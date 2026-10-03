# Coverage — launch-2026-09-30-jxmr

Status: ready — planning Step 5. Every row has its requirement, feature and acceptance, or is out of scope with
the decision that put it there.

Mode: initial (Baseline `none`) · Intake mode `full` · Intake hash `036cbb592ac5` · Schema-routes
`5f90325208e1`.

## Coverage

One row per PRD screen, flow, must-have, nice-to-have, out-of-scope item, interaction rule and open
question, and per `schema-routes.md` convention, entity, enum, contract rule, operation row and
unresolved gap — then, from the full drop (D6), one row per added file, frontend request (D3), background-work item, room access rule, cross-cutting rule, Blueprint rule, prototype-only behaviour and known gap. 517 rows.

| Group | Rows |
| --- | --- |
| PRD — product, roles and shell | 4 |
| PRD — screens (§3.1) | 12 |
| PRD — key flows (§3.2) | 3 |
| PRD — must-have (§5) | 16 |
| PRD — nice-to-have and out of scope (§5) | 7 |
| PRD — visual, platform and interactions (§6–§8) | 5 |
| PRD — open questions (§9) | 5 |
| schema-routes — conventions, route map, relationships | 9 |
| schema-routes — entities (40 + 2 embedded + _Common) | 43 |
| schema-routes — enums | 58 |
| schema-routes — shared list and write contract | 7 |
| schema-routes — operations (table rows; a row may bundle create / update) | 104 |
| schema-routes — gaps the drop author could not resolve | 6 |
| Full drop — the 20 added files | 20 |
| Full drop — frontend requests (D3), traced to the drop | 129 |
| Full drop — background work (worker-changes.md) | 45 |
| Full drop — access per room | 12 |
| Full drop — cross-cutting rules (_patterns.md) | 12 |
| Full drop — design documentation (Blueprint, Clinozy.dc.html:2216–2466) | 8 |
| Full drop — prototype-only behaviour (never copied) | 7 |
| Full drop — the drop's own known gaps (_report.md) | 5 |
| **Total** | **517** |

### PRD — product, roles and shell (4)

| Source (file:line) | Item | Requirement | Feature | Acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| intake-files/PRD.md:9 | Product summary — one place for front desk, doctors, therapists, pharmacist, accountant; enquiry → appointment → patient → Rx / treatment / invoice / payment | `operations.leads`, `operations.appointments`, `operations.patient-file`, `operations.invoices` | flow-enquiry-to-patient, flow-visit-to-payment, flow-plan-and-feedback | flow-enquiry-to-patient.1, flow-visit-to-payment.1, flow-plan-and-feedback.1 | covered |
| intake-files/PRD.md:15 | Roles — Front desk, Doctor, Therapist, Counsellor, Pharmacist, Accountant, Marketing, Owner / Admin, each with key abilities | `access.default-matrix`, `access.custom-roles` | team-and-access | team-and-access.1–6 | covered |
| intake-files/PRD.md:26 | Each role sees only the sections it is allowed to view (Users › Roles & access); Today highlights the role's own stages | `access.section-permissions`, `access.membership-roles` | team-and-access | team-and-access.1–6 | covered |
| intake-files/PRD.md:32 | One header on every screen — pinned section tabs, All sections, search (⌘K), branch picker; forms open as right drawers | `operations.preferences`, `operations.search` | shell-and-patterns | shell-and-patterns.1–5 | covered |

### PRD — screens (§3.1) (12)

| Source (file:line) | Item | Requirement | Feature | Acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| intake-files/PRD.md:36 | Screen · Splash — Branded load before the app (~3.7 s). | — | — | — | out-of-scope — frontend only ([D1](decisions.md)) |
| intake-files/PRD.md:42 | Screen · Today (butter) — The clinic floor right now. | `operations.today-floor` | today-floor | today-floor.1–4 | covered |
| intake-files/PRD.md:48 | Screen · Leads (lavender) — Enquiries and their conversations until they become patients. | `operations.leads` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/PRD.md:54 | Screen · Appointments (sky) — Bookings by doctor, room and machine. | `operations.appointments` | appointments | appointments.1–6 | covered |
| intake-files/PRD.md:60 | Screen · Patients (sage) — Registered patients. | `operations.patients` | patients | patients.1–3 | covered |
| intake-files/PRD.md:66 | Screen · Patient file (sage, tabs in their section colours) — Everything about one patient. | `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/PRD.md:72 | Screen · Medical (blush) — The in-house medicine store. | `operations.medical-store`, `operations.medical-sales` | medical-store | medical-store.1–4 | covered |
| intake-files/PRD.md:78 | Screen · Clinic stock (mint) — Consumables used in procedures (not sold). | `operations.clinic-stock` | clinic-stock | clinic-stock.1–3 | covered |
| intake-files/PRD.md:84 | Screen · Payments (peach) — One ledger of money in and out. | `operations.payments`, `operations.invoices` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/PRD.md:90 | Screen · Tasks (plum) — Every human follow-up with an owner and due time. | `operations.tasks` | tasks | tasks.1–4 | covered |
| intake-files/PRD.md:96 | Screen · Offerings (lime) — What the clinic sells. | `operations.offerings` | offerings | offerings.1–3 | covered |
| intake-files/PRD.md:102 | Screen · Users (slate) — Team, roles & access, branches. | `operations.team`, `operations.roles-and-access`, `operations.branches` | team-and-access | team-and-access.1–6 | covered |

### PRD — key flows (§3.2) (3)

| Source (file:line) | Item | Requirement | Feature | Acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| intake-files/PRD.md:110 | Flow 1: Enquiry becomes a patient | `operations.leads`, `operations.appointments`, `operations.patients` | flow-enquiry-to-patient | flow-enquiry-to-patient.1 | covered |
| intake-files/PRD.md:116 | Flow 2: Visit → prescription → sale → payment | `operations.prescriptions`, `operations.medical-sales`, `operations.payments` | flow-visit-to-payment | flow-visit-to-payment.1 | covered |
| intake-files/PRD.md:122 | Flow 3: Treatment plan and feedback | `operations.patient-file`, `operations.invoices`, `operations.feedback` | flow-plan-and-feedback | flow-plan-and-feedback.1 | covered |

### PRD — must-have (§5) (16)

| Source (file:line) | Item | Requirement | Feature | Acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| intake-files/PRD.md:180 | Must-have · Header with pinned section tabs, All sections, branch picker, ⌘K | `operations.preferences`, `operations.search` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/PRD.md:181 | Must-have · Today floor stages | `operations.today-floor` | today-floor | today-floor.1–4 | covered |
| intake-files/PRD.md:182 | Must-have · Leads list + lead drawer with chat and progress | `operations.leads`, `operations.messages` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/PRD.md:183 | Must-have · Appointments calendar + appointment form with status strip, reschedule, cancel, copy | `operations.appointments` | appointments | appointments.1–6 | covered |
| intake-files/PRD.md:184 | Must-have · Patients list + Patient file with all tabs | `operations.patients`, `operations.patient-file` | patients, patient-file | patients.1–3, patient-file.1–6 | covered |
| intake-files/PRD.md:185 | Must-have · Prescription with quick line, one-click dose/meal, print (A4) | `operations.prescriptions`, `files.prints` | patient-file | patient-file.1–6 | covered |
| intake-files/PRD.md:186 | Must-have · One invoice drawer for clinic and medical sales, print (A4) | `operations.invoices`, `files.prints` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/PRD.md:187 | Must-have · Medical store: stock, sales, POs, suppliers, manufacturers, MRs | `operations.medical-store`, `operations.medical-sales` | medical-store | medical-store.1–4 | covered |
| intake-files/PRD.md:188 | Must-have · Clinic stock: use, stock check, revert | `operations.clinic-stock` | clinic-stock | clinic-stock.1–3 | covered |
| intake-files/PRD.md:189 | Must-have · Payments ledger: Receive / Pay, pending credits, day close, credit notes | `operations.payments`, `operations.pending-credits`, `operations.day-close` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/PRD.md:190 | Must-have · Offering suggestions plan + Feedback (check-ins, reviews, action needed) | `operations.patient-file`, `operations.feedback` | patient-file | patient-file.1–6 | covered |
| intake-files/PRD.md:191 | Must-have · Tasks from rules with outcomes | `operations.tasks`, `operations.task-rules` | tasks | tasks.1–4 | covered |
| intake-files/PRD.md:192 | Must-have · Users, roles & access, branches | `operations.team`, `operations.roles-and-access`, `operations.branches` | team-and-access | team-and-access.1–6 | covered |
| intake-files/PRD.md:193 | Must-have · Dropdown engine (search, recent, create-from-picker), filters, tables with fold-to-fit, bulk select | `operations.lists`, `operations.search`, `operations.preferences` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/PRD.md:194 | Must-have · Draft/save model with failed-save retry, delete with reason + Undo | `operations.safe-saves`, `operations.delete-restore` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/PRD.md:195 | Must-have · Dark mode, reduced motion, offline splash, failed-load states | — | — | — | out-of-scope — frontend only ([D1](decisions.md)) |

### PRD — nice-to-have and out of scope (§5) (7)

| Source (file:line) | Item | Requirement | Feature | Acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| intake-files/PRD.md:198 | Nice-to-have · WhatsApp sending (chat is simulated) | `integrations.whatsapp-business`, `notifications.channels` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/PRD.md:199 | Nice-to-have · Real reminders going out on save | `notifications.appointment-reminder` | appointments | appointments.1–6 | covered |
| intake-files/PRD.md:200 | Nice-to-have · "Verify your email" banner | — | — | — | out-of-scope — the platform already verifies email ([D40](decisions.md), A31) |
| intake-files/PRD.md:201 | Nice-to-have · Final route URLs (currently one page switching sections) | — | — | — | out-of-scope — frontend only ([D1](decisions.md)) |
| intake-files/PRD.md:204 | Out of scope (prototype) · Phone layout (desktop / tablet only for now) | — | — | — | out-of-scope — phone layout is the frontend's (PRD.md:204, [D1](decisions.md)) |
| intake-files/PRD.md:205 | Out of scope (prototype) · Patient-facing app or booking page | — | — | — | out-of-scope — no patient-facing app (PRD.md:205, [D2](decisions.md)) |
| intake-files/PRD.md:206 | Out of scope (prototype) · Real backend, auth, integrations | `data.organization-scope`, `quality.tenant-isolation` | shell-and-patterns | shell-and-patterns.1–5 | covered |

### PRD — visual, platform and interactions (§6–§8) (5)

| Source (file:line) | Item | Requirement | Feature | Acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| intake-files/PRD.md:210 | Visual direction (§6) and platform behaviour (§7) — presentation; A4 prints of Rx, invoice and sale from web (PRD.md:225) | `files.prints` | patient-file, payments-and-invoices | patient-file.1–6, payments-and-invoices.1–6 | covered |
| intake-files/PRD.md:232 | Interactions · Empty states: each list explains what goes there and offers its "New …" button; empty Feedback card says no feedback yet with "Log feedback"; empty peek tiles show a dashed "Empty". | — | — | — | out-of-scope — frontend only ([D1](decisions.md)) |
| intake-files/PRD.md:233 | Interactions · Loading / success / error: skeleton rows while lists fetch; hover cards open only after data loads; Save reads "Saving…"; failed save keeps the drawer open with "Not saved · your changes are kept" + "Retry save"; failed list load shows a message with Retry; offline splash with Retry. Success = toast (with Undo where it applies). | `operations.safe-saves` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/PRD.md:234 | Interactions · Notifications or confirmations: delete / cancel / void = right confirm drawer with reason chips (Created by mistake · Duplicate · No longer needed · Other), then Undo toast. Rescheduling shows "a new reminder goes out on save". | `operations.delete-restore`, `notifications.appointment-reminder` | shell-and-patterns, appointments | shell-and-patterns.1–5, appointments.1–6 | covered |
| intake-files/PRD.md:235 | Interactions · Search / filter / sort: every list has search (300 ms debounce), Filters (its columns + Created + Follow-up date where it applies) and sortable columns. Leads: status, source, assigned. Appointments: doctor, status, type. Medical stock: low stock, nearest expiry. Sales: unpaid, returned. POs: stage. | `operations.lists` | shell-and-patterns | shell-and-patterns.1–5 | covered |

### PRD — open questions (§9) (5)

| Source (file:line) | Item | Requirement | Feature | Acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| intake-files/PRD.md:241 | Open question · Dark-mode pale tints need a visual check on real screens. | — | — | — | out-of-scope — frontend only ([D1](decisions.md)) |
| intake-files/PRD.md:242 | Open question · Should the "verify your email" banner be built now? | — | — | — | out-of-scope — the platform already verifies email ([D40](decisions.md), A31) |
| intake-files/PRD.md:243 | Open question · Final URLs: routes are proposed in legacy/schema-routes.md (93 routes) but the prototype is still one page. | — | — | — | out-of-scope — frontend only ([D1](decisions.md)) |
| intake-files/PRD.md:244 | Open question · When should the phone layout be designed, and for which roles first (doctor? front desk)? | — | — | — | out-of-scope — phone layout is the frontend's (PRD.md:204, [D1](decisions.md)) |
| intake-files/PRD.md:245 | Open question · Is WhatsApp the only messaging channel, or are SMS / calls logged too? | `notifications.channels` | leads-and-messages | leads-and-messages.1–6 | covered |

### schema-routes — conventions and route map (9)

| Source (file:line) | Item | Requirement | Feature | Acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| intake-files/schema-routes.md:5 | Convention · money as integer paise, currency always INR | `data.formats` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/schema-routes.md:6 | Convention · phone as E.164 +91, mobile pattern | `data.formats`, `data.contacts-on-records` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/schema-routes.md:7 | Convention · timestamps UTC; calendar dates and clock times clinic-local (Asia/Kolkata) | `data.formats` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/schema-routes.md:8 | Convention · every entity carries organization, created / updated time, created-by (see _Common) | `data.common-fields`, `data.organization-scope` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/schema-routes.md:9 | Convention · every create / show / edit is a right drawer; delete opens a confirm drawer with a required reason | `operations.delete-restore` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/schema-routes.md:10 | Convention · per-organization display sequences (#2841, PAY-5512) beside a uuid primary key | `data.display-numbers` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/schema-routes.md:16 | Route map · 93 frontend page / drawer routes with the role or permission each needs (Access column) | `access.default-matrix`, `access.section-permissions` | team-and-access | team-and-access.1–6 | covered |
| intake-files/schema-routes.md:114 | Route map · role home after sign-in, not-found behaviour, deep-link rules | — | — | — | out-of-scope — frontend only ([D1](decisions.md)) |
| intake-files/schema-routes.md:943 | Relationships · 46 relationships with cardinality and on-delete behaviour | `data.stage-foundation`, `data.stage-people`, `data.stage-scheduling`, `data.stage-billing` | shell-and-patterns | shell-and-patterns.1–5 | covered |

### schema-routes — entities (43)

| Source (file:line) | Item | Requirement | Feature | Acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| intake-files/schema-routes.md:122 | Entity · _Common — Fields present on every entity below (not repeated per table). | `data.common-fields` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/schema-routes.md:138 | Entity · Organization — The clinic business (tenant) | `data.organization-clinic-profile` | team-and-access | team-and-access.1–6 | covered |
| intake-files/schema-routes.md:154 | Entity · Branch — A clinic location | `data.stage-foundation`, `operations.branches` | team-and-access | team-and-access.1–6 | covered |
| intake-files/schema-routes.md:184 | Entity · User — A staff member who signs in | `data.membership-profile`, `data.user-presence` | team-and-access | team-and-access.1–6 | covered |
| intake-files/schema-routes.md:211 | Entity · RolePermission — Access matrix row (role × section) | `access.section-permissions` | team-and-access | team-and-access.1–6 | covered |
| intake-files/schema-routes.md:227 | Entity · UserPreference — Per-user UI state | `operations.preferences` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/schema-routes.md:242 | Entity · Lead — An enquiry and its conversation until the person becomes a patient | `data.stage-people`, `operations.leads` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/schema-routes.md:268 | Entity · LeadMessage — One chat line in a lead / contact thread | `data.stage-people`, `operations.messages` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/schema-routes.md:287 | Entity · Patient — A registered patient | `data.stage-people`, `operations.patients` | patients | patients.1–3 | covered |
| intake-files/schema-routes.md:321 | Entity · Appointment — A booking of a person with a doctor | `data.stage-scheduling`, `operations.appointments` | appointments | appointments.1–6 | covered |
| intake-files/schema-routes.md:354 | Entity · Prescription — A doctor's Rx for a patient | `data.stage-clinical-record`, `operations.prescriptions` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:374 | Entity · PrescriptionItem (embedded in Prescription.items) | `data.stage-clinical-record`, `operations.prescriptions` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:394 | Entity · Treatment — A procedure session record | `data.stage-treatments-feedback`, `operations.treatments` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:418 | Entity · PatientImage — A clinical photo | `data.stage-clinical-record`, `files.patient-photos` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:436 | Entity · PatientReport — Lab / scan / consent document | `data.stage-clinical-record`, `files.reports` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:452 | Entity · PatientPackage — A sold multi-session package | `data.stage-billing`, `data.package-sessions` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:468 | Entity · PatientNote — Timeline note on a patient | `data.stage-clinical-record`, `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:480 | Entity · OfferingSuggestion — One row of a patient's plan ("Offering suggestions") | `data.stage-billing`, `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:500 | Entity · CheckIn — Visit / aftercare check-in feedback | `data.stage-treatments-feedback`, `operations.feedback` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:523 | Entity · Review — A public / internal review | `data.stage-treatments-feedback`, `operations.feedback` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:542 | Entity · FeedbackAction — The follow-up logged against negative feedback | `data.stage-treatments-feedback`, `operations.feedback` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:557 | Entity · Offering — A sellable service / package / product | `data.stage-catalogue`, `operations.offerings` | offerings | offerings.1–3 | covered |
| intake-files/schema-routes.md:581 | Entity · Offer — A limited-time price on offerings | `data.stage-catalogue`, `operations.offerings` | offerings | offerings.1–3 | covered |
| intake-files/schema-routes.md:602 | Entity · Invoice — A bill (clinic, consultation or medical) | `data.stage-billing`, `operations.invoices` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/schema-routes.md:624 | Entity · InvoiceItem (embedded in Invoice.items) | `data.stage-billing`, `operations.invoices` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/schema-routes.md:640 | Entity · Payment — One ledger entry — money in or out (PAY-####) | `data.stage-billing`, `operations.payments` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/schema-routes.md:666 | Entity · CreditNote — Issued for every refund to a patient | `data.stage-billing`, `operations.invoices` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/schema-routes.md:680 | Entity · PendingCredit — Money owed either way, not yet settled (Payments › Pending) | `data.stage-billing`, `operations.pending-credits` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/schema-routes.md:699 | Entity · DayClose — One branch-day cash close | `data.stage-billing`, `operations.day-close` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/schema-routes.md:717 | Entity · Task — A human follow-up with owner and due time | `data.stage-tasks`, `operations.tasks` | tasks | tasks.1–4 | covered |
| intake-files/schema-routes.md:741 | Entity · Manufacturer — Medicine brand on the pack | `data.stage-medical-store`, `operations.medical-store` | medical-store | medical-store.1–4 | covered |
| intake-files/schema-routes.md:754 | Entity · Supplier — Medicine distributor (Medical) | `data.stage-medical-store`, `operations.medical-store` | medical-store | medical-store.1–4 | covered |
| intake-files/schema-routes.md:769 | Entity · MedicalRep — Medical representative | `data.stage-medical-store`, `operations.medical-store` | medical-store | medical-store.1–4 | covered |
| intake-files/schema-routes.md:783 | Entity · MRVisit | `data.stage-medical-store`, `operations.medical-store` | medical-store | medical-store.1–4 | covered |
| intake-files/schema-routes.md:795 | Entity · Medicine — A medicine for sale in the Medical store | `data.stage-medical-store`, `operations.medical-store` | medical-store | medical-store.1–4 | covered |
| intake-files/schema-routes.md:816 | Entity · MedicalPurchaseOrder | `data.stage-medical-store`, `operations.medical-store` | medical-store | medical-store.1–4 | covered |
| intake-files/schema-routes.md:832 | Entity · MedicalContact — A walk-in customer of the medicine store (not a patient) | `data.stage-medical-store`, `operations.medical-store` | medical-store | medical-store.1–4 | covered |
| intake-files/schema-routes.md:844 | Entity · MedicalSale | `data.stage-medical-store`, `operations.medical-sales` | medical-store | medical-store.1–4 | covered |
| intake-files/schema-routes.md:860 | Entity · StockVendor — "Clinic vendor" for consumables (never shared with Medical suppliers). | `data.stage-clinic-stock`, `operations.clinic-stock` | clinic-stock | clinic-stock.1–3 | covered |
| intake-files/schema-routes.md:873 | Entity · StockItem — A clinic consumable / equipment item. | `data.stage-clinic-stock`, `operations.clinic-stock` | clinic-stock | clinic-stock.1–3 | covered |
| intake-files/schema-routes.md:894 | Entity · StockPurchase | `data.stage-clinic-stock`, `operations.clinic-stock` | clinic-stock | clinic-stock.1–3 | covered |
| intake-files/schema-routes.md:909 | Entity · StockMovement — Signed stock change; every change is one row. | `data.stage-clinic-stock`, `operations.clinic-stock` | clinic-stock | clinic-stock.1–3 | covered |
| intake-files/schema-routes.md:929 | Entity · StockCount | `data.stage-clinic-stock`, `operations.clinic-stock` | clinic-stock | clinic-stock.1–3 | covered |

### schema-routes — enums (58)

| Source (file:line) | Item | Requirement | Feature | Acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| intake-files/schema-routes.md:996 | Enum · role (9: admin, doctor, therapist, front_desk, counsellor, pharmacist, accountant, marketing, owner) | `access.section-permissions`, `access.default-matrix` | team-and-access | team-and-access.1–6 | covered |
| intake-files/schema-routes.md:1009 | Enum · section (10: today, leads, appointments, patients, medical, stock, payments, tasks, offerings, users) | `access.section-permissions`, `access.default-matrix` | team-and-access | team-and-access.1–6 | covered |
| intake-files/schema-routes.md:1023 | Enum · tone (11: butter, lav, sky, sage, blush, mint, peach, plum, lime, slate, stone) | `data.membership-profile` | team-and-access | team-and-access.1–6 | covered |
| intake-files/schema-routes.md:1038 | Enum · theme (3: light, dark, system) | — | — | — | out-of-scope — frontend only ([D1](decisions.md)) |
| intake-files/schema-routes.md:1045 | Enum · presence (3: online, busy, away) | `data.user-presence` | team-and-access | team-and-access.1–6 | covered |
| intake-files/schema-routes.md:1052 | Enum · weekday (7: mon, tue, wed, thu, fri, sat, sun) | `data.membership-profile` | team-and-access | team-and-access.1–6 | covered |
| intake-files/schema-routes.md:1063 | Enum · lead_status (8: new, contacted, follow_up, clinic_visited, no_response, not_interested, invalid, lost) | `operations.leads`, `operations.messages` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/schema-routes.md:1075 | Enum · lead_source (7: instagram, google, whatsapp, facebook, walk_in, referral, retarget) | `operations.leads`, `operations.messages` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/schema-routes.md:1086 | Enum · lead_interest (6: others, clinical, peel, lhr, hydrafacial, prp) | `operations.leads`, `operations.messages` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/schema-routes.md:1096 | Enum · lead_kind (3: enquiry, retarget, contact_thread) | `operations.leads`, `operations.messages` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/schema-routes.md:1103 | Enum · channel (6: whatsapp, call, sms, instagram, email, note) | `operations.leads`, `operations.messages` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/schema-routes.md:1113 | Enum · message_direction (2: sent, received) | `operations.leads`, `operations.messages` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/schema-routes.md:1119 | Enum · delivery_status (5: queued, sent, delivered, read, failed) | `operations.leads`, `operations.messages` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/schema-routes.md:1128 | Enum · appointment_type (5: consultation, follow_up, treatment, package_session, other) | `operations.appointments` | appointments | appointments.1–6 | covered |
| intake-files/schema-routes.md:1137 | Enum · appointment_status (6: scheduled, confirmed, checked_in, completed, cancelled, no_show) | `operations.appointments` | appointments | appointments.1–6 | covered |
| intake-files/schema-routes.md:1147 | Enum · cancel_reason (5: patient_asked, unreachable, doctor_unavailable, resource_unavailable, other) | `operations.appointments` | appointments | appointments.1–6 | covered |
| intake-files/schema-routes.md:1156 | Enum · room (4: room_1, room_2, laser_room, any) | `operations.appointments` | appointments | appointments.1–6 | covered |
| intake-files/schema-routes.md:1164 | Enum · gender (3: female, male, other) | `operations.patients` | patients | patients.1–3 | covered |
| intake-files/schema-routes.md:1171 | Enum · patient_type (6: aesthetic, clinical, lhr, dental, physio, gynac) | `operations.patients` | patients | patients.1–3 | covered |
| intake-files/schema-routes.md:1181 | Enum · patient_status (4: new, regular, vip, inactive) | `operations.patients` | patients | patients.1–3 | covered |
| intake-files/schema-routes.md:1189 | Enum · patient_conversion (2: converted, not_converted) | `operations.patients` | patients | patients.1–3 | covered |
| intake-files/schema-routes.md:1195 | Enum · referral_source (6: patient, doctor, instagram, google, walk_in, other) | `operations.patients` | patients | patients.1–3 | covered |
| intake-files/schema-routes.md:1205 | Enum · patient_file_section (11: overview, timeline, prescriptions, treatments, images, reports, packages, invoices, payments, notes, team) | `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1220 | Enum · rx_meal (2: before, after) | `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1226 | Enum · rx_timing (8: empty_stomach, with_meal, morning, night, morning_night, thrice_week, once_week, alternate_days) | `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1238 | Enum · body_part (10: face, scalp, hair, body, chest, back, underarm, legs, arms, other) | `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1252 | Enum · treatment_template (5: skin, dental, physio, gynac, general) | `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1261 | Enum · aftercare_call (4: none, next_day, in_2_days, in_week) | `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1269 | Enum · image_album (3: general, private, lhr) | `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1276 | Enum · report_type (4: lab, scan, consent, other) | `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1284 | Enum · suggestion_status (4: planned, accepted, next_time, declined) | `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1292 | Enum · checkin_feel (4: much_better, better, same, worse) | `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1300 | Enum · checkin_followed (4: fully, mostly, partly, not_at_all) | `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1308 | Enum · review_source (5: google, video, instagram, internal_form, whatsapp) | `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1317 | Enum · feedback_action (9: doctor_called, asked_revisit, free_review_booked, plan_changed, replied_google, replied_instagram, replied_whatsapp, refund_credit, other) | `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1330 | Enum · offering_category (5: consultation, treatment, package, lhr, product) | `operations.offerings` | offerings | offerings.1–3 | covered |
| intake-files/schema-routes.md:1339 | Enum · offering_specialty (6: skin, hair, dental, gynac, physio, general) | `operations.offerings` | offerings | offerings.1–3 | covered |
| intake-files/schema-routes.md:1349 | Enum · offer_kind (4: percent, amount, fixed, extra) | `operations.offerings` | offerings | offerings.1–3 | covered |
| intake-files/schema-routes.md:1357 | Enum · invoice_type (3: clinic, medical, consultation) | `operations.payments`, `operations.invoices` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/schema-routes.md:1364 | Enum · payment_mode (4: cash, upi, card, credit) | `operations.payments`, `operations.invoices` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/schema-routes.md:1372 | Enum · payment_direction (2: received, paid) | `operations.payments`, `operations.invoices` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/schema-routes.md:1378 | Enum · payment_kind (6: receipt, refund, expense, supplier_bill, money_back, reversal) | `operations.payments`, `operations.invoices` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/schema-routes.md:1388 | Enum · expense_category (8: medicines, consumables, salary, rent, marketing, utilities, maintenance, misc) | `operations.payments`, `operations.invoices` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/schema-routes.md:1400 | Enum · bill_kind (3: medical_po, stock_po, other) | `operations.payments`, `operations.invoices` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/schema-routes.md:1407 | Enum · credit_direction (2: give, take) | `operations.payments`, `operations.invoices` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/schema-routes.md:1413 | Enum · credit_status (4: open, given_back, got_back, used) | `operations.payments`, `operations.invoices` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/schema-routes.md:1421 | Enum · opening_source (2: carried, default_float) | `operations.payments`, `operations.invoices` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/schema-routes.md:1427 | Enum · po_stage (4: ordered, received, paid, cancelled) | `operations.medical-store` | medical-store | medical-store.1–4 | covered |
| intake-files/schema-routes.md:1435 | Enum · stock_category (6: creams_serums, peels, masks, consumables, equipment, other) | `operations.clinic-stock` | clinic-stock | clinic-stock.1–3 | covered |
| intake-files/schema-routes.md:1445 | Enum · stock_unit (15: piece, tube, bottle, kit, pack, box, vial, ampoule, sachet, jar, roll, pair, ml, g, litre) | `operations.clinic-stock` | clinic-stock | clinic-stock.1–3 | covered |
| intake-files/schema-routes.md:1464 | Enum · measure_unit (4: ml, g, pcs, units) | `operations.clinic-stock` | clinic-stock | clinic-stock.1–3 | covered |
| intake-files/schema-routes.md:1472 | Enum · stock_movement_type (6: used, received, adjust, damaged, returned, reverted) | `operations.clinic-stock` | clinic-stock | clinic-stock.1–3 | covered |
| intake-files/schema-routes.md:1482 | Enum · revert_reason (4: mistake, wrong_item, wrong_qty, other) | `operations.clinic-stock` | clinic-stock | clinic-stock.1–3 | covered |
| intake-files/schema-routes.md:1490 | Enum · delete_reason (4: mistake, duplicate, not_needed, other) | `operations.delete-restore` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/schema-routes.md:1498 | Enum · task_kind (7: manual, follow_up, aftercare_call, callback, payment_reminder, confirm_visit, review_request) | `operations.tasks` | tasks | tasks.1–4 | covered |
| intake-files/schema-routes.md:1509 | Enum · task_source (6: lead, appointment, treatment, check_in, review, invoice) | `operations.tasks` | tasks | tasks.1–4 | covered |
| intake-files/schema-routes.md:1519 | Enum · task_status (3: open, snoozed, done) | `operations.tasks` | tasks | tasks.1–4 | covered |
| intake-files/schema-routes.md:1526 | Enum · task_outcome (5: log_check_in, doing_well, no_answer, happy, done) | `operations.tasks` | tasks | tasks.1–4 | covered |

### schema-routes — shared list and write contract (7)

| Source (file:line) | Item | Requirement | Feature | Acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| intake-files/schema-routes.md:1540 | Contract · Pagination | `operations.lists` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/schema-routes.md:1541 | Contract · Search | `operations.lists` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/schema-routes.md:1542 | Contract · Created filter | `operations.lists` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/schema-routes.md:1543 | Contract · Follow-up filter (where listed) | `operations.lists` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/schema-routes.md:1544 | Contract · Branch scope | `data.branch-scope`, `access.branch-visibility` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/schema-routes.md:1545 | Contract · Distinguished errors (every write) | `operations.safe-saves` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/schema-routes.md:1546 | Contract · Delete (every entity) | `operations.delete-restore`, `data.deleted-record-purge` | shell-and-patterns | shell-and-patterns.1–5 | covered |

### schema-routes — operations (104)

| Source (file:line) | Item | Requirement | Feature | Acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| intake-files/schema-routes.md:1552 | Operation · Sign in · read · n/a — n/a — no data before sign-in | `access.session-context` | team-and-access | team-and-access.1–6 | covered |
| intake-files/schema-routes.md:1556 | Operation · Sign in · write · signIn — session + user + org list → redirect to role home, toast "Welcome back, <first name>" | `access.session-context` | team-and-access | team-and-access.1–6 | covered |
| intake-files/schema-routes.md:1557 | Operation · Sign in · write · signOut — session cleared → "Signed out" dialog | `access.session-context` | team-and-access | team-and-access.1–6 | covered |
| intake-files/schema-routes.md:1563 | Operation · Shell · read · getSession — User, Organization, RolePermission, UserPreference | `access.session-context` | team-and-access | team-and-access.1–6 | covered |
| intake-files/schema-routes.md:1564 | Operation · Shell · read · listBranches — Branch | `operations.branches` | team-and-access | team-and-access.1–6 | covered |
| intake-files/schema-routes.md:1565 | Operation · Shell · read · commandSearch — Patient, Lead, Appointment, Invoice | `operations.search` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/schema-routes.md:1566 | Operation · Shell · read · contactCard — Patient / Lead / MedicalContact | `operations.search` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/schema-routes.md:1570 | Operation · Shell · write · updatePreference — saved silently | `operations.preferences` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/schema-routes.md:1571 | Operation · Shell · write · setPresence — toast "Status · <label>" | `operations.search` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/schema-routes.md:1577 | Operation · Today · read · listTodayFloor — Appointment (+ patient, open invoice, unfilled Rx) | `operations.today-floor` | today-floor | today-floor.1–4 | covered |
| intake-files/schema-routes.md:1578 | Operation · Today · read · todayPulse — derived | `operations.today-floor` | today-floor | today-floor.1–4 | covered |
| intake-files/schema-routes.md:1582 | Operation · Today · write · setAppointmentStatus — card moves stage | `operations.today-floor` | today-floor | today-floor.1–4 | covered |
| intake-files/schema-routes.md:1588 | Operation · Leads · read · listLeads — Lead | `operations.leads` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/schema-routes.md:1589 | Operation · Leads · read · getLead — Lead + LeadMessage (cursor 50, sentAt asc) + connected Appointments | `operations.leads` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/schema-routes.md:1593 | Operation · Leads · write · createLead — Lead → drawer switches to it, toast | `operations.leads` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/schema-routes.md:1594 | Operation · Leads · write · updateLead — Lead → draft cleared | `operations.leads` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/schema-routes.md:1595 | Operation · Leads · write · sendMessage — LeadMessage (deliveryStatus queued) appended | `operations.leads` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/schema-routes.md:1596 | Operation · Leads · write · bulkMessage / bulkExport — toast "WhatsApp drafted for N people" / file | `operations.leads` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/schema-routes.md:1602 | Operation · Appointments · read · listAppointmentsRange — Appointment | `operations.appointments` | appointments | appointments.1–6 | covered |
| intake-files/schema-routes.md:1603 | Operation · Appointments · read · listAppointments (list view) — Appointment | `operations.appointments` | appointments | appointments.1–6 | covered |
| intake-files/schema-routes.md:1604 | Operation · Appointments · read · getAppointment — Appointment + contact + connected leads + plan + photos + chat | `operations.appointments` | appointments | appointments.1–6 | covered |
| intake-files/schema-routes.md:1605 | Operation · Appointments · read · availableSlots — derived | `operations.appointments` | appointments | appointments.1–6 | covered |
| intake-files/schema-routes.md:1609 | Operation · Appointments · write · createAppointment — leadId (or new contact name+phone → contact-thread Lead), type, offeringId/serviceLabel, doctorId, durationMi… | `operations.appointments` | appointments | appointments.1–6 | covered |
| intake-files/schema-routes.md:1610 | Operation · Appointments · write · updateAppointment — Appointment; check-in moves open leads to clinic_visited + system LeadMessage | `operations.appointments` | appointments | appointments.1–6 | covered |
| intake-files/schema-routes.md:1611 | Operation · Appointments · write · cancelAppointment — status cancelled, slot released | `operations.appointments` | appointments | appointments.1–6 | covered |
| intake-files/schema-routes.md:1612 | Operation · Appointments · write · restoreAppointment — previous status | `operations.appointments` | appointments | appointments.1–6 | covered |
| intake-files/schema-routes.md:1613 | Operation · Appointments · write · uploadVisitPhotos — PatientImage[] with appointmentId | `operations.appointments` | appointments | appointments.1–6 | covered |
| intake-files/schema-routes.md:1619 | Operation · Patients · read · listPatients — Patient | `operations.patients` | patients | patients.1–3 | covered |
| intake-files/schema-routes.md:1623 | Operation · Patients · write · createPatient — Patient → opens patient file | `operations.patients` | patients | patients.1–3 | covered |
| intake-files/schema-routes.md:1629 | Operation · Patient file · read · getPatient — Patient + rail facts (next visit, dues, feedback) | `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1630 | Operation · Patient file · read · listPrescriptions — Prescription | `operations.prescriptions` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1631 | Operation · Patient file · read · listTreatments — Treatment (+ latest CheckIn) | `operations.treatments` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1632 | Operation · Patient file · read · listImages — PatientImage | `operations.images-and-reports` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1633 | Operation · Patient file · read · listReports / listPackages / listNotes — PatientReport / PatientPackage / PatientNote | `operations.images-and-reports` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1634 | Operation · Patient file · read · listPatientInvoices / listPatientPayments — Invoice / Payment | `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1635 | Operation · Patient file · read · getPlan — OfferingSuggestion + ideas (derived) + last 6 purchases + last 5 LeadMessages | `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1636 | Operation · Patient file · read · listFeedback — CheckIn + Review + FeedbackAction | `operations.feedback` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1640 | Operation · Patient file · write · updatePatient — Patient | `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1641 | Operation · Patient file · write · createPrescription / updatePrescription — Prescription; "Save & sell" also opens /medical/sales/create?prescription= | `operations.prescriptions` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1642 | Operation · Patient file · write · createTreatment / updateTreatment — Treatment; aftercare task scheduled | `operations.treatments` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1643 | Operation · Patient file · write · uploadImages / updateImage — PatientImage | `operations.images-and-reports` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1644 | Operation · Patient file · write · createReport — PatientReport | `operations.images-and-reports` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1645 | Operation · Patient file · write · addNote — PatientNote | `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1646 | Operation · Patient file · write · addSuggestion / updateSuggestion — OfferingSuggestion | `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1647 | Operation · Patient file · write · linkSuggestionInvoice / unlinkSuggestionInvoice — updated invoiceLinks | `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1648 | Operation · Patient file · write · createCheckIn / updateCheckIn — CheckIn; worse or ≤ 4 → callback Task; nextOfferingIds → planned suggestions | `operations.feedback` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1649 | Operation · Patient file · write · createReview / updateReview — Review; rating ≤ 3 → callback Task | `operations.feedback` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1650 | Operation · Patient file · write · logFeedbackAction — reviewId, action, note | `operations.feedback` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1651 | Operation · Patient file · write · printPrescription / printInvoice — n/a — client print of A4 sheet, no write | `operations.prescriptions` | patient-file | patient-file.1–6 | covered |
| intake-files/schema-routes.md:1657 | Operation · Medical · read · listSales — MedicalSale (+ invoice totals) | `operations.medical-sales` | medical-store | medical-store.1–4 | covered |
| intake-files/schema-routes.md:1658 | Operation · Medical · read · listPrescriptionsToFill — Prescription | `operations.medical-store` | medical-store | medical-store.1–4 | covered |
| intake-files/schema-routes.md:1659 | Operation · Medical · read · listMedicines — Medicine | `operations.medical-store` | medical-store | medical-store.1–4 | covered |
| intake-files/schema-routes.md:1660 | Operation · Medical · read · listPurchaseOrders — MedicalPurchaseOrder | `operations.medical-store` | medical-store | medical-store.1–4 | covered |
| intake-files/schema-routes.md:1661 | Operation · Medical · read · listSuppliers / listManufacturers / listMRs — Supplier / Manufacturer / MedicalRep (+ connections, derived payable) | `operations.medical-store` | medical-store | medical-store.1–4 | covered |
| intake-files/schema-routes.md:1662 | Operation · Medical · read · listMedicalPayments — Payment | `operations.medical-store` | medical-store | medical-store.1–4 | covered |
| intake-files/schema-routes.md:1666 | Operation · Medical · write · createSale — medicalContactId (or new name → MedicalContact), items [{medicineId, qty}], mode, paidNow, prescriptionId (se… | `operations.medical-sales` | medical-store | medical-store.1–4 | covered |
| intake-files/schema-routes.md:1667 | Operation · Medical · write · returnSale — SaleReturn; stock restored; refund Payment + CreditNote if paid | `operations.medical-sales` | medical-store | medical-store.1–4 | covered |
| intake-files/schema-routes.md:1668 | Operation · Medical · write · voidSale — voidedAt set | `operations.medical-sales` | medical-store | medical-store.1–4 | covered |
| intake-files/schema-routes.md:1669 | Operation · Medical · write · createMedicine / updateMedicine — Medicine | `operations.medical-store` | medical-store | medical-store.1–4 | covered |
| intake-files/schema-routes.md:1670 | Operation · Medical · write · quickCreateMedicine — Medicine (isQuick) selected in picker | `operations.medical-store` | medical-store | medical-store.1–4 | covered |
| intake-files/schema-routes.md:1671 | Operation · Medical · write · createPO / updatePO — MedicalPurchaseOrder (stage ordered) | `operations.medical-store` | medical-store | medical-store.1–4 | covered |
| intake-files/schema-routes.md:1672 | Operation · Medical · write · receivePO — stage received; batches added | `operations.medical-store` | medical-store | medical-store.1–4 | covered |
| intake-files/schema-routes.md:1673 | Operation · Medical · write · cancelPO — stage cancelled | `operations.medical-store` | medical-store | medical-store.1–4 | covered |
| intake-files/schema-routes.md:1674 | Operation · Medical · write · create/update Supplier, Manufacturer, MR — record | `operations.medical-store` | medical-store | medical-store.1–4 | covered |
| intake-files/schema-routes.md:1675 | Operation · Medical · write · logMRVisit — MRVisit | `operations.medical-store` | medical-store | medical-store.1–4 | covered |
| intake-files/schema-routes.md:1681 | Operation · Clinic stock · read · listStockItems — StockItem | `operations.clinic-stock` | clinic-stock | clinic-stock.1–3 | covered |
| intake-files/schema-routes.md:1682 | Operation · Clinic stock · read · listMovements — StockMovement | `operations.clinic-stock` | clinic-stock | clinic-stock.1–3 | covered |
| intake-files/schema-routes.md:1683 | Operation · Clinic stock · read · listStockPurchases — StockPurchase | `operations.clinic-stock` | clinic-stock | clinic-stock.1–3 | covered |
| intake-files/schema-routes.md:1684 | Operation · Clinic stock · read · listVendors — StockVendor | `operations.clinic-stock` | clinic-stock | clinic-stock.1–3 | covered |
| intake-files/schema-routes.md:1688 | Operation · Clinic stock · write · useStock — StockMovement (used); toast "Undo" | `operations.clinic-stock` | clinic-stock | clinic-stock.1–3 | covered |
| intake-files/schema-routes.md:1689 | Operation · Clinic stock · write · revertMovement — linked reverted StockMovement | `operations.clinic-stock` | clinic-stock | clinic-stock.1–3 | covered |
| intake-files/schema-routes.md:1690 | Operation · Clinic stock · write · saveStockCount — StockCount + adjust movements for changed lines | `operations.clinic-stock` | clinic-stock | clinic-stock.1–3 | covered |
| intake-files/schema-routes.md:1691 | Operation · Clinic stock · write · create/update StockItem — StockItem | `operations.clinic-stock` | clinic-stock | clinic-stock.1–3 | covered |
| intake-files/schema-routes.md:1692 | Operation · Clinic stock · write · create/update StockPurchase — StockPurchase + received movements | `operations.clinic-stock` | clinic-stock | clinic-stock.1–3 | covered |
| intake-files/schema-routes.md:1693 | Operation · Clinic stock · write · create/update StockVendor — StockVendor | `operations.clinic-stock` | clinic-stock | clinic-stock.1–3 | covered |
| intake-files/schema-routes.md:1699 | Operation · Payments · read · listLedger — Payment | `operations.payments` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/schema-routes.md:1700 | Operation · Payments · read · listPendingCredits — PendingCredit | `operations.pending-credits` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/schema-routes.md:1701 | Operation · Payments · read · listOpenSupplierBills — MedicalPurchaseOrder (received, due > 0) + StockPurchase (bill > paid) | `operations.payments` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/schema-routes.md:1702 | Operation · Payments · read · listOpenInvoices — Invoice | `operations.invoices` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/schema-routes.md:1703 | Operation · Payments · read · getDayClose — DayClose + day totals | `operations.day-close` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/schema-routes.md:1704 | Operation · Payments · read · getInvoice — Invoice (+ payments, credit notes) | `operations.invoices` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/schema-routes.md:1708 | Operation · Payments · write · receivePayment — Payment; invoice due recalculated | `operations.payments` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/schema-routes.md:1709 | Operation · Payments · write · payExpense — payeeName, amount, splits, expenseCategory, note | `operations.payments` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/schema-routes.md:1710 | Operation · Payments · write · updatePayment — Payment | `operations.payments` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/schema-routes.md:1711 | Operation · Payments · write · refundPayment — CreditNote + Payment (refund) | `operations.invoices`, `access.refunds` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/schema-routes.md:1712 | Operation · Payments · write · create/update PendingCredit — PendingCredit | `operations.payments` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/schema-routes.md:1713 | Operation · Payments · write · settleCredit — status updated + Payment | `operations.pending-credits` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/schema-routes.md:1714 | Operation · Payments · write · acceptOpeningCash — DayClose.openingAcceptedAt | `operations.day-close` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/schema-routes.md:1715 | Operation · Payments · write · closeDay — DayClose.closedAt; payments locked | `operations.day-close` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/schema-routes.md:1716 | Operation · Payments · write · createInvoice / updateInvoice — Invoice; matching plan rows → accepted | `operations.invoices` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/schema-routes.md:1722 | Operation · Tasks · read · listTasks — Task | `operations.tasks` | tasks | tasks.1–4 | covered |
| intake-files/schema-routes.md:1723 | Operation · Tasks · read · getTask — Task + source record + activity (LeadMessage) | `operations.tasks` | tasks | tasks.1–4 | covered |
| intake-files/schema-routes.md:1727 | Operation · Tasks · write · createTask / updateTask — Task | `operations.tasks` | tasks | tasks.1–4 | covered |
| intake-files/schema-routes.md:1728 | Operation · Tasks · write · resolveTask — status done or snoozed (+3 h for no_answer); may open check-in / review drawer | `operations.tasks` | tasks | tasks.1–4 | covered |
| intake-files/schema-routes.md:1734 | Operation · Offerings · read · listOfferings — Offering (+ live offers) | `operations.offerings` | offerings | offerings.1–3 | covered |
| intake-files/schema-routes.md:1735 | Operation · Offerings · read · listOffers — Offer | `operations.offerings` | offerings | offerings.1–3 | covered |
| intake-files/schema-routes.md:1739 | Operation · Offerings · write · create/update Offering — Offering; stacked create returns it to the parent picker | `operations.offerings` | offerings | offerings.1–3 | covered |
| intake-files/schema-routes.md:1740 | Operation · Offerings · write · create/update Offer — Offer | `operations.offerings` | offerings | offerings.1–3 | covered |
| intake-files/schema-routes.md:1746 | Operation · Users · read · listUsers — User | `operations.team`, `access.staff-invitation` | team-and-access | team-and-access.1–6 | covered |
| intake-files/schema-routes.md:1747 | Operation · Users · read · listRolePermissions — RolePermission | `operations.roles-and-access` | team-and-access | team-and-access.1–6 | covered |
| intake-files/schema-routes.md:1748 | Operation · Users · read · listBranches (settings) — Branch | `operations.branches` | team-and-access | team-and-access.1–6 | covered |
| intake-files/schema-routes.md:1752 | Operation · Users · write · createUser / updateUser — User | `operations.team`, `access.staff-invitation` | team-and-access | team-and-access.1–6 | covered |
| intake-files/schema-routes.md:1753 | Operation · Users · write · updateRolePermission — RolePermission | `operations.roles-and-access` | team-and-access | team-and-access.1–6 | covered |
| intake-files/schema-routes.md:1754 | Operation · Users · write · create/update Branch — Branch | `operations.team`, `access.staff-invitation` | team-and-access | team-and-access.1–6 | covered |

### schema-routes — gaps the drop author could not resolve (6)

| Source (file:line) | Item | Requirement | Feature | Acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| intake-files/schema-routes.md:1758 | Gap 1 · right drawers mapped to dialog-over | — | — | — | out-of-scope — frontend only ([D1](decisions.md)) |
| intake-files/schema-routes.md:1758 | Gap 2 · delete opens a confirm drawer with a reason (owner requires it) | `operations.delete-restore` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/schema-routes.md:1758 | Gap 3 · the prototype has no real routes; every URL is derived | — | — | — | out-of-scope — frontend only ([D1](decisions.md)) |
| intake-files/schema-routes.md:1758 | Gap 4 · presence, delivery_status, body_part, task_kind / task_source, stock_unit values beyond the seed data are completions — confirm | `data.value-lists` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/schema-routes.md:1758 | Gap 5 · paise and signed milli-unit stock deltas are engineering decisions, not visible in the UI | `data.formats` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/schema-routes.md:1758 | Gap 6 · sign-in screen beyond the "Signed out" state is not designed | `access.session-context` | team-and-access | team-and-access.1–6 | covered |

### Full drop — the 20 added files (20)

| Source (file:line) | Item | Requirement | Feature | Acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| intake-files/_index.md:3–22 | File · screen index: views per screen (Patients Recall; Appointments Agenda/Day/Week/Month), 11 patient-file sections, what is out of scope (Blueprint, "How data connects") | `operations.patients`, `operations.appointments`, `operations.patient-file` | patients, appointments, patient-file | patients.1–3, appointments.1–6, patient-file.1–6 | covered |
| intake-files/_report.md:13 | File · designer self-check: unreachable / unfinished flows and undesigned surfaces | — | — | — | out-of-scope — the designer's self-check; its gaps have their own rows below ([D6](decisions.md)) |
| intake-files/_patterns.md:35–289 | File · cross-screen patterns (~40% backend-relevant): save/retry, delete with reason + Undo, lists, bulk, dropdowns, chat, cards, command menu, uploads, errors | `operations.lists`, `operations.safe-saves`, `operations.delete-restore` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/today.md:1–268 | File · Today spec: 7 lanes, visit cards, work queue, Visit sheet (consult, Rx, treatment, checkout) | `operations.today-floor` | today-floor | today-floor.1–4 | covered |
| intake-files/appointments.md:1–390 | File · Appointments spec: agenda/day/week/month, appointment form, status machine, reminders | `operations.appointments` | appointments | appointments.1–6 | covered |
| intake-files/leads.md:1–442 | File · Leads spec: views, lead drawer, chat, contact editor, hold/claim, templates | `operations.leads`, `operations.messages` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/patients.md:1–308 | File · Patients spec: list views incl. Recall, new/quick-add patient, consent, bulk | `operations.patients` | patients | patients.1–3 | covered |
| intake-files/patient-file.md:1–542 | File · Patient file spec: sections, clinical notes as chips, visit flow, Rx/treatment/report/package/check-in/review drawers | `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/medical.md:1–539 | File · Medical spec: sales, medicines, POs, suppliers, manufacturers, MRs, returns, expiring stock | `operations.medical-store`, `operations.medical-sales` | medical-store | medical-store.1–4 | covered |
| intake-files/clinic-stock.md:1–419 | File · Clinic stock spec: items, purchases, movements, use, stock check, revert | `operations.clinic-stock` | clinic-stock | clinic-stock.1–3 | covered |
| intake-files/payments.md:1–430 | File · Payments spec: ledger, pending credits, receive/pay, invoice drawer, day close | `operations.payments`, `operations.invoices`, `operations.day-close` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/tasks.md:1–367 | File · Tasks spec: 13 rules, outcomes, snooze, reassign, rule settings, "Clinozy handles it" | `operations.tasks`, `operations.task-rules` | tasks | tasks.1–4 | covered |
| intake-files/offerings.md:1–419 | File · Offerings spec: offerings, offers, pricing layers, floor price | `operations.offerings` | offerings | offerings.1–3 | covered |
| intake-files/users.md:1–440 | File · Users spec: team, roles & access (matrix + 11 special permissions), branches | `operations.team`, `operations.roles-and-access`, `operations.branches` | team-and-access | team-and-access.1–6 | covered |
| intake-files/shell.md:1–76 | File · Shell spec: header, sections, branch picker, account menu | `operations.preferences` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/splash.md:1–99 | File · Splash spec: boot load, offline state | — | — | — | out-of-scope — frontend only ([D1](decisions.md)) |
| intake-files/Clinozy.dc.html:1–6177 | File · the clickable prototype: markup L1–2964, app logic + seed data L2965–6177 (read in full by 7 readers) | `operations.today-floor`, `operations.leads`, `operations.invoices` | flow-enquiry-to-patient, flow-visit-to-payment, flow-plan-and-feedback | flow-enquiry-to-patient.1, flow-visit-to-payment.1, flow-plan-and-feedback.1 | covered |
| intake-files/preset.md:1–277 | File · visual theme tokens — presentation only (theme per device :100, toast 4.5 s :254) | — | — | — | out-of-scope — frontend only ([D1](decisions.md)) |
| intake-files/design-brief-preset.md:1–230 | File · design brief + preset — presentation only (8 roles :7–8 match schema-routes.md:996–1007) | — | — | — | out-of-scope — frontend only ([D1](decisions.md)) |
| intake-files/support.js:1–1911 | File · prototype runtime bundle — presentation only, no product logic | — | — | — | out-of-scope — frontend only ([D1](decisions.md)) |

### Full drop — frontend requests (D3), traced to the drop (129)

| Source (file:line) | Item | Requirement | Feature | Acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| intake-files/users.md:71, 408 | Roles · the 11 special permissions (disc, floor, prices, dayclose, reverse, refund, void, allbr, clinical, export, perms) — enforced (D10: as catalog codes, proposed) | `access.custom-roles`, `access.special-permissions` | team-and-access | team-and-access.1–6 | covered |
| intake-files/users.md:11, 61, 361, 398 | Roles · custom roles | `access.custom-roles`, `access.special-permissions` | team-and-access | team-and-access.1–6 | covered |
| intake-files/users.md:61–65 | Roles · matrix keyed by role id; View required for Delete (users.md:65) | `access.section-permissions` | team-and-access | team-and-access.1–6 | covered |
| intake-files/users.md:110, 32, 77 | Roles · more than one role per membership (D5); first role is the main one | `access.membership-roles` | team-and-access | team-and-access.1–6 | covered |
| intake-files/users.md:11, 50, 73, 397 | Roles · seed the clinic roles with purposes, tones and presets (Marketing not found in the specs) | `access.custom-roles`, `access.special-permissions` | team-and-access | team-and-access.1–6 | covered |
| intake-files/users.md:19 | Roles · role-permission audit (Q-U6) — not found in the drop | `access.custom-roles`, `access.special-permissions` | team-and-access | team-and-access.1–6 | covered |
| intake-files/users.md:108, 117 | Users · invitation-based create (D4) — the spec shows a password (conflict) | `access.staff-invitation` | team-and-access | team-and-access.1–6 | covered |
| intake-files/users.md:32, 106, 109, 112–116 | Users · staff profile on the membership: seq, phone, tone, working days and hours, commission, branches | `operations.team`, `data.membership-profile` | team-and-access | team-and-access.1–6 | covered |
| intake-files/users.md:105 | Users · one Name field keeping "Dr." | `operations.team`, `data.membership-profile` | team-and-access | team-and-access.1–6 | covered |
| intake-files/users.md:247–252 | Users · membership removal with reason, note and 10 s restore | `access.member-removal` | team-and-access | team-and-access.1–6 | covered |
| intake-files/shell.md:27 | Users · presence (Online/Busy/Away) | `data.user-presence` | team-and-access | team-and-access.1–6 | covered |
| intake-files/users.md:136–141, 152 | Branches · area, city, PIN, phone, email optional | `operations.branches` | team-and-access | team-and-access.1–6 | covered |
| intake-files/users.md:146 | Branches · set a branch's team in one write | `operations.branches` | team-and-access | team-and-access.1–6 | covered |
| intake-files/leads.md:427–432 | Branches · maps and review links for message templates (not in the Users spec) | `operations.branches` | team-and-access | team-and-access.1–6 | covered |
| intake-files/shell.md:9, 43; today.md:5 | Preferences · pinned sections in pin order | `operations.preferences` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/_patterns.md:86 | Preferences · recent picks as ids (not values) | `operations.preferences` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/patients.md:129, 274; payments.md:39; Clinozy.dc.html:968 | Preferences · saved views per table | `operations.preferences` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/leads.md:32, 37, 65, 180, 402–403; tasks.md:46 | Leads · hold / claim / release (organization hold days, last touch, owner left) | `operations.leads` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/leads.md:17, 42 | Leads · views Mine / Unreplied (count) / All; unreplied counts | `operations.leads` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/leads.md:180 | Leads · hold filter; owner = owner or involved | `operations.leads` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/leads.md:34 | Leads · sort by updated and pipeline order | `operations.leads` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/leads.md:32, 36, 20, 304 | Leads · mark read, per-viewer unread | `operations.leads` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/leads.md:258, 80 | Leads · source "Phone call" | `operations.leads`, `data.contacts-on-records` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/leads.md:64, 83 | Leads · custom interests (≤ 30 chars) | `operations.leads` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/leads.md:253, 258 | Leads · createLead with status and patient link | `operations.leads` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/leads.md:244, 436 | Leads · delete reasons Test entry, Spam | `operations.leads` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/tasks.md:128; appointments.md:241–242, 390 | Leads · idempotent contact-thread creation per person | `operations.leads`, `data.contacts-on-records` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/leads.md:96–101, 79, 440–442; appointments.md:63 | Leads · contact fields: several mobiles (primary / WhatsApp), Instagram handles, default channel, preferences, household, lookup by phone | `operations.leads`, `data.contacts-on-records` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/leads.md:7 | Leads · Doctor in Leads access | `operations.leads` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/leads.md:72, 278–279 | Leads · status side-effect task rules | `operations.leads` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/leads.md:65, 196; Clinozy.dc.html:5704 | Leads · role-based assignment (who may reassign to whom) | `operations.leads` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/leads.md:52, 118, 378, 416 | Messaging · WhatsApp outage signal; "Queued" | `operations.messages`, `integrations.whatsapp-business` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/leads.md:52, 54, 116; tasks.md:196 | Messaging · resend a failed message | `operations.messages`, `integrations.whatsapp-business` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/leads.md:113, 419 | Messaging · Instagram send | `operations.messages`, `integrations.whatsapp-business` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/leads.md:54; tasks.md:83, 357–358 | Messaging · system messages carrying a record reference | `operations.messages`, `integrations.whatsapp-business` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/today.md:251–252; appointments.md:270; tasks.md:128; patient-file.md:25 | Messaging · per-person merged history feed | `operations.messages`, `integrations.whatsapp-business` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/patients.md:207, 265 | Patients · Recall view | `operations.patients` | patients | patients.1–3 | covered |
| intake-files/patients.md:133 | Patients · gender and conversion filters | `operations.patients` | patients | patients.1–3 | covered |
| intake-files/patients.md:30 | Patients · sorts (type, status, conversion, age, follow-up, due) | `operations.patients` | patients | patients.1–3 | covered |
| intake-files/patients.md:28, 33, 35 | Patients · per-row due total | `operations.patients` | patients | patients.1–3 | covered |
| intake-files/patients.md:28 | Patients · updated-by on every record | `operations.patients` | patients | patients.1–3 | covered |
| intake-files/patients.md:57, 172 | Patients · follow-up on create | `operations.patients` | patients | patients.1–3 | covered |
| intake-files/patients.md:54 | Patients · conversion writable and clearable | `operations.patients` | patients | patients.1–3 | covered |
| intake-files/patients.md:55 | Patients · referred-by name (≤ 30) | `operations.patients` | patients | patients.1–3 | covered |
| intake-files/patients.md:79; patient-file.md:510 | Patients · consent set Data / Photos / Marketing (replaces consentGiven) | `operations.patients` | patients | patients.1–3 | covered |
| intake-files/patient-file.md:21 | Patients · language | `operations.patients` | patients | patients.1–3 | covered |
| intake-files/patients.md:63, 299 | Patients · Onboarding task kind | `operations.patients` | patients | patients.1–3 | covered |
| intake-files/Clinozy.dc.html:5646–5647 | Patients · phone lookup that warns, never blocks (not found in the specs; prototype only) | `operations.patients` | patients | patients.1–3 | covered |
| intake-files/patient-file.md:53, 509 | Patients · create from a lead (Convert) — only indirect in the specs | `operations.patients` | patients | patients.1–3 | covered |
| intake-files/patient-file.md:3, 38 | Patient file · Visits section | `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/patient-file.md:251 | Patient file · default pins | `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/patient-file.md:3 | Patient file · default section (timeline per frontend D19) — not found; the spec opens Clinical notes | `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/patient-file.md:38, 46, 213 | Patient file · appointments by patient | `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/patient-file.md:53, 225 | Patient file · clinical notes as items {text ≤ 60, added at, added by} | `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/patient-file.md:63, 67, 486 | Patient file · per-album photo counts | `operations.images-and-reports` | patient-file | patient-file.1–6 | covered |
| intake-files/patient-file.md:163–168, 78 | Patient file · a package before its invoice; standalone "use a session" | `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/patient-file.md:176 | Patient file · optional check-in score | `operations.feedback` | patient-file | patient-file.1–6 | covered |
| intake-files/patient-file.md:112, 212, 364 | Patient file · body-part additions | `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/patient-file.md:521 | Patient file · feedback action "Called the patient" | `operations.feedback` | patient-file | patient-file.1–6 | covered |
| intake-files/patient-file.md:56, 67, 540 | Patient file · delete-reason additions (photo, suggestion) | `operations.images-and-reports` | patient-file | patient-file.1–6 | covered |
| intake-files/patient-file.md:25, 539 | Patient file · contact thread on the first message | `operations.patient-file` | patient-file | patient-file.1–6 | covered |
| intake-files/patients.md:80; patient-file.md:196, 267, 486 | Uploads · photos 15 MB; review videos 100 MB (vs the 10 MB cap) | `files.upload-limits` | patient-file | patient-file.1–6 | covered |
| intake-files/patient-file.md:7 | Patient file · role gates; Accountant has no access in the spec (frontend asked billing-only) | `access.accountant-billing` | patient-file | patient-file.1–6 | covered |
| intake-files/today.md:38–46, 157–163, 134, 247 | Visits · Visit with floor stages (frontend D18, D20) | `operations.today-floor` | today-floor | today-floor.1–4 | covered |
| intake-files/today.md:33, 59 | Visits · stage timestamps ("Waiting 6 min") | `operations.today-floor` | today-floor | today-floor.1–4 | covered |
| intake-files/today.md:135, 250 | Visits · last saved at | `operations.today-floor` | today-floor | today-floor.1–4 | covered |
| intake-files/today.md:82–85 | Visits · consult note (complaint and plan ≤ 120, findings, diagnoses) | `operations.today-floor` | today-floor | today-floor.1–4 | covered |
| intake-files/today.md:41–42, 92, 107, 120; patient-file.md:17, 92, 402 | Visits · start / move stage / pause / resume / complete | `operations.today-floor` | today-floor | today-floor.1–4 | covered |
| intake-files/today.md:3 | Visits · its own address — no URL in the prototype | `operations.today-floor` | today-floor | today-floor.1–4 | covered |
| intake-files/today.md:41, 208 | Visits · undo a check-in | `operations.today-floor` | today-floor | today-floor.1–4 | covered |
| intake-files/patient-file.md:396 | Visits · safety checks (consent, before photos, allergies) | `operations.today-floor` | today-floor | today-floor.1–4 | covered |
| intake-files/today.md:19, 38–46, 59 | Today · Enquiries and Pharmacy lanes; per-card flags | `operations.today-floor` | today-floor | today-floor.1–4 | covered |
| intake-files/today.md:134, 247, 255 | Today · allergies and contraindications | `operations.today-floor` | today-floor | today-floor.1–4 | covered |
| intake-files/today.md:84 | Today · diagnosis catalogue | `operations.today-floor` | today-floor | today-floor.1–4 | covered |
| intake-files/today.md:86 | Today · per-doctor prescription quick-add (kits) | `operations.prescriptions` | patient-file, today-floor | patient-file.1–6, today-floor.1–4 | covered |
| intake-files/today.md:83, 256 | Today · server-side dictation (later) | `operations.today-floor` | today-floor | today-floor.1–4 | covered |
| intake-files/appointments.md:3, 17, 276 | Appointments · views agenda / day / week / month | `operations.appointments` | appointments | appointments.1–6 | covered |
| intake-files/appointments.md:38, 40, 109 | Appointments · agenda from today; one meaning of "Active" | `operations.appointments` | appointments | appointments.1–6 | covered |
| intake-files/appointments.md:32 | Appointments · sort within a day | `operations.appointments` | appointments | appointments.1–6 | covered |
| intake-files/appointments.md:40, 51, 53, 107 | Appointments · per-day counts | `operations.appointments` | appointments | appointments.1–6 | covered |
| intake-files/appointments.md:30, 359–360 | Appointments · "Latest update": reminder delivery, WhatsApp "Yes", move count | `operations.appointments` | appointments | appointments.1–6 | covered |
| intake-files/appointments.md:71, 73 | Appointments · package on the appointment | `operations.appointments` | appointments | appointments.1–6 | covered |
| intake-files/appointments.md:74, 364 | Appointments · therapist in the doctor picker | `operations.appointments` | appointments | appointments.1–6 | covered |
| intake-files/appointments.md:225, 378 | Appointments · cancel reasons "Rescheduling later", "Booked by mistake" | `operations.appointments` | appointments | appointments.1–6 | covered |
| intake-files/appointments.md:245 | Appointments · restore → Scheduled | `operations.appointments` | appointments | appointments.1–6 | covered |
| intake-files/today.md:72; tasks.md:50–51; leads.md:279 | Appointments · task kinds No-show, Feedback, Call back | `operations.appointments` | appointments | appointments.1–6 | covered |
| intake-files/appointments.md:100 | Appointments · after create the drawer closes (frontend D28) | `operations.appointments` | appointments | appointments.1–6 | covered |
| intake-files/tasks.md:42–56, 178; today.md:72, 238, 240 | Tasks · a rule key per task (13 rules + Payment due + Recall) | `operations.tasks`, `operations.task-rules` | tasks | tasks.1–4 | covered |
| intake-files/tasks.md:123, 162, 315–327 | Tasks · per-rule automation and organization rule settings | `operations.tasks`, `operations.task-rules` | tasks | tasks.1–4 | covered |
| intake-files/tasks.md:185–227 | Tasks · about 40 outcomes, each with its result | `operations.tasks`, `operations.task-rules` | tasks | tasks.1–4 | covered |
| intake-files/tasks.md:58, 78, 309–310 | Tasks · resolved by (Clinozy or a person), result text, note ≤ 200 | `operations.tasks`, `operations.task-rules` | tasks | tasks.1–4 | covered |
| intake-files/tasks.md:178, 351 | Tasks · client-chosen snooze time and label | `operations.tasks`, `operations.task-rules` | tasks | tasks.1–4 | covered |
| intake-files/tasks.md:38, 113, 178, 355 | Tasks · reassign history | `operations.tasks`, `operations.task-rules` | tasks | tasks.1–4 | covered |
| intake-files/tasks.md:66, 178, 7 | Tasks · list search, type filter, "Everyone" for every role | `operations.tasks`, `operations.task-rules` | tasks | tasks.1–4 | covered |
| intake-files/tasks.md:58 | Tasks · Done entries for WhatsApp-confirmed visits | `operations.tasks`, `operations.task-rules` | tasks | tasks.1–4 | covered |
| intake-files/tasks.md:123, 227, 347–348 | Tasks · "Let Clinozy do it" | `operations.tasks`, `operations.task-rules` | tasks | tasks.1–4 | covered |
| intake-files/Clinozy.dc.html:1877–1878 | Tasks · new task type, priority, "Remind 15 min before" (prototype only; the spec has no create) | `operations.tasks`, `operations.task-rules` | tasks | tasks.1–4 | covered |
| intake-files/payments.md:103, 124, 29, 109, 129, 207 | Money · payment reference, attachments, edit log | `operations.payments` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/payments.md:34, 291 | Money · payment delete reasons | `operations.payments` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/payments.md:138, 143, 149 | Money · createSale with splits and a lead as buyer | `operations.medical-sales` | medical-store | medical-store.1–4 | covered |
| intake-files/medical.md:289, 294, 366 | Money · returnSale refund mode / write-off; voidSale restores stock and cancels the invoice; cancelPO reasons | `operations.medical-sales` | medical-store | medical-store.1–4 | covered |
| intake-files/payments.md:160, 161, 179, 45 | Money · pending credit: invoice link, settle-by, partial settle, adjusted | `operations.pending-credits` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/payments.md:191, 277, 327, 331, 187, 61, 67, 423 | Money · day close: reopen, auto-close, recounted opening, per-entry checked | `operations.day-close` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/payments.md:76, 327, 422 | Money · ₹2,000 default float as an organization setting | `operations.payments` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/payments.md:76 | Money · per-mode nets incl. splits | `operations.payments` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/payments.md:277, 331 | Money · last closes and open days | `operations.payments` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/payments.md:7; users.md:71, 73 | Money · gate day close by the special permission, not role names | `operations.day-close` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/payments.md:141, 88 | Money · overall discount before tax (C24) | `operations.invoices` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/payments.md:19; _patterns.md:129–130 | Money · list footer counts and totals | `operations.lists` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/offerings.md:70, 68, 73, 80, 81 | Offerings · offer price, branch availability, GST inclusive, search terms, description | `operations.offerings` | offerings | offerings.1–3 | covered |
| intake-files/offerings.md:72 | Offerings · GST as a number | `operations.offerings` | offerings | offerings.1–3 | covered |
| intake-files/offerings.md:102–103, 357, 107, 105 | Offerings · offer dates optional, all branches, note ≤ 1,000 | `operations.offerings` | offerings | offerings.1–3 | covered |
| intake-files/offerings.md:33 | Offerings · sorts on id, duration, sessions, status, billed price | `operations.offerings` | offerings | offerings.1–3 | covered |
| intake-files/medical.md:177, 536 | Medical · prescription-only flag | `operations.medical-store` | medical-store | medical-store.1–4 | covered |
| intake-files/medical.md:17, 45, 50, 539 | Medical · near-expiry discount | `operations.medical-store` | medical-store | medical-store.1–4 | covered |
| intake-files/medical.md:50, 200, 297–309 | Medical · return expiring stock to a supplier, with a supplier credit | `operations.medical-sales` | medical-store | medical-store.1–4 | covered |
| intake-files/medical.md:315–317, 319 | Medical · quick create for manufacturer, supplier, MR | `operations.medical-store` | medical-store | medical-store.1–4 | covered |
| intake-files/medical.md:55, 87, 103 | Medical · manufacturer / supplier / MR filters | `operations.medical-store` | medical-store | medical-store.1–4 | covered |
| intake-files/medical.md:31, 47, 63, 79, 95, 111 | Medical · sort keys per list | `operations.medical-store` | medical-store | medical-store.1–4 | covered |
| intake-files/medical.md:200, 433 | Medical · supplier account history | `operations.medical-store` | medical-store | medical-store.1–4 | covered |
| intake-files/medical.md:17, 264, 261, 45, 179 | Medical · reorder-low read with the best rate | `operations.medical-store` | medical-store | medical-store.1–4 | covered |
| intake-files/clinic-stock.md:34, 126–140 | Clinic stock · movements Received / Adjust / Damaged / Returned with a note, and Undo | `operations.clinic-stock` | clinic-stock | clinic-stock.1–3 | covered |
| intake-files/clinic-stock.md:61, 71 | Clinic stock · purchase payment rows in the movements list | `operations.clinic-stock` | clinic-stock | clinic-stock.1–3 | covered |
| intake-files/clinic-stock.md:114 | Clinic stock · an Adjust movement when "In stock" changes on edit (implied) | `operations.clinic-stock` | clinic-stock | clinic-stock.1–3 | covered |
| intake-files/clinic-stock.md:149 | Clinic stock · last rate per item — not found in the drop | `operations.clinic-stock` | clinic-stock | clinic-stock.1–3 | covered |
| intake-files/clinic-stock.md:31, 39, 47, 149, 154 | Clinic stock · low-stock filter and sorts | `operations.clinic-stock` | clinic-stock | clinic-stock.1–3 | covered |
| intake-files/clinic-stock.md:19 | Clinic stock · vendors with payable and purchase count — not found (closest: footer due) | `operations.clinic-stock` | clinic-stock | clinic-stock.1–3 | covered |
| intake-files/clinic-stock.md:149, 187–201 | Clinic stock · quick clinic item create | `operations.clinic-stock` | clinic-stock | clinic-stock.1–3 | covered |
| intake-files/today.md:149; shell.md:23 | Search · includes invoices; no appointments group | `operations.search` | shell-and-patterns | shell-and-patterns.1–5 | covered |

### Full drop — background work (worker-changes.md) (45)

| Source (file:line) | Item | Requirement | Feature | Acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| intake-files/schema-routes.md:279 | Background · WC-1 background.message-delivery | `background.message-delivery` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/leads.md:378 | Background · WC-2 message outage queue | `background.message-outage-queue` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/leads.md:410 | Background · WC-3 inbound messages | `background.inbound-messages` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/Clinozy.dc.html:4224 | Background · WC-4 channel fallback SMS → call | `background.channel-fallback` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/appointments.md:100 | Background · WC-5 booking confirm request | `background.booking-confirm-request` | appointments | appointments.1–6 | covered |
| intake-files/appointments.md:376 | Background · WC-6 appointment reminder | `background.appointment-reminder` | appointments | appointments.1–6 | covered |
| intake-files/appointments.md:244 | Background · WC-7 reminders follow reschedule / cancel / restore | `background.reminder-rescheduling` | appointments | appointments.1–6 | covered |
| intake-files/appointments.md:360 | Background · WC-8 auto-confirm on "Yes" | `background.auto-confirm-on-reply` | appointments | appointments.1–6 | covered |
| intake-files/payments.md:207 | Background · WC-9 payment receipt on WhatsApp | `background.payment-receipt` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/payments.md:193 | Background · WC-10 day-close summary to admin | `background.day-close-summary` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/patient-file.md:400 | Background · WC-11 visit share (Rx, invoice, photos) | `background.visit-share` | patient-file | patient-file.1–6 | covered |
| intake-files/medical.md:17 | Background · WC-12 bulk payment reminders | `background.bulk-payment-reminders` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/patients.md:281 | Background · WC-13 bulk message drafts | `background.bulk-message-drafts` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/leads.md:402 | Background · WC-14 lead hold release | `background.lead-hold-release` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/leads.md:119 | Background · WC-15 lead status auto-changes | `background.lead-status-auto` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/leads.md:192 | Background · WC-16 involved auto-add | `background.lead-involved-auto` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/schema-routes.md:244 | Background · WC-17 re-target leads | `background.retarget-leads` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/tasks.md:44 | Background · WC-18 task · reply | `background.task-reply` | tasks | tasks.1–4 | covered |
| intake-files/Clinozy.dc.html:4245 | Background · WC-19 task · message failed | `background.task-failed-message` | tasks | tasks.1–4 | covered |
| intake-files/Clinozy.dc.html:4246 | Background · WC-20 task · follow-up | `background.task-follow-up` | tasks | tasks.1–4 | covered |
| intake-files/leads.md:279 | Background · WC-21 task · call back | `background.task-call-back` | tasks | tasks.1–4 | covered |
| intake-files/Clinozy.dc.html:4247 | Background · WC-22 task · claim | `background.task-claim` | tasks | tasks.1–4 | covered |
| intake-files/Clinozy.dc.html:4250 | Background · WC-23 task · confirm | `background.task-confirm` | tasks | tasks.1–4 | covered |
| intake-files/Clinozy.dc.html:4251 | Background · WC-24 task · arrived? | `background.task-arrive` | tasks | tasks.1–4 | covered |
| intake-files/Clinozy.dc.html:4252 | Background · WC-25 task · rebook | `background.task-rebook` | tasks | tasks.1–4 | covered |
| intake-files/Clinozy.dc.html:4253 | Background · WC-26 task · feedback | `background.task-feedback` | tasks | tasks.1–4 | covered |
| intake-files/Clinozy.dc.html:4254 | Background · WC-27 task · aftercare call | `background.task-aftercare` | tasks | tasks.1–4 | covered |
| intake-files/Clinozy.dc.html:4256 | Background · WC-28 task · next visit | `background.task-next-visit` | tasks | tasks.1–4 | covered |
| intake-files/Clinozy.dc.html:4257 | Background · WC-29 task · gone quiet | `background.task-gone-quiet` | tasks | tasks.1–4 | covered |
| intake-files/payments.md:149 | Background · WC-30 task · payment due | `background.task-payment-due` | tasks | tasks.1–4 | covered |
| intake-files/patients.md:63 | Background · WC-31 task · onboarding | `background.task-onboarding` | tasks | tasks.1–4 | covered |
| intake-files/patient-file.md:186 | Background · WC-32 task · doctor call-back | `background.task-unhappy` | tasks | tasks.1–4 | covered |
| intake-files/payments.md:161 | Background · WC-33 task · settle by | `background.task-settle-by` | tasks | tasks.1–4 | covered |
| intake-files/medical.md:251 | Background · WC-34 task · MR next visit | `background.task-medical-rep-visit` | tasks | tasks.1–4 | covered |
| intake-files/tasks.md:58 | Background · WC-35 task auto-resolve | `background.task-auto-resolve` | tasks | tasks.1–4 | covered |
| intake-files/tasks.md:178 | Background · WC-36 snoozed task returns | `background.task-snooze-return` | tasks | tasks.1–4 | covered |
| intake-files/tasks.md:162 | Background · WC-37 "Clinozy handles it" | `background.task-automation` | tasks | tasks.1–4 | covered |
| intake-files/Clinozy.dc.html:4549 | Background · WC-38 task de-dup | `background.task-dedupe` | tasks | tasks.1–4 | covered |
| intake-files/payments.md:327 | Background · WC-39 day auto-close | `background.day-auto-close` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/users.md:19 | Background · WC-40 permission refresh | `background.permission-refresh` | team-and-access | team-and-access.1–6 | covered |
| intake-files/users.md:117 | Background · WC-41 inactive sign-out | `background.inactive-sign-out` | team-and-access | team-and-access.1–6 | covered |
| intake-files/today.md:262 | Background · WC-42 photo location cleanup | `background.photo-cleanup` | patient-file | patient-file.1–6 | covered |
| intake-files/patient-file.md:396 | Background · WC-43 before/after photo pairing | `background.photo-pairing` | patient-file | patient-file.1–6 | covered |
| intake-files/today.md:41 | Background · WC-44 floor live updates | `background.floor-live` | today-floor | today-floor.1–4 | covered |
| intake-files/today.md:92 | Background · WC-45 pharmacy queue | `background.pharmacy-queue` | today-floor | today-floor.1–4 | covered |

### Full drop — access per room (12)

| Source (file:line) | Item | Requirement | Feature | Acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| intake-files/today.md:7 | Access · Today: every role; role focus dims lanes | `access.default-matrix` | today-floor | today-floor.1–4 | covered |
| intake-files/appointments.md:7 | Access · Appointments: Admin, Doctor, Front desk, Counsellor, Therapist; create/edit without Therapist | `access.default-matrix` | appointments | appointments.1–6 | covered |
| intake-files/leads.md:7 | Access · Leads: Admin, Doctor, Front desk, Counsellor; delete Admin (no Marketing) | `access.default-matrix` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/patients.md:7; patient-file.md:7 | Access · Patients / file: view Admin, Doctor, Front desk, Counsellor, Pharmacist, Therapist; create/edit except Therapist; delete Admin; Accountant none | `access.default-matrix`, `access.accountant-billing` | patients, patient-file | patients.1–3, patient-file.1–6 | covered |
| intake-files/medical.md:7 | Access · Medical: view Admin, Pharmacist, Accountant; create/edit Admin, Pharmacist; delete/cancel/void Admin | `access.default-matrix` | medical-store | medical-store.1–4 | covered |
| intake-files/clinic-stock.md:7 | Access · Clinic stock: view Admin, Pharmacist, Accountant; create/edit Admin, Pharmacist; delete Admin | `access.default-matrix` | clinic-stock | clinic-stock.1–3 | covered |
| intake-files/payments.md:7 | Access · Payments: view Admin, Front desk, Counsellor, Accountant; create/edit Admin, Front desk, Counsellor; delete Admin | `access.default-matrix`, `access.billing-is-payments` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/tasks.md:7 | Access · Tasks: Admin, Doctor, Front desk, Counsellor, Therapist; no create; outcomes/snooze/reassign for every viewer | `access.default-matrix` | tasks | tasks.1–4 | covered |
| intake-files/offerings.md:7, 74 | Access · Offerings: Admin only by default; lowest price needs the floor permission (and must be hidden from others) | `access.default-matrix`, `access.special-permissions` | offerings | offerings.1–3 | covered |
| intake-files/users.md:7, 77 | Access · Users: Admin only; editing roles needs "Change roles & access"; Admin cannot be narrowed | `access.default-matrix`, `access.owner-acts` | team-and-access | team-and-access.1–6 | covered |
| intake-files/shell.md:39, 63 | Access · navigation lists only viewable sections; "Previewing as <role>" | `access.section-permissions` | team-and-access | team-and-access.1–6 | covered |
| intake-files/patient-file.md:63, 439; today.md:253, 262 | Access · Private album and clinical notes only for allowed roles (no rule given in the specs) | `access.private-album`, `access.special-permissions` | patient-file | patient-file.1–6 | covered |

### Full drop — cross-cutting rules (_patterns.md) (12)

| Source (file:line) | Item | Requirement | Feature | Acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| intake-files/_patterns.md:35–37, 285 | Rule · save is not optimistic; failed save keeps the draft with Retry; a stacked create returns the full record | `operations.safe-saves` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/_patterns.md:274, 285 | Rule · double-press guard + Retry → creates must be safe to retry | `quality.safe-retry` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/_patterns.md:56, 61, 65–75, 238 | Rule · delete / cancel / void through a reason (note ≤ 160, required for Other), per-kind reasons and effects, then Undo | `operations.delete-restore` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/_patterns.md:99, 113–115, 123 | Rule · search 300 ms; filters applied on Apply (Created, Follow-up sections); sort asc → desc → off | `operations.lists` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/_patterns.md:100, 102 | Rule · saved views; show / hide columns | `operations.preferences` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/_patterns.md:129–133 | Rule · whole list loaded and virtualised; footer count; select all N (conflicts with "no totals", schema-routes.md:1540) | `operations.lists` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/_patterns.md:84–88 | Rule · dropdowns search 250 ms, 30 per page; recent picks; create from the picker | `operations.preferences`, `operations.lists` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/_patterns.md:203 | Rule · command menu scope and caps; masked phone | `operations.search`, `quality.privacy` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/_patterns.md:253–255 | Rule · uploads: 10 MB (photos 15 MB), per-file progress | `files.upload-limits` | patient-file | patient-file.1–6 | covered |
| intake-files/_patterns.md:149–192 | Rule · chat: channels, delivery states, default channel follows the last used, templates, merged history | `operations.messages`, `notifications.channels` | leads-and-messages | leads-and-messages.1–6 | covered |
| intake-files/_patterns.md:214–229 | Rule · hover cards fetch first; team card presence and "Updated HH:MM" | `data.user-presence` | team-and-access | team-and-access.1–6 | covered |
| intake-files/_patterns.md:282, 286–289 | Rule · list load failure keeps the last rows; no remote errors designed for dropdowns, command menu, hover cards | — | — | — | out-of-scope — frontend only ([D1](decisions.md)) |

### Full drop — design documentation (Blueprint, Clinozy.dc.html:2216–2466) (8)

| Source (file:line) | Item | Requirement | Feature | Acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| intake-files/Clinozy.dc.html:2349 | Blueprint · slots free only when person, room and machine are free, inside branch hours and holidays; rechecked on Book | `operations.appointments` | appointments | appointments.1–6 | covered |
| intake-files/Clinozy.dc.html:2350 | Blueprint · phone is never identity; same person / family member / decide later | `data.contacts-on-records`, `operations.patients` | patients, leads-and-messages | patients.1–3, leads-and-messages.1–6 | covered |
| intake-files/Clinozy.dc.html:2351 | Blueprint · totals by the server; old bills keep old prices; payments never edited; credit note only | `operations.invoices`, `operations.payments` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/Clinozy.dc.html:2352 | Blueprint · no negative stock; expired batch blocked; price ≤ MRP; every movement tied to item + batch | `operations.medical-sales` | medical-store | medical-store.1–4 | covered |
| intake-files/Clinozy.dc.html:2354 | Blueprint · each write carries a one-time (idempotency) key | `quality.safe-retry` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/Clinozy.dc.html:2355–2356 | Blueprint · concurrent edits: who changed what + Load latest; "Updated 10:42" | `operations.safe-saves` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/Clinozy.dc.html:2448–2452 | Blueprint · financial-year numbering April–March; GST 18% aesthetic, consults exempt; refunds by owner / accountant; counsellor discount cap 15% | `operations.invoices`, `access.refunds`, `access.discounts` | payments-and-invoices, offerings | payments-and-invoices.1–6, offerings.1–3 | covered |
| intake-files/Clinozy.dc.html:2322, 2371–2376 | Blueprint · trial import → reconcile → go-live; AI drafts (reply, summary, dictation, aftercare) | — | — | — | out-of-scope — no legacy import ([D40](decisions.md)); AI drafts later ([D44](decisions.md)) |

### Full drop — prototype-only behaviour (never copied) (7)

| Source (file:line) | Item | Requirement | Feature | Acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| intake-files/Clinozy.dc.html:4461–4482, 4215 | Prototype · fake latency and random failures | — | — | — | out-of-scope — prototype-only, never copied ([D11](decisions.md)) |
| intake-files/Clinozy.dc.html:3409–3413, 5603 | Prototype · fixed / shifted clock and hard-coded dates | — | — | — | out-of-scope — prototype-only, never copied ([D11](decisions.md)) |
| intake-files/Clinozy.dc.html:4416, 5664, 4205 | Prototype · records joined by name instead of id | — | — | — | out-of-scope — prototype-only, never copied ([D11](decisions.md)) |
| intake-files/Clinozy.dc.html:5507, 4549 | Prototype · client-made ids (max + 1, Date.now) | — | — | — | out-of-scope — prototype-only, never copied ([D11](decisions.md)) |
| intake-files/Clinozy.dc.html:3165, 3934, 4013, 4151 | Prototype · preferences in localStorage (become server preferences — C7) | `operations.preferences` | shell-and-patterns | shell-and-patterns.1–5 | covered |
| intake-files/Clinozy.dc.html:3548, 4419, 5743 | Prototype · hard-coded clinic identity and people | — | — | — | out-of-scope — prototype-only, never copied ([D11](decisions.md)) |
| intake-files/Clinozy.dc.html:5356, 5421, 5442, 5102, 5413, 5417 | Prototype · ledger shortcuts that skip records (collect / pay / return without a payment record) | — | — | — | out-of-scope — prototype-only, never copied ([D11](decisions.md)) |

### Full drop — the drop's own known gaps (_report.md) (5)

| Source (file:line) | Item | Requirement | Feature | Acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| intake-files/_report.md:13; patient-file.md:28 | Gap · the Overview bento cannot be opened | — | — | — | out-of-scope — frontend only ([D1](decisions.md)) |
| intake-files/_report.md:13 | Gap · the New task drawer cannot be reached (createTask unchecked against a design) | `operations.tasks` | tasks | tasks.1–4 | covered |
| intake-files/_report.md:13 | Gap · the stacked New offering steps cannot be advanced | — | — | — | out-of-scope — frontend only ([D1](decisions.md)) |
| intake-files/_report.md:13 | Gap · Day close › Review never fills its State and action cells | `operations.day-close` | payments-and-invoices | payments-and-invoices.1–6 | covered |
| intake-files/_report.md:13 | Gap · notifications, organization switcher, security / billing / devices are not designed | — | — | — | out-of-scope — platform surfaces that already exist; not designed for the clinic ([D1](decisions.md)) |

### Out of scope — at a glance

The 31 coverage rows marked `out-of-scope`, in one table (the full rows sit in their groups above).

| # | Out of scope | Why | Decision | Source |
| --- | --- | --- | --- | --- |
| 1 | Splash screen | frontend only | [D1](decisions.md) | PRD.md:36 |
| 2 | Dark mode, motion, offline states | frontend only | [D1](decisions.md) | PRD.md:195 |
| 3 | "Verify your email" banner | platform already does it | [D40](decisions.md) | PRD.md:200 |
| 4 | Final route URLs | frontend only | [D1](decisions.md) | PRD.md:201 |
| 5 | Phone layout | frontend only | [D1](decisions.md) | PRD.md:204 |
| 6 | Patient-facing app | not in this launch | [D2](decisions.md) | PRD.md:205 |
| 7 | Empty states | frontend only | [D1](decisions.md) | PRD.md:232 |
| 8 | Dark-mode tint check | frontend only | [D1](decisions.md) | PRD.md:241 |
| 9 | Verify-email question | platform already does it | [D40](decisions.md) | PRD.md:242 |
| 10 | Final URLs question | frontend only | [D1](decisions.md) | PRD.md:243 |
| 11 | Phone layout question | frontend only | [D1](decisions.md) | PRD.md:244 |
| 12 | Role home, not-found, deep links | frontend only | [D1](decisions.md) | schema-routes.md:114 |
| 13 | Theme value list | frontend only | [D1](decisions.md) | schema-routes.md:1038 |
| 14 | Drawers as dialog routes | frontend only | [D1](decisions.md) | schema-routes.md:1758 |
| 15 | Derived URLs | frontend only | [D1](decisions.md) | schema-routes.md:1758 |
| 16 | Designer self-check file | its gaps have own rows | [D6](decisions.md) | _report.md:13 |
| 17 | Splash spec | frontend only | [D1](decisions.md) | splash.md |
| 18 | Theme tokens (preset) | frontend only | [D1](decisions.md) | preset.md |
| 19 | Design brief preset | frontend only | [D1](decisions.md) | design-brief-preset.md |
| 20 | Prototype runtime bundle | frontend only | [D1](decisions.md) | support.js |
| 21 | List-load error display | frontend only | [D1](decisions.md) | _patterns.md:282, 286–289 |
| 22 | Legacy import, AI drafts | later iteration | [D40](decisions.md), [D44](decisions.md) | Clinozy.dc.html:2322, 2371–2376 |
| 23 | Fake latency and failures | prototype only | [D11](decisions.md) | Clinozy.dc.html:4461–4482 |
| 24 | Fixed clock and dates | prototype only | [D11](decisions.md) | Clinozy.dc.html:3409–3413 |
| 25 | Joins by name | prototype only | [D11](decisions.md) | Clinozy.dc.html:4416 |
| 26 | Client-made ids | prototype only | [D11](decisions.md) | Clinozy.dc.html:5507 |
| 27 | Hard-coded clinic and people | prototype only | [D11](decisions.md) | Clinozy.dc.html:3548 |
| 28 | Ledger shortcuts | prototype only | [D11](decisions.md) | Clinozy.dc.html:5356 |
| 29 | Overview bento | frontend only | [D1](decisions.md) | _report.md:13 |
| 30 | Stacked New offering | frontend only | [D1](decisions.md) | _report.md:13 |
| 31 | Notifications, org switcher, security | platform surfaces exist | [D1](decisions.md) | _report.md:13 |

## Reconciliation

Planning Step 3. Every place where `PRD.md` and `schema-routes.md` disagree, where `schema-routes.md`
disagrees with itself, or where the drop disagrees with what this repository already provides — with
evidence on both sides. Items where both files agree are not listed; they are covered by their
coverage rows.

**Verdict rules (approved, [D1](decisions.md)):**

| Rule | When | Wins |
| --- | --- | --- |
| R1 | field-level detail — fields, types, value lists, validation | `schema-routes.md` (it was derived from the design screens) |
| R2 | product scope, behaviour, who uses what | `PRD.md` |
| R3 | a conflict in behaviour or access that neither file settles | no verdict — a Step 4 question (RED, or AMBER with a safe default) |
| R4 | the drop's conventions against this repository's API contract | the repository (non-negotiable); the difference becomes a Standing deviation |

Verdict values: `schema-routes` · `PRD` · `compatible` (both hold) · `Step 4 · RED` · `Step 4 · AMBER` ·
`frontend only` (no backend requirement — its coverage rows become `out-of-scope` for this repository
at Step 5).

### A — PRD ↔ schema-routes

| # | Item | PRD says (file:line) | schema-routes says (file:line) | Verdict | Action |
| --- | --- | --- | --- | --- | --- |
| A1 | Owner and Admin | one role row "Owner / Admin" — PRD.md:24 | two values: `admin` "full settings access", `owner` "everything" — schema-routes.md:999, 1007 | schema-routes (R1) + Step 4 · RED | keep two roles; ask what Admin may not do that Owner may |
| A2 | Configurable access vs fixed roles | each role sees what Users › Roles & access allows — PRD.md:26 | some actions name roles instead of a section permission: Rx (Doctor, Admin), treatments (Doctor, Therapist), day close (Accountant, Admin, Owner), Users (Admin, Owner) — schema-routes.md:35, 37–39, 91, 104–110; the editable matrix — schema-routes.md:211–225 | Step 4 · RED (R3) | decide which actions are fixed to a role and which follow the editable matrix |
| A3 | Who prescribes | Doctor "Rx" — PRD.md:18 | Rx create / edit: "Doctor, Admin" — schema-routes.md:35, 37 | PRD (R2), confirm at Step 4 · RED | only doctors prescribe, unless the user says Admin may |
| A4 | Patient list and patient file access | list: "All clinical roles, Front desk, Owner" — PRD.md:62; file: "Clinical roles, Front desk, Counsellor, Accountant (billing)" — PRD.md:68 | list: "any clinical/desk role" — schema-routes.md:30; file: patients.view (+ billing.view for billing tabs) — schema-routes.md:33 | Step 4 · RED (R3) | the PRD contradicts itself; settle which roles see the list, the file, and which tabs |
| A5 | Counsellor creates invoices | Counsellor key ability "invoices" — PRD.md:20; "Counsellor creates the invoice" — PRD.md:124 | Payments access excludes Counsellor — schema-routes.md:84; invoice create needs billing.create — schema-routes.md:92 | PRD (R2) | Counsellor may create invoices without the Payments ledger; confirm in the Step 4 access matrix |
| A6 | Marketing and reviews | Marketing key abilities "Leads, sources, reviews" — PRD.md:23 | reviews live in the patient file under patients.edit — schema-routes.md:46–47; Patients excludes Marketing — PRD.md:62, schema-routes.md:30 | Step 4 · RED (R3) | decide whether Marketing logs or reads reviews, and through what |
| A7 | Today floor stages | eight stages Enquiry · Booked · Waiting · With doctor · Treatment · Checkout · Pharmacy · Done — PRD.md:45; a must-have — PRD.md:181 | stage = "status + open invoice/Rx" — schema-routes.md:352; appointment statuses have no Waiting / With doctor / Treatment / Checkout / Pharmacy — schema-routes.md:1137–1145; "card moves stage" — schema-routes.md:1582 | PRD (R2) + Step 4 · RED | the eight stages stay; ask how a visit reaches each stage (staff move vs automatic) |
| A8 | Walk-in | "New ⌄" creates a walk-in — PRD.md:46 | no walk-in operation; createAppointment accepts a new contact — schema-routes.md:1609 | compatible + Step 4 · AMBER | a walk-in is an appointment for now; default: created already checked in |
| A9 | Lead filters | status, source, assigned (+ Created, Follow-up) — PRD.md:51, 235 | adds interests — schema-routes.md:22, 1588 | schema-routes (R1) | include the interests filter |
| A10 | Real WhatsApp delivery | nice-to-have "WhatsApp sending (chat is simulated)" — PRD.md:198 | messages carry a delivery state Sending → Sent → Delivered → Read / Failed — schema-routes.md:279, 1119–1126, 1595 | Step 4 · RED (R3) | ask: real delivery at launch, or messages logged only |
| A11 | Message channels | open question "WhatsApp only, or SMS / calls logged too?" — PRD.md:245 | channels WhatsApp, Call, SMS, Instagram, Email, Note — schema-routes.md:1103–1111 | schema-routes proposes, confirm at Step 4 · RED | ask together with A10 |
| A12 | Appointment reminders | nice-to-have "Real reminders going out on save" — PRD.md:199; "a new reminder goes out on save" — PRD.md:234 | scheduled = "confirm request sent on WhatsApp" — schema-routes.md:1140; "reminder queued" — schema-routes.md:1609 | Step 4 · RED (R3) | ask: are reminders sent at launch; channel and timing |
| A13 | Rooms and machines | bookings "by doctor, room and machine" — PRD.md:56–57 | room is a fixed list (Room 1, Room 2, Laser room, Any room) and there is no machine — schema-routes.md:337, 1156–1162; a cancel reason names machines — schema-routes.md:1153 | PRD (R2) + Step 4 · RED | rooms and machines are bookable; ask whether they are clinic-defined per branch |
| A14 | No-show | statuses Scheduled / Confirmed / Checked in / Completed / Cancelled — PRD.md:58, 135 | adds `no_show` (terminal) — schema-routes.md:1145 | schema-routes (R1) + Step 4 · RED | keep no-show; ask whether staff mark it or it is set automatically, and when |
| A15 | Patient display number | "P-####", "P-1042" — PRD.md:134, 157 | "PT-0412" / "#3508" — schema-routes.md:294 | frontend only | the backend keeps the per-organization number; the prefix is presentation |
| A16 | Patient type | "type" (one) — PRD.md:134 | `types`, up to 6 — schema-routes.md:304 | schema-routes (R1) | several types per patient |
| A17 | Patient file tabs | Clinical notes, Prescriptions, Treatments, Images, Packages, Invoices, Payments, Team — PRD.md:69; "Patient file with all tabs" — PRD.md:184 | adds Timeline, Reports, Notes — schema-routes.md:1205–1218, with Reports and Notes entities — schema-routes.md:436, 468 | schema-routes (R1) | Reports and Notes in scope; Timeline see B4 |
| A18 | Patient Team tab | a Team tab — PRD.md:69 | `team` section with no read operation — schema-routes.md:1218 vs 1629–1636 | Step 4 · AMBER | default: the staff who saw, treated or billed the patient, read-only |
| A19 | Purchase order stages | Ordered → Received → Paid — PRD.md:76, 145 | adds Cancelled — schema-routes.md:1433, 1673 | schema-routes (R1) | include cancel order |
| A20 | Manufacturer phone | Supplier / Manufacturer / MR / Clinic vendor: "name, phone, connections" — PRD.md:146 | Manufacturer has no phone — schema-routes.md:741–750 | schema-routes (R1) | no manufacturer phone |
| A21 | Payment mode | one "mode" — PRD.md:142; "mode UPI" — PRD.md:119 | up to 4 split modes summing to the amount — schema-routes.md:652 | schema-routes (R1) | split modes; one split is the PRD case |
| A22 | Task rules | rules: lead follow-ups, appointment reminders, aftercare calls, negative-feedback call-backs, payment dues — PRD.md:93 | kinds follow_up, confirm_visit, aftercare_call, callback, payment_reminder, review_request — schema-routes.md:1498–1507; "generated server-side and disappear when their condition is met", rules not given — schema-routes.md:739 | schema-routes for the kinds (R1) + Step 4 · RED | review_request added; "appointment reminders" = confirm_visit; ask each rule's trigger, due time, owner and closing condition |
| A23 | Task owner | "every human follow-up with an owner" — PRD.md:91 | owner may be empty with an owner role (a role queue) — schema-routes.md:727–728 | schema-routes (R1) + Step 4 · AMBER | role queues allowed; default: visible to everyone holding that role |
| A24 | Offers | Offering "type (offering / package / offer)" — PRD.md:139 | Offer is its own entity with dates, code and kind — schema-routes.md:581–600; package is a category — schema-routes.md:1335 | schema-routes (R1) | offers are separate records |
| A25 | Offering categories | sample categories Facial, Hair, Peel, Laser — PRD.md:169–173 | categories consultation, treatment, package, lhr, product (+ specialty) — schema-routes.md:1330–1347 | Step 4 · RED (R3) | ask with A13: fixed lists or clinic-defined |
| A26 | Invoice types | Clinic / Medical — PRD.md:141, 186 | adds Consultation — schema-routes.md:1357–1362 | schema-routes (R1) | three invoice types |
| A27 | Invoice status | Invoice has a "status" — PRD.md:141 | status derived from payments (paid / partial / unpaid), never stored — schema-routes.md:622 | schema-routes (R1) | derived |
| A28 | Plan row "Invoiced" | status values include Invoiced — PRD.md:140 | "✓ Invoiced" derived from invoice links; no `invoiced` value — schema-routes.md:498, 1284–1290 | schema-routes (R1) | derived |
| A29 | Reason chips | delete / cancel / void all use Created by mistake · Duplicate · No longer needed · Other — PRD.md:234 | delete and PO cancel use those — schema-routes.md:828, 1490–1496; appointment cancel has its own reasons — schema-routes.md:1147–1154; sale void and return take free text — schema-routes.md:856, 1668 | schema-routes (R1) + Step 4 · AMBER | appointment cancel keeps its reasons; default: sale void uses the delete reasons |
| A30 | Bulk select | tables with "bulk select" — PRD.md:193 | bulk operations only on Leads (message, export) — schema-routes.md:1596 | Step 4 · AMBER | default: bulk actions only where schema-routes defines them |
| A31 | Verify email | banner — nice-to-have PRD.md:200, open question PRD.md:242 | User has no email-verified state — schema-routes.md:184–207 | Step 4 · AMBER | the platform already verifies email (see C5) |
| A32 | Backend scope | "Real backend, auth, integrations" out of scope (prototype) — PRD.md:206 | a full data and operation contract for a backend — schema-routes.md:1–10, 1537–1755 | Step 4 · RED (R3) | ask this iteration's scope |
| A33 | Re-target lapsed patients | not mentioned — PRD.md:48–52 | system-created re-target leads ("No visit for 148 days …") — schema-routes.md:244, 263, 1084, 1100 | Step 4 · RED (R3) | ask: in launch scope, and the rule |
| A34 | "Ideas from history" | plans are built by adding offerings — PRD.md:69, 123 | ideas "computed server-side from notes / complaints / visits" — schema-routes.md:498, 1635 | Step 4 · RED (R3) | ask: in launch scope, and how ideas are produced |
| A35 | Staff commission | User fields have no commission — PRD.md:150 | `commissionPct`, read by nothing — schema-routes.md:204 | Step 4 · AMBER | default: stored, no behaviour at launch |
| A36 | Patient conversion | not mentioned — PRD.md:134 | `conversion` T-Converted / T-Not converted, server-set "took a treatment" — schema-routes.md:306, 1192–1193, 1623 | Step 4 · AMBER | default: converted when the first treatment is recorded |
| A37 | Legacy data | replaces WhatsApp, paper and spreadsheets; no import — PRD.md:9 | "legacy TX-/RF-/EX- display as PAY-" — schema-routes.md:647 | Step 4 · AMBER | default: no legacy import at launch |
| A38 | Branch scope of data | one or more branches; header branch picker — PRD.md:9, 32 | users belong to branches — schema-routes.md:199; reads filter by the picker, empty = all — schema-routes.md:1544 | Step 4 · RED (R3) | ask: may a user see branches they are not assigned to |
| A39 | Role stage highlight on Today | each role's own stages highlighted — PRD.md:26 | no stage ↔ role mapping — schema-routes.md:1009–1021, 352 | frontend only | depends on A7 |
| A40 | Presentation-only items | splash — PRD.md:36–40; dark mode, reduced motion, failed-load states — PRD.md:195; visual direction — PRD.md:210; A4 prints — PRD.md:225; empty states — PRD.md:232; phone layout — PRD.md:204, 244; dark-mode tints — PRD.md:241; final URLs — PRD.md:201, 243 | splash on first load — schema-routes.md:20; theme kept per user — schema-routes.md:236; prints are client-side, no write — schema-routes.md:1651; route map proposed — schema-routes.md:16, 1758 (gap 3) | frontend only | the backend stores the theme preference only |

### B — schema-routes against itself

| # | Item | schema-routes says (file:line) | schema-routes also says (file:line) | Verdict | Action |
| --- | --- | --- | --- | --- | --- |
| B1 | `billing.*` permissions | billing.view / create / edit guard patient billing tabs, invoices, payments — schema-routes.md:33, 71, 85–94 | the section list has `payments`, no `billing` — schema-routes.md:1009–1021 | Step 4 · AMBER | default: `billing.*` means the Payments section's permissions |
| B2 | Medicine expiry | expiry is a calendar date `YYYY-MM-DD` — schema-routes.md:7 | batch and purchase expiry are `MM/YY` — schema-routes.md:810, 826 | Step 4 · AMBER | default: expiry is a month (entered and shown MM/YY); a batch is expired after that month's last day |
| B3 | Package sessions | a package-session appointment "uses one session from a paid package"; next session = next appointment linked to the package — schema-routes.md:466, 1134 | Appointment has no link to a package; only Treatment does — schema-routes.md:321–350, 414 | Step 4 · AMBER | default: the appointment names the package; the session is used when the treatment is recorded |
| B4 | Timeline tab | a `timeline` section — schema-routes.md:1208 | no read operation for it — schema-routes.md:1629–1636 | Step 4 · AMBER | default: the patient's records in date order, read-only |
| B5 | Restore a cancelled appointment | restore returns the previous status — schema-routes.md:1144, 1612 | Appointment keeps no previous status — schema-routes.md:321–350 | schema-routes (the rule stands) | the status before cancel must be recoverable |
| B6 | Display-number uniqueness | display numbers are per-organization sequences — schema-routes.md:10; "unique per org" on User, Lead, Patient, Appointment — schema-routes.md:191, 249, 294, 328 | no uniqueness stated on Prescription, Offering, Invoice, CreditNote, PendingCredit, Medicine, PO, MedicalSale, StockItem, StockPurchase — schema-routes.md:361, 564, 609, 673, 687, 802, 821, 849, 880, 899 | schema-routes.md:10 wins | every display number is unique within its organization |
| B7 | Sale and invoice numbers | an invoice shows "#787" / "INV-787" / "S-983" — schema-routes.md:609 | a medical sale shows "S-983" — schema-routes.md:849; branches carry a GSTIN — schema-routes.md:172 | Step 4 · RED | ask how invoice numbers run (one series, per branch / GSTIN, per financial year) |
| B8 | Default access matrix | "per role preset" — schema-routes.md:220–223 | the presets are never listed; the route map's Access column gives partial role lists — schema-routes.md:21–110 | Step 4 · RED | ask together with A2 and A4 |

### C — the drop against this repository

Repository evidence: `CLAUDE.md` › API Contract and Key Patterns, and the route catalog
`docs/routes.txt`.

| # | Item | schema-routes says (file:line) | Repository says | Verdict | Action |
| --- | --- | --- | --- | --- | --- |
| C1 | Record ids | uuid primary key + a numeric display number — schema-routes.md:10 | clients see one public id per record, prefix + 21 characters, in the field `id` | repository (R4) | the display number stays a separate field; Standing deviation |
| C2 | Field naming | camelCase fields throughout — e.g. schema-routes.md:128–134 | request and response fields are snake_case | repository (R4) | mechanical rename; Standing deviation |
| C3 | Organization context | `organizationId` "from route slug" — schema-routes.md:8, 20, 128 | the active organization comes from the signed sign-in token; requests carry no organization segment; users switch organization explicitly | repository (R4) | the frontend may keep the slug in its URLs; Standing deviation |
| C4 | Organization record | Organization: slug, name, specialties, timezone, currency — schema-routes.md:138–152 | organizations already exist (read, change, delete, logo, memberships) | Step 4 · RED | recommend extending the existing organization with the clinic fields |
| C5 | Staff accounts and sign-in | admin creates a user with a password — schema-routes.md:197, 1752; sign-in by email + password — schema-routes.md:1556; sign-in not designed — schema-routes.md:1758 (gap 6) | people sign in themselves (password, email code, Google and other providers, passkeys, MFA), verify their email, and join an organization by invitation or membership | Step 4 · RED | ask how staff accounts are created |
| C6 | Roles | a fixed list of 9 roles, several per user ("Front desk · Admin") + a role × section matrix — schema-routes.md:198, 211–225, 996–1007 | organization roles are editable records with permission sets; a membership holds exactly one role | Step 4 · RED | ask: seed the 9 clinic roles as editable organization roles; how a person holds two |
| C7 | User preferences | per-user UI state incl. a branch filter — schema-routes.md:227–240 | per-user settings already exist (not per organization) | Step 4 · AMBER | default: extend user settings; the branch filter is kept per organization |
| C8 | Presence | online / busy / away — schema-routes.md:206, 1045–1050 | no presence today | schema-routes (R1) | new, small |
| C9 | "Billing" | billing.* permissions, invoices, payments — schema-routes.md:33, 85–94, 602–715 | "billing" already names the clinic's own subscription to the platform | compatible | clinic invoicing and payments are a separate area from the platform subscription; names must not collide |
| C10 | Files | image, report and review files as URLs — schema-routes.md:428, 447, 536 | an upload capability already exists | compatible | files go through the existing upload capability |
| C11 | Lists | cursor pages of 50, no totals — schema-routes.md:1540 | lists already page by opaque cursor with no count | compatible | — |
| C12 | Retried writes | failed save → "Retry save" — schema-routes.md:1545; PRD.md:233 | money and state writes already guard against double posting on retry | compatible | Step 5 quality: money-moving writes are safe to retry |
| C13 | Audit | created-by and updated time on every record — schema-routes.md:126–134 | an organization audit log already exists | compatible | Step 5 quality: which clinic actions are audited |

### P — the full drop (screen specs and prototype) against PRD / schema-routes

Planning Step 3 extension, after the full-drop intake (D6). Every conflict the 12 readers reported,
merged where several files say the same thing, weighed against the frontend's approved reading of
the same drop (its `KICKOFF.md` › B.13, Appendix F; decisions D22, D32 — the frontend read
`schema-routes.md` in full and reconciled it line by line). Rows are numbered P1, P2, … (P for the
prototype and specs). Rules for these (approved, [D11](decisions.md)):

| Rule | When | Wins |
| --- | --- | --- |
| R5 | a screen spec or the prototype against `PRD.md` or `schema-routes.md` | the files you approved: `PRD.md` for scope and behaviour (R2), `schema-routes.md` for data, value lists, limits and URLs (R1) — as frontend D22: the contract value is stored, the prototype label shown |
| R6 | the screen needs more than the contract carries, and the frontend listed it in its Appendix F | accepted — D3 took all of Appendix F |
| R7 | anything only the screens or the prototype say — not in `PRD.md`, `schema-routes.md`, Appendix F or a D-row | **no verdict — a question for you** (Step 4), with a proposed default; the plan never decides it |

Verdict values: `PRD (R2)` · `schema-routes (R1)` · `Appendix F (D3)` · `compatible` · `frontend only` ·
`ask you · RED` / `ask you · AMBER` (R7). Prototype-only behaviour (fake latency, fixed clock, name joins,
ledger shortcuts) is never copied — its coverage rows say so.

| # | Item | Spec / prototype says (file:line) | PRD / schema-routes / Appendix F says (file:line) | Verdict | Action |
| --- | --- | --- | --- | --- | --- |
| P1 | Today lanes | seven lanes Enquiries · Arriving · Waiting · With doctor · Treatment · Checkout · Pharmacy, no Done — today.md:19, 38–46 | eight stages incl. Booked and Done — PRD.md:45; Appointment-only floor read — schema-routes.md:1577 | Appendix F (D3) | seven lanes on the Visit model (frontend D20, part of Appendix F); settles A7 |
| P2 | Floor moves | Approve, Complete session and Receive also move the card — today.md:42, 92, 120, 160–163; Clinozy.dc.html:4558–4659 | only setAppointmentStatus writes the floor — schema-routes.md:1582; Appendix F asks for setVisitStage and completeVisit | Appendix F (D3) + ask you · AMBER | stage moves per D3; whether other actions move the card on the server — default: no, the screen asks for each move |
| P3 | Walk-in | "Check in now" books today at the current slot, already checked in — Clinozy.dc.html:6005; today.md:18, 153 | "New ⌄" creates a walk-in — PRD.md:46; no walk-in operation — schema-routes.md:1609 | PRD (R2) | a walk-in is booked at the current slot and checked in at once; settles A8 |
| P4 | Work queue on Today | its own seeded list — today.md:72 | Tasks feed the Today aside — schema-routes.md:717 | compatible | one task list; Today shows a slice of it |
| P5 | "Mine" for tasks | owned by me only — today.md:69 | owned by me + unowned — tasks.md:7; Clinozy.dc.html:4265 (neither PRD nor schema-routes says) | ask you · AMBER | default: mine + unowned (the role queue) |
| P6 | Appointment views | agenda / day / week / month — appointments.md:3, 17, 276 | day / week / list — schema-routes.md:26; PRD.md:56 | Appendix F (D3) | agenda / day / week / month (frontend D27) |
| P7 | After create | the drawer closes, the list stays — appointments.md:100; patients.md:63 | switches to edit / opens the record — schema-routes.md:1609, 1623 | frontend only | frontend D28; the create still returns the full record |
| P8 | Restore a cancelled visit | back to Scheduled while the slot has not passed — appointments.md:245; _patterns.md:72 | back to the previous status — schema-routes.md:1144, 1612 | Appendix F (D3) | Restore → scheduled; supersedes B5 |
| P9 | Cancel reasons | + Rescheduling later, Booked by mistake — appointments.md:225, 378 | five reasons — schema-routes.md:1147–1154; Appendix F: add the two "or confirm the mapping"; frontend D32 maps them to other + note | ask you · AMBER | default: add the two values |
| P10 | Appointment length, reason, notes | length 15–120, reason ≤ 120, notes ≤ 200 — appointments.md:75–77 | 5–240 step 5, reason ≤ 160, notes ≤ 2,000 — schema-routes.md:340, 345–346 | schema-routes (R1) | the contract's limits; the screen offers less |
| P11 | Bookable hours | 10:00–19:00 slots — appointments.md:86, 46 | inside the branch's hours — schema-routes.md:339 | schema-routes (R1) | branch hours decide |
| P12 | Patient visit with a connected lead | a patient's appointment shows their open lead, which moves to Clinic visited at check-in — appointments.md:65, 239 | one of patientId / leadId — schema-routes.md:329; getAppointment returns connected leads, check-in moves open leads to clinic_visited — schema-routes.md:1142, 1604, 1610 | compatible | connected leads are the person's open leads, read with the appointment |
| P13 | No-show | staff mark it, only after the start time — appointments.md:179; Clinozy.dc.html:5974 | no_show is terminal; who sets it not stated — schema-routes.md:1145 | ask you · RED | A14 — default: staff mark it after the start time; no automatic no-show |
| P14 | Photo and video size | photos ≤ 15 MB, review videos ≤ 100 MB — appointments.md:266–267; patient-file.md:196 | reports ≤ 10 MB, platform cap 10 MB — schema-routes.md:447, 1644; Appendix F: 15 MB / 100 MB | Appendix F (D3) | photos 15 MB, videos 100 MB, documents 10 MB |
| P15 | Leads access | Admin, Doctor, Front desk, Counsellor — leads.md:7 | Front desk, Counsellor, Marketing, Admin, Owner — schema-routes.md:22; PRD.md:50; Appendix F adds Doctor | ask you · RED | the access-matrix question |
| P16 | Contacts | the contact card edits phones, Instagram, default channel, household — leads.md:96–101, 440–442 | the lead or patient record; chat-only threads are contact_thread leads — schema-routes.md:251–262, 1101; Appendix F: contact fields on Lead and Patient | Appendix F (D3) | no Contact entity (frontend D32); settles the contact-model question from Step 1 |
| P17 | Lead for a known phone or patient | warns, never blocks; an existing patient starts a linked lead — leads.md:79, 253 | conflict "phone already a lead" — schema-routes.md:1593; Appendix F: a lookup that warns, createLead with patientId | Appendix F (D3) | warn, don't block (RC-157) |
| P18 | Lead status "Re-targeted" | a status value — leads.md:275, 398 | retarget is a lead kind — schema-routes.md:1063–1072, 1099 | schema-routes (R1) | stored as kind = retarget; the screen shows its label (frontend D22: the contract value is stored, the prototype label shown) |
| P19 | Lead status filter | single select — leads.md:180 | multi select — schema-routes.md:1588 | compatible | the backend takes several |
| P20 | "Queued" message | "Queued" — leads.md:52, 118 | queued labelled "Sending" — schema-routes.md:1123; Appendix F: outage signal | Appendix F (D3) | state stays queued |
| P21 | Lead → Contacted | first reply or a logged call — _patterns.md:158; leads.md:119, 280 | first reply — schema-routes.md:1067 | schema-routes (R1) + ask you · AMBER | first reply moves it; a logged call too? default: yes (WC-15) |
| P22 | Lead list paging | 10 per page — leads.md:40 | cursor, 50 — schema-routes.md:1539 | schema-routes (R1) | — |
| P23 | Message channels | WhatsApp, Instagram, call log, note — _patterns.md:155 | "WhatsApp only?" — PRD.md:245; SMS, email too — schema-routes.md:1103–1111 | ask you · RED | A10 / A11 — which channels really send at launch |
| P24 | Creating a task by hand | no create button on Tasks — tasks.md:7, 86–99 | "new task" — PRD.md:94; createTask — schema-routes.md:1727; Appendix F: type, priority, reminder | PRD (R2) + Appendix F (D3) | task create stays (RC-135) |
| P25 | Snooze | chosen time and label — tasks.md:178, 192, 204 | "No answer = snooze 3 h" — PRD.md:94; +3 h — schema-routes.md:734; Appendix F: client-chosen | Appendix F (D3) | client-chosen snooze (RC-190) |
| P26 | Task rules | 13 rules with condition, due time, owner, defaults — tasks.md:44–56; Clinozy.dc.html:4223–4259 | not given — schema-routes.md:739; Appendix F: a rule key per task, per-rule automation, org rule settings | Appendix F (D3) | WC-18–WC-38; settles A22 except who may change rule settings (access question) |
| P27 | Tasks access | not Pharmacist / Accountant — tasks.md:7 | any role, own tasks — PRD.md:92; schema-routes.md:95 | PRD (R2) | every role, own tasks |
| P28 | Patient-file sections | adds visits; Photos, Team notes, Clinical notes labels — patient-file.md:3 | overview, timeline, images, notes, team — schema-routes.md:1205–1218; Appendix F: visits, merged activity feed | Appendix F (D3) + schema-routes (R1) | contract values + visits; team stays a value the frontend does not build (frontend D26); timeline = merged feed; settles A18, B4 |
| P29 | Pins, branch filter, theme | kept on the device — patient-file.md:251; shell.md:9, 26–27 | per user on the server — schema-routes.md:229, 234–237; Appendix F: pin order, recent picks as ids | schema-routes (R1) + Appendix F (D3) | server, per user; theme on the device (frontend only) |
| P30 | Conversion | writable and clearable — patients.md:54 | server-set — schema-routes.md:306, 1623; Appendix F: writable, nullable | Appendix F (D3) | supersedes the A36 default |
| P31 | Consent | Data / Photos / Marketing — patients.md:79 | one consentGiven — schema-routes.md:309; Appendix F: the set | Appendix F (D3) | consent set |
| P32 | Check-in score | optional — patient-file.md:176 | required 1–10 — schema-routes.md:512; Appendix F: nullable | Appendix F (D3) | nullable |
| P33 | Package before its invoice | added without an invoice; "use a session" — patient-file.md:163–168 | invoiceId required — schema-routes.md:459; Appendix F: allowed | Appendix F (D3) | RC-178, RC-179 |
| P34 | Body parts, feedback actions, delete reasons | extra values — patient-file.md:56, 112, 212, 521 | shorter lists — schema-routes.md:1238–1250, 1317–1328, 1490–1495; Appendix F: the additions | Appendix F (D3) | add the values |
| P35 | Reason lists per kind | each kind offers its own reasons — _patterns.md:67–73; payments.md:291; medical.md:366 | one delete_reason set; void reason untyped — schema-routes.md:1490–1496, 1668; Appendix F: additions | schema-routes (R1) + Appendix F (D3) | one stored set + the additions; which reasons a screen offers is the screen's (frontend B.13 R41); supersedes A29 |
| P36 | Team note delete | immediate, no reason — patient-file.md:89 | every delete takes a reason — schema-routes.md:1546 | schema-routes (R1) | reason on every delete |
| P37 | Text limits | address 200, notes 1,000, Rx 1,000, note 500, check-in details 300 — patients.md:48, 58; patient-file.md:86, 113–115, 179 | address 240, notes 2,000, Rx 2,000, note 2,000, details 280 — schema-routes.md:302, 310, 367–369, 474, 514 | schema-routes (R1) + ask you · AMBER | the contract's limits; where a screen allows more (check-in details 300; branch and offering names) — default: accept the longer |
| P38 | List totals | footer counts and "Select all N" on every list — patients.md:34; _patterns.md:129–130 | no totals — schema-routes.md:1540; Appendix F: money-list totals, Unreplied counts | Appendix F (D3) + ask you · AMBER | totals where Appendix F asks; the other lists — default: a total count on every list |
| P39 | Filtering and paging | whole list filtered in the browser — patients.md:254 | server filters, cursor pages of 50 — schema-routes.md:1539–1544 | schema-routes (R1) | — |
| P40 | Photo page size | 12 per album — patient-file.md:67 | cursor 60 — schema-routes.md:1631 | compatible | page size is a parameter |
| P41 | Free-text dates | typed as text — patients.md:57, 76 | ISO dates — schema-routes.md:301, 311 | compatible | the screen parses |
| P42 | Rx follow-up date | only on the print — patient-file.md:315 | followUpDate — schema-routes.md:370 | schema-routes (R1) | kept |
| P43 | "Save & sell" | never shown — patient-file.md:283 | Rx → sale — PRD.md:118; schema-routes.md:1641 | PRD (R2) | kept |
| P44 | Rx doctor default | the last prescribing doctor — patient-file.md:110 | current user if a doctor — schema-routes.md:363 | compatible | the backend takes doctorId |
| P45 | Photo name | editable (≤ 60) — patient-file.md:209 | fileName server-set — schema-routes.md:430 | ask you · AMBER | default: an editable display name |
| P46 | Private album | lock icon, no rule — patient-file.md:63 | Doctor, Admin only — schema-routes.md:40 | schema-routes (R1) | the contract's rule |
| P47 | Patient-file access | Accountant none; Therapist view only — patient-file.md:7 | clinical roles + Accountant billing — PRD.md:62, 68; schema-routes.md:30, 33 | ask you · RED | A4 — the access-matrix question |
| P48 | Who prescribes | every role except Therapist — patient-file.md:7 | Doctor, Admin — schema-routes.md:35, 37; PRD.md:18 | ask you · RED | A3 |
| P49 | Who records treatments | not Therapist — patient-file.md:7 | Doctor, Therapist — schema-routes.md:38–39; PRD.md:19 | ask you · RED | A2 |
| P50 | Medical and Clinic stock access | Admin, Pharmacist, Accountant — medical.md:7; clinic-stock.md:7 | Medical: Pharmacist, Accountant, Owner; stock: Therapist, Front desk — PRD.md:74, 80 | ask you · RED | the access-matrix question |
| P51 | Medicine GST rates | 0 / 5 / 12 / 18 — medical.md:179 | adds 28 — schema-routes.md:807 | schema-routes (R1) | — |
| P52 | Quick medicine | MRP ₹0 and no manufacturer until completed — medical.md:318 | quick flag "Needs MRP and composition" — schema-routes.md:804–806 | schema-routes (R1) | the contract's quick flag relaxes them |
| P53 | Tax and discounts | MRP includes GST; discount before tax; overall discount as %; the prototype discounts after GST — medical.md:158, 178; payments.md:141; Clinozy.dc.html:3632 | GST on the discounted line; overall discount in paise — schema-routes.md:616, 622, 638; Appendix F asks to confirm (C24) | ask you · RED | how GST and discounts apply |
| P54 | Sale void | cancels the invoice, puts stock back — medical.md:366 | sets voidedAt — schema-routes.md:1672; Appendix F: restores stock, cancels the invoice | Appendix F (D3) | — |
| P55 | Sale return | Damaged / Reaction written off — medical.md:294 | stock restored — schema-routes.md:1671; Appendix F: write-offs | Appendix F (D3) | — |
| P56 | Sale status | Returned beside Paid / Unpaid — medical.md:29 | one derived status — schema-routes.md:858 | compatible | two derived flags |
| P57 | Purchase order "Pay" | marks it Paid directly — medical.md:339 | paid only from payments — schema-routes.md:827 | schema-routes (R1) | paying writes a payment |
| P58 | Paying a supplier's whole due | one action clears every bill — medical.md:82, 203 | one billRef per payment — schema-routes.md:657 | ask you · AMBER | default: one payment covering several bills |
| P59 | Clinic purchase "paid" | typed in the purchase — clinic-stock.md:151 | editable (schema-routes.md:905) and raised by payExpense (1708); Appendix F: payment rows in movements | ask you · AMBER | default: typing paid records a payment |
| P60 | Undo of a stock use | removes the movement — clinic-stock.md:102 | every change is a row — schema-routes.md:911, 923–924; Appendix F: movements with Undo | Appendix F (D3) + schema-routes (R1) | Undo per D3, written as a reversing row |
| P61 | Unmatched medicine names | toast on Rx → sale — medical.md:401 | Rx save creates quick medicines — schema-routes.md:378 | compatible | — |
| P62 | Pickers | full local list — medical.md:510 | cursor pages — schema-routes.md:1539 | schema-routes (R1) | — |
| P63 | Clinic stock tabs and defaults | no Vendors tab; own defaults — clinic-stock.md:3, 110–117 | Vendors tab; other defaults — schema-routes.md:81–83, 882–888 | compatible | vendors exist (frontend B.13 R14) |
| P64 | Payments and Offerings access | Offerings: Admin only — offerings.md:7; payments.md:7 | Offerings: Admin, Owner, Counsellor — schema-routes.md:84, 98; PRD.md:86, 98 | ask you · RED | the access-matrix question |
| P65 | Day-close gate | "Close the day" permission — users.md:71, 73 | role names — schema-routes.md:91; Appendix F: gate by dayclose | Appendix F (D3) | a permission code (D10) |
| P66 | Roles | 7 + custom; no Marketing, no Owner — users.md:11 | 9 incl. Marketing, Owner — schema-routes.md:996–1007; PRD.md:23 | PRD (R2) | D5, D8 |
| P67 | Delete needs View | View is enough — users.md:65 | canDelete requires canEdit — schema-routes.md:223; Appendix F: View | Appendix F (D3) | — |
| P68 | Sections in the matrix | 9 — Today needs none — users.md:63; today.md:7 | 10 incl. today — schema-routes.md:1009–1021 | schema-routes (R1) | 10 section codes (D10); whether Today is gated joins the access question |
| P69 | Staff name | one Name, "Dr." kept — users.md:105 | firstName / lastName — schema-routes.md:192–193; Appendix F: without breaking "Dr." | Appendix F (D3) | — |
| P70 | User branches | optional — users.md:112 | ≥ 1 — schema-routes.md:199 | compatible | always saved with one |
| P71 | Branch, offering, offer fields | optional address parts, GST as a number, optional offer dates, all-branch offers — users.md:134–145; offerings.md:65–107 | required parts, GST in 5 values, required dates — schema-routes.md:164–174, 565–600; Appendix F: these requests | Appendix F (D3) | longer names — see Text limits |
| P72 | "Use on next bill" | no action, yet "Adjusted" — payments.md:45, 50 | PRD.md:88; schema-routes.md:1419, 1713 | PRD (R2) | kept |
| P73 | Credit note without an invoice | "No invoice" give-back writes a credit note — payments.md:160, 179 | "Refunds issue a credit note" — PRD.md:88; invoiceId required — schema-routes.md:674 | ask you · RED | with the tax question |
| P74 | Pay with split modes | one mode — payments.md:123 | splits — schema-routes.md:652, 1709 | schema-routes (R1) | — |
| P75 | Invoice and sale numbers | #788 and S-983; INV/26-27/NNNN — payments.md:87, 149; Clinozy.dc.html:3332 | one seq — schema-routes.md:609, 849 | ask you · RED | B7 |
| P76 | Day close per branch | no branch field — payments.md:186–188 | per branch — schema-routes.md:706 | schema-routes (R1) | the header branch |
| P77 | Reversing a closed day's payment | reversal by a linked entry — Clinozy.dc.html:4040–4053 | reversal kind — schema-routes.md:1386 | schema-routes (R1) | RC-181 |
| P78 | Overpayment | not blocked — today.md:115 | amount > due rejected — schema-routes.md:1708 | schema-routes (R1) | refused |
| P79 | Closing a day with a difference | reason vs zero only — Clinozy.dc.html:6106–6107 | counted cash required — schema-routes.md:1715 | ask you · AMBER | default: allowed with a reason |
| P80 | Refund approval | the owner approves refunds — Clinozy.dc.html:6108, 2343 | "Give refunds" permission — users.md:71; Appendix F: the refund ability | ask you · AMBER | default: the refund permission only, no second approval |
| P81 | Delete note and Undo window | note ≤ 160; toast ~5 s — _patterns.md:61, 237 | note ≤ 280; restore 10 s — schema-routes.md:132–135, 1546 | schema-routes (R1) | — |
| P82 | Presence | Online / Offline — _patterns.md:227 | online / busy / away — schema-routes.md:1045–1050 | schema-routes (R1) | offline from last active |
| P83 | Command search | no appointments group — _patterns.md:203 | incl. appointments — schema-routes.md:1565; Appendix F: confirm invoices | schema-routes (R1) + Appendix F (D3) | appointments stay in the result; invoices included |
| P84 | Recall view | Patients › Recall — patients.md:207 | none — schema-routes.md:1619; Appendix F: recall view | Appendix F (D3) | — |
| P85 | Phone and tablet | designed — _report.md:4 | not designed — PRD.md:224 | frontend only | frontend D10 |
| P86 | Prescription approval | Needs approval → Approved → Sent to pharmacy → Dispensed — Clinozy.dc.html:3328; today.md:59, 90–92 | filled derived from a sale — schema-routes.md:372; not in Appendix F | ask you · RED | RC-172, WC-45, prescription status pending your answer |
| P87 | Ideas from history | rule-based keywords and counts — Clinozy.dc.html:4355–4367 | "computed server-side" — schema-routes.md:498 | ask you · RED | A34 — default: rule-based, no AI |
| P88 | Re-target leads | lapsed patients, skipping no consent or booked — Clinozy.dc.html:3349–3356 | system-created — schema-routes.md:244, 1084 | ask you · RED | A33 — the day threshold and whether it runs by itself |
| P89 | Treatment status and reversal | a session is reversed with a reason, never deleted — today.md:105, 107 | none — schema-routes.md:520–556; not in Appendix F | ask you · AMBER | RC-177 pending your answer — default: reverse with a reason |

### Earlier rows these settle

| Earlier row | Now | By |
| --- | --- | --- |
| A7 floor stages | seven lanes on the Visit model | P1 (D3) |
| A8 walk-in | booked at the current slot and checked in at once | P3 (PRD.md:46) |
| A18 Team section | stays a value; the frontend does not build it | P28 |
| A22 task rules | 13 rules with conditions, due times, owners and defaults | P26 (D3) — who may change the rule settings stays open |
| A29 reason chips | one stored set + the Appendix F additions | P35 |
| A36 patient conversion | writable and clearable | P30 (D3) |
| B4 timeline | the merged activity feed | P28 (D3) |
| B5 restore previous status | Restore → scheduled | P8 (D3) |
| Step 1 contact model | no Contact entity; contact fields on Lead and Patient | P16 (D3, frontend D32) |

### Raised to Step 4

Everything here is a question for you — nothing in it is decided by the plan (R3, R7).

**Answered:**

- access — rooms, actions and special permissions ([D12–D19](decisions.md); settles A2, A3, A4, A6,
  B1, B8, P15, P47, P48, P49, P50, P64);
- money — discount before tax, GST-inclusive prices, credit notes, numbering, day close, refunds,
  discount limits, GST seeds ([D20–D27](decisions.md); settles B7, P53, P73, P75, P79, P80);
- scheduling and clinical — rooms and machines per branch, offering kind + groups, no-show,
  prescription approval ([D28–D31](decisions.md); settles A13, A14, A25, P13, P86);
- messaging — real WhatsApp, no SMS or email, a confirm request + one reminder, daily re-target leads
  ([D32–D35](decisions.md); settles A10, A11, A12, A33, P23, P88);
- the last REDs — domains, live updates, records, ideas ([D36–D39](decisions.md); settles A34, P87).

**Every RED is answered**, and every AMBER default below is accepted ([D40](decisions.md)):

| Item | Default |
| --- | --- |
| A23 task owner | an unowned task sits in its role's queue, visible to everyone holding that role |
| A30 bulk select | bulk actions only where schema-routes defines them (Leads: message, export) |
| A31 verify email | the platform already verifies email; nothing new in the clinic API |
| A35 staff commission | stored on the staff profile, no behaviour at launch |
| A37 legacy data | no import at launch |
| B2 medicine expiry | a month (`MM/YY`); a batch is expired after that month's last day |
| B3 package sessions | the appointment names the package; a session is used when the visit completes |
| C7 preferences | extend the user's settings; the branch filter is kept per organization |
| P2 floor moves | the server moves a card only on an explicit stage call; completing the visit completes the appointment |
| P5 "Mine" tasks | owned by me + unowned in my roles' queues |
| P9 cancel reasons | add `rescheduling_later` and `booked_by_mistake` |
| P21 logged call | a logged call moves a new lead to Contacted, like a first reply |
| P37 text limits | accept the longer limit where a screen allows more than schema-routes (check-in details 300; branch and offering names) |
| P38 list totals | every list returns a total count |
| P45 photo name | an editable display name (≤ 60) beside the stored file name |
| P58 supplier dues | one payment may cover several of a supplier's bills |
| P59 clinic purchase paid | typing "paid" on a purchase records the payment |
| P89 treatment reversal | a session is reversed with a reason, never deleted |
| locked roles | only Admin is locked (can't be narrowed); other built-in roles are editable |
| print language | stored per prescription (English, Gujarati, Hindi); the layout is the frontend's |
| membership main role | the first role listed is the main one (users.md:110) |
| message templates | edited by Owner and Admin |
| diagnosis catalogue | prescribers (D14) add entries |
| day auto-close | a day nobody closed is closed at midnight after it (WC-39) |
| branch without a GSTIN | its own invoice series per financial year (D23) |
| background work | every "On failure" marked *(AMBER)* in worker-changes.md |

## Delta

n/a — initial (Baseline `none`).
