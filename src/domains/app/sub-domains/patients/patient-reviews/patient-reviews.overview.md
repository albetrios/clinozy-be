`src/domains/app/sub-domains/patients/patient-reviews/`

# Patient review

Parent: [patients](../patients.overview.md)

## Purpose

A review the patient gave — on Google, video, Instagram, the clinic's form or WhatsApp (launch
ROUTE #134 — routes-final 7.J, TR11). Table `app.patient_reviews`.

## Layout

| File | Role |
| --- | --- |
| `patient-reviews.schema.ts` | the table: the source, rating, `https://` link and file-count CHECKs, the call-back index, RLS with the purge arm |
| `patient-reviews.constants.ts` | sources, the call-back rating, the limits |
| `patient-reviews.{dto,validator,serializer,types}.ts` | the bodies, the list query (source, `needs_action`, the date range) |
| `patient-reviews.rules.ts` | the date, the visit, the confirmed uploads, the `system` entry, the call-back task (TR4), the actions |
| `patient-reviews.repository.ts` / `.service.ts` / `.controller.ts` / `.routes.ts` | routes 57–62 and 64 (an action) |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/patients/{patient_id}/reviews` | `patient:read` |
| `POST /app/patients/{patient_id}/reviews` | `patient_review:create` (launch D83 (4)) |
| `GET …/reviews/{patient_review_id}` | `patient:read` |
| `PATCH …/reviews/{patient_review_id}` | `patient_review:update` |
| `DELETE …/reviews/{patient_review_id}` | `patient_review:delete` |
| `POST …/reviews/{patient_review_id}/restore` | `patient_review:delete` |
| `POST …/reviews/{patient_review_id}/actions` | `patient_review:update` |

## Key invariants

- **Needs action (TR11):** a rating ≤ 3 with no feedback action; it creates a doctor call-back task
  when it turns on.
- **The fields (TR11):** `link` is `https://` only (DTO and CHECK); `file_keys` are confirmed
  uploads of the organization, up to 10; the visit is the patient's contact's; `review_date` is
  never in the future. No organization-wide list.
