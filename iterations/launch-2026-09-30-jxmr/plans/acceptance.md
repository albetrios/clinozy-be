# Acceptance — launch-2026-09-30-jxmr

Status: ready — planning Step 5. One row per acceptance criterion; Result and Evidence stay empty
until built (kickoff, Step 7).

| Item | Source | Result | Evidence |
| --- | --- | --- | --- |
| **team-and-access.1** An Owner or Admin invites a staff member with one or more roles, branches and hours; the person joins by accepting the invitation | intake-files/PRD.md:106 |  |  |
| **team-and-access.2** Each role sees and acts only in the sections its access allows; a person with two roles gets the union | intake-files/PRD.md:26 |  |  |
| **team-and-access.3** A change to a role's access or special permissions applies to everyone holding it at once | intake-files/PRD.md:106 |  |  |
| **team-and-access.4** Branches are added with their team, rooms, machines and holidays | intake-files/PRD.md:105 |  |  |
| **team-and-access.5** Only Owner deletes the organization or transfers ownership; Admin holds every clinic section | intake-files/PRD.md:24 |  |  |
| **team-and-access.6** A removed member is restorable for 10 seconds; an inactive member is signed out | intake-files/PRD.md:150 |  |  |
| **shell-and-patterns.1** Pinned sections, the branch filter and recent picks follow the user to any device | intake-files/PRD.md:180 |  |  |
| **shell-and-patterns.2** The command search finds patients, leads and invoices by name, phone or number | intake-files/PRD.md:180 |  |  |
| **shell-and-patterns.3** Every list searches, filters (its columns, Created, Follow-up), sorts, pages and shows its total | intake-files/PRD.md:235 |  |  |
| **shell-and-patterns.4** Delete, cancel and void ask for a reason and can be undone; deleted records are erased after the purge window | intake-files/PRD.md:234 |  |  |
| **shell-and-patterns.5** A failed save keeps the input, retrying never duplicates, and a stale save says who changed the record and when | intake-files/PRD.md:233 |  |  |
| **offerings.1** Offerings, packages and offers carry kind, group, sessions, list price and lowest price | intake-files/PRD.md:99 |  |  |
| **offerings.2** A discount stops at the offer price without "Bill below the offer price" and never goes below the lowest price | intake-files/PRD.md:99 |  |  |
| **offerings.3** Offers apply to chosen branches or all, with optional dates | intake-files/PRD.md:100 |  |  |
| **leads-and-messages.1** Front desk creates a lead with name, mobile, source and interests; a known phone warns but never blocks | intake-files/PRD.md:52 |  |  |
| **leads-and-messages.2** The lead list filters by status, source, assigned, Created and Follow-up date | intake-files/PRD.md:51 |  |  |
| **leads-and-messages.3** Messages go out on WhatsApp with delivery states and replies land in the conversation | intake-files/PRD.md:52 |  |  |
| **leads-and-messages.4** A first reply or a logged call moves a new lead to Contacted; check-in moves it to Clinic visited | intake-files/PRD.md:112 |  |  |
| **leads-and-messages.5** Closing a lead uses the "Close as" statuses; booking from a lead prefills the appointment | intake-files/PRD.md:52 |  |  |
| **leads-and-messages.6** Re-target leads appear daily for lapsed patients with marketing consent | intake-files/PRD.md:9 |  |  |
| **patients.1** The patient list shows patient, mobile, last visit, doctor, dues and follow-up, with filters and a Recall view | intake-files/PRD.md:63 |  |  |
| **patients.2** New patient captures name, mobile, gender, DOB, address, type, consent and notes | intake-files/PRD.md:64 |  |  |
| **patients.3** Converting a lead creates the patient with the lead linked | intake-files/PRD.md:114 |  |  |
| **appointments.1** The calendar shows agenda, day, week and month by doctor, room or machine | intake-files/PRD.md:57 |  |  |
| **appointments.2** A booking names patient or lead, service, doctor, room and machine, date, time and length inside branch hours and outside holidays | intake-files/PRD.md:135 |  |  |
| **appointments.3** The status moves Scheduled → Confirmed → Checked in → Completed; no-show only by staff after the start | intake-files/PRD.md:58 |  |  |
| **appointments.4** Reschedule, cancel with a reason, restore and copy work | intake-files/PRD.md:58 |  |  |
| **appointments.5** A confirm request goes out on booking and a reminder the day before; a "Yes" confirms | intake-files/PRD.md:234 |  |  |
| **appointments.6** A walk-in is booked at the current slot and checked in at once | intake-files/PRD.md:46 |  |  |
| **patient-file.1** The file shows every section; the Accountant sees billing only and Marketing reviews only | intake-files/PRD.md:69 |  |  |
| **patient-file.2** A prescription is drafted with the quick line, approved by a Doctor or Admin, printed and sent to the pharmacy | intake-files/PRD.md:185 |  |  |
| **patient-file.3** Treatments are recorded by Doctor or Therapist; a session is reversed with a reason, never deleted | intake-files/PRD.md:137 |  |  |
| **patient-file.4** Photos upload up to 15 MB into albums, with location data removed; the Private album only for Doctor and Admin | intake-files/PRD.md:138 |  |  |
| **patient-file.5** The plan lists offering suggestions (Planned → Invoiced) and ideas from history (AI, rules as fallback) | intake-files/PRD.md:140 |  |  |
| **patient-file.6** A worse check-in shows Action needed and creates a doctor call-back task | intake-files/PRD.md:124 |  |  |
| **today-floor.1** Today shows each visit in its lane (seven lanes) with time, service, doctor and plan flag | intake-files/PRD.md:45 |  |  |
| **today-floor.2** Check-in, stage moves, pause, resume and complete show for everyone within 60 seconds | intake-files/PRD.md:45 |  |  |
| **today-floor.3** Completing the visit completes the appointment and uses a package session | intake-files/PRD.md:46 |  |  |
| **today-floor.4** An approved prescription appears in the Pharmacy lane | intake-files/PRD.md:45 |  |  |
| **payments-and-invoices.1** One invoice serves clinic and medical sales; lines carry qty, rate, discount and GST; the overall discount comes before tax | intake-files/PRD.md:186 |  |  |
| **payments-and-invoices.2** Invoice numbers run per branch GSTIN and financial year | intake-files/PRD.md:141 |  |  |
| **payments-and-invoices.3** Receive and Pay record payments (splits, several supplier bills); a closed day's payment is reversed, never edited | intake-files/PRD.md:88 |  |  |
| **payments-and-invoices.4** Pending credits settle by give back, got it back or use on the next bill | intake-files/PRD.md:88 |  |  |
| **payments-and-invoices.5** Day close accepts the opening cash, counts the drawer, closes with a reason when it differs and locks the day | intake-files/PRD.md:88 |  |  |
| **payments-and-invoices.6** Refunds issue a credit note against an invoice | intake-files/PRD.md:88 |  |  |
| **medical-store.1** Medicines are stocked by batch with expiry (MM/YY) and the nearest expiry shown | intake-files/PRD.md:75 |  |  |
| **medical-store.2** A sale deducts stock by earliest expiry and refuses expired batches and prices above MRP | intake-files/PRD.md:76 |  |  |
| **medical-store.3** Sales are viewed, collected, returned or voided (stock restored), never edited | intake-files/PRD.md:76 |  |  |
| **medical-store.4** Purchase orders move Ordered → Received → Paid; paying records a payment | intake-files/PRD.md:76 |  |  |
| **clinic-stock.1** Items show stock in their unit; "Use" records a movement that can be undone | intake-files/PRD.md:82 |  |  |
| **clinic-stock.2** A stock check records counted against system and adjusts | intake-files/PRD.md:82 |  |  |
| **clinic-stock.3** A purchase records the vendor bill; typing paid records the payment | intake-files/PRD.md:82 |  |  |
| **tasks.1** Tasks come from the 13 rules, each with an owner or a role queue | intake-files/PRD.md:93 |  |  |
| **tasks.2** Outcomes resolve tasks; snooze returns them at the chosen time; reassign keeps history | intake-files/PRD.md:94 |  |  |
| **tasks.3** Staff create a task with type, priority and reminder | intake-files/PRD.md:94 |  |  |
| **tasks.4** Owner and Admin switch rules on or off and set their due time and owner | intake-files/PRD.md:93 |  |  |
| **flow-enquiry-to-patient.1** A new lead is booked from its chat, checked in on the day (the lead moves to Clinic visited), becomes a patient, and the visit completes | intake-files/PRD.md:111–114 |  |  |
| **flow-visit-to-payment.1** A quick-line prescription is saved and sold; the sale is prefilled and takes stock by earliest expiry; Receive by UPI shows in the ledger | intake-files/PRD.md:117–120 |  |  |
| **flow-plan-and-feedback.1** A planned package is invoiced (the row turns Invoiced), an aftercare task appears the next day, and a worse check-in shows Action needed with a doctor call-back task | intake-files/PRD.md:123–125 |  |  |
