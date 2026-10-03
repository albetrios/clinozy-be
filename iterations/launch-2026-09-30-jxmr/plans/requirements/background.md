# Background — launch-2026-09-30-jxmr

Status: ready — planning Step 5. Answers: the rules every piece of background work follows — the list of background work itself is [worker-changes.md](../worker-changes.md). Requirements state WHAT must be true; the
technical design is decided per ROUTE row at kickoff and recorded in `AS-BUILT.md` (agent-os decides).

| Requirement | Change | What must be true | Source | Features |
| --- | --- | --- | --- | --- |
| `background.retries` | NEW | Every piece of background work is retried; one that keeps failing is kept for a person to see, never lost silently | worker-changes.md › On failure; D40 | [shell-and-patterns](../features/shell-and-patterns/story.md) |
| `background.run-once` | NEW | Running a piece twice never doubles its effect — no duplicate message, task, payment or lead | H:2354; C12 | [shell-and-patterns](../features/shell-and-patterns/story.md) |
| `background.clinic-local-time` | NEW | Timed work runs in the clinic's local time and respects branch hours, holidays and the clinic's reminder hour | schema-routes.md:7; D34, D41 | [shell-and-patterns](../features/shell-and-patterns/story.md) |

## The background work

Each piece has its own requirement identifier — the `Requirement` column of
[worker-changes.md](../worker-changes.md) — and its own ROUTE row:

| Requirement | Work | Feature |
| --- | --- | --- |
| `background.message-delivery` | WC-1 — send an outgoing message through the WhatsApp Business API (or Instagram) and follow its delivery (Sending → Sent → Delivered → Read, or Failed) (D32) | leads-and-messages |
| `background.message-outage-queue` | WC-2 — hold messages while WhatsApp is down and send them when it is back | leads-and-messages |
| `background.inbound-messages` | WC-3 — take in replies (WhatsApp, Instagram) and add them to the person's conversation | leads-and-messages |
| `background.channel-fallback` | WC-4 — when WhatsApp fails, flag a call — no SMS at launch (D33) | leads-and-messages |
| `background.booking-confirm-request` | WC-5 — ask the patient to confirm right after booking ("Yes" confirms) (D34) | appointments |
| `background.appointment-reminder` | WC-6 — remind the patient the day before the visit, at the hour the clinic sets — no 2-hour nudge (D34) | appointments |
| `background.reminder-rescheduling` | WC-7 — move reminders when a visit is rescheduled, stop them when it is cancelled, restart them on restore (D34) | appointments |
| `background.auto-confirm-on-reply` | WC-8 — confirm the appointment when the patient replies "Yes" | appointments |
| `background.payment-receipt` | WC-9 — send the receipt to the patient on WhatsApp | payments-and-invoices |
| `background.day-close-summary` | WC-10 — send the day-close summary to the admin on WhatsApp | payments-and-invoices |
| `background.visit-share` | WC-11 — deliver the "Share Rx, invoice & photos" message | patient-file |
| `background.bulk-payment-reminders` | WC-12 — deliver bulk payment reminders | payments-and-invoices |
| `background.bulk-message-drafts` | WC-13 — prepare bulk WhatsApp drafts | leads-and-messages |
| `background.lead-hold-release` | WC-14 — open a held lead to the team after its idle days (default 3), or at once when its owner has left; warn the day before | leads-and-messages |
| `background.lead-status-auto` | WC-15 — move a lead's status by itself: first reply or logged call → Contacted; check-in → Clinic visited — each with a system line in the chat (P21, D40) | leads-and-messages |
| `background.lead-involved-auto` | WC-16 — add a team member to "involved" when they reply, call, note or book | leads-and-messages |
| `background.retarget-leads` | WC-17 — create re-target leads for lapsed patients — no visit in N days (clinic setting, default 90), marketing consent given, nothing booked; staff send the first message, nothing goes out by itself (D35) | leads-and-messages |
| `background.task-reply` | WC-18 — **Reply** task — a lead's last message is from them | tasks |
| `background.task-failed-message` | WC-19 — **Message failed** task | tasks |
| `background.task-follow-up` | WC-20 — **Follow-up** task — lead in Follow-up / Contacted / No response, follow-up date reached | tasks |
| `background.task-call-back` | WC-21 — **Call back** task when a lead is set to No response (unless one is open) | tasks |
| `background.task-claim` | WC-22 — **Claim** task — a lead's hold is open and it is not yours | tasks |
| `background.task-confirm` | WC-23 — **Confirm** task — visit Scheduled within 48 h and not confirmed | tasks |
| `background.task-arrive` | WC-24 — **Arrived?** task — 15 min past start, not checked in | tasks |
| `background.task-rebook` | WC-25 — **Rebook** task after a no-show | tasks |
| `background.task-feedback` | WC-26 — **Feedback** task — visit completed 1–3 days ago | tasks |
| `background.task-aftercare` | WC-27 — **Aftercare call** task — a treatment asked for a call and no check-in exists | tasks |
| `background.task-next-visit` | WC-28 — **Next visit** task — last visit 1–45 days ago, nothing booked, no follow-up date | tasks |
| `background.task-gone-quiet` | WC-29 — **Gone quiet** task — 30+ days since the last visit, with a package left or 2+ visits; up to 3 come-back reminders first | tasks |
| `background.task-payment-due` | WC-30 — **Payment due** task — an invoice or sale is saved with money left to pay | tasks |
| `background.task-onboarding` | WC-31 — **Onboarding** task — collect consent, date of birth and a first photo | tasks |
| `background.task-unhappy` | WC-32 — **Doctor call-back** task — a check-in says Worse or scores 4 or less (due in 3 h), or a review rates 3 or less (due in 4 h) | tasks |
| `background.task-settle-by` | WC-33 — **Settle by** task for a pending credit | tasks |
| `background.task-medical-rep-visit` | WC-34 — **MR next visit** reminder | tasks |
| `background.task-auto-resolve` | WC-35 — close a task by itself when its condition is gone, logged "Done by Clinozy" | tasks |
| `background.task-snooze-return` | WC-36 — bring a snoozed task back | tasks |
| `background.task-automation` | WC-37 — "Clinozy handles it": send the rule's canned message and close the task (first reply with prices + free slots, check-in, reminder, two slots, feedback form, aftercare check-in) | tasks |
| `background.task-dedupe` | WC-38 — never create a second open task of the same kind for the same person | tasks |
| `background.day-auto-close` | WC-39 — close a past day that nobody closed, taking the cash as expected, and lock its entries | payments-and-invoices |
| `background.permission-refresh` | WC-40 — apply a role's permission change to everyone holding it at once | team-and-access |
| `background.inactive-sign-out` | WC-41 — sign out a staff member set to Inactive | team-and-access |
| `background.photo-cleanup` | WC-42 — remove location data from uploaded photos, keeping capture order | patient-file |
| `background.photo-pairing` | WC-43 — pair before photos with the matching after photos | patient-file |
| `background.floor-live` | WC-44 — tell the doctor's queue and room that a patient checked in, and move the card for everyone on Today | today-floor |
| `background.pharmacy-queue` | WC-45 — put an approved prescription in the pharmacy queue (D31) | today-floor |
| `background.deleted-record-purge` | WC-46 — erase deleted records for good once their restore window ends (default 7 days, a clinic setting); live records are never touched | shell-and-patterns |
| `background.patient-ideas` | WC-47 — refresh a patient's AI ideas from a de-identified summary (Data consent only) | patient-file |

## Before → after

none — every requirement here is NEW
