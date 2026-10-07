`src/domains/app/sub-domains/medical-sales/`

# MedicalSale

Parent: [app](../../app.overview.md)

## Purpose

A sale over the store counter — never more than a batch holds, never an expired batch, never above MRP (D42) (launch ROUTE #51). Table `app.medical_sales`.

## Layout

| File | Role |
| --- | --- |
| `medical-sales.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `medical-sales.constants.ts` | value lists the CHECKs and validators share |
| `medical-sales.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `medical-sales.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `medical-sales.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/medical-sales` | `medical_sale:read` |
| `GET /app/medical-sales/exports` | `list:export` |
| `POST /app/medical-sales` | `medical_sale:create` |
| `GET /app/medical-sales/{medical_sale_id}` | `medical_sale:read` |
| `POST /app/medical-sales/{medical_sale_id}/void` | `sale:void` |
| `DELETE /app/medical-sales/{medical_sale_id}` | `medical_sale:delete` |
| `POST /app/medical-sales/{medical_sale_id}/restore` | `medical_sale:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
