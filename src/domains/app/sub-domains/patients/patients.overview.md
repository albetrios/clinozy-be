`src/domains/app/sub-domains/patients/`

# Patient

Parent: [app](../../app.overview.md)

## Purpose

A registered patient (launch ROUTE #13). Table `app.patients`.

## Layout

| File | Role |
| --- | --- |
| `patients.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `patients.constants.ts` | value lists the CHECKs and validators share |
| `patients.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `patients.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `patients.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/patients` | `patient:read` |
| `GET /app/patients/exports` | `list:export` |
| `POST /app/patients` | `patient:create` |
| `GET /app/patients/{patient_id}` | `patient:read` |
| `PATCH /app/patients/{patient_id}` | `patient:update` |
| `GET /app/patients/{patient_id}/timeline` | `patient:read` |
| `DELETE /app/patients/{patient_id}` | `patient:delete` |
| `POST /app/patients/{patient_id}/restore` | `patient:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
