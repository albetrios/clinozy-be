Status: ready
Kind: screen
Depends on: none

## Stories
- As the store keeper I want each purchase line to carry its GST rate so that the bill's taxable value and GST are recorded as on the supplier's bill.
- As the owner I want each order to show its taxable and GST totals so that I can check them against the supplier's bill.

## Rules
- The line's GST defaults to the medicine's rate, inclusive (`operations.purchase-line-gst-input`).
- Amounts come from the invoice calculation, per line, to the paisa (`quality.one-gst-calculation`).
- total = taxable total + GST total (`data.purchase-order-gst-totals`).
- Existing lines are filled by the migration (`data.purchase-gst-backfill`).

## Acceptance criteria
- A-1, A-2, A-3, A-4, A-5 — intake-files/BRIEF.md:62–66

## Work items
- `data.purchase-line-gst`, `data.purchase-order-gst-totals`, `data.purchase-gst-backfill`, `operations.purchase-line-gst-input`, `quality.one-gst-calculation`, `quality.additive-on-v1`
