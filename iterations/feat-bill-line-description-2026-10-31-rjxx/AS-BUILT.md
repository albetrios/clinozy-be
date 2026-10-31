# feat-bill-line-description-2026-10-31-rjxx — as built

Baseline: none · KICKOFF.md approved 2026-10-31 ([BD9](plans/decisions.md))

## Rows

| # | Planned | Actually built | Difference | Why | Decision | Reviewed | Commit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #1 | ROUTE 1 — bills: a line's description (routes-final § 1, BLD1–BLD4) | `migrations/20261031040323_invoice_items_description.sql` (`ADD COLUMN IF NOT EXISTS description VARCHAR(280) NULL`); `invoices.schema.ts` (`description`, after `name`), `INVOICE_ITEM_DESCRIPTION_MAX = 280` (`invoices.constants.ts`); `invoices.dto.ts` (new + changed line: `trimmedStringMinMax(1–280).nullable().optional()`); `invoices.lines.ts` (omitted keeps the kept line's, `null` clears — the `batch_number` rule); `invoices.repository.ts` (both line reads), `invoices.serializer.ts` + `invoices.types.ts` (bill and preview lines); medical-sales: DTO item `description`, `drawSaleLines` puts it on every drawn line, repository read, `lineOutput` + `MedicalSaleItemOutput`; OpenAPI response schemas + examples (`tooling/openapi/response-map/schemas/app-records.ts`); `docs/database/clinozy-be.dbml`; seeds (`SeedInvoiceLine.description`, the demo clinic's discounted bills carry one); `invoices.overview.md` invariant. Tests: new `invoices.validator.unit.test.ts` (3), a new BD4 case in `billing.integration.test.ts` (create, preview, change preview, keep/replace/clear, 400 on 281 and empty, amounts unchanged, list and read back), and the medical sale suite (sale line returns it, drawn across two batches). | `POST /app/medical-sales` also takes it | a sale's bill is locked (`409 invoice_of_sale`), so BD5's route to a description was impossible | BD1, BD3, BD4, BD10 | at Close (straight-through) | (this commit) |
| #2 | ROUTE 2 — acceptance, the frontend route map, the gates | `plans/acceptance.md` A-1 – A-6 pass (A-7 is clinozy-fe's, BD7); `plans/frontend-route-map.md`; gates: `pnpm validate` ✓, `pnpm validate:domain` ✓, `pnpm tsdoc:check` 0/0 ✓, `pnpm routes:catalog:check` ✓ (no route moved), `pnpm docs:check` ✓, `pnpm db:migrate:lint` 0 violations ✓, `pnpm test:global` 142/142 ✓, `pnpm test:unit` 6370/6370 ✓, billing + medical + app integration/e2e 419/419 ✓, demo-clinic seed 4/4 ✓ | none | — | — | at Close | (this commit) |

## Revisions to upcoming rows

- Row #1 widened the medical-sale create (BD10, routes-final rev 2) — no effect on row #2.
- Follow-up (not in scope): the Cresence backfill — move each "Lines — <name>: <description>" out of
  the bills' remarks onto the matching line's `description` (≤ 280 fits every one) and trim the remark.

## Standing deviations

None — Baseline none; this iteration adds none.
