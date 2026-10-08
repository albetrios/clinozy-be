`src/domains/app/sub-domains/stock/stock-vendors/`

# Stock vendor

Parent: [stock](../stock.overview.md)

## Purpose

Who the clinic buys consumables from — never the medical store's suppliers (launch ROUTE #137 —
routes-final 9.E, S13). Table `app.stock_vendors`.

## Layout

| File | Role |
| --- | --- |
| `stock-vendors.schema.ts` | the table: unique name in any case, the phone check, RLS |
| `stock-vendors.rules.ts` | delete only with nothing owed, `payable` |
| `stock-vendors.repository.ts` | the shared reads and writes, the open dues per vendor |
| `stock-vendors.{dto,validator,serializer,types}.ts` | request shapes, the response with `payable` |
| `stock-vendors.service.ts` / `.controller.ts` / `.routes.ts` | routes 23–28 |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/stock-vendors` | `stock_item:read` |
| `POST /app/stock-vendors` | `stock_item:create` |
| `GET /app/stock-vendors/{stock_vendor_id}` | `stock_item:read` |
| `PATCH /app/stock-vendors/{stock_vendor_id}` | `stock_item:update` |
| `DELETE /app/stock-vendors/{stock_vendor_id}` | `stock_item:delete` |
| `POST /app/stock-vendors/{stock_vendor_id}/restore` | `stock_item:delete` |

## Key invariants

- **Delete only with nothing owed** (`409 vendor_has_dues`); its items keep pointing nowhere
  (`SET NULL` on purge), its purchases keep it (`RESTRICT`).
