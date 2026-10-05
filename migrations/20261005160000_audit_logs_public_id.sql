-- Audit rows get a public id (`aud_…`). The audit API identifies a row by it and the daily S3
-- export writes it as each line's `id`; the bigserial never leaves the database — a restore
-- reissues it, so an archived line keyed by it would point at a different event.
--
-- Existing rows are filled by the ADD COLUMN itself: a volatile DEFAULT is evaluated per row
-- while the table is rewritten. An UPDATE backfill is not possible — audit.logs is append-only
-- (RLS has no UPDATE policy). The default is dropped afterwards: writers mint the id with
-- generatePublicId('auditLog').
--
-- No unique index: hosted environments may RANGE-partition audit.logs by created_at, and a
-- unique index there must include the partition key. 21 random characters make a collision
-- negligible, as for request ids.
ALTER TABLE audit.logs
  ADD COLUMN IF NOT EXISTS public_id VARCHAR(28) NOT NULL
  DEFAULT ('aud_' || substr(md5(random()::text || clock_timestamp()::text), 1, 21));
--> statement-breakpoint
ALTER TABLE audit.logs ALTER COLUMN public_id DROP DEFAULT;
