# AS-BUILT — change-pharmacy-record-fields-2026-10-31-wpan

What each ROUTE row built. Under D4 (straight through) each row's review of record is this table,
reviewed at Close; the PR's review covers anything after it.

| # | Work item | Built | Differs from the plan | Evidence | Reviewed |
| --- | --- | --- | --- | --- | --- |
| 1 | The nine columns | `migrations/20261031031925_pharmacy_record_fields.sql` (columns, CHECKs `NOT VALID` then validated); Drizzle columns + checks on `medicines`, `medicine_batches`, `medical_purchase_order_items`, `medical_purchase_orders`, `suppliers`, `invoice_items`; `HSN_CODE_PATTERN` + `hsnCodeSchema` shared (`record-fields`) | `suppliers.email` also got a CHECK (`char_length >= 3`, as the DTO's minimum) — db-changes synced | `pnpm db:migrate:lint` 0 violations; applied locally | Close, 2026-10-31 |
| 2 | Medicines | DTO fields (`hsn_code`, `pack_label`, `units_per_pack`; batch `mrp` via the shared `printedMrpSchema`); serializer/types; batch reads carry `mrp`; `assertUnitsPerPackChangeable` → 409 `medicine_has_stock` (`errors:medicineUnitsPerPackHasStock`, en + es); route copy | — | `medical-record-fields.integration.test.ts` A1–A3 | Close, 2026-10-31 |
| 3 | Suppliers + credits | `email` / `address` on DTO, serializer, types, route copy; a credit's `rate` = `unitPurchaseRate` (pack rate ÷ units per pack) | — | A4, A10 | Close, 2026-10-31 |
| 4 | Purchase orders | `note` on create/patch/receive and responses; line `mrp` on create/patch/receive and responses; receive adds `(quantity + free) × units_per_pack` and puts the line's MRP on the batch (an existing batch keeps its own unless the line has one); a received order takes a change of `note` alone | the received order's note-only change skips the date and line checks (nothing else changes) | A5, A6 | Close, 2026-10-31 |
| 5 | Sale and invoice lines | `snapshotOf` prices a medicine line with `unitSellingRate` from the drawn batch's MRP (else the medicine's), snapshots `pack_size` ← `pack_label` and `hsn_code`; kept lines keep theirs; `hsn_code` on every invoice item read and preview; sale lines carry `pack_size`, `hsn_code`, `units_per_pack`; sale cost per unit | `unitSellingRate` / `unitPurchaseRate` live in `medicines.stock.ts` beside the other stock helpers the sales, credits and invoices already import | A7–A9, A11; `medicines.stock.unit.test.ts` | Close, 2026-10-31 |
| 6 | Docs, catalog, seeds | route descriptions; overviews (medicines, purchase orders, sales, suppliers); demo clinic medicines carry HSN codes and pack labels, and their seeded sale lines snapshot both | — | `pnpm routes:catalog:check`, `pnpm docs:check`, `pnpm tsdoc:check` (0/0), `pnpm docs:lint` | Close, 2026-10-31 |
| 7 | Flow — loose sale end to end | covered in the integration suite: order with MRP → receive (60 units) → sell 3 units at ₹12.55 → stock 57 | the return step is covered by the existing batches suite (a return restocks units as sold) | A5–A9 test | Close, 2026-10-31 |
| 8 | Close | gates below; `plans/acceptance.md`; `plans/frontend-route-map.md` | `/be-pre-merge-review` replaced by a self-review of the diff and PR CI's review lanes (D4, straight through) | this file | Close, 2026-10-31 |

## Summary

- **Planned, not built:** none.
- **Built, not planned:** demo seed HSN codes and pack labels (be-seed-maintainer); the CHECK on
  `suppliers.email`.
- **Follow-ups:** the migration backfill of the old data and the data decisions C1–C5 (D12) — a
  data change after this ships; when the 78 old loose-selling medicines get `units_per_pack`, the
  backfill converts their batch quantities in the same transaction.

## Gates

`pnpm typecheck`, `pnpm lint`, `pnpm docs:lint`, `pnpm db:migrate:lint`, `pnpm routes:catalog:check`,
`pnpm docs:check`, `pnpm tsdoc:check`, `pnpm validate:domain`, `pnpm test:global`, `pnpm test:unit`,
and the medical, billing and app smoke suites (30 files, 477 tests) — green locally; PR CI runs the
full matrix.

## Standing deviations

| Item | Design says | Built as | Since |
| --- | --- | --- | --- |
| Units per pack after stock exists | — | locked while the medicine holds stock (409); the backfill converts old stock itself | this iteration (D7) |
| A return after a units-per-pack change | the line's quantity goes back into its batch | it goes back in today's unit — a line sold before the change restocks the wrong count; count the shelf after | this iteration (D7) |
| A loose unit's price | MRP ÷ units | rounded **down** to the paisa, so ten units of a ₹125.55 strip come to ₹125.50 | this iteration (D6) |
