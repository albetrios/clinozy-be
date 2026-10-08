# Worker changes — launch-2026-09-30-jxmr

The iteration's background work — everything that happens without a user — in one file, kept current
at every planning step (`be-iteration-planning` › Worker changes). Plain words only: no queue, job,
event or worker names; kickoff names them and records them in `AS-BUILT.md`.

Status: ready — planning Step 5, with D1–D44 applied; each piece has its ROUTE row in KICKOFF.md. Mode initial (Baseline `none`) · Intake
hash `036cbb592ac5` · 2026-10-03. Mode initial, so every row is `NEW` and there is no Before → after.

**Settled in Step 4:** real WhatsApp through the Business API (D32), no SMS or email (D33), a confirm
request + one reminder (D34), daily re-target leads with staff sending the first message (D35), the
task rules (coverage P26, D3) and who changes their settings (D19), refresh every 60 s instead of push
(D37), deleted records purged after 7 days (D38), AI ideas (D39), and every "On failure" default
(D40). Nothing is open.
Requirement identifiers are provisional until Step 5.

## Route review sync (2026-10-08)

The route review ([routes-final.md](routes-final.md), [D46](decisions.md)) settles how each piece below is built; the
re-planned ROUTE ([D50](decisions.md)) gives each one its row:

| Pieces | ROUTE row | What the route review changes |
| --- | --- | --- |
| WC-1–WC-4, WC-13 — messaging | #139 | the stream is the contact's activity (§4, M1, M8): messages are stored now and sent once this row lands |
| WC-5–WC-8 — booking messages | #140 | on the contact's booking (§6) |
| WC-9, WC-10, WC-12 — money messages | #141 | receipts and dues on the contact's invoices (§8, B3) |
| WC-11 — visit share | #142 | — |
| WC-14–WC-17 — lead automation | #143 | status moves and involved members happen in the activity write itself (§4, §5); hold release and re-target stay background |
| WC-18–WC-33, WC-35–WC-38 — task rules | #138 | one rules worker, 14 rules (§10, 10.A.10): `onboarding` (WC-31) goes — no rule designed; `unhappy` (WC-32) folds into `call_back`; `gone_quiet` (WC-29) counts paid sessions left, not packages only (§7, PK11) |
| WC-39 — day auto-close | #136 | §8, 8.E |
| WC-40, WC-41 — team | #144 | — |
| WC-42, WC-43 — photos | #145 | pairing uses a photo's session and stage (§7, P24) |
| WC-44 — floor | #146 | refresh, no push ([D37](decisions.md)) |
| WC-46 — purge | #147 | — |
| WC-34 (MR visit), WC-45 (pharmacy queue) | #153 | back with [D75](decisions.md): WC-34 is the `medical_rep_visit` task rule (§11 MD8); WC-45 is `GET /patient-prescriptions?is_filled=false` (§7), no worker — **built (#153):** the fifteenth source in `task-rule-conditions.repository.ts`, run by the existing `task-rules-sweep` → `task-rules` jobs (pharmacist queue, due 11:00 on `next_visit_on`, closes when a visit moves or clears the date); `is_filled` a derived filter on `app.patient_prescriptions` (a live `app.medical_sales` row names it) |
| WC-47 — AI ideas | #152 — deferred | `app.patient_ideas` is dropped until its feature is built (§7, P20) |

## Counts

| Area | NEW | CHANGED | REMOVED |
| --- | --- | --- | --- |
| Messages and reminders | 13 | 0 | 0 |
| Leads | 4 | 0 | 0 |
| Tasks | 21 | 0 | 0 |
| Money | 1 | 0 | 0 |
| Team and access | 2 | 0 | 0 |
| Files | 2 | 0 | 0 |
| Live updates | 2 | 0 | 0 |
| Records and ideas | 2 | 0 | 0 |
| **Total** | **47** | **0** | **0** |

Not background work (computed when read, no schedule needed): offer start / end by date
(`offerings.md:47, 106, 154`), low stock and expiry warnings (`medical.md:45, 50`;
`clinic-stock.md:29`), the opening cash carried from the last close (`payments.md:76, 327`).

## Messages and reminders

| # | Change | Background work | When it runs | What it touches | On failure | Who is told | Requirement | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WC-1 | NEW | send an outgoing message through the WhatsApp Business API (or Instagram) and follow its delivery (Sending → Sent → Delivered → Read, or Failed) (D32) | a message is sent from a chat, a reminder, a receipt or a share | the message's delivery status | marked "Not sent"; staff can Retry; a retry never sends twice *(D40)* | the sender sees the status | `background.message-delivery` | `schema-routes.md:279, 1119–1126`; `leads.md:52, 118`; `_patterns.md:153, 158` |
| WC-2 | NEW | hold messages while WhatsApp is down and send them when it is back | the provider reports an outage | queued messages | stay "Queued" until sent; never dropped *(D40)* | everyone composing sees "WhatsApp down · replies will queue" | `background.message-outage-queue` | `leads.md:378, 416`; `_patterns.md:158, 168, 288`; `H:1853` |
| WC-3 | NEW | take in replies (WhatsApp, Instagram) and add them to the person's conversation | a reply arrives | the conversation, unread counts | kept and retried until stored *(D40)* | the lead's owner sees it unread | `background.inbound-messages` | `leads.md:410`; `_patterns.md:149, 153` |
| WC-4 | NEW | when WhatsApp fails, flag a call — no SMS at launch (D33) | a WhatsApp message fails and the rule is set to "Clinozy handles it" | the message, a "failed" task | the task stays open for a person | the lead's owner | `background.channel-fallback` | `H:4224–4235`; `tasks.md:315–325` |
| WC-5 | NEW | ask the patient to confirm right after booking ("Yes" confirms) (D34) | an appointment is booked | the appointment's reminder status | marked failed; the Confirm task stays open | front desk | `background.booking-confirm-request` | `appointments.md:100, 370, 376`; `H:6030, 6051` |
| WC-6 | NEW | remind the patient the day before the visit, at the hour the clinic sets — no 2-hour nudge (D34) | that hour, the day before each scheduled visit | the appointment's reminder status | marked failed, shown in "Latest update" | front desk | `background.appointment-reminder` | `appointments.md:376`; `H:3234, 6030, 6048`; `PRD.md:199, 234` |
| WC-7 | NEW | move reminders when a visit is rescheduled, stop them when it is cancelled, restart them on restore (D34) | the appointment is rescheduled, cancelled or restored | pending reminders | safe to skip a stopped reminder | — | `background.reminder-rescheduling` | `appointments.md:179, 244, 245`; `_patterns.md:72` |
| WC-8 | NEW | confirm the appointment when the patient replies "Yes" | a "Yes" reply to the confirm request or reminder | the appointment (Confirmed, "Replied Yes") | the visit stays Scheduled; the Confirm task stays open | front desk sees "Replied Yes" | `background.auto-confirm-on-reply` | `appointments.md:360, 370`; `H:4270, 5971` |
| WC-9 | NEW | send the receipt to the patient on WhatsApp | a payment is received | — (a message) | retried; the receipt can be re-sent by hand *(D40)* | the patient | `background.payment-receipt` | `payments.md:207`; `today.md:118, 120`; `H:4629` |
| WC-10 | NEW | send the day-close summary to the admin on WhatsApp | a day is closed | — (a message) | retried *(D40)* | the admin | `background.day-close-summary` | `payments.md:193, 423`; `H:6107` |
| WC-11 | NEW | deliver the "Share Rx, invoice & photos" message | staff press Share at the end of a visit | — (a message with documents) | marked "Not sent"; Retry | the patient | `background.visit-share` | `patient-file.md:400`; `H:766` |
| WC-12 | NEW | deliver bulk payment reminders | staff send reminders to all unpaid (sales or dues) | each person's last-reminder date | each failed message is marked; the rest still go | the patients | `background.bulk-payment-reminders` | `medical.md:17, 539`; `H:5013, 5441` |
| WC-13 | NEW | prepare bulk WhatsApp drafts | staff pick people and press Message | — | — | the staff member who asked | `background.bulk-message-drafts` | `schema-routes.md:1596`; `patients.md:281`; `users.md:38` |

## Leads

| # | Change | Background work | When it runs | What it touches | On failure | Who is told | Requirement | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WC-14 | NEW | open a held lead to the team after its idle days (default 3), or at once when its owner has left; warn the day before | daily, and when an owner leaves | lead hold state | safe to run again; never changes the owner by itself | the team ("Open to team"), the owner ("hold expires soon") | `background.lead-hold-release` | `leads.md:32, 180, 402–403`; `tasks.md:46`; `H:3869, 5738` |
| WC-15 | NEW | move a lead's status by itself: first reply or logged call → Contacted; check-in → Clinic visited — each with a system line in the chat (P21, D40) | the reply / call / check-in happens | the lead's status, its conversation | the status stays; never moves a closed lead | the lead's owner | `background.lead-status-auto` | `leads.md:119, 280–282`; `appointments.md:100, 239`; `schema-routes.md:1142, 1610` |
| WC-16 | NEW | add a team member to "involved" when they reply, call, note or book | that action on the lead | the lead's involved people | — | — | `background.lead-involved-auto` | `leads.md:192, 196`; `H:1791` |
| WC-17 | NEW | create re-target leads for lapsed patients — no visit in N days (clinic setting, default 90), marketing consent given, nothing booked; staff send the first message, nothing goes out by itself (D35) | daily | new leads (Re-targeted), their first message | each patient gets one re-target lead at most | the assigned owner | `background.retarget-leads` | `schema-routes.md:244, 263, 1084, 1100`; `H:3349–3356, 3377, 3398–3399` |

## Tasks

A task appears by itself when its condition becomes true, and closes by itself when the condition is gone
("Done by Clinozy"). Each rule can be switched off, or set to "Clinozy handles it", per organization
(`tasks.md:148–162`). Due times are clinic-local.

| # | Change | Background work | When it runs | What it touches | On failure | Who is told | Requirement | Source | Built |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WC-18 | NEW | **Reply** task — a lead's last message is from them | the message arrives; due 30 min later | Task | — | the lead's owner | `background.task-reply` | `tasks.md:44–56`; `H:4244` | `task-rules` rule `reply` — due 30 min after it came, high · #138 |
| WC-19 | NEW | **Message failed** task | an outbound message fails with no later success | Task | — | the lead's owner | `background.task-failed-message` | `H:4245` | `task-rules` rule `failed_message` — on the person (last 30 days), its author, else the lead's owner, else the front desk queue · #138 |
| WC-20 | NEW | **Follow-up** task — lead in Follow-up / Contacted / No response, follow-up date reached | that date; due 11:00 | Task | — | the lead's owner | `background.task-follow-up` | `H:4246`; `leads.md:278` | `task-rules` rule `follow_up` — any open lead, 11:00 on its date · #138 |
| WC-21 | NEW | **Call back** task when a lead is set to No response (unless one is open) | the status change | Task | — | the lead's owner | `background.task-call-back` | `leads.md:279`; `H:5633` | not a rule of its own (10.A.10): a No response lead keeps its `follow_up` task · #138 |
| WC-22 | NEW | **Claim** task — a lead's hold is open and it is not yours | the hold opens; due in 3 h | Task | — | the team | `background.task-claim` | `H:4247` | `task-rules` rule `claim` — the hold ended or an involved member left; the counsellor queue · #138 |
| WC-23 | NEW | **Confirm** task — visit Scheduled within 48 h and not confirmed | due 2 h before if under 20 h away, else 18:00 the day before | Task | — | front desk | `background.task-confirm` | `H:4250`; `appointments.md:234` | `task-rules` rule `confirm` — a moved booking's task closes and a fresh one opens · #138 |
| WC-24 | NEW | **Arrived?** task — 15 min past start, not checked in | start + 15 min | Task | — | front desk | `background.task-arrive` | `H:4251` | `task-rules` rule `arrive` · #138 |
| WC-25 | NEW | **Rebook** task after a no-show | the next day, 11:00 | Task | — | front desk | `background.task-rebook` | `H:4252`; `tasks.md:205` | `task-rules` rule `rebook` — no-shows of the last 30 days, until a newer booking · #138 |
| WC-26 | NEW | **Feedback** task — visit completed 1–3 days ago | 12:00 | Task | — | front desk | `background.task-feedback` | `H:4253`; `appointments.md:376` | `task-rules` rule `feedback` — the counsellor queue, 12:00 the next day · #138 |
| WC-27 | NEW | **Aftercare call** task — a treatment asked for a call and no check-in exists | treatment date + the chosen days, 11:00 | Task | — | the treating therapist | `background.task-aftercare` | `H:4254`; `PRD.md:125`; `today.md:105, 107` | `task-rules` rule `aftercare` — 1 / 2 / 7 days, shown from 2 days before, up to 14 days late · #138 |
| WC-28 | NEW | **Next visit** task — last visit 1–45 days ago, nothing booked, no follow-up date | 17:00 | Task | — | front desk | `background.task-next-visit` | `H:4256` | `task-rules` rule `next_visit` — 17:00 the day after the last visit · #138 |
| WC-29 | NEW | **Gone quiet** task — 30+ days since the last visit, with a package left or 2+ visits; up to 3 come-back reminders first | daily, 12:00 | Task | — | front desk | `background.task-gone-quiet` | `H:4257`; `tasks.md:55, 326` | `task-rules` rule `gone_quiet` — sessions left on a live patient offering; Clinozy opens a re-target lead · #138 |
| WC-30 | NEW | **Payment due** task — an invoice or sale is saved with money left to pay | the save | Task | — | front desk | `background.task-payment-due` | `payments.md:149`; `medical.md:167`; `H:5065` | `task-rules` rule `payment_due` — the day after the invoice's date, its first credited member · #138 |
| WC-31 | NEW | **Onboarding** task — collect consent, date of birth and a first photo | a new patient is created; due today | Task | — | front desk | `background.task-onboarding` | `patients.md:63, 299` | dropped — no rule designed (10.A.10) · #138 |
| WC-32 | NEW | **Doctor call-back** task — a check-in says Worse or scores 4 or less (due in 3 h), or a review rates 3 or less (due in 4 h) | the check-in / review is saved | Task | — | the visit's doctor | `background.task-unhappy` | `patient-file.md:186, 202`; `schema-routes.md:1648–1649`; `H:4065, 4067` | folded into `call_back` — opened in the check-in's / review's write (`openCallBackTask`) and by an `unhappy` outcome · #138 |
| WC-33 | NEW | **Settle by** task for a pending credit | the settle-by date | Task | — | the owner of the credit | `background.task-settle-by` | `payments.md:161`; `H:4034` | `task-rules` rule `settle_by` — the credit's creator · #138 |
| WC-34 | NEW | **MR next visit** reminder | the MR's next-visit date | Task | — | the pharmacist | `background.task-medical-rep-visit` | `medical.md:251`; `H:5386` | `task-rules` job, rule `medical_rep_visit` · #153 |
| WC-35 | NEW | close a task by itself when its condition is gone, logged "Done by Clinozy" | the source record changes | Task (resolved) | — | the owner sees it in Done | `background.task-auto-resolve` | `tasks.md:58`; `H:4263` | `task-rules`: per rule, open tasks whose record no longer qualifies close (`outcome` `done`, "Done by Clinozy") — even while the rule is off · #138 |
| WC-36 | NEW | bring a snoozed task back | its snooze time | Task | — | the owner | `background.task-snooze-return` | `tasks.md:178` | `task-rules`: snoozed tasks whose time came open again, every five minutes · #138 |
| WC-37 | NEW | "Clinozy handles it": send the rule's canned message and close the task (first reply with prices + free slots, check-in, reminder, two slots, feedback form, aftercare check-in) | a task of a rule set to automatic appears | Task, a message | the task stays open for a person | — | `background.task-automation` | `tasks.md:162, 315–325`; `H:4224–4235, 4326` | `task-rules`: when the task falls due — `confirm`, `payment_due`, `feedback` queue a WhatsApp message; `gone_quiet` opens a re-target lead; then "Done by Clinozy" · #138 |
| WC-38 | NEW | never create a second open task of the same kind for the same person | every task the rules create | Task | — | — | `background.task-dedupe` | `H:4549–4550` | `idx_tasks_open_rule_source` — one open task per rule per record · #138 |

## Money

| # | Change | Background work | When it runs | What it touches | On failure | Who is told | Requirement | Source | Built |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WC-39 | NEW | close a past day that nobody closed, taking the cash as expected, and lock its entries | after the grace period (midnight after the day) | DayClose, the day's payments | safe to run again; never closes today | the admin / accountant see "Auto-closed" | `background.day-auto-close` | `payments.md:277, 327, 331`; `H:5085–5087` | `day-close-auto-close-sweep` (cron `7 * * * *`, cross-tenant read) → one `day-close-auto-close` job per organization (`organizationPublicId`, deduplicated) — `billing/day-closes/workers/` · #136 |

## Team and access

| # | Change | Background work | When it runs | What it touches | On failure | Who is told | Requirement | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WC-40 | NEW | apply a role's permission change to everyone holding it at once | a role's access or special permissions change | each holder's effective access | — | — | `background.permission-refresh` | `users.md:19, 77` |
| WC-41 | NEW | sign out a staff member set to Inactive | the user is set Inactive | their sessions | — | — | `background.inactive-sign-out` | `users.md:117` |

## Files

| # | Change | Background work | When it runs | What it touches | On failure | Who is told | Requirement | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WC-42 | NEW | remove location data from uploaded photos, keeping capture order | a photo is uploaded | PatientImage | the photo is not shown until cleaned *(D40)* | — | `background.photo-cleanup` | `today.md:262` |
| WC-43 | NEW | pair before photos with the matching after photos | visit photos are added | PatientImage | — | — | `background.photo-pairing` | `patient-file.md:396` |

## Live updates

| # | Change | Background work | When it runs | What it touches | On failure | Who is told | Requirement | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WC-44 | NEW | tell the doctor's queue and room that a patient checked in, and move the card for everyone on Today | check-in, and every stage change | Today, the visit | the next refresh shows it (Today polls every 60 s; no push, D37) | the doctor | `background.floor-live` | `today.md:41, 208`; `appointments.md:376`; `schema-routes.md:1577` |
| WC-45 | NEW | put an approved prescription in the pharmacy queue (D31) | Approve | Today (Pharmacy lane), the prescription | the next refresh shows it | the pharmacist | `background.pharmacy-queue` | `today.md:92`; `H:6093` |

## Records and ideas

| # | Change | Background work | When it runs | What it touches | On failure | Who is told | Requirement | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WC-46 | NEW | erase deleted records for good once their restore window ends (default 7 days, a clinic setting); live records are never touched | daily | every clinic record deleted more than N days ago | retried the next day; nothing erased twice *(D40)* | — | `background.deleted-record-purge` | D38 |
| WC-47 | NEW | refresh a patient's AI ideas from a de-identified summary (Data consent only) | after a visit, treatment, package or plan change | the patient's ideas | the rule-based ideas stay shown *(D40)* | — | `background.patient-ideas` | D39; `schema-routes.md:1635`; `H:4355–4367` |
