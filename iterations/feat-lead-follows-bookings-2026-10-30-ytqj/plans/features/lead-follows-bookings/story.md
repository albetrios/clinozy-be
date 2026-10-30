Status: ready
Kind: flow
Depends on: none

## Stories
- As a front-desk member I want a lead to move to Appointment scheduled when I book its person so that the list shows who is booked without my touching the lead.
- As a front-desk member I want a cancelled visit to put the lead back in Follow-up, dated now, so that someone follows the person up again.
- As a counsellor I want the lead's follow-up task to wait while a visit is booked so that I am not asked to chase someone already coming.

## Rules
- A booking still to happen keeps the open lead in Appointment scheduled; only the last one ending moves it back (`operations.lead-follows-bookings`).
- A reschedule or confirm keeps it; a reinstate, restore or copy books it again (`operations.lead-follows-bookings`).
- Never set by hand; left by hand while booked only for a closing status (`operations.lead-status-by-hand`).
- A booked person's new, reopened or restored lead starts booked (`operations.lead-follows-bookings`).
- The follow-up task waits while booked (`background.follow-up-task`).
- Each move leaves one stream line, in the booking's transaction (`quality.stream-lines`, `quality.lead-moves-atomic`).
- The status is open and counted by one-open-lead-per-contact (`data.lead-status-booked`).

## Acceptance criteria
- A booking for a person with an open lead moves it to Appointment scheduled, with a stream line — intake-files/BRIEF.md:130
- A reschedule or a confirm keeps the lead in Appointment scheduled — intake-files/BRIEF.md:131
- Cancelling one of two bookings still to happen keeps the lead in Appointment scheduled — intake-files/BRIEF.md:132
- Cancelling, marking no-show or removing the last one moves the lead to Follow-up, dated now, with a stream line naming why; the follow-up task opens again — intake-files/BRIEF.md:133
- Reinstating or restoring a booking moves the lead back to Appointment scheduled — intake-files/BRIEF.md:134
- A check-in of a booked lead ends it in Clinic visited — intake-files/BRIEF.md:135
- Setting Appointment scheduled by hand is refused; leaving it by hand for an open status while booked is refused; the closing statuses are allowed — intake-files/BRIEF.md:136
- A lead created or reopened for a booked person starts in Appointment scheduled — intake-files/BRIEF.md:137
- The follow-up task does not open for a booked lead — intake-files/BRIEF.md:138

## Work items
- `data.lead-status-booked`, `operations.lead-follows-bookings`, `operations.lead-status-by-hand`, `background.follow-up-task`, `quality.stream-lines`, `quality.lead-moves-atomic`, `quality.copy`
