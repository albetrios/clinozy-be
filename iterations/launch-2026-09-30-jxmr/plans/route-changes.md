# Route changes — launch-2026-09-30-jxmr

The iteration's proposed routes, in one file, kept current at every planning step
(`be-iteration-planning` › Route changes). Proposals only — kickoff confirms each route when it builds
it and records any change in `AS-BUILT.md`; the built truth is `docs/routes.txt`.

Status: ready — planning Step 5, with D1–D44 applied; each route reaches its ROUTE row through its feature. Mode initial (Baseline `none`) ·
Intake hash `036cbb592ac5` · 2026-10-03.

**Provisional prefix.** New clinic routes are drafted under `/api/v1/app/…` — the domain is not chosen
yet (Step 4 asks where new tables live; the route prefix follows the domain, as every existing route
does). Paths follow the API contract: plural kebab-case segments, semantic snake_case params, no
organization segment (the active organization is the sign-in token's), lifecycle actions as `POST`
sub-paths. A patient's records are listed and created under the patient and addressed by their own
id afterwards (`/patients/{patient_id}/prescriptions` → `/prescriptions/{prescription_id}`).

**Lists** return a total count with every page (P38, D40). **Every save** on a record changed since it was opened is refused with who changed it and when (D43).

**Access** names the clinic section and action from the role × section matrix (`patients · edit`), or
a role where the drop fixes one — settled: rooms and actions per D12, role-named actions as permission codes (D13, D14), the Accountant and Marketing slices (D15, D16), `billing.*` = Payments (D17), special permissions (D18).

## Counts

| Area | NEW | CHANGED | REMOVED |
| --- | --- | --- | --- |
| Team, roles and preferences | 9 | 11 | 0 |
| Branches | 14 | 0 | 0 |
| Leads and messages | 18 | 0 | 0 |
| Appointments and Today | 20 | 0 | 0 |
| Patients | 6 | 0 | 0 |
| Patient file | 41 | 0 | 0 |
| Offerings and offers | 9 | 0 | 0 |
| Invoices and payments | 21 | 0 | 0 |
| Medical store | 33 | 0 | 0 |
| Clinic stock | 13 | 0 | 0 |
| Tasks | 9 | 0 | 0 |
| Search | 2 | 0 | 0 |
| **Total** | **195** | **11** | **0** |

Plus `DELETE` + `POST …/restore` on every clinic resource (see Delete and restore). RC-141 to RC-191
are the frontend's requests (D3), traced to the full drop's specs and prototype; RC-192 to RC-206 follow
your Step 4 answers (rooms and machines D28, offering groups D29, clinic settings D34–D35, the
messaging webhook D32, branch holidays D41).

## Team, roles and preferences

| # | Change | Method | Path | Access | Operation | Source |
| --- | --- | --- | --- | --- | --- | --- |
| RC-1 | CHANGED | GET | `/api/v1/auth/me/context` | signed in | getSession | `schema-routes.md:1563` |
| RC-2 | CHANGED | GET | `/api/v1/tenancy/organization/memberships` | users · view | listUsers | `schema-routes.md:1746` |
| RC-3 | CHANGED | POST | `/api/v1/tenancy/organization/memberships` | users · create | createUser (as an invitation, D4) | `schema-routes.md:1752` |
| RC-4 | CHANGED | PATCH | `/api/v1/tenancy/organization/memberships/{membership_id}` | users · edit | updateUser | `schema-routes.md:1752` |
| RC-5 | CHANGED | GET | `/api/v1/tenancy/organization/roles/{role_id}/permissions` | users · view | listRolePermissions | `schema-routes.md:1747` |
| RC-6 | CHANGED | PUT | `/api/v1/tenancy/organization/roles/{role_id}/permissions` | users · edit | updateRolePermission | `schema-routes.md:1753` |
| RC-7 | CHANGED | PATCH | `/api/v1/tenancy/organization` | Owner, Admin | Organization clinic fields (D7) | `schema-routes.md:138–152` |
| RC-8 | NEW | GET | `/api/v1/app/preferences` | signed in | getSession (preferences part) | `schema-routes.md:227–240, 1563` |
| RC-9 | NEW | PATCH | `/api/v1/app/preferences` | signed in | updatePreference | `schema-routes.md:1570` |
| RC-10 | NEW | PUT | `/api/v1/users/me/presence` | signed in | setPresence | `schema-routes.md:1571` |
| RC-11 | NEW | GET | `/api/v1/app/staff` | any role | person pickers (doctors, therapists, owners) | `schema-routes.md:186` |
| RC-141 | CHANGED | PATCH | `/api/v1/tenancy/organization/roles/{role_id}` | users · edit (Change roles & access) | role tone and purpose (D3) | `users.md:49–50, 61, 71` |
| RC-142 | CHANGED | POST | `/api/v1/tenancy/organization/roles` | users · edit (Change roles & access) | custom role (+ copy access from) | `users.md:236, 361, 368` |
| RC-143 | CHANGED | DELETE | `/api/v1/tenancy/organization/memberships/{membership_id}` | users · delete | remove a member with reason and note | `users.md:247–252` |
| RC-201 | CHANGED | PATCH | `/api/v1/tenancy/organization/settings` | Owner, Admin | clinic settings: the reminder hour (D34), re-target days (D35) and the deleted-record purge days (D38) | D34, D35, D38 |
| RC-144 | NEW | POST | `/api/v1/tenancy/organization/memberships/{membership_id}/restore` | users · delete | undo a member removal (10 s) | `users.md:252` |
| RC-145 | NEW | GET | `/api/v1/app/saved-views` | signed in (own) | saved views per list | `patients.md:129, 274`; `payments.md:39` |
| RC-146 | NEW | POST | `/api/v1/app/saved-views` | signed in (own) | save a view | `patients.md:129`; `H:968` |
| RC-147 | NEW | PATCH | `/api/v1/app/saved-views/{saved_view_id}` | signed in (own) | rename / update a view | `patients.md:274` |
| RC-148 | NEW | DELETE | `/api/v1/app/saved-views/{saved_view_id}` | signed in (own) | remove a view | `H:968` |

## Branches

| # | Change | Method | Path | Access | Operation | Source |
| --- | --- | --- | --- | --- | --- | --- |
| RC-12 | NEW | GET | `/api/v1/app/branches` | any role (active only); users · view (incl. inactive) | listBranches, listBranches (settings) | `schema-routes.md:1564, 1748` |
| RC-13 | NEW | POST | `/api/v1/app/branches` | users · create | create Branch | `schema-routes.md:1754` |
| RC-14 | NEW | PATCH | `/api/v1/app/branches/{branch_id}` | users · edit | update Branch | `schema-routes.md:1754` |
| RC-15 | NEW | GET | `/api/v1/app/branches/{branch_id}` | users · view | Branch drawer | `schema-routes.md:110` |
| RC-149 | NEW | PUT | `/api/v1/app/branches/{branch_id}/team` | users · edit | set a branch's team in one write | `users.md:146` |
| RC-192 | NEW | GET | `/api/v1/app/branches/{branch_id}/rooms` | any role (pickers) | a branch's rooms | D28; `PRD.md:56–57` |
| RC-193 | NEW | POST | `/api/v1/app/branches/{branch_id}/rooms` | users · edit | add a room | D28 |
| RC-194 | NEW | PATCH | `/api/v1/app/rooms/{room_id}` | users · edit | rename or deactivate a room | D28 |
| RC-195 | NEW | GET | `/api/v1/app/branches/{branch_id}/machines` | any role (pickers) | a branch's machines | D28; `PRD.md:56–57` |
| RC-196 | NEW | POST | `/api/v1/app/branches/{branch_id}/machines` | users · edit | add a machine | D28 |
| RC-197 | NEW | PATCH | `/api/v1/app/machines/{machine_id}` | users · edit | rename or deactivate a machine | D28 |
| RC-204 | NEW | GET | `/api/v1/app/branches/{branch_id}/holidays` | any role (booking) | a branch's holidays | D41; `H:2349` |
| RC-205 | NEW | POST | `/api/v1/app/branches/{branch_id}/holidays` | users · edit | add a holiday | D41 |
| RC-206 | NEW | PATCH | `/api/v1/app/branch-holidays/{branch_holiday_id}` | users · edit | change a holiday's date or label | D41 |

## Leads and messages

| # | Change | Method | Path | Access | Operation | Source |
| --- | --- | --- | --- | --- | --- | --- |
| RC-202 | NEW | GET | `/api/v1/app/webhooks/messaging` | public — the provider's verification handshake | confirm the webhook to Meta | D32 |
| RC-203 | NEW | POST | `/api/v1/app/webhooks/messaging` | public, provider-signed | WhatsApp and Instagram replies and delivery reports (WC-1, WC-3) | D32, D3 |
| RC-16 | NEW | GET | `/api/v1/app/leads` | leads · view | listLeads | `schema-routes.md:1588` |
| RC-17 | NEW | POST | `/api/v1/app/leads` | leads · create | createLead | `schema-routes.md:1593` |
| RC-18 | NEW | GET | `/api/v1/app/leads/{lead_id}` | leads · view | getLead | `schema-routes.md:1589` |
| RC-19 | NEW | PATCH | `/api/v1/app/leads/{lead_id}` | leads · edit | updateLead | `schema-routes.md:1594` |
| RC-20 | NEW | GET | `/api/v1/app/leads/{lead_id}/messages` | leads · view | getLead (messages, cursor) | `schema-routes.md:1589` |
| RC-21 | NEW | POST | `/api/v1/app/leads/{lead_id}/messages` | leads · edit | sendMessage | `schema-routes.md:1595` |
| RC-22 | NEW | POST | `/api/v1/app/leads/bulk-messages` | leads · edit | bulkMessage | `schema-routes.md:1596` |
| RC-23 | NEW | POST | `/api/v1/app/leads/exports` | leads · view | bulkExport | `schema-routes.md:1596` |
| RC-150 | NEW | POST | `/api/v1/app/leads/{lead_id}/claim` | leads · edit | claim a lead whose hold is open | `leads.md:37, 65, 402–403`; `tasks.md:194` |
| RC-151 | NEW | POST | `/api/v1/app/leads/{lead_id}/release` | leads · edit (owner) | release a lead to the team | `leads.md:65, 403` |
| RC-152 | NEW | POST | `/api/v1/app/leads/{lead_id}/read` | leads · view | mark a lead read (per viewer) | `leads.md:32, 36` |
| RC-153 | NEW | POST | `/api/v1/app/leads/{lead_id}/messages/{lead_message_id}/resend` | leads · edit | resend a failed message | `leads.md:52, 116`; `tasks.md:196` |
| RC-154 | NEW | GET | `/api/v1/app/message-templates` | leads · view | templates in the composer | `leads.md:427–432`; `_patterns.md:178–183` |
| RC-155 | NEW | POST | `/api/v1/app/message-templates` | Owner, Admin (open) | create a template | `_patterns.md:178–183` |
| RC-156 | NEW | PATCH | `/api/v1/app/message-templates/{message_template_id}` | Owner, Admin (open) | edit a template | `_patterns.md:178–183` |
| RC-157 | NEW | GET | `/api/v1/app/phone-lookup` | leads · create, patients · create | who already has this mobile (warns, never blocks) | `leads.md:79`; `H:5646–5647` |

## Appointments and Today

| # | Change | Method | Path | Access | Operation | Source |
| --- | --- | --- | --- | --- | --- | --- |
| RC-24 | NEW | GET | `/api/v1/app/today` | any role | listTodayFloor, todayPulse | `schema-routes.md:1577–1578` |
| RC-25 | NEW | GET | `/api/v1/app/appointments` | appointments · view | listAppointmentsRange, listAppointments — by doctor, room or machine (D28) | `schema-routes.md:1602–1603` |
| RC-26 | NEW | GET | `/api/v1/app/appointments/available-slots` | appointments · create | availableSlots | `schema-routes.md:1605` |
| RC-27 | NEW | POST | `/api/v1/app/appointments` | appointments · create | createAppointment — a room and a machine may be named (D28); the slot must be free for person, room and machine, inside branch hours and outside holidays (D41) | `schema-routes.md:1609` |
| RC-28 | NEW | GET | `/api/v1/app/appointments/{appointment_id}` | appointments · view | getAppointment | `schema-routes.md:1604` |
| RC-29 | NEW | PATCH | `/api/v1/app/appointments/{appointment_id}` | appointments · edit | updateAppointment | `schema-routes.md:1610` |
| RC-30 | NEW | POST | `/api/v1/app/appointments/{appointment_id}/status` | appointments · edit | setAppointmentStatus — no-show by staff only after the start time (D30) | `schema-routes.md:1582` |
| RC-31 | NEW | POST | `/api/v1/app/appointments/{appointment_id}/cancel` | appointments · edit | cancelAppointment | `schema-routes.md:1611` |
| RC-32 | NEW | POST | `/api/v1/app/appointments/{appointment_id}/reinstate` | appointments · edit | restoreAppointment (undo a cancel — named apart from the delete-undo `…/restore`) | `schema-routes.md:1612` |
| RC-33 | NEW | POST | `/api/v1/app/appointments/{appointment_id}/copy` | appointments · create | Copy (copyOf) | `schema-routes.md:27, 350` |
| RC-34 | NEW | POST | `/api/v1/app/appointments/{appointment_id}/photos` | patients · edit | uploadVisitPhotos | `schema-routes.md:1613` |
| RC-158 | NEW | GET | `/api/v1/app/appointments/day-counts` | appointments · view | booked / confirmed / awaiting per day | `appointments.md:40, 51, 53, 107` |
| RC-159 | NEW | POST | `/api/v1/app/appointments/{appointment_id}/visit` | appointments · edit | start the visit | `patient-file.md:17, 92`; `today.md:41` |
| RC-160 | NEW | GET | `/api/v1/app/visits/{visit_id}` | appointments · view | the Visit sheet / visit flow | `today.md:125–137` |
| RC-161 | NEW | PATCH | `/api/v1/app/visits/{visit_id}` | patients · edit | consult note, safety checks (autosave) | `today.md:82–85, 135, 250`; `patient-file.md:396` |
| RC-162 | NEW | POST | `/api/v1/app/visits/{visit_id}/stage` | appointments · edit | move the visit to its next floor stage | `today.md:42, 92, 120` |
| RC-163 | NEW | POST | `/api/v1/app/visits/{visit_id}/pause` | appointments · edit | pause the visit | `patient-file.md:17, 402` |
| RC-164 | NEW | POST | `/api/v1/app/visits/{visit_id}/resume` | appointments · edit | resume the visit | `patient-file.md:17` |
| RC-165 | NEW | POST | `/api/v1/app/visits/{visit_id}/complete` | appointments · edit | complete the visit (completes the appointment, uses a package session) | `patient-file.md:402`; `today.md:120` |
| RC-166 | NEW | POST | `/api/v1/app/appointments/{appointment_id}/undo-check-in` | appointments · edit | undo a check-in | `today.md:41, 208` |

## Patients

| # | Change | Method | Path | Access | Operation | Source |
| --- | --- | --- | --- | --- | --- | --- |
| RC-35 | NEW | GET | `/api/v1/app/patients` | patients · view | listPatients | `schema-routes.md:1619` |
| RC-36 | NEW | POST | `/api/v1/app/patients` | patients · create | createPatient | `schema-routes.md:1623` |
| RC-37 | NEW | GET | `/api/v1/app/patients/{patient_id}` | patients · view | getPatient | `schema-routes.md:1629` |
| RC-38 | NEW | PATCH | `/api/v1/app/patients/{patient_id}` | patients · edit | updatePatient | `schema-routes.md:1640` |
| RC-39 | NEW | GET | `/api/v1/app/patients/{patient_id}/timeline` | patients · view | Timeline section (B4) | `schema-routes.md:1208` |
| RC-167 | NEW | GET | `/api/v1/app/patients/{patient_id}/activity` | patients · view | merged history (messages + record events) | `patient-file.md:25`; `today.md:251–252` |

## Patient file

| # | Change | Method | Path | Access | Operation | Source |
| --- | --- | --- | --- | --- | --- | --- |
| RC-40 | NEW | GET | `/api/v1/app/patients/{patient_id}/prescriptions` | patients · view | listPrescriptions | `schema-routes.md:1630` |
| RC-41 | NEW | POST | `/api/v1/app/patients/{patient_id}/prescriptions` | prescribe code — Doctor, Admin (D14) | createPrescription | `schema-routes.md:1641` |
| RC-42 | NEW | GET | `/api/v1/app/prescriptions/{prescription_id}` | patients · view | Prescription viewer | `schema-routes.md:36` |
| RC-43 | NEW | PATCH | `/api/v1/app/prescriptions/{prescription_id}` | prescribe code — Doctor, Admin (D14) | updatePrescription | `schema-routes.md:1641` |
| RC-44 | NEW | GET | `/api/v1/app/patients/{patient_id}/treatments` | patients · view | listTreatments | `schema-routes.md:1631` |
| RC-45 | NEW | POST | `/api/v1/app/patients/{patient_id}/treatments` | treatments code — Doctor, Therapist (D12, D13) | createTreatment | `schema-routes.md:1642` |
| RC-46 | NEW | PATCH | `/api/v1/app/treatments/{treatment_id}` | treatments code — Doctor, Therapist (D12, D13) | updateTreatment | `schema-routes.md:1642` |
| RC-47 | NEW | GET | `/api/v1/app/patients/{patient_id}/images` | patients · view (Private album: Doctor, Admin) | listImages | `schema-routes.md:1632, 40` |
| RC-48 | NEW | POST | `/api/v1/app/patients/{patient_id}/images` | patients · edit | uploadImages | `schema-routes.md:1643` |
| RC-49 | NEW | PATCH | `/api/v1/app/images/{image_id}` | patients · edit | updateImage | `schema-routes.md:1643` |
| RC-50 | NEW | GET | `/api/v1/app/patients/{patient_id}/reports` | patients · view | listReports | `schema-routes.md:1633` |
| RC-51 | NEW | POST | `/api/v1/app/patients/{patient_id}/reports` | patients · edit | createReport | `schema-routes.md:1644` |
| RC-52 | NEW | GET | `/api/v1/app/reports/{report_id}` | patients · view | Report viewer | `schema-routes.md:43` |
| RC-53 | NEW | GET | `/api/v1/app/patients/{patient_id}/packages` | patients · view | listPackages | `schema-routes.md:1633` |
| RC-54 | NEW | GET | `/api/v1/app/patients/{patient_id}/notes` | patients · view | listNotes | `schema-routes.md:1633` |
| RC-55 | NEW | POST | `/api/v1/app/patients/{patient_id}/notes` | patients · edit | addNote | `schema-routes.md:1645` |
| RC-56 | NEW | GET | `/api/v1/app/patients/{patient_id}/plan` | patients · view | getPlan — ideas from the AI on a de-identified summary, rules as the fallback (D39) | `schema-routes.md:1635` |
| RC-57 | NEW | POST | `/api/v1/app/patients/{patient_id}/offering-suggestions` | patients · edit | addSuggestion | `schema-routes.md:1646` |
| RC-58 | NEW | PATCH | `/api/v1/app/offering-suggestions/{offering_suggestion_id}` | patients · edit | updateSuggestion | `schema-routes.md:1646` |
| RC-59 | NEW | POST | `/api/v1/app/offering-suggestions/{offering_suggestion_id}/link-invoice` | payments · edit (D17) | linkSuggestionInvoice | `schema-routes.md:1647` |
| RC-60 | NEW | POST | `/api/v1/app/offering-suggestions/{offering_suggestion_id}/unlink-invoice` | payments · edit (D17) | unlinkSuggestionInvoice | `schema-routes.md:1647` |
| RC-61 | NEW | GET | `/api/v1/app/patients/{patient_id}/feedback` | patients · view | listFeedback | `schema-routes.md:1636` |
| RC-62 | NEW | POST | `/api/v1/app/patients/{patient_id}/check-ins` | patients · edit | createCheckIn | `schema-routes.md:1648` |
| RC-63 | NEW | PATCH | `/api/v1/app/check-ins/{check_in_id}` | patients · edit | updateCheckIn | `schema-routes.md:1648` |
| RC-64 | NEW | POST | `/api/v1/app/patients/{patient_id}/reviews` | patients · edit, or the reviews code — Marketing (D16) | createReview | `schema-routes.md:1649` |
| RC-65 | NEW | PATCH | `/api/v1/app/reviews/{review_id}` | patients · edit, or the reviews code — Marketing (D16) | updateReview | `schema-routes.md:1649` |
| RC-66 | NEW | POST | `/api/v1/app/feedback-actions` | patients · edit | logFeedbackAction (a check-in or a review) | `schema-routes.md:1650` |
| RC-67 | NEW | GET | `/api/v1/app/check-ins/{check_in_id}` | patients · view | Check-in drawer | `schema-routes.md:45` |
| RC-68 | NEW | GET | `/api/v1/app/reviews/{review_id}` | patients · view, or the reviews code (D16) | Review drawer | `schema-routes.md:47` |
| RC-168 | NEW | POST | `/api/v1/app/patients/{patient_id}/clinical-notes` | patients · edit (clinical sections; the Accountant and Marketing never — D15, D16) | add a clinical note item | `patient-file.md:53, 225` |
| RC-169 | NEW | DELETE | `/api/v1/app/clinical-notes/{patient_clinical_note_id}` | patients · edit (clinical sections; the Accountant and Marketing never — D15, D16) | remove a clinical note item | `patient-file.md:56, 225` |
| RC-170 | NEW | GET | `/api/v1/app/diagnoses` | patients · view | diagnosis catalogue | `today.md:84` |
| RC-171 | NEW | POST | `/api/v1/app/diagnoses` | prescribe code — Doctor, Admin (D14) | add to the catalogue | `today.md:84` |
| RC-172 | NEW | POST | `/api/v1/app/prescriptions/{prescription_id}/approve` | prescribe code — Doctor, Admin (D14) | approve (draft → approved; every copied line reviewed first), print and send to the pharmacy (D31) | `today.md:86–92` |
| RC-173 | NEW | GET | `/api/v1/app/prescription-kits` | prescribe code — Doctor, Admin (D14) | my kits / quick-adds | `patient-file.md:278`; `today.md:86` |
| RC-174 | NEW | POST | `/api/v1/app/prescription-kits` | prescribe code — Doctor, Admin (D14) | create a kit | `patient-file.md:278` |
| RC-175 | NEW | PATCH | `/api/v1/app/prescription-kits/{prescription_kit_id}` | prescribe code — Doctor, Admin (D14) | edit a kit | `patient-file.md:278` |
| RC-176 | NEW | DELETE | `/api/v1/app/prescription-kits/{prescription_kit_id}` | prescribe code — Doctor, Admin (D14) | remove a kit | `patient-file.md:278` |
| RC-177 | NEW | POST | `/api/v1/app/treatments/{treatment_id}/reverse` | treatments code — Doctor, Therapist (D12, D13) | reverse a session with a reason (never deleted) (P89, D40) | `today.md:105, 107` |
| RC-178 | NEW | POST | `/api/v1/app/patients/{patient_id}/packages` | payments · create (D17) | add a package before its invoice | `patient-file.md:159–169` |
| RC-179 | NEW | POST | `/api/v1/app/packages/{patient_package_id}/use-session` | patients · edit | use a session by hand | `patient-file.md:78` |

## Offerings and offers

| # | Change | Method | Path | Access | Operation | Source |
| --- | --- | --- | --- | --- | --- | --- |
| RC-69 | NEW | GET | `/api/v1/app/offerings` | offerings · view (pickers: any role) | listOfferings | `schema-routes.md:1734` |
| RC-70 | NEW | POST | `/api/v1/app/offerings` | offerings · create | create Offering | `schema-routes.md:1739` |
| RC-71 | NEW | PATCH | `/api/v1/app/offerings/{offering_id}` | offerings · edit | update Offering | `schema-routes.md:1739` |
| RC-72 | NEW | GET | `/api/v1/app/offers` | offerings · view | listOffers | `schema-routes.md:1735` |
| RC-73 | NEW | POST | `/api/v1/app/offers` | offerings · create | create Offer | `schema-routes.md:1740` |
| RC-74 | NEW | PATCH | `/api/v1/app/offers/{offer_id}` | offerings · edit | update Offer | `schema-routes.md:1740` |
| RC-198 | NEW | GET | `/api/v1/app/offering-groups` | any role (pickers) | the clinic's offering groups | D29; `PRD.md:169–173` |
| RC-199 | NEW | POST | `/api/v1/app/offering-groups` | offerings · create | add a group | D29 |
| RC-200 | NEW | PATCH | `/api/v1/app/offering-groups/{offering_group_id}` | offerings · edit | rename or reorder a group | D29 |

## Invoices and payments

| # | Change | Method | Path | Access | Operation | Source |
| --- | --- | --- | --- | --- | --- | --- |
| RC-75 | NEW | GET | `/api/v1/app/invoices` | payments · view (D17) | listOpenInvoices, listPatientInvoices | `schema-routes.md:1702, 1634` |
| RC-76 | NEW | POST | `/api/v1/app/invoices` | payments · create (Counsellor too, D12) | createInvoice — numbered per branch GSTIN and financial year (D23); overall discount before tax, GST-inclusive lines where marked (D20, D21) | `schema-routes.md:1716` |
| RC-77 | NEW | GET | `/api/v1/app/invoices/{invoice_id}` | payments · view | getInvoice | `schema-routes.md:1704` |
| RC-78 | NEW | PATCH | `/api/v1/app/invoices/{invoice_id}` | payments · edit | updateInvoice | `schema-routes.md:1716` |
| RC-79 | NEW | POST | `/api/v1/app/invoices/{invoice_id}/refunds` | refund code — Accountant, Owner, Admin (D25) | refundPayment (credit note + refund; a credit note only against an invoice, D22) | `schema-routes.md:1711` |
| RC-80 | NEW | GET | `/api/v1/app/payments` | payments · view | listLedger, listPatientPayments, listMedicalPayments | `schema-routes.md:1699, 1634, 1662` |
| RC-81 | NEW | POST | `/api/v1/app/payments` | payments · create | receivePayment, payExpense (by direction) | `schema-routes.md:1708–1709` |
| RC-82 | NEW | GET | `/api/v1/app/payments/{payment_id}` | payments · view | Receive / Pay drawer (edit) | `schema-routes.md:87` |
| RC-83 | NEW | PATCH | `/api/v1/app/payments/{payment_id}` | payments · edit | updatePayment | `schema-routes.md:1710` |
| RC-84 | NEW | GET | `/api/v1/app/supplier-bills` | payments · view | listOpenSupplierBills | `schema-routes.md:1701` |
| RC-85 | NEW | GET | `/api/v1/app/pending-credits` | payments · view | listPendingCredits | `schema-routes.md:1700` |
| RC-86 | NEW | POST | `/api/v1/app/pending-credits` | payments · create | create PendingCredit | `schema-routes.md:1712` |
| RC-87 | NEW | PATCH | `/api/v1/app/pending-credits/{pending_credit_id}` | payments · edit | update PendingCredit | `schema-routes.md:1712` |
| RC-88 | NEW | POST | `/api/v1/app/pending-credits/{pending_credit_id}/settle` | payments · edit; a give-back needs the refund code (D25) | settleCredit — a give-back with no invoice is a refund payment, not a credit note (D22) | `schema-routes.md:1713` |
| RC-89 | NEW | GET | `/api/v1/app/day-closes` | close-the-day code — Accountant, Owner, Admin (D13, D18) | getDayClose (branch + date) | `schema-routes.md:1703` |
| RC-90 | NEW | POST | `/api/v1/app/day-closes` | close-the-day code — Accountant, Owner, Admin (D13, D18) | acceptOpeningCash (opens the day) | `schema-routes.md:1714` |
| RC-91 | NEW | POST | `/api/v1/app/day-closes/{day_close_id}/close` | close-the-day code — Accountant, Owner, Admin (D13, D18) | closeDay — a reason when the count differs (D24) | `schema-routes.md:1715` |
| RC-92 | NEW | GET | `/api/v1/app/credit-notes/{credit_note_id}` | payments · view | Credit note (from the ledger) | `schema-routes.md:666–678` |
| RC-180 | NEW | POST | `/api/v1/app/payments/{payment_id}/checked` | Close the day (ability) | tick an entry in the day-close review | `payments.md:61, 67` |
| RC-181 | NEW | POST | `/api/v1/app/payments/{payment_id}/reverse` | Reverse settled payments (ability) | reverse with refund / credit / correction | `users.md:71`; `H:4040–4053` |
| RC-182 | NEW | POST | `/api/v1/app/day-closes/{day_close_id}/reopen` | Close the day (ability) | reopen a closed day | `payments.md:191, 193` |

## Medical store

| # | Change | Method | Path | Access | Operation | Source |
| --- | --- | --- | --- | --- | --- | --- |
| RC-93 | NEW | GET | `/api/v1/app/medical-sales` | medical · view | listSales | `schema-routes.md:1657` |
| RC-94 | NEW | POST | `/api/v1/app/medical-sales` | medical · create | createSale — never more than a batch holds, never an expired batch, never above MRP (D42) | `schema-routes.md:1666` |
| RC-95 | NEW | GET | `/api/v1/app/medical-sales/{medical_sale_id}` | medical · view | Sale view | `schema-routes.md:51` |
| RC-96 | NEW | POST | `/api/v1/app/medical-sales/{medical_sale_id}/returns` | medical · edit | returnSale | `schema-routes.md:1667` |
| RC-97 | NEW | POST | `/api/v1/app/medical-sales/{medical_sale_id}/void` | medical · edit | voidSale | `schema-routes.md:1668` |
| RC-98 | NEW | GET | `/api/v1/app/prescriptions` | medical · view | listPrescriptionsToFill | `schema-routes.md:1658` |
| RC-99 | NEW | GET | `/api/v1/app/medicines` | medical · view (pickers: Doctor too) | listMedicines | `schema-routes.md:1659` |
| RC-100 | NEW | POST | `/api/v1/app/medicines` | medical · create (quick create: Doctor too) | createMedicine, quickCreateMedicine | `schema-routes.md:1669–1670` |
| RC-101 | NEW | GET | `/api/v1/app/medicines/{medicine_id}` | medical · view | Medicine drawer | `schema-routes.md:55` |
| RC-102 | NEW | PATCH | `/api/v1/app/medicines/{medicine_id}` | medical · edit | updateMedicine | `schema-routes.md:1669` |
| RC-103 | NEW | GET | `/api/v1/app/medical-purchase-orders` | medical · view | listPurchaseOrders | `schema-routes.md:1660` |
| RC-104 | NEW | POST | `/api/v1/app/medical-purchase-orders` | medical · create | createPO | `schema-routes.md:1671` |
| RC-105 | NEW | GET | `/api/v1/app/medical-purchase-orders/{medical_purchase_order_id}` | medical · view | PO view | `schema-routes.md:58` |
| RC-106 | NEW | PATCH | `/api/v1/app/medical-purchase-orders/{medical_purchase_order_id}` | medical · edit | updatePO | `schema-routes.md:1671` |
| RC-107 | NEW | POST | `/api/v1/app/medical-purchase-orders/{medical_purchase_order_id}/receive` | medical · edit | receivePO | `schema-routes.md:1672` |
| RC-108 | NEW | POST | `/api/v1/app/medical-purchase-orders/{medical_purchase_order_id}/cancel` | medical · edit | cancelPO | `schema-routes.md:1673` |
| RC-109 | NEW | GET | `/api/v1/app/suppliers` | medical · view | listSuppliers | `schema-routes.md:1661` |
| RC-110 | NEW | POST | `/api/v1/app/suppliers` | medical · create | create Supplier | `schema-routes.md:1674` |
| RC-111 | NEW | PATCH | `/api/v1/app/suppliers/{supplier_id}` | medical · edit | update Supplier | `schema-routes.md:1674` |
| RC-112 | NEW | GET | `/api/v1/app/manufacturers` | medical · view | listManufacturers | `schema-routes.md:1661` |
| RC-113 | NEW | POST | `/api/v1/app/manufacturers` | medical · create | create Manufacturer | `schema-routes.md:1674` |
| RC-114 | NEW | PATCH | `/api/v1/app/manufacturers/{manufacturer_id}` | medical · edit | update Manufacturer | `schema-routes.md:1674` |
| RC-115 | NEW | GET | `/api/v1/app/medical-reps` | medical · view | listMRs | `schema-routes.md:1661` |
| RC-116 | NEW | POST | `/api/v1/app/medical-reps` | medical · create | create MR | `schema-routes.md:1674` |
| RC-117 | NEW | PATCH | `/api/v1/app/medical-reps/{medical_rep_id}` | medical · edit | update MR | `schema-routes.md:1674` |
| RC-118 | NEW | POST | `/api/v1/app/medical-reps/{medical_rep_id}/visits` | medical · edit | logMRVisit (table `medical_rep_visit`, D36) | `schema-routes.md:1675` |
| RC-119 | NEW | GET | `/api/v1/app/medical-contacts` | medical · view | sale Customer picker | `schema-routes.md:834` |
| RC-120 | NEW | GET | `/api/v1/app/suppliers/{supplier_id}` | medical · view | Supplier drawer (+ Account) | `schema-routes.md:63` |
| RC-183 | NEW | POST | `/api/v1/app/medicines/{medicine_id}/return-expiring` | medical · edit | return expiring stock to a supplier (supplier credit) | `medical.md:297–309` |
| RC-184 | NEW | GET | `/api/v1/app/supplier-credits` | medical · view | supplier credits | `medical.md:200, 308` |
| RC-185 | NEW | POST | `/api/v1/app/medicines/near-expiry-discount` | medical · edit | sell expiring medicines at a discount (all or one) | `medical.md:17, 50` |
| RC-186 | NEW | GET | `/api/v1/app/medicines/reorder-suggestions` | medical · view | reorder low stock at the best rate | `medical.md:264` |
| RC-187 | NEW | GET | `/api/v1/app/suppliers/{supplier_id}/account` | medical · view | supplier account history | `medical.md:200, 433` |

## Clinic stock

| # | Change | Method | Path | Access | Operation | Source |
| --- | --- | --- | --- | --- | --- | --- |
| RC-121 | NEW | GET | `/api/v1/app/stock-items` | stock · view | listStockItems | `schema-routes.md:1681` |
| RC-122 | NEW | POST | `/api/v1/app/stock-items` | stock · create | create StockItem | `schema-routes.md:1691` |
| RC-123 | NEW | PATCH | `/api/v1/app/stock-items/{stock_item_id}` | stock · edit | update StockItem | `schema-routes.md:1691` |
| RC-124 | NEW | GET | `/api/v1/app/stock-movements` | stock · view | listMovements | `schema-routes.md:1682` |
| RC-125 | NEW | POST | `/api/v1/app/stock-movements` | stock · edit | useStock | `schema-routes.md:1688` |
| RC-126 | NEW | POST | `/api/v1/app/stock-movements/{stock_movement_id}/revert` | stock · edit | revertMovement | `schema-routes.md:1689` |
| RC-127 | NEW | POST | `/api/v1/app/stock-counts` | stock · edit | saveStockCount | `schema-routes.md:1690` |
| RC-128 | NEW | GET | `/api/v1/app/stock-purchases` | stock · view | listStockPurchases | `schema-routes.md:1683` |
| RC-129 | NEW | POST | `/api/v1/app/stock-purchases` | stock · create | create StockPurchase | `schema-routes.md:1692` |
| RC-130 | NEW | PATCH | `/api/v1/app/stock-purchases/{stock_purchase_id}` | stock · edit | update StockPurchase | `schema-routes.md:1692` |
| RC-131 | NEW | GET | `/api/v1/app/stock-vendors` | stock · view | listVendors | `schema-routes.md:1684` |
| RC-132 | NEW | POST | `/api/v1/app/stock-vendors` | stock · create | create StockVendor | `schema-routes.md:1693` |
| RC-133 | NEW | PATCH | `/api/v1/app/stock-vendors/{stock_vendor_id}` | stock · edit | update StockVendor | `schema-routes.md:1693` |

## Tasks

| # | Change | Method | Path | Access | Operation | Source |
| --- | --- | --- | --- | --- | --- | --- |
| RC-134 | NEW | GET | `/api/v1/app/tasks` | tasks · view (own; Owner, Admin: everyone's) | listTasks | `schema-routes.md:1722` |
| RC-135 | NEW | POST | `/api/v1/app/tasks` | tasks · create | createTask | `schema-routes.md:1727` |
| RC-136 | NEW | GET | `/api/v1/app/tasks/{task_id}` | tasks · view | getTask | `schema-routes.md:1723` |
| RC-137 | NEW | PATCH | `/api/v1/app/tasks/{task_id}` | tasks · edit | updateTask (incl. reassign) | `schema-routes.md:1727` |
| RC-138 | NEW | POST | `/api/v1/app/tasks/{task_id}/resolve` | tasks · edit | resolveTask | `schema-routes.md:1728` |
| RC-188 | NEW | GET | `/api/v1/app/task-rules` | tasks · view | the task rules and their on / automatic settings | `tasks.md:148–162` |
| RC-189 | NEW | PUT | `/api/v1/app/task-rules` | Owner, Admin (A22) | switch rules on / off, set "Clinozy handles it" | `tasks.md:162` |
| RC-190 | NEW | POST | `/api/v1/app/tasks/{task_id}/snooze` | tasks · edit | snooze with a chosen time and label | `tasks.md:178, 351` |
| RC-191 | NEW | POST | `/api/v1/app/tasks/{task_id}/automate` | tasks · edit | "Let Clinozy do it" | `tasks.md:123, 227, 347–348` |

## Search

| # | Change | Method | Path | Access | Operation | Source |
| --- | --- | --- | --- | --- | --- | --- |
| RC-139 | NEW | GET | `/api/v1/app/search` | any role (results filtered by access) | commandSearch | `schema-routes.md:1565` |
| RC-140 | NEW | GET | `/api/v1/app/contact-card` | any role | contactCard (a patient, lead or walk-in customer) | `schema-routes.md:1566` |

## Delete and restore — every clinic resource

Every clinic resource above with a `{…_id}` path also gets `DELETE /api/v1/app/<resource>/{…_id}`
(soft delete with a reason, `{reason, note}`) and `POST /api/v1/app/<resource>/{…_id}/restore` (the
10-second Undo on screen; the API restores until the purge — 7 days by default, D38) —
`schema-routes.md:132–134, 1546`. Money records follow the money rules instead (sales are voided —
P54; payments reversed — P77; refunds and credit notes — D22, D25; an unpaid invoice is deleted with
the void permission — D18). The delete policy is settled (D38); the per-resource list comes with the
ROUTE rows at Step 5.

## Served by existing routes — no change

| Operation | Existing route | Source |
| --- | --- | --- |
| signIn | the platform's sign-in routes (password, email code, Google, passkeys, MFA) | `schema-routes.md:1556` |
| signOut | `POST /api/v1/auth/logout` | `schema-routes.md:1557` |
| file uploads (photos, reports, review files, bills) | `POST /api/v1/uploads` + `…/{upload_id}/confirm` | `schema-routes.md:428, 447, 536` |
| organization switch (the drop's org slug) | `POST /api/v1/auth/switch-to-organization` | `schema-routes.md:19–20` |
| the access sections (dynamic) | `GET /api/v1/tenancy/permissions` — the catalog, now with the clinic section codes seeded (D10) | `schema-routes.md:1009–1021`; `users.md:61–65` |

## Before → after

| # | Route | What changes | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| RC-1 | `GET /api/v1/auth/me/context` | output | the user, the active organization and its permissions | also the clinic roles held, the assigned branches and the clinic section permissions | getSession; D5, D9 |
| RC-2 | `GET /api/v1/tenancy/organization/memberships` | output, filters | members with one role | members with one or more roles, their branches and staff profile; filter by role, branch and search | D5; listUsers |
| RC-3 | `POST /api/v1/tenancy/organization/memberships` | input | invite with one role | invite with one or more roles, branches and the staff profile (hours, colour, commission) | D4, D5 |
| RC-4 | `PATCH /api/v1/tenancy/organization/memberships/{membership_id}` | input | change the one role | change the roles, branches and staff profile | D5 |
| RC-5 | `GET /api/v1/tenancy/organization/roles/{role_id}/permissions` | output | platform permission codes | also the clinic section codes (section × view / create / edit / delete) from the catalog | D5, D10; seeded per D12, D13, D16–D19 |
| RC-6 | `PUT /api/v1/tenancy/organization/roles/{role_id}/permissions` | input | platform permission codes | also the clinic section codes, for the 9 seeded clinic roles and any custom role | D5, D10; seeded per D12, D13, D16–D19 |
| RC-7 | `PATCH /api/v1/tenancy/organization` | input, output | name, slug, settings | also specialties, timezone (currency fixed to INR) | D7 |
| RC-141 | `PATCH /api/v1/tenancy/organization/roles/{role_id}` | input, output | name and description | also tone and purpose (special permissions travel as catalog codes through RC-6 — D10, D18) | D3, D10; `users.md:49–50, 71` |
| RC-142 | `POST /api/v1/tenancy/organization/roles` | input | a new role with platform permissions | a custom clinic role, optionally copying another role's access | D3; `users.md:236, 361` |
| RC-143 | `DELETE /api/v1/tenancy/organization/memberships/{membership_id}` | input, behaviour | removes the member | removes with a reason and note; restorable for 10 s (RC-144) | D3; `users.md:247–252` |
| RC-201 | `PATCH /api/v1/tenancy/organization/settings` | input, output | the organization's existing settings | also the clinic settings: the reminder hour (D34), the re-target days, default 90 (D35), and the deleted-record purge days, default 7 (D38) | D34, D35, D38 |
