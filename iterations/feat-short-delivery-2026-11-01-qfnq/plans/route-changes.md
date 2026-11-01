# feat-short-delivery-2026-11-01-qfnq — route changes

Iteration `feat-short-delivery-2026-11-01-qfnq` · MODE initial (Baseline `none`, [SD1](decisions.md)) ·
Intake mode `brief` · Intake hash `d03c5ab0bf5a` · 2026-11-01.

| Area | NEW | CHANGED | REMOVED |
| --- | --- | --- | --- |
| Medical purchase orders | 0 | 3 | 0 |

| # | Change | Method | Path | Access | Operation | Source | Built |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RC-1 | CHANGED — an ordered line takes `received_quantity`, `received_free_quantity` | POST | `/api/v1/app/medical-purchase-orders/{medical_purchase_order_id}/receive` | medicine · update | receive goods | `BRIEF.md:15–22` | |
| RC-2 | CHANGED — output: lines `received_quantity`, `received_free_quantity`, `is_short`; order `short_line_count` | GET | `/api/v1/app/medical-purchase-orders/{medical_purchase_order_id}` | medicine · read | one order | `BRIEF.md:23` | |
| RC-3 | CHANGED — output, as RC-2 | GET | `/api/v1/app/medical-purchase-orders` | medicine · read | list | `BRIEF.md:23` | |

## Before → after

| # | Route | What changes | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| RC-1 | receive | input, stock, amounts | an ordered line: `id`, `is_received`, batch, expiry, MRP; stock + amount from the ordered quantity | + `received_quantity`, `received_free_quantity` (default ordered); stock, batch, amount, GST and totals from the received quantity | SD3–SD8 |
| RC-2, RC-3 | GET order, list | output | a line's `is_received` | + `received_quantity`, `received_free_quantity`, `is_short`; the order `short_line_count` | SD3, SD9 |
