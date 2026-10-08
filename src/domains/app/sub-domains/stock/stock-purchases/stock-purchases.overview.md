`src/domains/app/sub-domains/stock/stock-purchases/`

# Stock purchase

Parent: [stock](../stock.overview.md)

## Purpose

One vendor bill: what arrived and what is owed (launch ROUTE #137 — routes-final 9.D, S10–S12).
Tables `app.stock_purchases` and `app.stock_purchase_items`.

## Layout

| File | Role |
| --- | --- |
| `stock-purchases.schema.ts` | the bill (generated `due_amount` / `payment_status`) and its lines (key purchase + line), RLS |
| `stock-purchases.constants.ts` | the line cap, the payment statuses |
| `stock-purchases.rules.ts` | the lines and their receipts, quick items, the bill default, "Paid", fixed lines, delete only unpaid, restore |
| `stock-purchases.repository.ts` | the shared reads and writes, the derived `q` (bill number, vendor name, `#16`), the lines, the payments |
| `stock-purchases.{dto,validator,serializer,types}.ts` | request shapes, the response with `items` and `payment_ids` |
| `stock-purchases.service.ts` / `.controller.ts` / `.routes.ts` | routes 16–22; the list's `meta.due_total` |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/stock-purchases` | `stock_item:read` |
| `GET /app/stock-purchases/exports` | `stock_item:export` |
| `POST /app/stock-purchases` | `stock_item:create` (and `payment:create` for "Paid") |
| `GET /app/stock-purchases/{stock_purchase_id}` | `stock_item:read` |
| `PATCH /app/stock-purchases/{stock_purchase_id}` | `stock_item:update` |
| `DELETE /app/stock-purchases/{stock_purchase_id}` | `stock_item:delete` |
| `POST /app/stock-purchases/{stock_purchase_id}/restore` | `stock_item:delete` |

## Key invariants

- **Lines are what arrived (S10):** each writes a `received` movement and sets the item's
  `last_rate`; fixed once saved (`409 purchase_received`).
- **Paid by billing (S11):** `paid_amount` is kept by supplier-bill payments pointing at it, never
  above the bill; "Paid" records one in the same transaction.
- **Delete only unpaid (S12):** it takes back its received stock (`409 not_enough_stock` when some
  was used); a restore receives it again.
