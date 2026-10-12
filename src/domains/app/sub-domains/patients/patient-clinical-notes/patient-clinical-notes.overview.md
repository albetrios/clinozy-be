`src/domains/app/sub-domains/patients/patient-clinical-notes/`

# Patient clinical note

Parent: [patients](../patients.overview.md)

## Purpose

One clinical note on a patient file — a complaint, finding, diagnosis, treatment or future
suggestion, or safety check (launch ROUTE #133 — routes-final 7.B). The visit's consult notes live
here (A10). Table `app.patient_clinical_notes`.

## Layout

| File | Role |
| --- | --- |
| `patient-clinical-notes.schema.ts` | the table: the six kinds, the visit and catalogue links (`chk_patient_clinical_notes_patient_diagnosis`), RLS |
| `patient-clinical-notes.constants.ts` | the kinds, the text limit |
| `patient-clinical-notes.{dto,validator,serializer,types}.ts` | the create body (no update — never edited, P12), the list query |
| `patient-clinical-notes.rules.ts` | the visit is the patient's (TR3); a new note's `system` entry (M10) |
| `patient-clinical-notes.repository.ts` / `.service.ts` / `.controller.ts` / `.routes.ts` | routes 8–12, nested under the patient |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/patients/{patient_id}/clinical-notes` | `patient:clinical_record:read` |
| `POST /app/patients/{patient_id}/clinical-notes` | `patient:update` + `patient:clinical_record:read` |
| `GET …/clinical-notes/{patient_clinical_note_id}` | `patient:clinical_record:read` |
| `DELETE …/clinical-notes/{patient_clinical_note_id}` | `patient:update` + `patient:clinical_record:read` |
| `POST …/clinical-notes/{patient_clinical_note_id}/restore` | `patient:update` + `patient:clinical_record:read` |

## Key invariants

- **Never edited (P12):** a wrong note is deleted with a reason and written again.
- **A `diagnosis` note may name the catalogue** (`patient_diagnosis_id`); any other kind may not
  (400, and the CHECK).
- **The activity entry** shows only to `patient:clinical_record:read` holders (M10).
