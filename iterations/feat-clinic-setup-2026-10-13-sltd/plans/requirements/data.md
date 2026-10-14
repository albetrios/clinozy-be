# Data — feat-clinic-setup-2026-10-13-sltd

What is stored, owned by whom, kept how long. The diagrams and the per-table detail are in
[db-changes.md](../db-changes.md); the agreed design is [routes-final.md](../routes-final.md) §1–§2.

| Id | Requirement | Kind | Source |
| --- | --- | --- | --- |
| `data.setup-progress` | A clinic's setup progress — the answers with no record of their own (`clinic_type`, `you`), the skipped guide items (`treatments`, `invite_team`), and when it was deferred, went live (and by whom), was hidden and had all three guide items done — is stored once per clinic with the clinic's settings, never per person. | NEW | D5, D20, D26, D28; BRIEF.md:50, 220–221 |
| `data.ticks-from-records` | Whether a live check or a guide item is done is worked out from the clinic's own records on every read (the main branch, services, members and roles, appointments); nothing stores a per-item "done". | NEW | BRIEF.md:104; OS3 |
| `data.first-branch-main` | A clinic's first branch is its main branch; there is at most one main branch (as built). | CHANGED | BR1–BR3; BRIEF.md:146–150 |
| `data.existing-clinics-live` | A clinic that has an active main branch and an active service when this ships is recorded as live (no person recorded). | NEW | D7; OS8 |
| `data.live-by-kept` | Who took the clinic live stays recorded when that member later leaves (the launch's K2). | NEW | routes-final header › Rules |
| `data.no-day-float` | Setup neither shows nor writes the cash-drawer float; the stored `default_day_float` is left as it is. | NEW | D17 |

## Before → after

| Requirement | Before | After | Why |
| --- | --- | --- | --- |
| `data.first-branch-main` | a branch is main only when the request says so; a clinic can have branches and no main | a clinic's first branch is main by itself; one main at most, as before | BR1 — the design's rule (users.md:132), never built |
