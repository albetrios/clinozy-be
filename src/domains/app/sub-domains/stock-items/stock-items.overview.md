`src/domains/app/sub-domains/stock-items/`

# StockItem

Parent: [app](../../app.overview.md)

## Purpose

A consumable kept in stock — its levels in milli-units (×1000) (launch ROUTE #54). Table `app.stock_items`.

## Layout

| File | Role |
| --- | --- |
| `stock-items.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `stock-items.constants.ts` | value lists the CHECKs and validators share |
| `stock-items.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `stock-items.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `stock-items.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/stock-items` | `stock_item:read` |
| `GET /app/stock-items/exports` | `list:export` |
| `POST /app/stock-items` | `stock_item:create` |
| `GET /app/stock-items/{stock_item_id}` | `stock_item:read` |
| `PATCH /app/stock-items/{stock_item_id}` | `stock_item:update` |
| `DELETE /app/stock-items/{stock_item_id}` | `stock_item:delete` |
| `POST /app/stock-items/{stock_item_id}/restore` | `stock_item:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
