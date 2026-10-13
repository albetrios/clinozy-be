# Background — feat-clinic-setup-2026-10-13-sltd

The list of background work is [worker-changes.md](../worker-changes.md): **none** in this iteration (D21).

| Id | Requirement | Kind | Source |
| --- | --- | --- | --- |
| `background.none` | No work runs without a user: every setup write happens in a manager's own request, the ticks are read on demand, and the existing clinics are filled once by the database change itself. | NEW | D21; worker-changes |

## Before → after

none — every requirement here is NEW.
