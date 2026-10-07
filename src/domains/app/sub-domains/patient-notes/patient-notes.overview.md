`src/domains/app/sub-domains/patient-notes/`

# PatientNote

Parent: [app](../../app.overview.md)

## Purpose

A timeline note on a patient (launch ROUTE #29). Table `app.patient_notes`.

## Layout

| File | Role |
| --- | --- |
| `patient-notes.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `patient-notes.constants.ts` | value lists the CHECKs and validators share |
| `patient-notes.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `patient-notes.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `patient-notes.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/patients/{patient_id}/notes` | `patient:read` |
| `POST /app/patients/{patient_id}/notes` | `patient:update` |
| `GET /app/patient-notes/{patient_note_id}` | `patient:read` |
| `PATCH /app/patient-notes/{patient_note_id}` | `patient:update` |
| `DELETE /app/patient-notes/{patient_note_id}` | `patient:update` |
| `POST /app/patient-notes/{patient_note_id}/restore` | `patient:update` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
