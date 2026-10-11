`src/domains/app/sub-domains/patients/patient-reports/`

# Patient report

Parent: [patients](../patients.overview.md)

## Purpose

A lab, scan, consent or other document of a patient, up to ten confirmed uploads (launch ROUTE #133
— routes-final 7.G, P29). Table `app.patient_reports`.

## Layout

| File | Role |
| --- | --- |
| `patient-reports.schema.ts` | the table: the type, up to ten files, notes up to 1000, RLS |
| `patient-reports.{constants,dto,validator,serializer,types}.ts` | the bodies, the list query |
| `patient-reports.rules.ts` | the files are confirmed uploads; a new report's `system` entry (M10); each file's name and view link (`decorate`, D86) |
| `patient-reports.repository.ts` / `.service.ts` / `.controller.ts` / `.routes.ts` | routes 39–44, nested under the patient |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/patients/{patient_id}/reports` | `patient:clinical_record:read` |
| `POST /app/patients/{patient_id}/reports` | `patient:update` + `patient:clinical_record:read` |
| `GET …/reports/{patient_report_id}` | `patient:clinical_record:read` |
| `PATCH …/reports/{patient_report_id}` | `patient:update` + `patient:clinical_record:read` |
| `DELETE …/reports/{patient_report_id}` | `patient:update` + `patient:clinical_record:read` |
| `POST …/reports/{patient_report_id}/restore` | `patient:update` + `patient:clinical_record:read` |

## Key invariants

- **Clinical (P29):** read with the clinical code; written with `patient:update` and it; the
  activity entry shows only to its holders (M10).
- **A link that opens each file (D86):** every read answers `files` — each of `file_keys`, in order,
  with the upload's `file_name` and `file_url`, a presigned GET valid 15 minutes
  (`PRESIGNED_URL_EXPIRY_SECONDS`), made fresh on every response and served inline under that name.
  Whoever may read the report gets the links; nobody else does. A file whose upload is gone answers
  `null` for both (the `fileReadUrls` port, one upload read per page).
