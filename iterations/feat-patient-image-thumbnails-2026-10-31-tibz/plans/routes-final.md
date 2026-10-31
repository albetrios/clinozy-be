# Clinozy API — final routes, sub-domain by sub-domain (feat-patient-image-thumbnails-2026-10-31-tibz)

Started from `main` on branch `feat/patient-image-thumbnails`. Shaped by
[`routes-final-template.md`](../../../docs/design-workflow/process/routes-final-template.md).

**How to read the tables:** paths are under `/api/v1/app`; `{x_id}` is a public id; **Gate** is the
permission the caller needs; **Idem** `req` = `X-Idempotency-Key` required.

## Sub-domains (in build order)

| # | Sub-domain | Folder (`src/domains/app/sub-domains/…`) | Paths (`/app/…`) | Routes | Builds on | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Patient images — thumbnails | `patients/patient-images/` | `patients/{patient_id}/images…` | 6 reshaped, 0 new | upload (the thumbnail capability) | **final (rev 2, confirmed 2026-10-31)** — [PT16](decisions.md), [PT19](decisions.md) |

App total: **0 routes added, 0 removed, 6 reshaped** — `docs/routes.txt` keeps its count.

## 1. Patient images — thumbnails — final (rev 1, confirmed 2026-10-31)

| # | Method | Path | Gate | Idem | Change |
| --- | --- | --- | --- | --- | --- |
| 33 | GET | `/patients/{patient_id}/images` | `patient:clinical_record:read` | — | each photo + `thumbnail_url` |
| 34 | POST | `/patients/{patient_id}/images` | `patient:update` + `patient:clinical_record:read` | req | + `thumbnail_url`; the thumbnail job after the commit |
| 35 | GET | `/patients/{patient_id}/images/{patient_image_id}` | `patient:clinical_record:read` | — | + `thumbnail_url` |
| 36 | PATCH | `/patients/{patient_id}/images/{patient_image_id}` | `patient:update` + `patient:clinical_record:read` | — | + `thumbnail_url` |
| 37 | DELETE | `/patients/{patient_id}/images/{patient_image_id}` | `patient:update` + `patient:clinical_record:read` | — | removes the thumbnail after the commit |
| 38 | POST | `/patients/{patient_id}/images/{patient_image_id}/restore` | `patient:update` + `patient:clinical_record:read` | req | + `thumbnail_url`; a new thumbnail after the commit |

Rules: `thumbnail_url` is the thumbnail's 15-minute link, or `file_url`'s value when there is none;
it follows the photo's own read gate (the private album stays private); `thumbnail_key` is
returned beside `file_key`, null until the thumbnail exists ([PT19](decisions.md), rev 2).

**Route review final — 2026-10-31.** Every sub-domain is confirmed; the frontend may kick off on these routes.
