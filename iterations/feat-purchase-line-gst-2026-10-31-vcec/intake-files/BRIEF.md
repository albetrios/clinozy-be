# Brief — Purchase lines carry GST like invoice lines, orders total it, and a monthly purchase GST summary

<!--
Written 2026-10-31 from the user's requirement and answers (relayed by the orchestrating session).
Builds on change-pharmacy-record-fields (medicines.hsn_code, medicines.units_per_pack,
medical_purchase_order_items.mrp, medical_purchase_orders.note) — that change merges first.
Entities and routes as the launch's schema-routes.md names them.
-->

## What changes

A medical purchase order line holds `quantity`, `free_quantity`, `rate` and `amount` only, and the rate is the
GST-inclusive cost. The app cannot show the taxable value and the GST paid per purchase, per GST rate or per HSN
code, so the clinic cannot produce a purchase register or claim input tax credit. Cresence's old orders have
658 lines at 18 %, 12 %, 5 % and 0 % ("without GST bill").

1. **Each purchase line carries GST, the way an invoice line does** — `gst_percent` (0, 5, 12, 18, 28; defaults
   to the medicine's `gst_percent`), `is_gst_inclusive` (today's rate includes GST — default `true`),
   `taxable_amount` and `gst_amount`. The amounts come from the invoice calculation (`computeInvoiceAmounts` —
   no discount), rounded per line to the paisa: inclusive → taxable = quantity × rate ÷ (1 + GST ÷ 100), GST the
   rest, amount = quantity × rate; exclusive → taxable = quantity × rate, GST = taxable × GST ÷ 100, amount =
   taxable + GST. Free packs cost nothing.
2. **The order totals it** — `taxable_total` and `gst_total` beside `total` (= taxable_total + gst_total).
3. **A purchase GST summary for one month** — over the received orders whose receive date (organization time
   zone) falls in the month: by GST rate (`gst_percent`, taxable, GST, total, line count), by HSN code (the line
   medicine's `hsn_code`, blank grouped as "no HSN"; with its rate(s)), and the month's totals. One route plus a
   CSV export of it.

Screens (clinozy-fe, medical store): the purchase-order drawer and order view show and edit GST % per line (and
the inclusive toggle) and show the taxable / GST totals; a new **Purchase GST summary** screen — month picker,
by rate, by HSN, CSV download.

## Why

The clinic owner files GST returns and claims input tax credit on medicine purchases. Without the taxable value
and GST per line, the purchase register has to be built by hand from the paper bills.

## Affected screens, entities and routes

- Screens: medical store › Purchases (order drawer, order view), a new Purchase GST summary screen
- Entities: medical_purchase_order_items (new `gst_percent`, `is_gst_inclusive`, `taxable_amount`,
  `gst_amount`), medical_purchase_orders (new `taxable_total`, `gst_total`); reads medicines (`gst_percent`,
  `hsn_code`)
- Routes: `POST/PATCH/GET /app/medical-purchase-orders[/:medical_purchase_order_id]`,
  `POST /app/medical-purchase-orders/:medical_purchase_order_id/receive` (lines and totals carry GST);
  new `GET /app/medical-purchase-orders/gst-summary?month=YYYY-MM` → `{ by_rate[], by_hsn[], totals }` (medicine:read)
  and `GET /app/medical-purchase-orders/gst-summary/exports` (CSV, medicine:export)

## Rules

- `gst_percent` ∈ {0, 5, 12, 18, 28}; 0 % covers the "without GST bill" purchases — no separate flag.
- A line sent without `gst_percent` takes its medicine's; without `is_gst_inclusive`, `true`.
- Rounding per line to the paisa, exactly the invoice calculation (reused, not re-written).
- `total = taxable_total + gst_total`; what the supplier is owed (`due_amount`) follows `total`.
- Existing rows: the migration fills each line's `gst_percent` from its medicine, GST-inclusive, and recomputes
  `taxable_amount` / `gst_amount` and the orders' totals (inclusive keeps `amount` and `total` unchanged).
- The summary counts received, live (not cancelled) orders only; `month` is required, `YYYY-MM`; gates as the
  list and its CSV (medicine:read; medicine:export + medicine:read).

## Acceptance criteria

- [ ] A purchase line saved with rate 112, quantity 10, GST 12 % inclusive has taxable 1000.00, GST 120.00, amount 1120.00.
- [ ] The same line exclusive has taxable 1120.00, GST 134.40, amount 1254.40, and the order total follows.
- [ ] A line sent without `gst_percent` takes its medicine's GST rate; without `is_gst_inclusive`, inclusive.
- [ ] Every order read shows `taxable_total` and `gst_total`, and `total = taxable_total + gst_total`.
- [ ] Existing lines after the migration carry their medicine's GST rate, inclusive, with amounts unchanged.
- [ ] `GET /app/medical-purchase-orders/gst-summary?month=2026-10` returns by_rate, by_hsn and totals over the month's received orders only.
- [ ] The CSV export carries the same rows; medicine:export is required.
- [ ] The frontend drawer edits GST % per line and shows the taxable/GST totals; the summary screen picks a month and downloads the CSV.

## Out of scope

Supplier GSTIN validation, GSTR-2 filing formats, reverse charge, cess, discounts on purchase lines, short
deliveries (the next iteration, short-delivery), anything on production.
