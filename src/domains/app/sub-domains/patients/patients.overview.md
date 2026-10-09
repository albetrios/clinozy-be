`src/domains/app/sub-domains/patients/`

# Patient

Parent: [app](../../app.overview.md)

## Purpose

The patient file — the clinical side of a contact (launch ROUTE #133 — routes-final §7): consents,
allergies, usual doctor, home branch, status, and everything the clinic records about the person's
care, in the nested sub-domains below. **The person lives on the contact** (P1, P2): the file carries
`contact_id` only (P3); the timeline is the contact's activity (P8, M10).

## Layout

| File / folder | Role |
| --- | --- |
| `patients.schema.ts` | `app.patients` — one live file per contact (`idx_patients_organization_contact_unique`), the counter, the K8 usual doctor, the AI ideas' stale mark (`ideas_stale_since`, D80), RLS on the organization plus `patients_ideas_sweep_read`, a `FOR SELECT` policy for the ideas sweep's cross-organization read (never purged, P7 — the maintenance role cannot write) |
| `patients.constants.ts` | types, statuses, conversion, the clinical-list limits, the patient file's one body-part list (TR8), `PT` |
| `patients.{dto,validator,serializer,types}.ts` | request shapes (a contact or an inline new one), the list's `q` (`PT-0412`, `#412`, the contact's text), the response, the export row |
| `patients.rules.ts` | one file per contact, the usual doctor on the contact's team; the shared patient-file helpers — the same-patient visit and session checks (TR3), the organization's today, the `system` entry in the contact's activity (M10) |
| `patients.repository.ts` / `.service.ts` / `.controller.ts` / `.routes.ts` | routes 1–7: the inline contact through the contacts service, the export with the contact's name and number |
| `patient-clinical-notes/` | 7.B — clinical notes, never edited (routes 8–12) |
| `patient-prescriptions/` | 7.C — prescriptions, the pharmacy queue, approval (routes 13–20) |
| `prescription-kits/` | 7.D — a doctor's own reusable lines (routes 21–26) |
| `patient-diagnoses/` | 7.E — the diagnosis catalogue (routes 27–32) |
| `patient-images/` | 7.F — photos in three albums (routes 33–38) |
| `patient-reports/` | 7.G — lab, scan, consent reports (routes 39–44) |
| `patient-treatments/` | 7.H — treatment sessions, reversed never deleted (routes 45–50) |
| `patient-check-ins/` | 7.I — how the patient is doing, the next offerings in the plan (routes 51–56) |
| `patient-reviews/` | 7.J — reviews the patient gave (routes 57–62) |
| `patient-feedback-actions/` | 7.K — what was done about a check-in or a review (routes 63–64, under their parent) |
| `patient-offerings/` | 7.L — what the patient bought, spent by treatments (routes 65–67) |
| `patient-offering-suggestions/` | 7.M — the plan (routes 68–73) |
| `patient-ideas/` | 7.N — ideas from history: the rules, or Claude's ideas refreshed in the background (route 74, D80) |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/patients` | `patient:read` |
| `GET /app/patients/exports` | `patient:export` (+ `patient:read`) |
| `POST /app/patients` (for a contact, or with a new one — `contact` needs `contact:create`) | `patient:create` |
| `GET /app/patients/{patient_id}` | `patient:read` |
| `PATCH /app/patients/{patient_id}` | `patient:update` |
| `DELETE /app/patients/{patient_id}` | `patient:delete` |
| `POST /app/patients/{patient_id}/restore` | `patient:delete` |

## Key invariants

- **One live file per contact (P1):** a second is a 409 `contact_is_patient` naming the one there —
  on create and restore; the partial unique index backs it up.
- **Opened at check-in (P10, A14):** a check-in of a contact without a file opens one (home branch
  and doctor from the visit, `lead_id` the lead), not converted — the first treatment converts (P4).
- **Never purged (P7):** soft delete only; out of `APP_RECORD_TABLES`; every table pointing at a
  patient does so `ON DELETE RESTRICT`.
- **The clinical gates (P14):** clinical notes, photos and reports are read with
  `patient:clinical_record:read` and written with `patient:update` and it; a private photo also
  needs `patient:private_album:read` (P23).
- **Tenant isolation:** ENABLE + FORCE RLS on the organization GUC; not branch-scoped (P6).
