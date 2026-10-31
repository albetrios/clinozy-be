`src/domains/app/sub-domains/medical/medical-purchase-orders/`

# Medical purchase order

Parent: [medical](../medical.overview.md)

## Purpose

What the store orders from its suppliers — ordered, then received into batches (launch ROUTE #153
— routes-final 11.E, MD15–MD16). Tables `app.medical_purchase_orders` and
`app.medical_purchase_order_items`; paying is billing's.

## Layout

| File | Role |
| --- | --- |
| `medical-purchase-orders.schema.ts` | the tables: stages, the generated due and payment status, the cancel reasons, lines, RLS |
| `medical-purchase-orders.rules.ts` | the lines (quick medicines as typed) and their GST, read-only once received, receiving into batches |
| `medical-purchase-orders.gst-summary.ts` | the month's purchase GST by rate and HSN code, and its CSV (feat-purchase-line-gst PG9) |
| `medical-purchase-orders.repository.ts` | the shared reads and writes, lines, a supplier's dues, credits |
| `medical-purchase-orders.{dto,validator,serializer,types}.ts` | request shapes, the response |
| `medical-purchase-orders.service.ts` / `.controller.ts` / `.routes.ts` | routes 25–32, the GST summary and its CSV |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/medical-purchase-orders` | `medicine:read` |
| `GET /app/medical-purchase-orders/exports` | `medicine:export` |
| `GET /app/medical-purchase-orders/gst-summary` | `medicine:read` |
| `GET /app/medical-purchase-orders/gst-summary/exports` | `medicine:export` + `medicine:read` |
| `POST /app/medical-purchase-orders` | `medicine:create` |
| `GET /app/medical-purchase-orders/{medical_purchase_order_id}` | `medicine:read` |
| `PATCH /app/medical-purchase-orders/{medical_purchase_order_id}` | `medicine:update` |
| `DELETE /app/medical-purchase-orders/{medical_purchase_order_id}` | `medicine:delete` |
| `POST /app/medical-purchase-orders/{medical_purchase_order_id}/restore` | `medicine:delete` |
| `POST /app/medical-purchase-orders/{medical_purchase_order_id}/receive` | `medicine:update` |

## Key invariants

- **Ordered → received:** while ordered it changes and can be cancelled (the delete, with its own
  reasons); once received it is read-only (`409 transition_not_allowed`) — but a change of `note`
  alone (change-pharmacy-record-fields D10).
- **Receive** moves each ticked line into its batch — `(quantity + free_quantity) ×` the
  medicine's `units_per_pack` units, with the line's `mrp` on the batch when it has one (D5, D8) —
  refreshes the supplier's price, sets the total to the received lines' and applies the
  supplier's open credits.
- **Goods not ordered (MD26):** receive's lines without `id` — a medicine or a quick one added as
  typed, its quantity, free packs and rate — become received lines of the order (at most 50), with
  their batch and price like an ordered line.
- **The supplier on every order** carries its name, phone and GSTIN — a deleted supplier's too —
  for the PO sheet (MD30 (c)).
- **`due_amount`** = total − paid − credited once received; payments move `paid_amount`.
- **GST per line (feat-purchase-line-gst PG3–PG8):** each line carries `gst_percent` (the
  medicine's unless sent), `is_gst_inclusive` (true unless sent), `taxable_amount` and
  `gst_amount` — the invoice calculation (`computeInvoiceAmounts`, no discount), per line to the
  paisa; `amount = taxable_amount + gst_amount` (quantity × rate when inclusive, GST on top when
  not). The order stores `taxable_total` and `gst_total`, `total = taxable_total + gst_total` —
  its lines' while ordered, the received lines' once received.
- **Purchase GST summary (PG9, PG11–PG13):** `month` (`YYYY-MM`, not after this month) — the
  received lines of the live orders received in that month (organization time zone), `by_rate`,
  `by_hsn` (the medicine's HSN code and rate) and `totals`; its CSV one row per group with a
  `section` column. Served by `idx_medical_purchase_orders_organization_received`.
