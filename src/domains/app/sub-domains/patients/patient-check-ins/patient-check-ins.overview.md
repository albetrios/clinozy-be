`src/domains/app/sub-domains/patients/patient-check-ins/`

# Patient check-in

Parent: [patients](../patients.overview.md)

## Purpose

How a patient is doing after a visit or a session — a feel, a score, how the advice was followed,
and the next offerings put in the plan (launch ROUTE #134 — routes-final 7.I, TR9, TR10). Table
`app.patient_check_ins`.

## Layout

| File | Role |
| --- | --- |
| `patient-check-ins.schema.ts` | the table: the feel, score and followed CHECKs, the card and latest-per-session indexes, the call-back index, RLS with the purge arm |
| `patient-check-ins.constants.ts` | feels, followed values, the call-back score, the plan's limit |
| `patient-check-ins.{dto,validator,serializer,types}.ts` | the bodies, the list query (feel, `needs_action`, the date range) |
| `patient-check-ins.rules.ts` | the date, the links, the server-filled context, the `system` entry, the call-back task (TR4), `score_change`, `next_offering_ids`, the actions; the call-back helpers reviews share |
| `patient-check-ins.repository.ts` | the previous score, the plan rows, a session's latest check-in, planning the next offerings |
| `.service.ts` / `.controller.ts` / `.routes.ts` | routes 51–56 and 63 (an action); `next_offering_ids` planned in the check-in's transaction |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/patients/{patient_id}/check-ins` | `patient:read` |
| `POST /app/patients/{patient_id}/check-ins` | `patient:update` |
| `GET …/check-ins/{patient_check_in_id}` | `patient:read` |
| `PATCH …/check-ins/{patient_check_in_id}` | `patient:update` |
| `DELETE …/check-ins/{patient_check_in_id}` | `patient:update` |
| `POST …/check-ins/{patient_check_in_id}/restore` | `patient:update` |
| `POST …/check-ins/{patient_check_in_id}/actions` | `patient:update` |

## Key invariants

- **Needs action (TR9):** feel `worse` or a score ≤ 4 with no feedback action; it creates a doctor
  call-back task when it turns on.
- **Next offerings live in the plan (TR10):** `next_offering_ids` (create only, up to 10 active
  offerings) become `planned` suggestions linked by `patient_check_in_id`; one the plan already
  holds is skipped, and the list reads them back.
- **The links (TR3):** the visit and the session are the patient's; `check_in_date` is never in the
  future.
