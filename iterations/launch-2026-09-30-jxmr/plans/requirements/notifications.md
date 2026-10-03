# Notifications — launch-2026-09-30-jxmr

Status: ready — planning Step 5. Answers: who is told what, through which channel, when. Requirements state WHAT must be true; the
technical design is decided per ROUTE row at kickoff and recorded in `AS-BUILT.md` (agent-os decides).

| Requirement | Change | What must be true | Source | Features |
| --- | --- | --- | --- | --- |
| `notifications.channels` | NEW | Patients are messaged on WhatsApp (and Instagram where that is the thread); calls and notes are logged; no SMS or email to patients at launch | D32, D33, D3 | [leads-and-messages](../features/leads-and-messages/story.md) |
| `notifications.appointment-confirm` | NEW | A confirm request goes to the patient right after booking; a "Yes" confirms the appointment | D34; schema-routes.md:1140 | [appointments](../features/appointments/story.md) |
| `notifications.appointment-reminder` | NEW | One reminder goes the day before, at the clinic's hour; it moves on reschedule, stops on cancel, restarts on restore | D34; PRD.md:234 | [appointments](../features/appointments/story.md) |
| `notifications.payment-receipt` | NEW | The patient receives a receipt on WhatsApp when a payment is received | payments.md; WC-9 | [payments-and-invoices](../features/payments-and-invoices/story.md) |
| `notifications.visit-share` | NEW | At the end of a visit staff can share the prescription, invoice and photos with the patient | WC-11 | [patient-file](../features/patient-file/story.md) |
| `notifications.payment-reminders` | NEW | Staff send payment reminders to everyone unpaid in one action | WC-12 | [payments-and-invoices](../features/payments-and-invoices/story.md) |
| `notifications.day-close-summary` | NEW | The admin receives the day-close summary on WhatsApp | payments.md:193, 423; WC-10 | [payments-and-invoices](../features/payments-and-invoices/story.md) |
| `notifications.marketing-consent` | NEW | Re-target and campaign messages go only to patients who gave marketing consent | D35; H:2353 | [leads-and-messages](../features/leads-and-messages/story.md) |

## Before → after

none — every requirement here is NEW
