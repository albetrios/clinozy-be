# Data requirements

Diagrams: [`../db-changes.md`](../db-changes.md).

| Identifier | Kind | Requirement | Source |
| --- | --- | --- | --- |
| `data.received-quantities` | NEW | Each purchase line stores the received and received free packs and whether it came short | `BRIEF.md:15–18` |
| `data.received-backfill` | NEW | Existing received lines: received = ordered, not short | `BRIEF.md:48` |

## Before → after

none — every requirement here is NEW.
