`src/domains/app/sub-domains/stock/stock-items/`

# Stock item

Parent: [stock](../stock.overview.md)

## Purpose

One consumable or piece of equipment and how much is left (launch ROUTE #137 — routes-final 9.A,
S6). Table `app.stock_items`.

## Layout

| File | Role |
| --- | --- |
| `stock-items.schema.ts` | the table: the balance `≥ 0`, size and measure both or neither, maximum `≥` minimum, RLS |
| `stock-items.constants.ts` | categories, units, measures, the derived levels, the defaults |
| `stock-items.rules.ts` | the opening quantity as an `opening` movement, delete only at zero, the cross-field checks |
| `stock-items.repository.ts` | the shared reads and writes, the derived `stock_level` and `lasts_days_to` filters and sorts, the guarded balance |
| `stock-items.{dto,validator,serializer,types}.ts` | request shapes, the response with `stock_level` and `lasts_days` |
| `stock-items.service.ts` / `.controller.ts` / `.routes.ts` | routes 1–7 |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/stock-items` | `stock_item:read` |
| `GET /app/stock-items/exports` | `stock_item:export` |
| `POST /app/stock-items` | `stock_item:create` |
| `GET /app/stock-items/{stock_item_id}` | `stock_item:read` |
| `PATCH /app/stock-items/{stock_item_id}` | `stock_item:update` |
| `DELETE /app/stock-items/{stock_item_id}` | `stock_item:delete` |
| `POST /app/stock-items/{stock_item_id}/restore` | `stock_item:delete` |

## Key invariants

- **The quantity moves only with a movement (S5):** never in a `PATCH`; the opening quantity is
  an `opening` movement; a movement leaves `updated_at` alone (D43 is about the details).
- **`last_rate`** follows the latest purchase line (S10).
- **`lasts_days_to` (D81):** the items whose `lasts_days` is at most the value ("runs out within a
  week" = 7); an item without a weekly usage has no `lasts_days` and never matches.
- **Delete only at zero** (`409 item_has_stock`); an item with movements is never purged.
