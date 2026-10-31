# Coverage — feat-lead-follows-bookings-2026-10-30-ytqj

Status: **Steps 1–3, 2026-10-30** — every row is `covered` (the backend's, here) or `covered (clinozy-fe)`
(the frontend's, planned in the same-named clinozy-fe iteration); nothing `open`, nothing out of scope
but the brief's own Out of scope (BRIEF.md:149–156).

Mode: initial (Baseline `none`) · Intake mode `brief` (from scratch) · Intake hash `5bae0977a19a`.

## Intake read (Step 1)

The gate passed: 1 file, the mandatory set of a brief from scratch.

| File | Read in full | Kind | What it gives this plan |
| --- | --- | --- | --- |
| `BRIEF.md` | yes | the change list | every row below |

With no `PRD.md` or `schema-routes.md` in the snapshot, the brief is read against **the code as built**
(the launch's route review as it stands in the code, and the first slice of this change already written
before the iteration opened — D9). What the code does today, where it bears on the brief:

| # | Fact in the code today (2026-10-30, branch `feat/lead-follows-bookings` at `6e92210`) | Where | Bears on |
| --- | --- | --- | --- |
| K1 | A lead's statuses: `new`, `contacted`, `follow_up`, `appointment_scheduled`, `no_response` open; `not_interested`, `invalid`, `lost`, `clinic_visited` closed — the first slice added `appointment_scheduled` (varchar 21, CHECK, one-open-lead index) | `leads.constants.ts`, migrations `20261028131034`, `20261028131036` | C1–C9 |
| K2 | Every appointment write re-syncs the person's open lead with their bookings (`LeadsRepository.followBookings`) and writes a `system` stream line when it moves | `appointments.rules.ts` › `followLeadBookings` | C5–C9 |
| K3 | Check-in (and a walk-in, checked in as it is made) moves the person's **open** lead to `clinic_visited` and opens a patient file once, linked to that lead — a person with **no open lead** gets an unlinked file and their closed lead stays closed | `appointments.rules.ts` › `convertAtCheckIn`, `LeadsRepository.markVisited` | C11–C13 |
| K4 | A lead has **no close date** — only `updated_at`, which any later edit moves | `leads.schema.ts` | C12 (D7) |
| K5 | The `follow_up` task rule skips booked leads (first slice); a rule task closes itself once its record stops qualifying (TK4), and every booking write asks for a rules run after its commit | `task-rule-conditions.repository.ts`, `task-rules.repository.ts:224`, `appointments.rules.ts` › `followBookingMessages` | C10, C11 |
| K6 | "Start visit" (Today's walk-in, the patient file's Start visit) checks in the person's booking **of today** if there is one, else books a walk-in — a booking on a later day is left as it is, and nothing tells the desk | clinozy-fe `visits-api.ts` › `startVisit` | C14 |
| K7 | The patient's own follow-ups after a visit are task rules already: `feedback`, `aftercare`, `next_visit`, `rebook`, `gone_quiet` | `tasks.constants.ts` | C15 |
| K8 | Probed on 2026-10-30 against the code: a walk-in after a cancel → open lead `clinic_visited`, follow-up task closed, file linked; a lead closed `lost` → stays `lost`, file unlinked; a walk-in with a later booking → the booking stays `scheduled` | throwaway probe, not committed | C11–C14 |

## Coverage

| # | Source (file:line) | Item | Requirement | Feature | Acceptance | Status |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | BRIEF.md:35–36 | five steps on the lead's Progress; "Close as" the four closing statuses | — (frontend) | lead-progress | BRIEF.md:143 | covered (clinozy-fe) |
| C2 | BRIEF.md:37–40 | step 4 books for a member who books; the lead moves on save, not on press; not pressable without the right or on a closed lead | `access.book-from-lead` | lead-progress | BRIEF.md:143 | covered (clinozy-fe; access here) |
| C3 | BRIEF.md:41–45 | the booking still to happen on Progress with Reschedule and Cancel; while booked, the earlier steps and No response wait | `operations.lead-status-by-hand` | lead-progress | BRIEF.md:144–145 | covered (clinozy-fe; the refusal here) |
| C4 | BRIEF.md:46–52 | done steps lighter (D6); the phone's vertical list; the Status filter in the pipeline's order | — (frontend) | lead-progress | BRIEF.md:146 | covered (clinozy-fe) |
| C5 | BRIEF.md:56–58, 109–112 | a booking still to happen moves the open lead to Appointment scheduled, a stream line; a reschedule or confirm keeps it; it is an open status | `data.lead-status-booked`, `operations.lead-follows-bookings` | lead-follows-bookings | BRIEF.md:130–131 | covered |
| C6 | BRIEF.md:59–61, 113–114 | the last booking cancelled / no-show / removed → Follow-up dated now, a stream line naming why; only the last; a reinstate or restore books it again | `operations.lead-follows-bookings` | lead-follows-bookings | BRIEF.md:132–134 | covered |
| C7 | BRIEF.md:62 | a check-in ends a booked lead in Clinic visited | `operations.lead-follows-bookings` | lead-follows-bookings | BRIEF.md:135 | covered |
| C8 | BRIEF.md:63–64, 115–117 | nobody sets Appointment scheduled by hand; leaving it by hand only for a closing status while booked; moves freely once no booking is left | `operations.lead-status-by-hand` | lead-follows-bookings | BRIEF.md:136 | covered |
| C9 | BRIEF.md:65–66 | a lead created, reopened or restored for a booked person starts in Appointment scheduled | `operations.lead-follows-bookings` | lead-follows-bookings | BRIEF.md:137 | covered |
| C10 | BRIEF.md:67–68 | the lead's follow-up task waits while booked | `background.follow-up-task` | lead-follows-bookings | BRIEF.md:138 | covered |
| C11 | BRIEF.md:72–77 | a walk-in after a cancel: the open lead → Clinic visited, its follow-up task closes, the file opens linked | `operations.check-in-converts` | walk-in-after-cancel | BRIEF.md:139 | covered |
| C12 | BRIEF.md:78, 118–120 | win-back: no open lead, the latest lead closed Lost / Not interested ≤ 90 days ago → Clinic visited, "Won back at check-in", the file linked (D2); the close date (D7) | `data.lead-closed-at`, `operations.check-in-wins-back` | walk-in-after-cancel | BRIEF.md:140 | covered |
| C13 | BRIEF.md:79 | Invalid, or closed > 90 days, or no lead — stays as it is; an unlinked file | `operations.check-in-wins-back` | walk-in-after-cancel | BRIEF.md:141 | covered |
| C14 | BRIEF.md:84–86, 121 | another booking still to happen is kept; Start visit's heads-up "Also booked · <day> · <time>" with Open (D3) | `operations.walk-in-keeps-bookings` | walk-in-after-cancel | BRIEF.md:142 | covered (the heads-up: clinozy-fe) |
| C15 | BRIEF.md:81–82 | after the visit the patient's own follow-ups take over | — (unchanged, K7) | walk-in-after-cancel | — | covered (no change) |
| C16 | BRIEF.md:122 | every server move leaves one `system` stream line naming why | `quality.stream-lines` | lead-follows-bookings, walk-in-after-cancel | BRIEF.md:130, 133, 140 | covered |
| C17 | BRIEF.md:123 | undo check-in leaves the lead in Clinic visited | — (unchanged) | — | — | covered (no change) |
| C18 | BRIEF.md:124–126 | permissions are the existing ones | `access.book-from-lead` | lead-progress | BRIEF.md:143–144 | covered |
| C19 | BRIEF.md:147 | every label translated — 11 frontend locales, 2 backend | `quality.copy` | all | BRIEF.md:147 | covered |
| C20 | BRIEF.md:149–156 | out of scope: undo check-in, cancelling the other booking, a setting for the window, Invalid or older leads, the patient follow-up rules, the demo seed | — | — | — | out-of-scope (BRIEF.md:149–156) |

## Reconciliation (Step 3)

n/a — a brief from scratch carries no `PRD.md` or `schema-routes.md`; the brief was read against the
code (K1–K8 above). No row conflicts with it: K3 and K4 are what this change adds to, K6 is the gap C14
closes.

## Delta (Step 2)

n/a — initial (Baseline `none`).
