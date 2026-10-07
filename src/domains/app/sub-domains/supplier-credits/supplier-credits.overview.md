`src/domains/app/sub-domains/supplier-credits/`

# SupplierCredit

Parent: [app](../../app.overview.md)

## Purpose

Credit from a supplier for expiring stock returned (launch ROUTE #52). Table `app.supplier_credits`.

## Layout

| File | Role |
| --- | --- |
| `supplier-credits.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `supplier-credits.constants.ts` | value lists the CHECKs and validators share |
| `supplier-credits.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `supplier-credits.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `supplier-credits.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/supplier-credits` | `supplier:read` |
| `POST /app/supplier-credits` | `supplier:update` |
| `GET /app/supplier-credits/{supplier_credit_id}` | `supplier:read` |
| `DELETE /app/supplier-credits/{supplier_credit_id}` | `supplier:update` |
| `POST /app/supplier-credits/{supplier_credit_id}/restore` | `supplier:update` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
