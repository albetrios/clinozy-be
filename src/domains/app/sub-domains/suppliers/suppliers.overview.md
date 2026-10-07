`src/domains/app/sub-domains/suppliers/`

# Supplier

Parent: [app](../../app.overview.md)

## Purpose

An agency the store buys medicines from (launch ROUTE #45). Table `app.suppliers`, with `app.supplier_manufacturers`.

## Layout

| File | Role |
| --- | --- |
| `suppliers.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `suppliers.constants.ts` | value lists the CHECKs and validators share |
| `suppliers.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `suppliers.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `suppliers.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/suppliers` | `supplier:read` |
| `POST /app/suppliers` | `supplier:create` |
| `GET /app/suppliers/{supplier_id}` | `supplier:read` |
| `PATCH /app/suppliers/{supplier_id}` | `supplier:update` |
| `DELETE /app/suppliers/{supplier_id}` | `supplier:delete` |
| `POST /app/suppliers/{supplier_id}/restore` | `supplier:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
