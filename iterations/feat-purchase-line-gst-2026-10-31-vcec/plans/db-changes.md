# feat-purchase-line-gst-2026-10-31-vcec — database changes

Iteration `feat-purchase-line-gst-2026-10-31-vcec` · MODE initial (Baseline `none`, [PG1](decisions.md)) ·
Intake mode `brief` · Intake hash `35ce19d3e29b` · 2026-10-31.

| NEW | CHANGED | REMOVED |
| --- | --- | --- |
| 0 | 2 | 0 |

Two tables gain columns, one migration fills them for the rows that exist ([PG8](decisions.md)), and
one partial index serves the monthly summary ([PG15](decisions.md)). No table, policy or permission
is added; RLS stays as it is on both tables.

## Overview

```mermaid
erDiagram
  medical_purchase_order["medical_purchase_order · CHANGED · app.medical_purchase_orders"]
  medical_purchase_order_item["medical_purchase_order_item · CHANGED · app.medical_purchase_order_items"]
  medicine["medicine · EXISTING · app.medicines"]
  supplier["supplier · EXISTING · app.suppliers"]
  supplier ||--o{ medical_purchase_order : "is ordered from"
  medical_purchase_order ||--|{ medical_purchase_order_item : "has"
  medicine ||--o{ medical_purchase_order_item : "is bought on"
```

## Stage 1 — the purchase line and the order (ROUTE 1)

### `medical_purchase_order_item`

- **Holds:** one line of a purchase order — the medicine, packs ordered and free, the rate per pack,
  and now its GST: the rate, whether the rate includes it, the taxable value and the GST.
- **Table:** `app.medical_purchase_order_items` (CHANGED).
- **Sources:** `BRIEF.md:17–22`, `:51–56`.
- **Added / Replaced:** added `gst_percent` (smallint NOT NULL, one of 0, 5, 12, 18, 28 —
  `chk_medical_purchase_order_items_gst_percent`), `is_gst_inclusive` (boolean NOT NULL DEFAULT
  true), `taxable_amount`, `gst_amount` (numeric(12,2) NOT NULL, ≥ 0). Replaced
  `chk_medical_purchase_order_items_amount` (`amount = quantity × rate`) by: `amount =
  taxable_amount + gst_amount`, and `quantity × rate` is the amount when inclusive, the taxable
  amount when exclusive ([PG4](decisions.md)).
- **Open:** none.

```mermaid
erDiagram
  medical_purchase_order_item["medical_purchase_order_item · CHANGED · app.medical_purchase_order_items"] {
    id id PK
    id medical_purchase_order_id FK
    id medicine_id FK
    int quantity
    int free_quantity
    numeric rate
    numeric amount "now taxable_amount + gst_amount"
    smallint gst_percent "NEW 0 5 12 18 28"
    boolean is_gst_inclusive "NEW default true"
    numeric taxable_amount "NEW"
    numeric gst_amount "NEW"
  }
  medicine["medicine · EXISTING · app.medicines"] {
    id id PK
    smallint gst_percent "the line default"
    text hsn_code "the summary's HSN"
  }
  medicine ||--o{ medical_purchase_order_item : "is bought on"
```

### `medical_purchase_order`

- **Holds:** an order to a supplier, ordered then received; what it comes to and what is owed.
- **Table:** `app.medical_purchase_orders` (CHANGED).
- **Sources:** `BRIEF.md:23`, `:24–27`.
- **Added / Replaced:** added `taxable_total`, `gst_total` (numeric(12,2) NOT NULL DEFAULT 0, ≥ 0)
  with `chk_medical_purchase_orders_totals` (`total = taxable_total + gst_total`); added the
  partial index `idx_medical_purchase_orders_organization_received` (`organization_id,
  received_at` WHERE live and received) for the summary ([PG15](decisions.md)). `due_amount` and
  `payment_status` keep following `total`.
- **Open:** none.

```mermaid
erDiagram
  medical_purchase_order["medical_purchase_order · CHANGED · app.medical_purchase_orders"] {
    id id PK
    id supplier_id FK
    text stage
    timestamptz received_at
    numeric total "= taxable_total + gst_total"
    numeric taxable_total "NEW"
    numeric gst_total "NEW"
    numeric due_amount "generated"
  }
  medical_purchase_order ||--|{ medical_purchase_order_item : "has"
```

## The migration's fill ([PG8](decisions.md))

| Step | What |
| --- | --- |
| 1 | add the columns nullable (the order totals with their default) |
| 2 | each line: `gst_percent` = its medicine's, `is_gst_inclusive` = true, `taxable_amount = round(amount × 100 ÷ (100 + gst_percent), 2)`, `gst_amount = amount − taxable_amount` |
| 3 | each order: `taxable_total` / `gst_total` = the sums over the lines that count in `total` (all while ordered; `is_received` once received) |
| 4 | `SET NOT NULL`, the checks, the index |
