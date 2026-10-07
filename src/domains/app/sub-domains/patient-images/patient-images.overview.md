`src/domains/app/sub-domains/patient-images/`

# PatientImage

Parent: [app](../../app.overview.md)

## Purpose

A clinical photo of a patient (the Private album is Doctor and Admin only) (launch ROUTE #27). Table `app.patient_images`.

## Layout

| File | Role |
| --- | --- |
| `patient-images.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `patient-images.constants.ts` | value lists the CHECKs and validators share |
| `patient-images.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `patient-images.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `patient-images.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/patients/{patient_id}/images` | `clinical_record:read` |
| `POST /app/patients/{patient_id}/images` | `patient:update` |
| `GET /app/patient-images/{patient_image_id}` | `clinical_record:read` |
| `PATCH /app/patient-images/{patient_image_id}` | `patient:update` |
| `DELETE /app/patient-images/{patient_image_id}` | `patient:update` |
| `POST /app/patient-images/{patient_image_id}/restore` | `patient:update` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
