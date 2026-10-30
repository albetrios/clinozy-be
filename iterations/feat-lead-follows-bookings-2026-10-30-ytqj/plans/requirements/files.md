# Requirements — files

| Id | Requirement | Kind | Source | Decision |
| --- | --- | --- | --- | --- |
| `files.lead-export-closed-at` | The leads CSV export carries the close date as a column, and Appointment scheduled among the statuses | CHANGED | BRIEF.md:52, 101 | D11 · routes-final LF5 |

## Before → after

| Requirement | Before | After | Why |
| --- | --- | --- | --- |
| `files.lead-export-closed-at` | no close date; eight statuses | a `closed_at` column; nine statuses | D11 |
