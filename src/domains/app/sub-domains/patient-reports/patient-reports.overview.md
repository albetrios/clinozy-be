`src/domains/app/sub-domains/patient-reports/`

# PatientReport

Parent: [app](../../app.overview.md)

## Purpose

A lab, scan or consent document of a patient (launch ROUTE #28). Table `app.patient_reports`.

## Layout

| File | Role |
| --- | --- |
| `patient-reports.schema.ts` | the table, its CHECKs, indexes and RLS policy |
| `patient-reports.constants.ts` | value lists the CHECKs and validators share |
| `patient-reports.{dto,validator,serializer,types}.ts` | request shapes, parsing, the response |
| `patient-reports.repository.ts` / `.service.ts` / `.controller.ts` | the shared app record layers on this table |
| `patient-reports.routes.ts` | the routes below |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/patients/{patient_id}/reports` | `patient:read` |
| `POST /app/patients/{patient_id}/reports` | `patient:update` |
| `GET /app/patient-reports/{patient_report_id}` | `patient:read` |
| `PATCH /app/patient-reports/{patient_report_id}` | `patient:update` |
| `DELETE /app/patient-reports/{patient_report_id}` | `patient:update` |
| `POST /app/patient-reports/{patient_report_id}/restore` | `patient:update` |

## Key invariants

- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; the retention-cleanup arm (USING only) lets the deleted-record purge (D38) erase rows.
- **Soft delete carries its reason:** `delete_reason` set exactly when `deleted_at` is; `other` needs a `delete_note`.
- **References are public ids:** a referenced id that is no live record of the organization is a 400 naming the field.
- **Stale saves refused (D43):** a `PATCH` with an older `expected_updated_at` is a 409 naming who changed it and when.
