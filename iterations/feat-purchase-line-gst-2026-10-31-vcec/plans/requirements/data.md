# Data requirements

Diagrams: [`../db-changes.md`](../db-changes.md).

| Identifier | Kind | Requirement | Source |
| --- | --- | --- | --- |
| `data.purchase-line-gst` | NEW | Each purchase line stores its GST rate, whether its rate includes GST, its taxable value and its GST, to the paisa | `BRIEF.md:17–22` |
| `data.purchase-order-gst-totals` | NEW | Each order stores its taxable and GST totals; total = taxable + GST | `BRIEF.md:23` |
| `data.purchase-gst-backfill` | NEW | Existing lines take their medicine's rate, inclusive; amounts and totals unchanged | `BRIEF.md:55–56` |

## Before → after

| Requirement | Before | After | Why |
| --- | --- | --- | --- |
| `data.purchase-line-gst` | a line's `amount` = quantity × rate, GST unknown | `amount` = taxable + GST; inclusive keeps quantity × rate | PG3, PG4 |
