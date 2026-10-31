# Requirements — data

What is stored, owned by whom, related how, kept how long, removed how. The diagrams and per-table sections are in
[`db-changes.md`](../db-changes.md) — this file does not repeat them.

| Id | Requirement | Kind | Source | Decision |
| --- | --- | --- | --- | --- |
| `data.lead-status-booked` | A lead's status includes **Appointment scheduled**, an open status set and cleared only by the person's bookings; one open lead per contact counts it | CHANGED | BRIEF.md:56–66, 109–110 | D1 · routes-final LF1 |
| `data.lead-closed-at` | A lead records **when it closed** — set exactly while its status is Not interested, Invalid, Lost or Clinic visited, emptied when it reopens; read-only; existing closed leads take their last update. Kept and removed with the lead (as built: soft delete, the organization's purge window) | NEW | BRIEF.md:78, 118–120 | D7, D10, D11, D13 · routes-final LF4, LF5 · [db-changes › lead](../db-changes.md#lead) |

## Before → after

| Requirement | Before | After | Why |
| --- | --- | --- | --- |
| `data.lead-status-booked` | eight statuses; four open (New, Contacted, Follow-up, No response) | nine; five open — Appointment scheduled among them | D1 |
