# Requirements — access

Which role may see or do what, scoped to what. **No permission code is added or changed** (BRIEF.md:124–126).

| Id | Requirement | Kind | Source | Decision |
| --- | --- | --- | --- | --- |
| `access.book-from-lead` | Booking from the lead's Progress needs Appointments › Create; seeing the booking still to happen needs Appointments › View; Reschedule and Cancel need Appointments › Edit; moving the lead by hand needs Leads › Edit — the existing codes (`appointment:create` · `read` · `update`, `lead:update`) | NEW | BRIEF.md:37–45, 124–126 | routes-final §1.4, §2.4 |

## Before → after

none — every requirement here is NEW (the codes themselves are unchanged).
