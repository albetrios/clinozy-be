-- migration-safety: allow add_column_not_null_without_default reason="Pre-release: the table holds no rows when this runs, so the column is NOT NULL from the start — there is nothing to backfill."
-- Audit rows get a public id (`aud_…`). The audit API identifies a row by it and the daily S3
-- export writes it as each line's `id`; the bigserial never leaves the database — a restore
-- reissues it, so an archived line keyed by it would point at a different event. Writers mint
-- the id with generatePublicId('auditLog').
--
-- No unique index: hosted environments may RANGE-partition audit.logs by created_at, and a
-- unique index there must include the partition key. 21 random characters make a collision
-- negligible, as for request ids.
ALTER TABLE audit.logs
  ADD COLUMN IF NOT EXISTS public_id VARCHAR(28) NOT NULL;
