`src/domains/app/sub-domains/stock-vendors/`

# StockVendor

Parent: [app](../../app.overview.md)

## Purpose

A vendor the organization buys consumables from (launch ROUTE #53). Table `app.stock_vendors`.

## Layout

| File | Role |
| --- | --- |
| `stock-vendors.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `stock-vendors.constants.ts` | value lists the CHECKs and validators share |
| `stock-vendors.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `stock-vendors.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `stock-vendors.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/stock-vendors` | `stock_vendor:read` |
| `POST /app/stock-vendors` | `stock_vendor:create` |
| `GET /app/stock-vendors/{stock_vendor_id}` | `stock_vendor:read` |
| `PATCH /app/stock-vendors/{stock_vendor_id}` | `stock_vendor:update` |
| `DELETE /app/stock-vendors/{stock_vendor_id}` | `stock_vendor:delete` |
| `POST /app/stock-vendors/{stock_vendor_id}/restore` | `stock_vendor:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
