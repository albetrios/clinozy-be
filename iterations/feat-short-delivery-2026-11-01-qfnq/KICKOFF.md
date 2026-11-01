# feat-short-delivery-2026-11-01-qfnq — kickoff

## 1. Header

| Field | Value |
| --- | --- |
| Iteration | `feat-short-delivery-2026-11-01-qfnq` (type `feat`, topic `short-delivery`) |
| Mode | initial — Baseline `none` ([SD1](plans/decisions.md)) |
| Baseline | `none` |
| Intake mode | `brief` |
| Intake note | 1 received (BRIEF.md) · from scratch |
| Drop placed | 2026-11-01 |
| Intake hash | `d03c5ab0bf5a` |
| Schema-routes | — (brief from scratch) |
| Date | 2026-11-01 |
| Branch | `feat/short-delivery` ([SD2](plans/decisions.md)) |
| Sibling | clinozy-fe `iterations/feat-short-delivery-2026-11-01-qfnq/` — Receive goods' received quantities, short lines in the view |

## 2. Goal and scope

**Goal.** Receive goods records what arrived per line; stock, batches, amounts, GST and the supplier's dues
follow it; short lines are marked.

**In scope:** the line's received columns and their fill; receive input, bounds, stock, amounts and totals;
reads (`is_short`, `short_line_count`); docs, OpenAPI, tests, seeds where they write received lines.

**Out of scope:** `BRIEF.md:60–63` — back-orders, receiving an order twice, damaged-goods returns, production.

## 3. Locked decisions

- [SD3](plans/decisions.md)–[SD6](plans/decisions.md) — columns, defaults, closing, owe what arrived.
- [SD12](plans/decisions.md) route review final; [SD13](plans/decisions.md) approved.

## 4. Features and order

1. `short-delivery` (screen) — [story](plans/features/short-delivery/story.md).

## 5. ROUTE

| # | Work item | Kind | Depends on | Skill/driver | Acceptance | Assignee | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | The line's received quantities: schema, migration + fill, DTO, rules, repository, serializer, docs (SHC1, SHC2) | sub-domain | — | `/be-build-requirement` (schema chain; route chain) | A-1 – A-6 | Claude | done |
| 2 | Tests, seeds, OpenAPI, overview (SHC3) | feature | 1 | `be-test-generator`, `be-seed-maintainer` | A-1 – A-6 | Claude | done |
| 3 | Acceptance, frontend route map, gates | flow | 1, 2 | `be-kickoff-iteration` › Close | A-1 – A-7 | Claude | done |

## 6. Requirements index

| Identifier | File |
| --- | --- |
| `data.received-quantities` | [requirements/data.md](plans/requirements/data.md) |
| `data.received-backfill` | [requirements/data.md](plans/requirements/data.md) |
| `operations.receive-what-arrived` | [requirements/operations.md](plans/requirements/operations.md) |
| `operations.short-lines-shown` | [requirements/operations.md](plans/requirements/operations.md) |
| `quality.one-money-calculation` | [requirements/quality.md](plans/requirements/quality.md) |

The other requirement files are n/a (written, saying why).

## 7. Open AMBER items

- [SD7](plans/decisions.md) bounds 0…ordered · [SD8](plans/decisions.md) both 0 = not received · [SD9](plans/decisions.md) `short_line_count` · [SD10](plans/decisions.md) the fill · [SD11](plans/decisions.md) the amount check.

## 8. Standing deviations

n/a — Baseline `none`.

## 9. Definition of done

Every ROUTE row `done`; acceptance filled; AS-BUILT; `pnpm validate`, `pnpm tsdoc:check`,
`pnpm routes:catalog:check`, `pnpm docs:check`, `pnpm db:migrate:lint`, the touched suites,
`pnpm test:global`, `pnpm test:unit` green; `plans/frontend-route-map.md`.

## 10. Verification

Each criterion traced to `BRIEF.md` and proven by the purchase-order integration suite (A-1 – A-5), the
migration on the local demo database (A-6), and clinozy-fe's tests (A-7).
