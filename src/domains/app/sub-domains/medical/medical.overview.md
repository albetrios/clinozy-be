`src/domains/app/sub-domains/medical/`

# Medical store

Parent: [app](../../app.overview.md)

## Purpose

The clinic's in-house medicine store (launch ROUTE #153 — routes-final 11, routes 1–57; rev 2 ROUTE #186–#197): medicines
with batches and expiry, sales to patients and other contacts, purchase orders that become
batches, suppliers and what the store owes them, manufacturers, MRs and their visits, and the
store's slice of the payments ledger — never sharing records with clinic stock (9).

## Layout

| Folder / file | Role |
| --- | --- |
| [`manufacturers/`](manufacturers/manufacturers.overview.md) | 11.A — the brands on the packs (routes 1–6) |
| [`suppliers/`](suppliers/suppliers.overview.md) | 11.B — agencies, what each is owed, paying them (routes 7–13) |
| [`suppliers/supplier-credits/`](suppliers/supplier-credits/supplier-credits.overview.md) | 11.C — stock returned to a supplier, owed back; voided and undone (routes 14–16, 54, 55, 57) |
| [`medicines/`](medicines/medicines.overview.md) | 11.D — medicines, their batches and supplier prices (routes 17–24) |
| [`medical-purchase-orders/`](medical-purchase-orders/medical-purchase-orders.overview.md) | 11.E — orders: ordered, then received into batches (routes 25–32) |
| [`medical-reps/`](medical-reps/medical-reps.overview.md) | 11.F — medical representatives (routes 33–38) |
| [`medical-reps/medical-rep-visits/`](medical-reps/medical-rep-visits/medical-rep-visits.overview.md) | 11.G — an MR's logged visits (routes 39–43) |
| [`medical-sales/`](medical-sales/medical-sales.overview.md) | 11.H — sales, their void and returns, who owes on them (routes 44–50, 52) |
| [`medical-payments/`](medical-payments/medical-payments.overview.md) | 11.I — the store's slice of the payments ledger and its CSV (routes 51, 53) — routes and controller only |
| each resource's `seed/` | the one-row helpers the demo clinic seed writes the store through (`seedManufacturer`, `seedSupplier`, `seedSupplierCredit`, `seedMedicine` + its batches and prices, `seedMedicalPurchaseOrder` + its lines, `seedMedicalRep`, `seedMedicalRepVisit`, `seedMedicalSale` with its `medical` invoice) — `pnpm db:seed:demo-clinic` |
| `medical.container.ts` | builds the eight services |
| `medical.routes.ts` | registers the nine route sets (the store's payments on billing's payments service) |

## Key invariants

- **One code set (MD2):** `medicine:read` · `create` · `update` · `delete` · `export` — every
  route's gate; money keeps billing's codes — `payment:create` (paying a supplier, a sale's "Paid
  now"), `payment:delete` for a return's refund (MD23, as every refund since D83).
- **One store per organization (MD3):** only a sale has a branch — its invoice's.
- **Whole packs, one balance (MD4):** a medicine's `quantity` is its batches' sum; every writer —
  a batch edited by hand, a received order line, a supplier credit, a sale, its void and undo, a
  return — moves one batch and its medicine through `medicines/medicines.stock.ts` (guarded,
  never below 0 — a 409 `not_enough_stock`).
- **Earliest expiry first (MD5):** a sale draws from the unexpired batches by expiry month, then
  the oldest batch.
- **Money through billing (MD7):** a sale writes its `medical` invoice through the invoice ledger
  (`recordInvoice`), a return a credit note (`recordCreditNote`), paying an order is a
  `supplier_bill` payment pointing at it (`app.payments.medical_purchase_order_id`).
