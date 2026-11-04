-- Migration: patient_images_thumbnail_skip_reason
-- Created: 2026-11-04T05:24:54.000Z
-- Reference: docs/reference/data/migrations.md
--
-- A patient photo the thumbnail job cannot use keeps its full-size fallback — and, until now, a NULL
-- `thumbnail_key`, so the 15-minute sweep re-queued it on every run for its first seven days (a
-- corrupt or oversized file decoded and refused ~670 times). The job now records why it made none,
-- and the sweep and the backfill pass a photo with a reason by:
--
-- - `thumbnail_skip_reason`: `not_opted_in`, `source_missing` or `source_unusable`
--   (UPLOAD_THUMBNAIL_SKIP_REASON_VALUES) — each final for the photo's file, which never changes.
--   Nullable, no default, so no rewrite; every existing row stays NULL (its next job decides).
-- - `chk_patient_images_thumbnail_or_skip`: a photo holds a thumbnail or a reason, never both — the
--   job clears the reason when a later run (a restore) makes the thumbnail.
--
-- Each CHECK is added NOT VALID and validated after; the column is all NULL, so the scan passes at
-- once. The previous release never reads or writes the column. RLS is unchanged.

ALTER TABLE app.patient_images
  ADD COLUMN IF NOT EXISTS thumbnail_skip_reason VARCHAR(20) NULL;

ALTER TABLE app.patient_images
  ADD CONSTRAINT chk_patient_images_thumbnail_skip_reason
  CHECK (thumbnail_skip_reason IN ('not_opted_in', 'source_missing', 'source_unusable'))
  NOT VALID;

ALTER TABLE app.patient_images
  VALIDATE CONSTRAINT chk_patient_images_thumbnail_skip_reason;

ALTER TABLE app.patient_images
  ADD CONSTRAINT chk_patient_images_thumbnail_or_skip
  CHECK (thumbnail_key IS NULL OR thumbnail_skip_reason IS NULL)
  NOT VALID;

ALTER TABLE app.patient_images
  VALIDATE CONSTRAINT chk_patient_images_thumbnail_or_skip;
