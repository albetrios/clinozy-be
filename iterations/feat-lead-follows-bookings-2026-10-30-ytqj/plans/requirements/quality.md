# Requirements — quality

| Id | Requirement | Kind | Source | Decision |
| --- | --- | --- | --- | --- |
| `quality.stream-lines` | Every lead move the server makes leaves exactly one `system` line in the person's stream naming why (booked · cancelled · no-show · removed · checked in · won back), tied to the booking | NEW | BRIEF.md:122 | routes-final AF1, AF2 |
| `quality.copy` | Every new label and message is a translation key: the frontend's eleven locales, the backend's two (`en`, `es`) | NEW | BRIEF.md:147 | — |
| `quality.lead-moves-atomic` | A lead moves in the same transaction as the booking write that moves it — a failed write leaves the lead as it was; a write that moves nothing never fails the booking | NEW | BRIEF.md:54–68 | routes-final §2.10, 2.A.9 |
| `quality.closed-at-held` | The database refuses a lead whose close date disagrees with its status | NEW | BRIEF.md:118–120 | D13 · routes-final LF4 |

## Before → after

none — every requirement here is NEW.
