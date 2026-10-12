`src/domains/app/sub-domains/patients/patient-images/`

# Patient image

Parent: [patients](../patients.overview.md)

## Purpose

A photo of a patient in one of three albums — `general`, `private`, `lhr` — optionally filed under
its visit, its session and a stage (launch ROUTE #133 — routes-final 7.F, P19, P23–P26). Table
`app.patient_images`.

## Layout

| File | Role |
| --- | --- |
| `patient-images.schema.ts` | the table: the album, stage and body-part CHECKs, an upload filed once, the tab index, RLS |
| `patient-images.constants.ts` | albums, stages, the photo upload's types and size |
| `patient-images.{dto,validator,serializer,types}.ts` | the bodies, the list query (album tab, visit, session, stage, body part) |
| `patient-images.rules.ts` | the private album's read scope and write check, the upload check, `taken_on`, the links, the `system` entry (marked private), `service_label`, `file_url` (D86) |
| `patient-images.repository.ts` / `.service.ts` / `.controller.ts` / `.routes.ts` | routes 33–38; the list's `meta.album_counts` |

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/patients/{patient_id}/images` | `patient:clinical_record:read` |
| `POST /app/patients/{patient_id}/images` | `patient:update` + `patient:clinical_record:read` |
| `GET …/images/{patient_image_id}` | `patient:clinical_record:read` |
| `PATCH …/images/{patient_image_id}` | `patient:update` + `patient:clinical_record:read` |
| `DELETE …/images/{patient_image_id}` | `patient:update` + `patient:clinical_record:read` |
| `POST …/images/{patient_image_id}/restore` | `patient:update` + `patient:clinical_record:read` |

A private photo also needs `patient:private_album:read` on every route (P23).

## Key invariants

- **The private album is its holders' alone (P23):** without the code a private photo is not
  listed, not counted, a 404 by id, and its activity entry is hidden (`is_private_photo`, PC16).
- **The upload (P19, P25):** a confirmed JPG or PNG of the organization, up to 15 MB, filed once
  (409 `image_exists`); `file_name` is the upload's.
- **Filed without its location (WC-42, D79):** before a photo is filed, the upload domain rewrites
  its stored JPEG / PNG without the EXIF GPS block and XMP (`removeImageLocation`; the capture time
  and orientation stay); a storage failure files nothing. `PATIENT_IMAGE_LOCATION_REMOVAL_ENABLED`
  (on, required on in production) switches it.
- **A link that shows the photo (D86):** every read answers `file_url` — a presigned GET of the
  upload, valid 15 minutes (`PRESIGNED_URL_EXPIRY_SECONDS`), made fresh on every response and served
  inline under the uploaded file's name; `null` when the upload is gone. Only a photo the caller may
  read is answered at all, so a private photo's link reaches only the album's holders (the
  `fileReadUrls` port, one upload read per page).
- **Pairing (WC-43):** a session's `before` and `after` photos of one body part pair on
  `patient_treatment_id`, `stage` and `body_part` (P24) — read, not computed.
- **The links (P24, P25, TR3):** the visit is the patient's contact's and checked in or completed;
  the session is the patient's; `taken_on` is never in the future.
