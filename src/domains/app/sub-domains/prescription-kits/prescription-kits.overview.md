`src/domains/app/sub-domains/prescription-kits/`

# PrescriptionKit

Parent: [app](../../app.overview.md)

## Purpose

A doctor's one-tap prescription — a named set of medicine lines (the doctor's own) (launch ROUTE #26). Table `app.prescription_kits`.

## Layout

| File | Role |
| --- | --- |
| `prescription-kits.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `prescription-kits.constants.ts` | value lists the CHECKs and validators share |
| `prescription-kits.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `prescription-kits.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `prescription-kits.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/prescription-kits` | `prescription:create` |
| `POST /app/prescription-kits` | `prescription:create` |
| `GET /app/prescription-kits/{prescription_kit_id}` | `prescription:create` |
| `PATCH /app/prescription-kits/{prescription_kit_id}` | `prescription:create` |
| `DELETE /app/prescription-kits/{prescription_kit_id}` | `prescription:create` |
| `POST /app/prescription-kits/{prescription_kit_id}/restore` | `prescription:create` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
