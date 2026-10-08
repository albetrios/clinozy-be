`src/domains/app/sub-domains/patients/patient-treatments/`

# Patient treatment

Parent: [patients](../patients.overview.md)

## Purpose

One treatment session recorded for a patient — reversed with a reason, never deleted (launch
ROUTE #134 — routes-final 7.H, TR6–TR8, TR13). Table `app.patient_treatments`.

## Layout

| File | Role |
| --- | --- |
| `patient-treatments.schema.ts` | the table (no soft delete): the template, body-part, session-number, aftercare and status CHECKs, the spent session held while done, the reverse pair, the not-billed index, the K8 team keys, RLS |
| `patient-treatments.constants.ts` | templates, aftercare calls, statuses, the limits |
| `patient-treatments.{dto,validator,serializer,types}.ts` | the bodies, the reverse body, the list query (`is_billed`, the performed days), `is_billed` |
| `patient-treatments.rules.ts` | the checks, spending and giving back a bought session, the file's conversion (P4), the `system` entries, `latest_check_in` |
| `patient-treatments.repository.ts` / `.service.ts` / `.controller.ts` / `.routes.ts` | routes 45–50; the `reverse` transition |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/patient-treatments` | `patient_treatment:read` |
| `GET /app/patients/{patient_id}/treatments` | `patient_treatment:read` |
| `POST /app/patients/{patient_id}/treatments` | `patient_treatment:create` |
| `GET …/treatments/{patient_treatment_id}` | `patient_treatment:read` |
| `PATCH …/treatments/{patient_treatment_id}` | `patient_treatment:update` |
| `POST …/treatments/{patient_treatment_id}/reverse` | `patient_treatment:update` |

## Key invariants

- **Paid before the visit (TR7):** `patient_offering_id` (create only) spends one session in one
  guarded `sessions_used + 1` — the patient's, the same offering, not expired (409
  `offering_expired`), a session left (409 `offering_used_up`); its count becomes `session_number`,
  and a linked session's number and offering never change.
- **Reversed, never deleted (TR6):** `reverse` is final, gives the session back and clears the link
  in the same write; a reversed session can't be changed (409 `treatment_reversed`).
- **The checks (TR8):** `performed_at` never in the future, the visit checked in or completed, a
  sent offering active (O13). The patient's first session converts the file (P4).
