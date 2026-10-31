# Requirements — background

The rules every piece of background work follows; the list itself is [`worker-changes.md`](../worker-changes.md).

| Id | Requirement | Kind | Source | Decision |
| --- | --- | --- | --- | --- |
| `background.follow-up-task` | The lead's follow-up task opens only for an open lead **not** in Appointment scheduled whose follow-up date has come; it closes once the lead no longer qualifies (booked, visited, won back, closed); the rules run after every booking write, as built — safe to repeat, never two open tasks for one lead | CHANGED | BRIEF.md:60, 67–68, 77 | routes-final TF1 · WC-1 |

## Before → after

| Requirement | Before | After | Why |
| --- | --- | --- | --- |
| `background.follow-up-task` | any open lead whose follow-up date had come | not while booked; reopened right after a cancel (dated now); closed by a visit or a win-back | D1, D2 |
