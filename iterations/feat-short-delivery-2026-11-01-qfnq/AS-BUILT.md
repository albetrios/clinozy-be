# feat-short-delivery-2026-11-01-qfnq — as built

Baseline: none · KICKOFF.md approved 2026-11-01 ([SD13](plans/decisions.md)) · branch `feat/short-delivery` · on `main` at `791352c`

## Rows

| # | Planned | Actually built | Difference | Why | Decision | Reviewed | Commit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #1 | ROUTE 1 — the received quantities (SHC1, SHC2) | **Schema / migration `20261101054040_purchase_line_received_quantities.sql`:** `received_quantity`, `received_free_quantity` (filled = ordered on received lines, between NO FORCE / FORCE RLS), generated `is_short`, `chk_medical_purchase_order_items_received` (set exactly when received, 0…ordered), `chk_medical_purchase_order_items_amount` on `coalesce(received_quantity, quantity) × rate`. **DTO:** an ordered receive line takes both (0…9999). **Rules:** `receivedPacks` (default ordered, more is a 400 `items` — new i18n key `medicalPurchaseOrderReceivedOverOrdered`, en/es); 0 + 0 is not received; the batch takes the packs that came × units per pack; the line's money is `purchaseLineMoney` on the received quantity (the invoice calculation) and the totals add it; `decorate` counts `short_line_count`. **Repository:** `lockItems` / `insertItems` return the line's GST; `markItemReceived` writes the received quantities and money. Route description, OpenAPI response map, overview | — | — | SD3–SD11 | straight through | `4aa280b` |
| #2 | ROUTE 2 — tests, seeds (SHC3) | `medical-short-delivery.integration.test.ts` (A-1 – A-5; also as the RLS-subject role); the demo clinic's seed writes received = ordered ([SD14](plans/decisions.md)) | — | — | SD14 | straight through | `4aa280b` |
| #3 | ROUTE 3 — acceptance, route map, gates | `plans/acceptance.md` A-1 – A-6 pass (A-7 is clinozy-fe's); `plans/frontend-route-map.md`. **Gates:** `pnpm validate` ✓, `pnpm tsdoc:check` 0/0 ✓, `pnpm routes:catalog:check` ✓, `pnpm docs:check` ✓, `pnpm db:migrate:lint` ✓, the medical integration + demo seed suites 40/40 ✓, `pnpm test:global` 142/142 ✓, `pnpm test:unit` 6414/6414 ✓ | the full e2e / integration lanes run in PR CI | the full serial suite is long | — | straight through | (this commit) |

## Revisions to upcoming rows

- none.

## Summary

- Planned, not built: none.
- Built, not planned: none.
- Follow-ups: none.

## Standing deviations

| Item | Design says | Built as | Since iteration | Decision |
| --- | --- | --- | --- | --- |
| — | — | — | — | — |
