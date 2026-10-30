# Acceptance — feat-lead-follows-bookings-2026-10-30-ytqj

One row per acceptance criterion of the brief (intake mode `brief`); Result and Evidence stay empty until built.
Rows A14–A17 are the frontend's (clinozy-fe fills its own `plans/acceptance.md`; this file links them at Close).

| Item | Source | Result | Evidence |
| --- | --- | --- | --- |
| A1 A booking moves the open lead to Appointment scheduled, with a stream line | BRIEF.md:130 | | |
| A2 A reschedule or confirm keeps it | BRIEF.md:131 | | |
| A3 Cancelling one of two bookings keeps it | BRIEF.md:132 | | |
| A4 The last one cancelled / no-show / removed → Follow-up dated now, a stream line naming why; the follow-up task opens again | BRIEF.md:133 | | |
| A5 Reinstate or restore → Appointment scheduled again | BRIEF.md:134 | | |
| A6 A check-in ends a booked lead in Clinic visited | BRIEF.md:135 | | |
| A7 By hand: set refused; leaving for an open status while booked refused; closing statuses allowed | BRIEF.md:136 | | |
| A8 A lead created or reopened for a booked person starts in Appointment scheduled | BRIEF.md:137 | | |
| A9 The follow-up task does not open for a booked lead | BRIEF.md:138 | | |
| A10 A walk-in after a cancel: open lead → Clinic visited, follow-up task closed, new file linked | BRIEF.md:139 | | |
| A11 A check-in wins back the latest lead closed Lost / Not interested ≤ 90 days: Clinic visited, "Won back at check-in", file linked | BRIEF.md:140 | | |
| A12 Invalid, or closed > 90 days, stays closed at a check-in | BRIEF.md:141 | | |
| A13 A walk-in keeps another booking still to happen; Start visit shows "Also booked · <day> · <time>" with Open | BRIEF.md:142 | | |
| A14 Step 4 reads "Book" and opens the booking form; not pressable without the right or on a closed lead | BRIEF.md:143 | | |
| A15 The booking still to happen on Progress with Reschedule and Cancel appointment | BRIEF.md:144 | | |
| A16 While booked, the earlier steps and No response are not pressable and say why | BRIEF.md:145 | | |
| A17 Completed steps lighter than the current, with a check, both themes; phone list without mid-word breaks | BRIEF.md:146 | | |
| A18 Every label translated — 11 frontend locales, 2 backend | BRIEF.md:147 | | |
