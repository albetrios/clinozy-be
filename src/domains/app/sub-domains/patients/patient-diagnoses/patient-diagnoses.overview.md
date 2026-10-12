`src/domains/app/sub-domains/patients/patient-diagnoses/`

# Patient diagnosis

Parent: [patients](../patients.overview.md)

## Purpose

The organization's diagnosis catalogue a clinical note of kind `diagnosis` picks from (launch
ROUTE #133 — routes-final 7.E, P18, P28). Table `app.patient_diagnoses` — no patient; its routes are
top-level.

## Layout

| File | Role |
| --- | --- |
| `patient-diagnoses.schema.ts` | the table: the name unique in the organization in any case among live entries, RLS |
| `patient-diagnoses.{constants,dto,validator,serializer,types}.ts` | the bodies, the list query (by name by default) |
| `patient-diagnoses.repository.ts` / `.service.ts` / `.controller.ts` / `.routes.ts` | routes 27–32 |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/patient-diagnoses` | `organization:read` (every member) |
| `POST /app/patient-diagnoses` | `patient_prescription:create` |
| `GET /app/patient-diagnoses/{patient_diagnosis_id}` | `organization:read` |
| `PATCH /app/patient-diagnoses/{patient_diagnosis_id}` | `patient_prescription:update` |
| `DELETE /app/patient-diagnoses/{patient_diagnosis_id}` | `patient_prescription:delete` |
| `POST /app/patient-diagnoses/{patient_diagnosis_id}/restore` | `patient_prescription:delete` |
