`src/domains/app/sub-domains/prescriptions/`

# Prescription

Parent: [app](../../app.overview.md)

## Purpose

A doctor's prescription for a patient — a draft until a prescriber approves it (D31) (launch ROUTE #25). Table `app.prescriptions`.

## Layout

| File | Role |
| --- | --- |
| `prescriptions.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `prescriptions.constants.ts` | value lists the CHECKs and validators share |
| `prescriptions.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `prescriptions.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `prescriptions.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/patients/{patient_id}/prescriptions` | `prescription:read` |
| `POST /app/patients/{patient_id}/prescriptions` | `prescription:create` |
| `GET /app/prescriptions` | `prescription:read` |
| `GET /app/prescriptions/{prescription_id}` | `prescription:read` |
| `PATCH /app/prescriptions/{prescription_id}` | `prescription:update` |
| `POST /app/prescriptions/{prescription_id}/approve` | `prescription:update` |
| `DELETE /app/prescriptions/{prescription_id}` | `prescription:delete` |
| `POST /app/prescriptions/{prescription_id}/restore` | `prescription:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
