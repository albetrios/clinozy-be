`src/domains/app/sub-domains/stock/stock-counts/`

# Stock count

Parent: [stock](../stock.overview.md)

## Purpose

A stock check: what was counted for each item and the `adjust` movements for what differed
(launch ROUTE #137 — routes-final 9.C, S9). Tables `app.stock_counts` and `app.stock_count_lines`.

## Layout

| File | Role |
| --- | --- |
| `stock-counts.schema.ts` | the count (no `updated_*`, no soft delete) and its lines (key count + item), RLS |
| `stock-counts.constants.ts` | the line cap, the movements' note |
| `stock-counts.rules.ts` | the system quantities taken `FOR UPDATE`, at least one difference, the movements |
| `stock-counts.repository.ts` | the shared reads and the insert, the lines |
| `stock-counts.{dto,validator,serializer,types}.ts` | request shapes, the response with its lines |
| `stock-counts.service.ts` / `.controller.ts` / `.routes.ts` | routes 13–15 |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/stock-counts` | `stock_item:read` |
| `POST /app/stock-counts` | `stock_item:update` |
| `GET /app/stock-counts/{stock_count_id}` | `stock_item:read` |

## Key invariants

- **Never changed or deleted (S9):** it moved stock; a wrong one is followed by another count or a
  revert.
- **The system quantity is the server's** — each item's balance when the count is saved.
