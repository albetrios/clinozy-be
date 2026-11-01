-- migration-transaction: none reason="CREATE INDEX CONCURRENTLY cannot run inside a transaction"
-- Migration: upload_record_binding
-- Created: 2026-11-01T09:00:00.000Z
-- Reference: docs/reference/data/migrations.md
--
-- C-2: an uploaded file belongs to the record it was first attached to. `bound_resource` names the
-- kind of record (`patient_report`, `payment`, …) and `bound_public_id` its public id; both are NULL
-- until the first attach and stay NULL for rows written before this migration (no backfill — nothing
-- is deployed). A record write binds its keys in one guarded UPDATE that refuses a key bound to
-- another record, and a read link is signed only for the record the key is bound to. RLS is unchanged.
-- The index serves the orphan sweep (G2-5) and is built CONCURRENTLY so no upload waits.

ALTER TABLE upload.uploads
  ADD COLUMN IF NOT EXISTS bound_resource VARCHAR(40) NULL,
  ADD COLUMN IF NOT EXISTS bound_public_id VARCHAR(28) NULL;

--> statement-breakpoint
ALTER TABLE upload.uploads
  ADD CONSTRAINT chk_uploads_bound_pair
  CHECK ((bound_resource IS NULL) = (bound_public_id IS NULL))
  NOT VALID;

--> statement-breakpoint
ALTER TABLE upload.uploads
  VALIDATE CONSTRAINT chk_uploads_bound_pair;

--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_uploads_bound_record
  ON upload.uploads (bound_resource, bound_public_id)
  WHERE bound_resource IS NOT NULL;
