`src/domains/app/sub-domains/patient-clinical-notes/`

# PatientClinicalNote

Parent: [app](../../app.overview.md)

## Purpose

One short clinical note item — a complaint, diagnosis, treatment or future suggestion — with who added it and when (launch ROUTE #24). Table `app.patient_clinical_notes`.

## Layout

| File | Role |
| --- | --- |
| `patient-clinical-notes.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `patient-clinical-notes.constants.ts` | value lists the CHECKs and validators share |
| `patient-clinical-notes.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `patient-clinical-notes.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `patient-clinical-notes.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/patients/{patient_id}/clinical-notes` | `clinical_record:read` |
| `POST /app/patients/{patient_id}/clinical-notes` | `patient:update` |
| `GET /app/patient-clinical-notes/{patient_clinical_note_id}` | `clinical_record:read` |
| `DELETE /app/patient-clinical-notes/{patient_clinical_note_id}` | `patient:update` |
| `POST /app/patient-clinical-notes/{patient_clinical_note_id}/restore` | `patient:update` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
