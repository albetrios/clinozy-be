`src/domains/app/sub-domains/patients/patient-prescriptions/`

# Patient prescription

Parent: [patients](../patients.overview.md)

## Purpose

A doctor's prescription for a patient — a draft until a prescriber approves it, then final (launch
ROUTE #133 — routes-final 7.C, P15, P16, P27). Table `app.patient_prescriptions`.

## Layout

| File | Role |
| --- | --- |
| `patient-prescriptions.schema.ts` | the table: the counter (`RX-500`), the lines as `jsonb` (≤ 30), the K8 doctor and approver, `chk_patient_prescriptions_approved`, the pharmacy-queue index, RLS |
| `patient-prescriptions.constants.ts` | statuses, print languages, the line and text limits |
| `patient-prescriptions.{dto,validator,serializer,types}.ts` | the line shape shared with kits, the bodies, the list query (`q` a number only) |
| `patient-prescriptions.rules.ts` | live medicines on the lines (shared with kits), the visit, final once approved, the approver, the approval's `system` entry |
| `patient-prescriptions.repository.ts` / `.service.ts` / `.controller.ts` / `.routes.ts` | routes 13–20: the queue top-level, the rest nested under the patient |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/patient-prescriptions` (the pharmacy queue) | `patient_prescription:read` |
| `GET /app/patients/{patient_id}/prescriptions` | `patient_prescription:read` |
| `POST /app/patients/{patient_id}/prescriptions` | `patient_prescription:create` |
| `GET …/prescriptions/{patient_prescription_id}` | `patient_prescription:read` |
| `PATCH …/prescriptions/{patient_prescription_id}` (a draft) | `patient_prescription:update` |
| `POST …/prescriptions/{patient_prescription_id}/approve` | `patient_prescription:update` |
| `DELETE …/prescriptions/{patient_prescription_id}` (a draft) | `patient_prescription:delete` |
| `POST …/prescriptions/{patient_prescription_id}/restore` | `patient_prescription:delete` |

## Key invariants

- **Final once approved (P15):** `PATCH` and `DELETE` are a 409 `prescription_approved`; approving
  needs a line and records the caller's membership.
- **Lines name live medicines (P15):** a line's `medicine_id` that is no live medicine is a 400 on
  `items`.
- **The path's patient wins** over `?patient_id=` on the nested list (TR3, the kernel).
