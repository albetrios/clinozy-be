# Worker changes — feat-lead-follows-bookings-2026-10-30-ytqj

The iteration's background work — everything that happens without a user — in one file
(`be-iteration-planning` › Worker changes). WHAT only: no queue, job, event or worker names (kickoff
names them in `AS-BUILT.md`).

Status: **Steps 1–3, 2026-10-30**. Mode initial (Baseline `none`) · Intake mode `brief` · Intake hash
`5bae0977a19a`. The lead's moves themselves happen **in the request** that books, cancels or checks in
(BRIEF.md:54–79) — not in the background.

## Counts

| NEW | CHANGED | REMOVED |
| --- | --- | --- |
| 0 | 1 | 0 |

| # | Change | Background work | When it runs | What it touches | On failure | Who is told | Requirement | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WC-1 | CHANGED | the lead's follow-up task — open it when the follow-up date has come, close it when it no longer applies | the task rules run: on its schedule, and right after every booking write (a booking, a move, a status change, a removal) as today | Task | retried; a repeat never opens it twice (one task per record and rule) | the lead's owner, else the counsellor queue — as today | `background.follow-up-task` | BRIEF.md:60, 67–68, 77 |

## Before → after

| # | Background work | What changes | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| WC-1 | the lead's follow-up task | when it opens | any open lead whose follow-up date has come | not while the lead is `appointment_scheduled` (the booking's confirm and reminder follow the person up); a cancel dates it now, so it opens on the run right after; a check-in (a walk-in too) or a win-back closes the lead, so the open task closes on that run | D1, D2 |
