# feat-patient-image-thumbnails-2026-10-31-tibz — route changes

| NEW | CHANGED | REMOVED |
| --- | --- | --- |
| 0 | 6 | 0 |

Every patient image route answers each photo with `thumbnail_url` ([PT5](decisions.md)) — additive
on `v1`; gates, statuses and idempotency unchanged.

| Method | Path (`/api/v1/app`) | Before | After | Built |
| --- | --- | --- | --- | --- |
| GET | `/patients/{patient_id}/images` | photos with `file_url` | + `thumbnail_url` | AS-BUILT #3 |
| POST | `/patients/{patient_id}/images` | the photo | + `thumbnail_url` (the full photo until the job runs); enqueues the thumbnail | AS-BUILT #2, #3 |
| GET | `/patients/{patient_id}/images/{patient_image_id}` | the photo | + `thumbnail_url` | AS-BUILT #3 |
| PATCH | `/patients/{patient_id}/images/{patient_image_id}` | the photo | + `thumbnail_url` | AS-BUILT #3 |
| DELETE | `/patients/{patient_id}/images/{patient_image_id}` | 204 | 204; enqueues the thumbnail's removal | AS-BUILT #2 |
| POST | `/patients/{patient_id}/images/{patient_image_id}/restore` | the photo | + `thumbnail_url`; enqueues a new thumbnail | AS-BUILT #2, #3 |
