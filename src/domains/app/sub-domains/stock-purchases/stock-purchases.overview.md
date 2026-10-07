`src/domains/app/sub-domains/stock-purchases/`

# StockPurchase

Parent: [app](../../app.overview.md)

## Purpose

A purchase of consumables from a vendor (launch ROUTE #55). Table `app.stock_purchases`.

## Layout

| File | Role |
| --- | --- |
| `stock-purchases.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `stock-purchases.constants.ts` | value lists the CHECKs and validators share |
| `stock-purchases.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `stock-purchases.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `stock-purchases.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/stock-purchases` | `stock_purchase:read` |
| `GET /app/stock-purchases/exports` | `list:export` |
| `POST /app/stock-purchases` | `stock_purchase:create` |
| `GET /app/stock-purchases/{stock_purchase_id}` | `stock_purchase:read` |
| `PATCH /app/stock-purchases/{stock_purchase_id}` | `stock_purchase:update` |
| `DELETE /app/stock-purchases/{stock_purchase_id}` | `stock_purchase:delete` |
| `POST /app/stock-purchases/{stock_purchase_id}/restore` | `stock_purchase:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
