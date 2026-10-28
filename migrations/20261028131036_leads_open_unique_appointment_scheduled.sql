-- migration-transaction: none reason="CREATE/DROP INDEX CONCURRENTLY cannot run inside a transaction"
-- Migration: leads_open_unique_appointment_scheduled
-- Created: 2026-10-28T13:10:36.000Z
-- Reference: docs/reference/data/migrations.md
--
-- One open lead per contact (L6) counts the new open status `appointment_scheduled` (L11, the
-- previous migration): a contact whose lead waits on a booking may not get a second open lead.
-- The partial unique index's predicate gains the value.
--
-- Online and gap-free: the replacement is built under a temporary name CONCURRENTLY, the old one
-- dropped CONCURRENTLY, then the replacement renamed to the canonical
-- `idx_leads_organization_contact_open_unique` (metadata only) — there is never a moment without
-- the unique index. Idempotent through IF [NOT] EXISTS.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_organization_contact_open_unique_next
  ON app.leads USING btree (organization_id, contact_id)
  WHERE deleted_at IS NULL AND status IN ('new', 'contacted', 'follow_up', 'appointment_scheduled', 'no_response');
--> statement-breakpoint

DROP INDEX CONCURRENTLY IF EXISTS app.idx_leads_organization_contact_open_unique;
--> statement-breakpoint

ALTER INDEX IF EXISTS app.idx_leads_organization_contact_open_unique_next
  RENAME TO idx_leads_organization_contact_open_unique;
