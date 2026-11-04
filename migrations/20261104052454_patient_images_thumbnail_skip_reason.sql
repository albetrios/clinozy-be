-- Migration: patient_images_thumbnail_skip_reason
-- Created: 2026-11-04T05:24:54.000Z
-- Reference: docs/reference/data/migrations.md
--
-- A patient photo the thumbnail job cannot use keeps its full-size fallback — and, until now, a NULL
-- `thumbnail_key`, so the 15-minute sweep re-queued it on every run for its first seven days (a
-- corrupt or oversized file decoded and refused ~670 times). The job now records why it made none,
-- and the sweep and the backfill pass a photo with a reason by:
--
-- - `thumbnail_skip_reason`: `not_opted_in`, `source_missing` or `source_unusable` (the upload
--   domain's skips, UPLOAD_THUMBNAIL_SKIP_REASON_VALUES — each final for the photo's file, which
--   never changes), or `job_failed`: the photo's job failed for good — it stalled past BullMQ's
--   limit (the worker died under it, an out-of-memory kill included) or used every attempt — so a
--   file that crashes the worker is not handed to it again every 15 minutes
--   (PATIENT_IMAGE_THUMBNAIL_SKIP_REASON_VALUES). Nullable, no default, so no rewrite; every existing
--   row stays NULL (its next job decides).
-- - `chk_patient_images_thumbnail_or_skip`: a photo holds a thumbnail or a reason, never both — the
--   job clears the reason when a later run (a restore) makes the thumbnail.
--
-- Each CHECK is added NOT VALID, then validated in this same transaction: ADD CONSTRAINT's ACCESS
-- EXCLUSIVE lock is still held, so app.patient_images waits through both validation scans — one full
-- pass each (every new value is NULL, so none fails). On today's data that is milliseconds; a much
-- larger table would move the VALIDATEs to a later migration. The previous release never reads or
-- writes the column. RLS is unchanged.

ALTER TABLE app.patient_images
  ADD COLUMN IF NOT EXISTS thumbnail_skip_reason VARCHAR(20) NULL;

ALTER TABLE app.patient_images
  ADD CONSTRAINT chk_patient_images_thumbnail_skip_reason
  CHECK (thumbnail_skip_reason IN ('not_opted_in', 'source_missing', 'source_unusable', 'job_failed'))
  NOT VALID;

ALTER TABLE app.patient_images
  VALIDATE CONSTRAINT chk_patient_images_thumbnail_skip_reason;

ALTER TABLE app.patient_images
  ADD CONSTRAINT chk_patient_images_thumbnail_or_skip
  CHECK (thumbnail_key IS NULL OR thumbnail_skip_reason IS NULL)
  NOT VALID;

ALTER TABLE app.patient_images
  VALIDATE CONSTRAINT chk_patient_images_thumbnail_or_skip;
