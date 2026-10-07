`src/domains/app/sub-domains/medical-rep-visits/`

# MedicalRepVisit

Parent: [app](../../app.overview.md)

## Purpose

One visit of a medical rep (D36) (launch ROUTE #47). Table `app.medical_rep_visits`.

## Layout

| File | Role |
| --- | --- |
| `medical-rep-visits.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `medical-rep-visits.constants.ts` | value lists the CHECKs and validators share |
| `medical-rep-visits.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `medical-rep-visits.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `medical-rep-visits.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/medical-reps/{medical_rep_id}/visits` | `medical_rep:read` |
| `POST /app/medical-reps/{medical_rep_id}/visits` | `medical_rep:update` |
| `GET /app/medical-rep-visits/{medical_rep_visit_id}` | `medical_rep:read` |
| `PATCH /app/medical-rep-visits/{medical_rep_visit_id}` | `medical_rep:update` |
| `DELETE /app/medical-rep-visits/{medical_rep_visit_id}` | `medical_rep:update` |
| `POST /app/medical-rep-visits/{medical_rep_visit_id}/restore` | `medical_rep:update` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
