# Patient file and clinical record

Status: ready
Kind: screen
Depends on: patients, appointments, offerings
Tables: `diagnosis`, `patient_clinical_note`, `prescription`, `prescription_kit`, `patient_image`, `patient_report`, `patient_note`, `patient_package`, `offering_suggestion`, `patient_idea`, `treatment`, `check_in`, `review`, `feedback_action` — [db-changes.md](../../db-changes.md)

## Stories

- As a Doctor I want the whole patient record in one file so that I treat with full context.
- As a Doctor I want to draft, approve and print prescriptions so that the pharmacy gets a signed order.
- As a Therapist I want to record treatment sessions and photos so that progress is tracked.

## Rules

- Doctor and Admin prescribe; a prescription is a draft until approved (`access.prescribe`)
- A treatment session is reversed with a reason, never deleted (`operations.treatments`)
- The Accountant sees only billing; Marketing only reviews (`access.accountant-billing`)
- AI ideas use a de-identified summary, Data consent only (`quality.privacy`)

## Acceptance criteria

- **patient-file.1** The file shows every section; the Accountant sees billing only and Marketing reviews only — intake-files/PRD.md:69
- **patient-file.2** A prescription is drafted with the quick line, approved by a Doctor or Admin, printed and sent to the pharmacy — intake-files/PRD.md:185
- **patient-file.3** Treatments are recorded by Doctor or Therapist; a session is reversed with a reason, never deleted — intake-files/PRD.md:137
- **patient-file.4** Photos upload up to 15 MB into albums, with location data removed; the Private album only for Doctor and Admin — intake-files/PRD.md:138
- **patient-file.5** The plan lists offering suggestions (Planned → Invoiced) and ideas from history (AI, rules as fallback) — intake-files/PRD.md:140
- **patient-file.6** A worse check-in shows Action needed and creates a doctor call-back task — intake-files/PRD.md:124

## Work items

- `data.stage-clinical-record`
- `data.stage-treatments-feedback`
- `data.package-sessions`
- `operations.patient-file`
- `operations.prescriptions`
- `operations.treatments`
- `operations.images-and-reports`
- `operations.feedback`
- `access.prescribe`
- `access.treatments`
- `access.accountant-billing`
- `access.marketing-reviews`
- `access.private-album`
- `files.patient-photos`
- `files.reports`
- `files.review-videos`
- `files.upload-limits`
- `files.prints`
- `integrations.ai-ideas`
- `quality.privacy`
- `notifications.visit-share`
- `background.visit-share`
- `background.photo-cleanup`
- `background.photo-pairing`
- `background.patient-ideas`
