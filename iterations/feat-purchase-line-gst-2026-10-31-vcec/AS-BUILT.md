# feat-purchase-line-gst-2026-10-31-vcec — as built

Baseline: none · KICKOFF.md approved 2026-10-31 ([PG18](plans/decisions.md)) · branch `feat/purchase-line-gst` ([PG2](plans/decisions.md)) · built on `main` at `0470857` (change-pharmacy-record-fields, #182)

## Rows

| # | Planned | Actually built | Difference | Why | Decision | Reviewed | Commit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #1 | ROUTE 1 — the line's GST and the order's totals (POC1, POC2) | **Schema:** `medical_purchase_order_items` + `gst_percent` (smallint, `chk_medical_purchase_order_items_gst_percent` on the medicines' list), `is_gst_inclusive` (default true), `taxable_amount`, `gst_amount`; `chk_medical_purchase_order_items_amount` now `amount = taxable + gst` and `quantity × rate` = the amount (inclusive) or the taxable value (exclusive); `medical_purchase_orders` + `taxable_total`, `gst_total`, `chk_medical_purchase_orders_totals`. **Migrations:** `20261031042806_purchase_line_gst.sql` (columns, the fill between `NO FORCE` / `FORCE ROW LEVEL SECURITY` on the three tables it reads or writes, NOT NULL behind a validated check, the checks NOT VALID + VALIDATE) and `20261031042833_purchase_orders_received_index.sql` (the summary's index, CONCURRENTLY). **Rules:** `purchaseLineMoney` calls `computeInvoiceAmounts` (one line, no discount); `resolveLines` takes the rate sent or the medicine's (`findLive`), inclusive unless sent; save and receive store `taxable_total`, `gst_total`, `total` from the counted lines. **DTO / repository / serializer / types / OpenAPI / overview / route descriptions** follow. **Verified:** the migration applied on the local demo database with every check validated (A-5); `medical-purchase-gst.integration.test.ts` A-1 – A-4 | two migrations, not one | `CREATE INDEX CONCURRENTLY` must run outside a transaction; the fill must run inside one | PG8, PG15; [PG19](plans/decisions.md) | straight through ([PG18](plans/decisions.md)) | `9caedd4` |
| #2 | ROUTE 2 — the GST summary and its CSV (POC3) | `medical-purchase-orders.gst-summary.ts` — `purchaseGstSummary` and `purchaseGstSummaryExport`, registered as the rules' `collectionViews` (`gst-summary`, `gst-summary-exports`) and served by `controller.collectionView` (the `medical-sales/dues` pattern); `findGstSummary` in the repository (one grouped read by rate and HSN code, one order count); the month's bounds from `instantInTimeZone` in the organization's time zone; `medicalPurchaseGstSummaryQueryDto` on the shared `yearMonthSchema` (the medicines' `expiryMonthSchema` now reuses it); i18n `errors:validation.medicalPurchaseGstMonthInFuture` (en, es); OpenAPI response map, query-schema map, `route-success-statuses.json`, `docs/routes.txt` (451 routes). **Verified:** A-6, A-7 in the integration suite (also as the RLS-subject application role) | the summary lives in its own file | the rules file was already long; the invoice sub-domain splits the same way (`invoices.amounts.ts`) | PG9–PG13; [PG20](plans/decisions.md) | straight through | `9caedd4` |
| #3 | ROUTE 3 — seeds and cross-cutting tests (POC4) | the demo clinic's purchase lines carry their medicine's GST, inclusive, and its orders their totals (`purchaseLineGst` in `demo-clinic.ts`, the invoice calculation); `docs/database/clinozy-be.dbml` regenerated — and `generate-dbdiagram.ts` now reads every column of a multi-column `ADD COLUMN` and `SET/DROP NOT NULL`, which also adds #182's missing columns and fixes two nullabilities | the diagram generator fixed | without it the dbml dropped all but the first new column | [PG21](plans/decisions.md) | straight through | `9caedd4` |
| #4 | ROUTE 4 — acceptance, the frontend route map, the gates | `plans/acceptance.md` A-1 – A-7 pass (A-8 is clinozy-fe's); `plans/frontend-route-map.md` (sections 1, 2, 4 by hand; 3 generated, `--check` green). **Gates:** `pnpm validate` ✓; `pnpm tsdoc:check` 0/0 ✓; `pnpm routes:catalog:check` ✓ (451); `pnpm docs:check` ✓; `pnpm db:migrate:lint` ✓ (0 violations); `pnpm validate:domain` ✓; `pnpm test:global` 142/142 ✓; `pnpm test:unit` 6372/6372 ✓; the medical integration suites + the demo-clinic seed suite 38/38 ✓; the pre-commit guard ✓ | **Not run locally:** the full e2e / integration lanes and `validate:route-success-coverage` (it needs the full suite's observations — it fails on unchanged `main` locally too); PR CI runs them | the full serial suite is long | — | straight through | (this commit) |

## Revisions to upcoming rows

- none — no scope change.

## Summary

- Planned, not built: none.
- Built, not planned: the `yearMonthSchema` reuse ([PG20](plans/decisions.md)) and the dbml generator fix ([PG21](plans/decisions.md)).
- Follow-ups for the next iteration: `feat-short-delivery` — the line's amount and GST follow the received quantity.

## Standing deviations

The complete list of where the code differs from the drop — Baseline `none`, no list to carry; none added.

| Item | Design says | Built as | Since iteration | Decision |
| --- | --- | --- | --- | --- |
| — | — | — | — | — |
