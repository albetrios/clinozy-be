# Realtime — launch-2026-09-30-jxmr

Status: ready — planning Step 5. Answers: what must update on screen without a refresh. Requirements state WHAT must be true; the
technical design is decided per ROUTE row at kickoff and recorded in `AS-BUILT.md` (agent-os decides).

| Requirement | Change | What must be true | Source | Features |
| --- | --- | --- | --- | --- |
| `realtime.refresh-60s` | NEW | Shared screens (Today, Tasks, lists) show others' changes within 60 seconds; there is no push at launch | D37; schema-routes.md:1577, 1582 | [shell-and-patterns](../features/shell-and-patterns/story.md), [today-floor](../features/today-floor/story.md) |
| `realtime.chat-refresh` | NEW | An open conversation refreshes faster than the 60-second screens | D37 | [leads-and-messages](../features/leads-and-messages/story.md) |

## Before → after

none — every requirement here is NEW
