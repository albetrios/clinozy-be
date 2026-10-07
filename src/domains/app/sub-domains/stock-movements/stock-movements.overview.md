`src/domains/app/sub-domains/stock-movements/`

# StockMovement

Parent: [app](../../app.overview.md)

## Purpose

One change to an item's stock — used, received, adjusted, damaged, returned or reverted (a ledger) (launch ROUTE #56). Table `app.stock_movements`.

## Layout

| File | Role |
| --- | --- |
| `stock-movements.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `stock-movements.constants.ts` | value lists the CHECKs and validators share |
| `stock-movements.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `stock-movements.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `stock-movements.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/stock-movements` | `stock_item:read` |
| `POST /app/stock-movements` | `stock_item:update` |
| `GET /app/stock-movements/{stock_movement_id}` | `stock_item:read` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
