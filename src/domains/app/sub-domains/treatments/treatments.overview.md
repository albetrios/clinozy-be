`src/domains/app/sub-domains/treatments/`

# Treatment

Parent: [app](../../app.overview.md)

## Purpose

A treatment session done for a patient — reversed with a reason, never deleted (P89) (launch ROUTE #40). Table `app.treatments`.

## Layout

| File | Role |
| --- | --- |
| `treatments.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `treatments.constants.ts` | value lists the CHECKs and validators share |
| `treatments.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `treatments.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `treatments.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/patients/{patient_id}/treatments` | `patient:read` |
| `POST /app/patients/{patient_id}/treatments` | `treatment:create` |
| `GET /app/treatments` | `patient:read` |
| `GET /app/treatments/{treatment_id}` | `patient:read` |
| `PATCH /app/treatments/{treatment_id}` | `treatment:update` |
| `POST /app/treatments/{treatment_id}/reverse` | `treatment:update` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
