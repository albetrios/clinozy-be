-- Migration: patient_images_thumbnail_key
-- Created: 2026-10-31T04:16:30.298Z
-- Reference: docs/reference/data/migrations.md
--
-- A patient photo's thumbnail (feat-patient-image-thumbnails): the key of the 320 px WebP the
-- thumbnail job writes next to the photo (`<file_key without extension>.thumb.webp`). Nullable —
-- a photo has none until the job makes one, and none again once a delete removes it; the photo's
-- responses fall back to the full photo then. Existing photos get theirs from the backfill
-- (`pnpm ops:patient-image-thumbnails-backfill`), not from SQL. RLS is unchanged.

ALTER TABLE app.patient_images
  ADD COLUMN IF NOT EXISTS thumbnail_key VARCHAR(512) NULL;
