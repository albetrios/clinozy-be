# feat-short-delivery-2026-11-01-qfnq — acceptance

| Item | Source | Result | Evidence |
| --- | --- | --- | --- |
| A-1 A 10-pack line received as 8 (+1 of 2 free) adds (8 + 1) × units_per_pack units | `BRIEF.md:52` | | |
| A-2 Its amount, taxable and GST are 8 × rate's; `is_short: true` | `BRIEF.md:53` | | |
| A-3 The order's total and `due_amount` are the received lines'; `short_line_count` 1 | `BRIEF.md:54` | | |
| A-4 A line sent without received quantities receives what was ordered, not short | `BRIEF.md:55` | | |
| A-5 A received quantity above ordered is a 400 `items` | `BRIEF.md:56` | | |
| A-6 Existing received lines after the migration: received = ordered, not short | `BRIEF.md:57` | | |
| A-7 The Receive goods drawer takes received quantities; the view marks short lines | `BRIEF.md:58` | | |
