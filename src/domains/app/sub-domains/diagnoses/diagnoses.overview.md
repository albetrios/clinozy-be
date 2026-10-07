`src/domains/app/sub-domains/diagnoses/`

# Diagnosis

Parent: [app](../../app.overview.md)

## Purpose

The diagnosis catalogue the consult note picks from (launch ROUTE #23). Table `app.diagnoses`.

## Layout

| File | Role |
| --- | --- |
| `diagnoses.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `diagnoses.constants.ts` | value lists the CHECKs and validators share |
| `diagnoses.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `diagnoses.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `diagnoses.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/diagnoses` | `patient:read` |
| `POST /app/diagnoses` | `prescription:create` |
| `GET /app/diagnoses/{diagnosis_id}` | `patient:read` |
| `PATCH /app/diagnoses/{diagnosis_id}` | `prescription:update` |
| `DELETE /app/diagnoses/{diagnosis_id}` | `prescription:delete` |
| `POST /app/diagnoses/{diagnosis_id}/restore` | `prescription:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
