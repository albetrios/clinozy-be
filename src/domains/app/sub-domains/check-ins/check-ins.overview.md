`src/domains/app/sub-domains/check-ins/`

# CheckIn

Parent: [app](../../app.overview.md)

## Purpose

A follow-up check on how a patient is doing (launch ROUTE #41). Table `app.check_ins`, with `app.check_in_next_offerings`.

## Layout

| File | Role |
| --- | --- |
| `check-ins.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `check-ins.constants.ts` | value lists the CHECKs and validators share |
| `check-ins.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `check-ins.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `check-ins.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/patients/{patient_id}/check-ins` | `patient:read` |
| `POST /app/patients/{patient_id}/check-ins` | `patient:update` |
| `GET /app/check-ins/{check_in_id}` | `patient:read` |
| `PATCH /app/check-ins/{check_in_id}` | `patient:update` |
| `DELETE /app/check-ins/{check_in_id}` | `patient:update` |
| `POST /app/check-ins/{check_in_id}/restore` | `patient:update` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
