`src/domains/app/sub-domains/medical-reps/`

# MedicalRep

Parent: [app](../../app.overview.md)

## Purpose

A manufacturer's representative who visits the store (launch ROUTE #46). Table `app.medical_reps`, with `app.medical_rep_manufacturers`.

## Layout

| File | Role |
| --- | --- |
| `medical-reps.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `medical-reps.constants.ts` | value lists the CHECKs and validators share |
| `medical-reps.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `medical-reps.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `medical-reps.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/medical-reps` | `medical_rep:read` |
| `POST /app/medical-reps` | `medical_rep:create` |
| `GET /app/medical-reps/{medical_rep_id}` | `medical_rep:read` |
| `PATCH /app/medical-reps/{medical_rep_id}` | `medical_rep:update` |
| `DELETE /app/medical-reps/{medical_rep_id}` | `medical_rep:delete` |
| `POST /app/medical-reps/{medical_rep_id}/restore` | `medical_rep:delete` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
