# feat-short-delivery-2026-11-01-qfnq — acceptance

| Item | Source | Result | Evidence |
| --- | --- | --- | --- |
| A-1 A 10-pack line received as 8 (+1 of 2 free) adds (8 + 1) × units_per_pack units | `BRIEF.md:52` | pass | `medical-short-delivery.integration.test.ts` — batch `SH1:90` = (8 + 1) × 10 units |
| A-2 Its amount, taxable and GST are 8 × rate's; `is_short: true` | `BRIEF.md:53` | pass | same suite — the line `8,1,true,896,800,96` (received, free, short, amount, taxable, GST) |
| A-3 The order's total and `due_amount` are the received lines'; `short_line_count` 1 | `BRIEF.md:54` | pass | same suite — the order `1496,1308.47,187.53,1496,1` (total, taxable, GST, due, short lines); still 1 on a re-read |
| A-4 A line sent without received quantities receives what was ordered, not short | `BRIEF.md:55` | pass | same suite — the cream sent without quantities: `3,false,600`, its batch `CR1:3` |
| A-5 A received quantity above ordered is a 400 `items` | `BRIEF.md:56` | pass | same suite — 11 of 10 is a 400 on `items`; 0 + 0 is not received (`false,null,false`), the order owes the cream alone |
| A-6 Existing received lines after the migration: received = ordered, not short | `BRIEF.md:57` | pass | migration `20261101054040` applied on the local demo database: `VALIDATE` of `chk_medical_purchase_order_items_received` and the new `chk_medical_purchase_order_items_amount` passed on every existing row; the demo seed writes received = ordered (seed suite green) |
| A-7 The Receive goods drawer takes received quantities; the view marks short lines | `BRIEF.md:58` | clinozy-fe | the sibling iteration's `AS-BUILT.md` and its pull request |
