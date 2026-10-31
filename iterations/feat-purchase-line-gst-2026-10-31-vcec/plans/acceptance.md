# feat-purchase-line-gst-2026-10-31-vcec — acceptance

One row per acceptance criterion in `intake-files/BRIEF.md`. Result and Evidence are filled when built.

| Item | Source | Result | Evidence |
| --- | --- | --- | --- |
| A-1 A line at rate 112 × 10, GST 12 % inclusive: taxable 1000.00, GST 120.00, amount 1120.00 | `BRIEF.md:62` | pass | `medical-purchase-gst.integration.test.ts` — line 0: `1000,120,1120,12,true` ([AS-BUILT #1](../AS-BUILT.md)) |
| A-2 The same line exclusive: taxable 1120.00, GST 134.40, amount 1254.40; the order total follows | `BRIEF.md:63` | pass | same suite — line 1: `1120,134.4,1254.4,12,false`; order totals `2720,272.4,2992.4` ([AS-BUILT #1](../AS-BUILT.md)) |
| A-3 Without `gst_percent` the line takes its medicine's rate; without `is_gst_inclusive`, inclusive | `BRIEF.md:64` | pass | same suite — lines sent without `gst_percent` / `is_gst_inclusive` take the medicine's 12 % / 0 %, inclusive; a 7 % rate is a 400 `items` |
| A-4 Every order read shows `taxable_total` and `gst_total`; `total = taxable_total + gst_total` | `BRIEF.md:65` | pass | same suite — create, get and receive answer `taxable_total + gst_total = total`; receive keeps the three received lines (`1600,138,1738`), `due_amount` 1738; `chk_medical_purchase_orders_totals` |
| A-5 After the migration, existing lines carry their medicine's rate, inclusive, amounts unchanged | `BRIEF.md:66` | pass | the migration applied on the local demo database: `VALIDATE CONSTRAINT` of `chk_medical_purchase_order_items_amount` (amount = taxable + GST, inclusive = quantity × rate) and `chk_medical_purchase_orders_totals` passed on every existing row ([AS-BUILT #1](../AS-BUILT.md)) |
| A-6 `GET …/gst-summary?month=2026-10` returns `by_rate`, `by_hsn`, `totals` over that month's received orders only | `BRIEF.md:67` | pass | same suite — by rate `0:1:500 12:1:1120 18:1:118`, by HSN `300490:12, 330499:18, null:0` (none last), totals `1,3,1600,138,1738`; a waiting order is not counted; an empty month, a missing / malformed / future month (400 `month`) |
| A-7 The CSV export carries the same rows; `medicine:export` is required | `BRIEF.md:68` | pass | same suite — the CSV's eight lines, `purchase-gst-summary-<month>.csv`, 7 rows; a doctor (medicine:read, no export) reads the summary but gets 403 on the CSV; the front desk 403 |
| A-8 The frontend drawer edits GST % per line and shows the totals; the summary screen picks a month and downloads the CSV | `BRIEF.md:69` | clinozy-fe | the sibling iteration's `AS-BUILT.md` and its pull request |
