# KICKOFF — change-pharmacy-record-fields-2026-10-31-wpan

## 1. Header

| Field | Value |
| --- | --- |
| Iteration | `change-pharmacy-record-fields-2026-10-31-wpan` (clinozy-be; the same-named clinozy-fe iteration plans the screens) |
| Mode | initial — Baseline `none` (from scratch) |
| Intake mode | `brief` — `BRIEF.md` only |
| Intake note | 1 received (BRIEF.md) · from scratch |
| Drop placed | 2026-10-31 |
| Intake hash | `b96b02cab069` |
| Date | 2026-10-31 |
| Branch | `claude/happy-shannon-mtu7q6` (the session's branch; the pre-push hook allows `claude/*` — D4) |

## 2. Goal and scope

**Goal:** the pharmacy records keep what the old Cresence system knew — HSN code, pack label and units per pack on a
medicine, the MRP on each batch, email and address on a supplier, a note on a purchase order — and the two flows the
old data shows the pharmacy runs every day work: selling loose strips or tablets by the unit, and charging each batch
the MRP printed on it.

**In scope (this repository):**

- One migration: nine columns on six tables ([plans/db-changes.md](plans/db-changes.md)).
- Medicines, suppliers, purchase orders: the fields on their bodies and responses; `units_per_pack` locked while a
  medicine holds stock (D7); a received order's note (D10).
- Stock in units (D5): receive multiplies by `units_per_pack`; the sale line, sale cost and supplier credit price per
  unit.
- The sale line: the batch's MRP (D2), per unit rounded down (D6), with `pack_size` and `hsn_code` snapshots (D3).
- Tests, seeds, the route catalog, OpenAPI (en, es), i18n, the overviews, and the frontend route map at close.

**Out of scope:** the backfill of the old data and the data decisions C1–C5 (D12); stock adjustments, write-offs,
reports; `BRIEF.md` › Out of scope.

## 3. Locked decisions

All in [plans/decisions.md](plans/decisions.md): **D1** loose selling in · **D2** charge the batch MRP · **D3** HSN
snapshot on bill lines · **D4** straight through · **D5** units everywhere on the medicine · **D6** unit price rounded
down · **D7** `units_per_pack` locked while stocked · **D8** the batch MRP comes from the order line · **D9** field
shapes · **D10** a received order's note · **D11** no new route · **D12** backfill after it ships.

## 4. Features and order

| Order | Feature | Kind | Depends on | Story |
| --- | --- | --- | --- | --- |
| 1 | Pharmacy record fields (medicine, batch, supplier, order) | screen | — | [features/pharmacy-record-fields](plans/features/pharmacy-record-fields/story.md) |
| 2 | Loose sale at the batch MRP | flow | 1 | [features/flow-loose-sale](plans/features/flow-loose-sale/story.md) |

## 5. ROUTE

The ordered ledger — the schema first, then each changed sub-domain, then the flow, then close. Each sub-domain row's
spec is its section of [plans/routes-final.md](plans/routes-final.md), built ditto.

| # | Work item | Kind | Depends on | Skill/driver | Acceptance | Assignee | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | The nine columns — Drizzle schemas + one migration (CHECKs `NOT VALID` then validated) | table | — | `/be-build-requirement` (CHANGE table) · be-schema-generator · be-sql-design-guard · be-db-migration-maintainer · be-rls-tenant-isolation-guard | `pnpm db:migrate:lint`; the schema matches the database | Claude | done |
| 2 | Sub-domain 1 — medicines: fields, batch MRP, `units_per_pack` lock (routes-final §1) | sub-domain | 1 | `/be-build-requirement` (CHANGE) · be-api-contract-guard · be-i18n-message-guard · be-test-generator | A1–A3 | Claude | done |
| 3 | Sub-domain 2 — suppliers: email, address; credit priced per unit (routes-final §2) | sub-domain | 1 | `/be-build-requirement` (CHANGE) · be-test-generator | A4, A10 | Claude | done |
| 4 | Sub-domain 3 — purchase orders: note, line MRP, receive in units, the received order's note (routes-final §3) | sub-domain | 1, 2 | `/be-build-requirement` (CHANGE) · be-idempotency-guard · be-test-generator | A5, A6 | Claude | done |
| 5 | Sub-domain 4 — sale lines at the batch MRP per unit, `pack_size` + `hsn_code` snapshots, sale cost per unit (routes-final §4) | sub-domain | 1, 2 | `/be-build-requirement` (CHANGE) · be-test-generator | A7–A9 | Claude | done |
| 6 | Route schemas, OpenAPI (en, es), route catalog, seeds, overviews, TSDoc | flow | 2–5 | be-route-schema-doc-guard · be-openapi-multilingual · be-route-catalog · be-seed-maintainer · be-overview-doc-maintainer · be-tsdoc-export-guard | `pnpm routes:catalog:check`, `pnpm docs:check`, `pnpm tsdoc:check` | Claude | done |
| 7 | Flow — a loose sale at the batch MRP, end to end (order → receive with MRP → sell units → return) | flow | 2–5 | be-test-generator | A8 + the e2e flow test | Claude | done |
| 8 | Acceptance and close — gates, `/be-pre-merge-review`, `plans/acceptance.md`, `AS-BUILT.md`, `plans/frontend-route-map.md`, `done` | flow | 1–7 | be-kickoff-iteration › Close | every row of `plans/acceptance.md` filled | Claude | done |

## 6. Requirements index

| Identifier | File |
| --- | --- |
| `data.medicine-fields`, `data.batch-mrp`, `data.supplier-contact`, `data.order-note`, `data.line-snapshots`, `data.units` | [requirements/data.md](plans/requirements/data.md) |
| `operations.units-per-pack-locked`, `operations.receive-in-units`, `operations.sale-at-batch-mrp`, `operations.received-order-note` | [requirements/operations.md](plans/requirements/operations.md) |
| `access.unchanged` | [requirements/access.md](plans/requirements/access.md) |
| `quality.no-meaning-change-today`, `quality.never-above-mrp`, `quality.errors-translated` | [requirements/quality.md](plans/requirements/quality.md) |
| `background.none` | [worker-changes.md](plans/worker-changes.md) — none |

## 7. Open AMBER items

D5–D12 are safe defaults taken under D4 (straight through); each is reviewed at Close.

## 8. Standing deviations

Baseline `none` — none carried in. New from this iteration: D7's known limit (a return of a line sold before a
`units_per_pack` change restocks in today's unit), recorded in `AS-BUILT.md` › Standing deviations.

## 9. Definition of done

- Every ROUTE row `done`.
- `plans/acceptance.md` filled with results and evidence.
- `AS-BUILT.md` written: a row per ROUTE row, the summary, the Standing deviations.
- The repository's gates green: `pnpm validate`, `pnpm tsdoc:check`, `pnpm routes:catalog:check`, `pnpm db:migrate:lint`,
  the touched suites, and PR CI.

## 10. Verification

- **Intake mode `brief`:** the `BRIEF.md` acceptance criteria this repository proves ([plans/acceptance.md](plans/acceptance.md)
  A1–A12) and the frontend's list for the screens.
- **The existing suites** for everything touched — medicines, suppliers, supplier credits, purchase orders, medical
  sales and returns, invoices, the RLS-role lane, the route-success coverage.
