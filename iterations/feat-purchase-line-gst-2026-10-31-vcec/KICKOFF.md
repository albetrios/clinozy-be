# feat-purchase-line-gst-2026-10-31-vcec — kickoff

## 1. Header

| Field | Value |
| --- | --- |
| Iteration | `feat-purchase-line-gst-2026-10-31-vcec` (type `feat`, topic `purchase-line-gst`) |
| Mode | initial — Baseline `none` ([PG1](plans/decisions.md)) |
| Baseline | `none` |
| Intake mode | `brief` |
| Intake note | 1 received (BRIEF.md) · from scratch |
| Drop placed | 2026-10-31 |
| Intake hash | `35ce19d3e29b` |
| Schema-routes | — (brief from scratch) |
| Date | 2026-10-31 |
| Branch | `feat/purchase-line-gst` ([PG2](plans/decisions.md)) |
| Sibling | clinozy-fe `iterations/feat-purchase-line-gst-2026-10-31-vcec/` — the purchase-order drawer and view, the Purchase GST summary screen ([PG16](plans/decisions.md)) |

## 2. Goal and scope

**Goal.** Every medical purchase line records its GST the way an invoice line does, every order its
taxable and GST totals, and one route reports a month's purchase GST by rate and HSN code (with a
CSV), so the clinic can keep a purchase register and claim input tax credit.

**In scope:** the two tables' new columns and their fill; the line input, amounts (the invoice
calculation) and order totals on create, change and receive; the summary route and its CSV; route
docs, OpenAPI, the route catalog, the overview, seeds and tests; the frontend's screens (sibling).

**Out of scope:** `BRIEF.md:73–74` — supplier GSTIN validation, GSTR formats, reverse charge, cess,
discounts on purchase lines, short deliveries (the next iteration); a CGST / SGST / IGST split
([PG14](plans/decisions.md)); anything on production.

## 3. Locked decisions

- [PG3](plans/decisions.md)–[PG8](plans/decisions.md) — line columns, the reused calculation, defaults, 0 %, totals, the fill.
- [PG9](plans/decisions.md), [PG10](plans/decisions.md) — the summary route + CSV, the list's gates.
- [PG16](plans/decisions.md) — both repositories; [PG17](plans/decisions.md) route review final; [PG18](plans/decisions.md) approved.

## 4. Features and order

1. `purchase-line-gst` (screen) — [story](plans/features/purchase-line-gst/story.md).
2. `purchase-gst-summary` (screen) — [story](plans/features/purchase-gst-summary/story.md).

## 5. ROUTE

| # | Work item | Kind | Depends on | Skill/driver | Acceptance | Assignee | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | The purchase line's GST and the order's totals — schema, migration + fill, DTO, rules, repository, serializer, docs: [`routes-final.md` § 1](plans/routes-final.md), POC1, POC2 | sub-domain | — | `/be-build-requirement` (schema chain `be-schema-generator` → `be-sql-design-guard` → `be-db-migration-maintainer` → `be-rls-tenant-isolation-guard`; route chain `be-api-contract-guard`, `be-route-schema-doc-guard`, `be-test-generator`, `be-tsdoc-export-guard`) | A-1 – A-5 | Claude | done |
| 2 | The purchase GST summary and its CSV: POC3 | feature | 1 | `/be-build-requirement` (route chain + `be-route-catalog`, `be-i18n-message-guard`, `be-overview-doc-maintainer`) | A-6, A-7 | Claude | done |
| 3 | Seeds and the cross-cutting tests: POC4 | feature | 1, 2 | `be-seed-maintainer`, `be-test-generator` | A-1 – A-7 | Claude | done |
| 4 | Acceptance, the frontend route map, the gates | flow | 1–3 | `be-kickoff-iteration` › Close | A-1 – A-8 | Claude | done |

## 6. Requirements index

| Identifier | File |
| --- | --- |
| `data.purchase-line-gst` | [requirements/data.md](plans/requirements/data.md) |
| `data.purchase-order-gst-totals` | [requirements/data.md](plans/requirements/data.md) |
| `data.purchase-gst-backfill` | [requirements/data.md](plans/requirements/data.md) |
| `access.purchase-gst-summary` | [requirements/access.md](plans/requirements/access.md) |
| `operations.purchase-line-gst-input` | [requirements/operations.md](plans/requirements/operations.md) |
| `operations.purchase-gst-summary` | [requirements/operations.md](plans/requirements/operations.md) |
| `operations.purchase-gst-summary-export` | [requirements/operations.md](plans/requirements/operations.md) |
| `files.purchase-gst-summary-csv` | [requirements/files.md](plans/requirements/files.md) |
| `quality.one-gst-calculation` | [requirements/quality.md](plans/requirements/quality.md) |
| `quality.additive-on-v1` | [requirements/quality.md](plans/requirements/quality.md) |
| `quality.summary-indexed` | [requirements/quality.md](plans/requirements/quality.md) |

`background`, `notifications`, `realtime`, `integrations` are n/a (written, saying why).

## 7. Open AMBER items

- [PG11](plans/decisions.md) — the summary counts received lines of orders received in the month (organization time zone).
- [PG12](plans/decisions.md) — by_rate: rates present; by_hsn: by code and rate.
- [PG13](plans/decisions.md) — one CSV with a `section` column.
- [PG14](plans/decisions.md) — GST not split into CGST / SGST / IGST.
- [PG15](plans/decisions.md) — a new partial index on received orders.

## 8. Standing deviations

n/a — Baseline `none`: no list to carry; this iteration adds none.

## 9. Definition of done

Every ROUTE row `done`; `plans/acceptance.md` filled; `AS-BUILT.md` summary and Standing deviations;
`pnpm validate`, `pnpm tsdoc:check`, `pnpm routes:catalog:check`, `pnpm docs:check`,
`pnpm db:migrate:lint`, the touched suites, `pnpm test:global`, `pnpm test:unit` green;
`plans/frontend-route-map.md` written.

## 10. Verification

Brief mode → each acceptance criterion traced to its `BRIEF.md` line in `plans/acceptance.md` and
proven by a test: the rules' unit tests (line math A-1, A-2, defaults A-3), the purchase-order
integration suite (totals A-4, the summary A-6, the CSV and its gate A-7), the migration's fill
checked on a seeded database (A-5); the frontend's `pnpm health` (A-8).
