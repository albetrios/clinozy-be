# feat-purchase-line-gst-2026-10-31-vcec — route changes

Iteration `feat-purchase-line-gst-2026-10-31-vcec` · MODE initial (Baseline `none`, [PG1](decisions.md)) ·
Intake mode `brief` · Intake hash `35ce19d3e29b` · 2026-10-31.

| Area | NEW | CHANGED | REMOVED |
| --- | --- | --- | --- |
| Medical purchase orders | 2 | 5 | 0 |

All under `/api/v1/app`. Additive on `v1`: request fields are optional, response fields are added;
nothing is renamed, removed or re-gated.

## Medical purchase orders

| # | Change | Method | Path | Access | Operation | Source | Built |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RC-1 | NEW | GET | `/api/v1/app/medical-purchase-orders/gst-summary` | medicine · read | the month's purchase GST by rate and HSN | `BRIEF.md:24–27`, `:46–47` | as proposed — `9caedd4` ([AS-BUILT #1–#2](../AS-BUILT.md)) |
| RC-2 | NEW | GET | `/api/v1/app/medical-purchase-orders/gst-summary/exports` | medicine · export (+ read) | the summary as CSV | `BRIEF.md:27`, `:47` | as proposed — `9caedd4` ([AS-BUILT #1–#2](../AS-BUILT.md)) |
| RC-3 | CHANGED — lines take `gst_percent`, `is_gst_inclusive` | POST | `/api/v1/app/medical-purchase-orders` | medicine · create | create an order | `BRIEF.md:17–22`, `:45` | as proposed — `9caedd4` ([AS-BUILT #1–#2](../AS-BUILT.md)) |
| RC-4 | CHANGED — as RC-3 | PATCH | `/api/v1/app/medical-purchase-orders/{medical_purchase_order_id}` | medicine · update | change an order | `BRIEF.md:45` | as proposed — `9caedd4` ([AS-BUILT #1–#2](../AS-BUILT.md)) |
| RC-5 | CHANGED — unordered lines take them; totals from received lines | POST | `/api/v1/app/medical-purchase-orders/{medical_purchase_order_id}/receive` | medicine · update | receive goods | `BRIEF.md:45` | as proposed — `9caedd4` ([AS-BUILT #1–#2](../AS-BUILT.md)) |
| RC-6 | CHANGED — output: lines and totals carry GST | GET | `/api/v1/app/medical-purchase-orders/{medical_purchase_order_id}` | medicine · read | one order | `BRIEF.md:23` | as proposed — `9caedd4` ([AS-BUILT #1–#2](../AS-BUILT.md)) |
| RC-7 | CHANGED — output (+ CSV columns) | GET | `/api/v1/app/medical-purchase-orders` (+ `/exports`) | medicine · read (export) | list orders | `BRIEF.md:23` | as proposed — `9caedd4` ([AS-BUILT #1–#2](../AS-BUILT.md)) |

## Relied on, unchanged

| # | Method | Path | Access | Used for |
| --- | --- | --- | --- | --- |
| RU-1 | GET | `/api/v1/app/medicines` | medicine · read | the line picker — the medicine's `gst_percent` prefills the line |
| RU-2 | DELETE / POST restore | `/api/v1/app/medical-purchase-orders/{medical_purchase_order_id}[/restore]` | medicine · delete | cancel / undo, unchanged |

## Before → after

| # | Route | What changes | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| RC-3, RC-4 | POST, PATCH order | input | a line: `medicine_id` / `new_medicine_name`, `quantity`, `free_quantity`, `rate` | the same and optional `gst_percent` (0, 5, 12, 18, 28 — default the medicine's) and `is_gst_inclusive` (default true) | PG3, PG5 |
| RC-5 | receive | input, totals | an unordered line as RC-3; `total` = the received lines' amounts | the same with the GST fields; `taxable_total`, `gst_total`, `total` from the received lines | PG7 |
| RC-6, RC-7 | GET order, list, CSV | output | an order: `total`, …; a line: `quantity`, `free_quantity`, `rate`, `amount`, … | the order adds `taxable_total`, `gst_total`; a line adds `gst_percent`, `is_gst_inclusive`, `taxable_amount`, `gst_amount`; `amount` = taxable + GST | PG3, PG7 |
