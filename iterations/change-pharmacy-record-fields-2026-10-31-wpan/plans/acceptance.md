# Acceptance — change-pharmacy-record-fields-2026-10-31-wpan

One row per `BRIEF.md` acceptance criterion this repository proves; Result and Evidence are filled at Close.

| # | Criterion | Result | Evidence |
| --- | --- | --- | --- |
| A1 | A medicine saves and returns `hsn_code`, `pack_label`, `units_per_pack`; a bad HSN is a 400 on `hsn_code`; `units_per_pack` outside 1–1000 is a 400 | pass | `medical-record-fields.integration.test.ts` "A1, A3, A11" |
| A2 | Changing `units_per_pack` on a medicine with stock is a 409 `medicine_has_stock`; with no stock it saves | pass | `medical-record-fields.integration.test.ts` "A2" |
| A3 | A medicine's batch saves and returns its `mrp` | pass | `medical-record-fields.integration.test.ts` "A1, A3, A11" |
| A4 | A supplier saves and returns `email` (a bad one is a 400) and `address` | pass | `medical-record-fields.integration.test.ts` "A4" |
| A5 | A purchase order saves and returns `note` and each line's `mrp`; a received order takes a change of `note` alone and refuses any other change with a 409 | pass | `medical-record-fields.integration.test.ts` "A5…A9" (note, line MRP, note-only change, 409 otherwise) |
| A6 | Receiving a line stores its MRP on the batch and adds `(quantity + free) × units_per_pack` units | pass | `medical-record-fields.integration.test.ts` "A5…A9" — 5 + 1 free × 10 = 60 units @ ₹125.55 |
| A7 | A sale line from a batch with an MRP is charged that MRP; from a batch without one, the medicine's MRP | pass | `medical-record-fields.integration.test.ts` "A5…A9" (₹449 batch MRP) and "A7, A11" (medicine MRP) |
| A8 | A loose sale (`units_per_pack` 10, MRP ₹125.55) charges ₹12.55 a unit and takes the units from stock | pass | `medical-record-fields.integration.test.ts` "A5…A9" — 3 × ₹12.55 = ₹37.65, stock 57; `medicines.stock.unit.test.ts` |
| A9 | A sale line carries `pack_size` (the medicine's pack label) and `hsn_code` | pass | `medical-record-fields.integration.test.ts` "A5…A9" — `pack_size` 1*10, `hsn_code` 300490 |
| A10 | A supplier credit on a loose-selling medicine is priced per unit | pass | `medical-record-fields.integration.test.ts` "A10" — 3 × ₹8 = ₹24 |
| A11 | Every medicine today reads the same (`units_per_pack` 1, sale at the medicine's MRP) | pass | `medical-record-fields.integration.test.ts` "A7, A11"; the existing medical and billing suites unchanged (477 pass) |
| A12 | The gates and the touched suites are green | pass | AS-BUILT › Gates |
