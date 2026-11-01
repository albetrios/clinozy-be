# Operations requirements

| Identifier | Kind | Requirement | Source |
| --- | --- | --- | --- |
| `operations.receive-what-arrived` | CHANGED | Receive takes received quantities per ordered line (default ordered, 0…ordered); stock, batch, amounts and totals follow the received quantity | `BRIEF.md:15–22`, `:42–46` |
| `operations.short-lines-shown` | NEW | Every order read marks its short lines and counts them | `BRIEF.md:23` |

## Before → after

| Requirement | Before | After | Why |
| --- | --- | --- | --- |
| `operations.receive-what-arrived` | a ticked line adds and owes all it ordered | it adds and owes what arrived | SD3–SD6 |
