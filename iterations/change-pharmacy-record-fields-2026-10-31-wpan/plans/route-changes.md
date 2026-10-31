# Route changes — change-pharmacy-record-fields-2026-10-31-wpan

No route is added or removed (D11). Every change is a field on an existing body or response;
gates, statuses and idempotency stay as built. Paths are under `/api/v1/app`.

| Route | Before | After | Decision |
| --- | --- | --- | --- |
| `POST /medicines` | no HSN, pack or unit | + `hsn_code`, `pack_label`, `units_per_pack` (default 1); each batch + `mrp` | D1, D3, D8, D9 |
| `PATCH /medicines/{medicine_id}` | — | the same fields; `units_per_pack` changed while the medicine holds stock → **409 `medicine_has_stock`** | D7 |
| `GET /medicines`, `GET /medicines/{medicine_id}` | — | + `hsn_code`, `pack_label`, `units_per_pack`; each batch + `mrp` | D1, D8 |
| `POST /suppliers`, `PATCH /suppliers/{supplier_id}` | name, phone, GST | + `email` (valid email, ≤ 120), `address` (≤ 240) | D9 |
| `GET /suppliers`, `GET /suppliers/{supplier_id}` | — | + `email`, `address` | D9 |
| `POST /medical-purchase-orders` | — | + `note`; each line + `mrp` | D8, D10 |
| `PATCH /medical-purchase-orders/{medical_purchase_order_id}` | a received order → 409 | + `note`, line `mrp`; a received order takes a change of `note` alone, anything else still 409 | D10 |
| `POST /medical-purchase-orders/{medical_purchase_order_id}/receive` | batch number, expiry | + each line's `mrp` (ordered and unexpected lines), + `note`; adds `(quantity + free) × units_per_pack` units; the MRP goes onto the batch | D5, D8 |
| `GET /medical-purchase-orders`, `GET …/{medical_purchase_order_id}` | — | + `note`; each line + `mrp` | D8 |
| `POST /medical-sales` | each line at the medicine's MRP | each line at its batch's MRP (else the medicine's) per unit, rounded down; line + `hsn_code`, `pack_size` | D2, D3, D6 |
| every route returning invoice lines (`/invoices…`, `/medical-sales…`) | `pack_size` always null | + `hsn_code`; `pack_size` the medicine's pack label | D3 |
| `POST /suppliers/{supplier_id}/credits` | quantity × pack rate | quantity × unit rate (pack rate ÷ `units_per_pack`) | D5 |

Error copy added (i18n, en first): `errors:medicineUnitsPerPackHasStock`,
`errors:validation.hsnCodeFormat`. The received order's 409 keeps `transition_not_allowed` and its
copy.
