# Requirements — operations

What users (and the server, on their writes) can do.

| Id | Requirement | Kind | Source | Decision |
| --- | --- | --- | --- | --- |
| `operations.lead-follows-bookings` | Every booking write keeps the person's **open** lead in step with their bookings: a booking still to happen → Appointment scheduled; the last one cancelled / no-show / removed → Follow-up, its follow-up date now; a reschedule or confirm keeps it; a reinstate, restore or copy books it again; a lead created, reopened or restored for a booked person starts booked | CHANGED | BRIEF.md:54–66, 111–114 | D1 · routes-final K-L11, LF3, AF1 |
| `operations.lead-status-by-hand` | Appointment scheduled is never set by hand; while a booking is still to happen a lead leaves it by hand only for Not interested, Invalid or Lost — anything else is refused with the way named (cancel the appointment); with no booking left it moves freely | CHANGED | BRIEF.md:63–64, 115–117 | D1 · routes-final LF2 |
| `operations.check-in-converts` | A check-in — a walk-in's too — ends the person's open lead in Clinic visited and opens the patient file once, linked to it (as built), whatever happened to their bookings before | CHANGED | BRIEF.md:62, 72–77 | routes-final AF2 |
| `operations.check-in-wins-back` | With no open lead, a check-in wins back the person's **latest** lead when it is Lost or Not interested and closed within the last 90 days → Clinic visited; a file this check-in opens links to it; Invalid, older, or none → nothing | NEW | BRIEF.md:78–79, 118–120 | D2, D7, D14, D15 · routes-final LF6, AF2 |
| `operations.walk-in-keeps-bookings` | A walk-in or a check-in never cancels, moves or confirms another booking; the person's other booking still to happen is shown to the desk after Start visit ("Also booked · <day> · <time>", Open) | NEW | BRIEF.md:84–86, 121 | D3 · routes-final AF3 |

## Before → after

| Requirement | Before | After | Why |
| --- | --- | --- | --- |
| `operations.lead-follows-bookings` | a booking left the lead as it was | the lead follows the bookings (K-L11) | D1 |
| `operations.lead-status-by-hand` | any status but Clinic visited could follow any | Appointment scheduled is the bookings'; leaving it by hand while booked only for a closing status | D1 |
| `operations.check-in-converts` | an open lead converted; nothing tied the lead to a booking before the visit | unchanged at the check-in itself; the lead now reaches it through Appointment scheduled or Follow-up | D1 |
