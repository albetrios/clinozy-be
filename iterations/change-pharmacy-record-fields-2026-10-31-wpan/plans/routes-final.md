# Clinozy API — final routes for change-pharmacy-record-fields, sub-domain by sub-domain

Started 2026-10-31 from the code on `claude/happy-shannon-mtu7q6` (= `main` at `aff0386`). This file is the
iteration's route review (`be-iteration-planning` Step 5), shaped by
[`routes-final-template.md`](../../../docs/design-workflow/process/routes-final-template.md). Under D4 (straight
through) each sub-domain is final on writing; kickoff builds it ditto.

What exists is the launch as built — its route review (`launch-2026-09-30-jxmr/plans/routes-final.md` §11, Medical)
and `docs/routes.txt` — and this file only describes what this iteration changes on top of it.

How to read the tables: paths are under `/api/v1/app`; `{x_id}` is a public id; **Gate** is the permission the caller
needs; **Idem** `req` = `X-Idempotency-Key` header required; `*` = required.

## Sub-domains (in build order)

| # | Sub-domain | Folder (`src/domains/app/sub-domains/…`) | Paths (`/app/…`) | Routes | Builds on | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Medicines — **CHANGED** | `medical/medicines/` | `medicines` | 4 changed (of 8) | manufacturers, suppliers | **final (rev 1, 2026-10-31)** |
| 2 | Suppliers — **CHANGED** | `medical/suppliers/` (+ `supplier-credits/`) | `suppliers` | 5 changed (of 12) | — | **final (rev 1, 2026-10-31)** |
| 3 | Medical purchase orders — **CHANGED** | `medical/medical-purchase-orders/` | `medical-purchase-orders` | 5 changed (of 8) | 1, 2 | **final (rev 1, 2026-10-31)** |
| 4 | Medical sales and invoice lines — **CHANGED** | `medical/medical-sales/`, `billing/invoices/` | `medical-sales`, `invoices` | responses + `POST /medical-sales` pricing | 1 | **final (rev 1, 2026-10-31)** |

App total: **no route added or removed**; fields added to existing bodies and responses (D11).

## 1. Medicines

| # | Method | Path | Gate | Idem | Change |
| --- | --- | --- | --- | --- | --- |
| 1.1 | POST | `/medicines` | medicine:create | req | body + `hsn_code` (4/6/8 digits, null), `pack_label` (1–30, null), `units_per_pack` (1–1000, default 1); `batches[]` + `mrp` (> 0, null) |
| 1.2 | PATCH | `/medicines/{medicine_id}` | medicine:update | - | same fields; `units_per_pack` changed while `quantity > 0` → **409 `medicine_has_stock`** |
| 1.3 | GET | `/medicines` | medicine:read | - | each row + `hsn_code`, `pack_label`, `units_per_pack`; `batches[]` + `mrp` |
| 1.4 | GET | `/medicines/{medicine_id}` | medicine:read | - | as 1.3 |

Stock fields (`quantity`, `min_stock`, `max_stock`, a batch's `quantity`) count units (D5).

## 2. Suppliers

| # | Method | Path | Gate | Idem | Change |
| --- | --- | --- | --- | --- | --- |
| 2.1 | POST | `/suppliers` | medicine:create | req | body + `email` (valid, ≤ 120, null), `address` (1–240, null) |
| 2.2 | PATCH | `/suppliers/{supplier_id}` | medicine:update | - | same fields |
| 2.3 | GET | `/suppliers` | medicine:read | - | + `email`, `address` |
| 2.4 | GET | `/suppliers/{supplier_id}` | medicine:read | - | + `email`, `address` |
| 2.5 | POST | `/suppliers/{supplier_id}/credits` | medicine:update | req | priced per unit: `rate` = batch purchase rate ÷ `units_per_pack` (D5) |

## 3. Medical purchase orders

| # | Method | Path | Gate | Idem | Change |
| --- | --- | --- | --- | --- | --- |
| 3.1 | POST | `/medical-purchase-orders` | medicine:create | req | body + `note` (1–500); `items[]` + `mrp` (> 0, null) |
| 3.2 | PATCH | `/medical-purchase-orders/{medical_purchase_order_id}` | medicine:update | - | + `note`, line `mrp`; a received order takes `note` alone (D10) |
| 3.3 | POST | `/medical-purchase-orders/{medical_purchase_order_id}/receive` | medicine:update | req | + `note`; each line (ordered or not) + `mrp`; adds `(quantity + free) × units_per_pack` units; the line's MRP goes onto the batch (D8) |
| 3.4 | GET | `/medical-purchase-orders` | medicine:read | - | + `note`; `items[]` + `mrp` |
| 3.5 | GET | `/medical-purchase-orders/{medical_purchase_order_id}` | medicine:read | - | as 3.4 |

## 4. Medical sales and invoice lines

| # | Method | Path | Gate | Idem | Change |
| --- | --- | --- | --- | --- | --- |
| 4.1 | POST | `/medical-sales` | medicine:create | req | each line's `rate` = its batch's MRP (else the medicine's) ÷ `units_per_pack`, rounded down to the paisa (D2, D6); `quantity` in units |
| 4.2 | GET | `/medical-sales`, `/medical-sales/{medical_sale_id}` | medicine:read | - | lines + `hsn_code`; `pack_size` = the medicine's pack label |
| 4.3 | GET / POST | `/invoices…` (every response with `items[]`) | payment:* | as built | lines + `hsn_code`; a medicine line snapshots `pack_size` and `hsn_code` (D3) |

Route review final: every sub-domain confirmed (rev 1, 2026-10-31, D4).
