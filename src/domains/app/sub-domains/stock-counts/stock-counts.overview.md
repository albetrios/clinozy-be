`src/domains/app/sub-domains/stock-counts/`

# StockCount

Parent: [app](../../app.overview.md)

## Purpose

A stock count — only the changed lines write adjust movements (launch ROUTE #57). Table `app.stock_counts`.

## Layout

| File | Role |
| --- | --- |
| `stock-counts.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `stock-counts.constants.ts` | value lists the CHECKs and validators share |
| `stock-counts.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `stock-counts.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `stock-counts.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/stock-counts` | `stock_item:read` |
| `POST /app/stock-counts` | `stock_item:update` |
| `GET /app/stock-counts/{stock_count_id}` | `stock_item:read` |
| `DELETE /app/stock-counts/{stock_count_id}` | `stock_item:update` |
| `POST /app/stock-counts/{stock_count_id}/restore` | `stock_item:update` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
