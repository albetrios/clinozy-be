-- Migration: leads_status_appointment_scheduled
-- Created: 2026-10-28T13:10:34.536Z
-- Reference: docs/reference/data/migrations.md
-- migration-safety: allow alter_column_type reason="varchar(14) to varchar(21) is binary coercible: no table rewrite, no index rebuild"
--
-- A lead gains the open status `appointment_scheduled` (L11): the person's bookings set it — a
-- live scheduled or confirmed appointment moves the contact's open lead there, and the end of the
-- last one (a cancel, a no-show, a removal) moves it back to `follow_up`; check-in still takes it
-- to `clinic_visited`. The value is 21 characters, so `status` widens from `varchar(14)` to
-- `varchar(21)` — widening a varchar changes no stored byte, so Postgres rewrites nothing. The
-- CHECK gains the value: dropped and added again NOT VALID, then validated, so writers are never
-- blocked for a scan. Rows already stored keep their status — every one is still allowed. The
-- one-open-lead index takes the new open status in the next migration (CONCURRENTLY, outside a
-- transaction).

ALTER TABLE app.leads DROP CONSTRAINT IF EXISTS chk_leads_status;
--> statement-breakpoint

ALTER TABLE app.leads ALTER COLUMN status TYPE varchar(21);
--> statement-breakpoint

ALTER TABLE app.leads
  ADD CONSTRAINT chk_leads_status
  CHECK (status IN ('new', 'contacted', 'follow_up', 'appointment_scheduled', 'no_response', 'not_interested', 'invalid', 'lost', 'clinic_visited'))
  NOT VALID;
--> statement-breakpoint

ALTER TABLE app.leads VALIDATE CONSTRAINT chk_leads_status;
