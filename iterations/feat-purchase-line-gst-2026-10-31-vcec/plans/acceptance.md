# feat-purchase-line-gst-2026-10-31-vcec — acceptance

One row per acceptance criterion in `intake-files/BRIEF.md`. Result and Evidence are filled when built.

| Item | Source | Result | Evidence |
| --- | --- | --- | --- |
| A-1 A line at rate 112 × 10, GST 12 % inclusive: taxable 1000.00, GST 120.00, amount 1120.00 | `BRIEF.md:62` | | |
| A-2 The same line exclusive: taxable 1120.00, GST 134.40, amount 1254.40; the order total follows | `BRIEF.md:63` | | |
| A-3 Without `gst_percent` the line takes its medicine's rate; without `is_gst_inclusive`, inclusive | `BRIEF.md:64` | | |
| A-4 Every order read shows `taxable_total` and `gst_total`; `total = taxable_total + gst_total` | `BRIEF.md:65` | | |
| A-5 After the migration, existing lines carry their medicine's rate, inclusive, amounts unchanged | `BRIEF.md:66` | | |
| A-6 `GET …/gst-summary?month=2026-10` returns `by_rate`, `by_hsn`, `totals` over that month's received orders only | `BRIEF.md:67` | | |
| A-7 The CSV export carries the same rows; `medicine:export` is required | `BRIEF.md:68` | | |
| A-8 The frontend drawer edits GST % per line and shows the totals; the summary screen picks a month and downloads the CSV | `BRIEF.md:69` | | |
