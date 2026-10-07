`src/domains/app/sub-domains/medicines/`

# Medicine

Parent: [app](../../app.overview.md)

## Purpose

A medicine the store stocks — its batches, supplier rates and stock levels (launch ROUTE #48). Table `app.medicines`.

## Layout

| File | Role |
| --- | --- |
| `medicines.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `medicines.constants.ts` | value lists the CHECKs and validators share |
| `medicines.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `medicines.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `medicines.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/medicines` | `medicine:read` |
| `GET /app/medicines/exports` | `list:export` |
| `POST /app/medicines` | `medicine:create` |
| `GET /app/medicines/{medicine_id}` | `medicine:read` |
| `PATCH /app/medicines/{medicine_id}` | `medicine:update` |
| `DELETE /app/medicines/{medicine_id}` | `medicine:delete` |
| `POST /app/medicines/{medicine_id}/restore` | `medicine:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
