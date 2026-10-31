# DB changes — change-pharmacy-record-fields-2026-10-31-wpan

Kept current at every step; before → after for each changed table. No new table, no new pointer,
no RLS change (every table keeps its organization policy). One migration adds the nine columns.

## Before → after

| Table | Column | Before | After | Rule (CHECK) | Decision |
| --- | --- | --- | --- | --- | --- |
| `app.medicines` | `hsn_code` | — | `varchar(8)` null | `hsn_code ~ '^[0-9]{4}([0-9]{2}){0,2}$'` | D3, D9 |
| `app.medicines` | `pack_label` | — | `varchar(30)` null | `char_length(pack_label) > 0` | D9 |
| `app.medicines` | `units_per_pack` | — | `smallint NOT NULL DEFAULT 1` | `units_per_pack BETWEEN 1 AND 1000` | D1, D5, D7 |
| `app.medicine_batches` | `mrp` | — | `numeric(12,2)` null | `mrp > 0` | D2, D8 |
| `app.medical_purchase_order_items` | `mrp` | — | `numeric(12,2)` null | `mrp > 0` | D8 |
| `app.medical_purchase_orders` | `note` | — | `varchar(500)` null | `char_length(note) > 0` | D9, D10 |
| `app.suppliers` | `email` | — | `varchar(120)` null | `char_length(email) >= 3` (the DTO validates the address) | D9 |
| `app.suppliers` | `address` | — | `varchar(240)` null | `char_length(address) > 0` | D9 |
| `app.invoice_items` | `hsn_code` | — | `varchar(8)` null — snapshot | as `medicines.hsn_code` | D3 |
| `app.invoice_items` | `pack_size` | always `null` | the medicine's `pack_label` when billed | unchanged | D9 |

Every `ADD COLUMN` is nullable or carries a default, so the migration needs no backfill and no
table rewrite; each CHECK is added `NOT VALID` and validated after (`pnpm db:migrate:lint`).

## Meaning changes (no column change)

Stock is counted in units (D5): `medicines.quantity`, `min_stock`, `max_stock`,
`medicine_batches.quantity`, `invoice_items.quantity` (medicine lines), the return and
`supplier_credits.quantity`. While `units_per_pack` is 1 — every row when this ships — a unit is a
pack and nothing reads differently.

```text
supplier ──packs──► medical_purchase_order_items (quantity, free_quantity, rate, mrp)
                         │ receive: (quantity + free) × units_per_pack units, mrp → batch
                         ▼
medicines (units_per_pack, hsn_code, pack_label) ──< medicine_batches (quantity units, mrp, purchase_rate per pack)
                         │ sale: units drawn by earliest expiry
                         ▼
invoice_items (quantity units, rate = floor(batch mrp ?? medicine mrp ÷ units_per_pack),
               pack_size ← pack_label, hsn_code ← hsn_code)
```
