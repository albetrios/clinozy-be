# Operations requirements

| Identifier | Kind | Requirement | Source |
| --- | --- | --- | --- |
| `operations.purchase-line-gst-input` | CHANGED | Create, change and receive take an optional GST rate and inclusive flag per line, defaulting to the medicine's rate and inclusive | `BRIEF.md:18–19`, `:52` |
| `operations.purchase-gst-summary` | NEW | Read one month's purchase GST by rate, by HSN code and in total | `BRIEF.md:24–27` |
| `operations.purchase-gst-summary-export` | NEW | Download that summary as CSV | `BRIEF.md:27` |

## Before → after

| Requirement | Before | After | Why |
| --- | --- | --- | --- |
| `operations.purchase-line-gst-input` | a line: medicine, quantity, free quantity, rate | the same + `gst_percent`, `is_gst_inclusive` (optional) | PG3, PG5 |
