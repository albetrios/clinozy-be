-- Migration: upload_record_binding_backfill
-- Created: 2026-11-04T04:39:12.000Z
-- Reference: docs/reference/data/migrations.md
--
-- C-2 follow-up: 20261101090000_upload_record_binding added `bound_resource` / `bound_public_id` with no
-- backfill, on the belief that nothing was deployed. Production holds every upload v9.4.1 attached, all
-- unbound — and a read link is signed only for the record a file is bound to, so every existing patient
-- photo and report file lost its link. This binds each confirmed, live, unbound upload to the record
-- that holds its key, exactly as a record write binds it (UploadRepository.bindKeysToRecord):
--
-- - The records are UPLOAD_BOUND_RECORD_TABLES (upload-bound-records.ts) with the key column each
--   record's `uploadFields` names: patient_images.file_key (patient_image), patient_reports.file_keys
--   (patient_report), patient_reviews.file_keys (patient_review), contact_activities.attachment_keys
--   (contact_activity), payments.attachment_keys (payment). A key binds only to a record of its own
--   organization.
-- - A key several records hold binds to one of them: a live record before a deleted one (a deleted
--   record's purge tombstones the files bound to it, G2-5), then the earliest created — the first
--   attach — then the record kind and id, so the choice is stable.
-- - Soft-deleted records keep their files bound, as a record write leaves them, so a restore shows them
--   again and the purge tombstones them.
-- - An upload no record holds stays unbound (the next record write that sends it binds it), and an
--   upload already bound is left alone, so a re-run changes nothing.
--
-- Rows the previous release writes after this runs are bound by the trigger the previous migration
-- (previous_release_write_compatibility) installed first, so no record falls between the two.
--
-- The six tables are FORCE RLS and the migrator is RLS-subject: the UPDATE runs between NO FORCE and
-- FORCE (the leads_closed_at pattern), one transaction, ACCESS EXCLUSIVE on the six tables until commit:
-- one hash join of the five record tables' keys with upload.uploads, a sequential pass over each.

ALTER TABLE upload.uploads NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.patient_images NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.patient_reports NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.patient_reviews NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.contact_activities NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.payments NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

WITH record_keys AS (
  SELECT 'patient_image'::varchar AS resource, record.id, record.public_id, record.organization_id,
    record.created_at, record.deleted_at, record.file_key::text AS file_key
  FROM app.patient_images AS record
  UNION ALL
  SELECT 'patient_report', record.id, record.public_id, record.organization_id,
    record.created_at, record.deleted_at, unnest(record.file_keys)
  FROM app.patient_reports AS record
  UNION ALL
  SELECT 'patient_review', record.id, record.public_id, record.organization_id,
    record.created_at, record.deleted_at, unnest(record.file_keys)
  FROM app.patient_reviews AS record
  UNION ALL
  SELECT 'contact_activity', record.id, record.public_id, record.organization_id,
    record.created_at, NULL::timestamptz, unnest(record.attachment_keys)
  FROM app.contact_activities AS record
  UNION ALL
  SELECT 'payment', record.id, record.public_id, record.organization_id,
    record.created_at, record.deleted_at, unnest(record.attachment_keys)
  FROM app.payments AS record
),
owner_of_key AS (
  SELECT DISTINCT ON (organization_id, file_key) organization_id, file_key, resource, public_id
  FROM record_keys
  ORDER BY organization_id, file_key, deleted_at IS NOT NULL, created_at, resource, id
)
UPDATE upload.uploads AS upload_row
SET bound_resource = owner_of_key.resource,
    bound_public_id = owner_of_key.public_id,
    updated_at = now()
FROM owner_of_key
WHERE upload_row.organization_id = owner_of_key.organization_id
  AND upload_row.file_key = owner_of_key.file_key
  AND upload_row.status = 'UPLOADED'
  AND upload_row.deleted_at IS NULL
  AND upload_row.bound_public_id IS NULL;
--> statement-breakpoint

ALTER TABLE upload.uploads FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.patient_images FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.patient_reports FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.patient_reviews FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.contact_activities FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.payments FORCE ROW LEVEL SECURITY;
