# Brief — pharmacy records keep what the old system knew: HSN, pack, loose units, batch MRP, supplier contact and order notes

## What changes

The Cresence migration review found eight old pharmacy columns with real data and no home in the
new app. This change gives each one a field, shows it on the screens that edit and read it, and
adapts the two flows the data says the pharmacy runs every day: selling loose strips or tablets,
and selling each batch at the MRP printed on it.

Screen by screen:

- **Medicine drawer (add / edit)** — three new fields: **HSN code** (4, 6 or 8 digits), **Pack**
  (a free label such as `1*10`, `30GM`, `60ML`) and **Units per pack** (1 = sold in whole packs
  only; 10 = a strip of 10 that can be sold one tablet at a time). Every batch row gains an
  **MRP** (the price printed on that batch). Stock, reorder level and fill-up level are counted in
  units; when units per pack is above 1 the drawer shows them as packs + loose units
  (`3 packs + 4`).
- **Medicines tab** — the stock column reads in packs + loose units for a loose-selling medicine;
  HSN and pack show in the row's details.
- **Supplier drawer** — two new fields: **Email** and **Address**.
- **Purchase order drawer** — a **Note** for the order (`30 DAYS DUE`, `without gst bill`), and an
  optional **MRP** on each line (the price printed on the packs ordered).
- **Receive goods** — each line takes its **MRP** (prefilled from the order line, else the
  medicine's MRP), stored on the batch it goes into; the order's **Note** can be written here too.
- **Purchase order view** — shows the note and each line's MRP.
- **Pharmacy sale (new sale)** — a loose-selling medicine is sold in units: the quantity stepper
  counts units and shows the pack equivalent; the line price is the unit price.
- **Sale and bill views** — every pharmacy line shows its pack and HSN; a line is charged the MRP
  of the batch it was drawn from.

## Why

- The GST return's HSN summary needs an HSN code per medicine line, and pharmacy bills print it
  (334 medicines, 65 codes in the old data).
- Bill lines already snapshot a pack size but have nothing to copy it from (342 medicines carry a
  pack label).
- 609 old sale lines charged part of a pack (one strip of a 3-strip pack): the pharmacy sells loose,
  and today the app sells whole units only.
- 62 medicines were bought at more than one MRP. A batch may never be sold above the MRP printed on
  it, so the MRP belongs on the batch.
- 36 suppliers have a real email and 44 a full address — needed to send orders and statements and
  for GST records.
- 8 purchase orders carry notes with real meaning (payment terms, a bill without GST, a return
  netted against the bill), with nowhere else to keep them.

For whom: the pharmacy desk (sale, receive, medicine and supplier records) and the owner (GST
return, supplier statements).

## Affected screens, entities and routes

- Screens: medical-medicines, medical-medicine-drawer, medical-suppliers, medical-supplier-drawer,
  medical-purchases, medical-purchase-order-drawer, medical-purchase-order-view,
  medical-receive-goods, medical-sales, medical-sale-drawer, medical-sale-view
- Entities: medicines, medicine_batches, suppliers, medical_purchase_orders,
  medical_purchase_order_items, invoice_items
- Routes (no new route; these change their body or response):
  - `POST /app/medicines`, `PATCH /app/medicines/{medicine_id}`, `GET /app/medicines`,
    `GET /app/medicines/{medicine_id}`
  - `POST /app/suppliers`, `PATCH /app/suppliers/{supplier_id}`, `GET /app/suppliers`,
    `GET /app/suppliers/{supplier_id}`
  - `POST /app/medical-purchase-orders`, `PATCH /app/medical-purchase-orders/{medical_purchase_order_id}`,
    `POST /app/medical-purchase-orders/{medical_purchase_order_id}/receive`,
    `GET /app/medical-purchase-orders`, `GET /app/medical-purchase-orders/{medical_purchase_order_id}`
  - `POST /app/medical-sales` and every route that returns invoice lines (the line's `hsn_code`,
    `pack_size`, unit `rate`)

## Rules

**New fields**

| Field | Type | Rule |
| --- | --- | --- |
| `medicines.hsn_code` | text, optional | 4, 6 or 8 digits; `null` clears it |
| `medicines.pack_label` | text, optional | 1–30 characters, as printed (`1*10`, `30GM`); `null` clears it |
| `medicines.units_per_pack` | whole number, default 1 | 1–1000; 1 = whole packs only |
| `medicine_batches.mrp` | money, optional | above 0; `null` = not recorded |
| `medical_purchase_order_items.mrp` | money, optional | above 0; the MRP printed on the packs of that line |
| `suppliers.email` | text, optional | a valid email, up to 120 characters; `null` clears it |
| `suppliers.address` | text, optional | 1–240 characters; `null` clears it |
| `medical_purchase_orders.note` | text, optional | 1–500 characters; `null` clears it |
| `invoice_items.hsn_code` | text, snapshot | the medicine's HSN code when the line was billed (like name and pack) |

**Units (loose selling)**

- A medicine's stock is counted in **units**. A unit is one pack unless `units_per_pack` is above 1,
  when it is the loose piece (a tablet, a strip). Every medicine today has `units_per_pack` 1, so
  every stored number keeps its meaning.
- In units: the medicine's `quantity`, `min_stock` ("Reorder at"), `max_stock` ("Fill up to"), each
  batch's `quantity`, a sale line's and a return's `quantity`, a supplier credit's `quantity`.
- In packs (what a supplier sells): a purchase order line's `quantity`, `free_quantity` and `rate`,
  a batch's `purchase_rate`, a supplier price's `rate` and `free_quantity`, and every MRP.
- Receiving a line adds `(quantity + free_quantity) × units_per_pack` units to its batch.
- `units_per_pack` changes only while the medicine holds no stock — otherwise a 409
  `medicine_has_stock` ("Sell or return its stock first"); its batches would otherwise change
  meaning.

**Batch MRP and the sale price**

- A received line's MRP is stored on its batch: a new batch takes it; an existing batch of the same
  number takes it when the line sends one, else keeps its own.
- A medicine line is charged the MRP of the batch it is drawn from; a batch without a recorded MRP
  (all stock today) falls back to the medicine's MRP.
- A loose-selling medicine is charged per unit: the pack MRP divided by `units_per_pack`, rounded
  **down** to the paisa — never above the printed MRP.
- The line's `pack_size` snapshot is the medicine's pack label and `hsn_code` its HSN code, both
  taken when the line is billed; a kept line keeps its snapshot.
- A supplier credit (return to supplier) and a sale's cost price use the batch's purchase rate per
  unit (the pack rate divided by `units_per_pack`).

**Order note**

- `note` is written on create, change and receive. A received order is read-only, except that a
  change sending only `note` is allowed (payment terms are often noted after the goods arrive).

**Permissions** — unchanged: each field rides on the route that already writes its record
(`medicine:create` / `medicine:update` for medicines, suppliers, purchase orders, receive and sales).

## Acceptance criteria

- [ ] A medicine saves and returns `hsn_code`, `pack_label` and `units_per_pack`; a bad HSN (not 4, 6
      or 8 digits) is a 400 on `hsn_code`; `units_per_pack` outside 1–1000 is a 400.
- [ ] Changing `units_per_pack` on a medicine with stock is a 409 `medicine_has_stock`; with no stock
      it saves.
- [ ] A medicine's batch saves and returns its `mrp`.
- [ ] A supplier saves and returns `email` (a bad one is a 400) and `address`.
- [ ] A purchase order saves and returns `note` and each line's `mrp`; a received order takes a change
      of `note` alone and refuses any other change with a 409.
- [ ] Receiving a line stores its MRP on the batch and adds `(quantity + free) × units_per_pack` units.
- [ ] A sale line drawn from a batch with an MRP is charged that MRP; from a batch without one, the
      medicine's MRP.
- [ ] A sale of a loose-selling medicine (`units_per_pack` 10, MRP ₹125.55) charges ₹12.55 a unit and
      takes the units from stock.
- [ ] A sale line carries `pack_size` (the medicine's pack label) and `hsn_code`.
- [ ] A supplier credit on a loose-selling medicine is priced per unit.
- [ ] The frontend edits and shows every new field on the screens listed above, and sells a
      loose-selling medicine in units.

## Out of scope

- Filling the new fields from the old data (the backfill runs after this ships, from the migration
  worksheet, as a data change with a dry run and an undo list).
- The six data decisions C1–C5 (inactive medicines, expired stock rows, manufacturer phones, the
  inactive supplier, the B1G1 offer price) — data only.
- Medicine stock adjustments, shelf counts, write-offs, a stock value report, pausing a medicine
  or supplier — separate ideas.
- Showing HSN on a printed bill layout beyond the line it already lists; the GST return report.
- Converting a medicine's stock when `units_per_pack` changes (refused while it holds stock).
