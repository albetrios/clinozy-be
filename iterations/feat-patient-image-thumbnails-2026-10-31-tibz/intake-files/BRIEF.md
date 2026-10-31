# Brief — patient photo grids load small thumbnails, the opened photo stays full size

## What changes

- A patient image (`app.patient_images`) gains `thumbnail_key`, nullable: a thumbnail may not
  exist yet.
- When a patient image is created, a background job makes a small thumbnail from the stored photo
  (longest side 320 px, no enlargement, EXIF orientation honoured, metadata stripped, WebP quality
  80), saves it next to the photo through the existing object storage port and sets
  `thumbnail_key`. A failed thumbnail never fails the upload; the image has no thumbnail until a
  retry or the sweep makes one.
- The thumbnail capability is a common part of the upload domain (a pure buffer transform plus an
  upload service method that reads the source and writes `<file_key without extension>.thumb.webp`
  next to it, and a signed read for thumbnail keys under the organization's own prefix), opted in
  per upload purpose for image types only. Only patient images use it now.
- Image responses gain `thumbnail_url`: the signed link of the thumbnail for grids, falling back to
  the full photo's link when `thumbnail_key` is empty. `file_url` stays the full photo, used when a
  photo is opened.
- A one-off backfill makes thumbnails for every existing image without one, organization by
  organization (migrated Cresence photos included); dry run by default, safe to re-run, resumable.
- Deleting an image also deletes its thumbnail.

## Why

Every photo grid (the patient file's albums, the visit and session photos) downloads full-size
photos — up to 15 MB each — so grids are slow and costly on clinic connections.

## Affected screens, entities and routes

- Screens: the patient file's photo grids (thumbnail) and the opened photo (full size) — clinozy-fe.
- Entities: `patient_images` (`thumbnail_key`).
- Routes: `GET /app/patients/{patient_id}/images`, `POST /app/patients/{patient_id}/images`,
  `GET|PATCH|DELETE /app/patients/{patient_id}/images/{patient_image_id}`,
  `POST /app/patients/{patient_id}/images/{patient_image_id}/restore` — each response gains
  `thumbnail_url`; no route added, removed or re-gated.

## Rules

- The thumbnail job follows `docs/reference/runtime/queue-and-worker-rules.md`: enqueued after the
  commit, a deliberate job identity, a lost-enqueue sweep, tenant jobs carry
  `organizationPublicId`, worker database contexts, no storage call inside a database context.
- A thumbnail key is not an upload row: its signed read checks the key sits under the
  organization's own prefix.
- `thumbnail_url` follows the photo's own gate (the private album stays private).
- Never run the backfill on production from this work.

## Acceptance criteria

- [ ] `patient_images.thumbnail_key` exists, nullable, with its migration and RLS unchanged.
- [ ] Creating a photo enqueues a thumbnail job after the commit; the job writes a 320 px WebP next
      to the photo and sets `thumbnail_key`; an enqueue or thumbnail failure never fails the create.
- [ ] Every image response carries `thumbnail_url` — the thumbnail's link, or the full photo's when
      there is none; `file_url` is unchanged.
- [ ] Deleting a photo removes its thumbnail object and clears `thumbnail_key`; restoring it makes
      one again.
- [ ] A sweep re-enqueues images whose enqueue was lost.
- [ ] A backfill script (dry run by default, `--apply`) enqueues a thumbnail for every live image
      without one, organization by organization; re-running it is safe.
- [ ] `sharp` loads inside both production images.

## Out of scope

Deleting the stored full-size photo; thumbnails for any other upload purpose or record (the
capability is ready, nothing else opts in); running the backfill on any hosted database.
