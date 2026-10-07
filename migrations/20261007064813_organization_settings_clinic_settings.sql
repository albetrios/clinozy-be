-- The clinic settings on the organization's settings row (launch-2026-09-30-jxmr, ROUTE #1).
--
-- The settings the launch's rooms and background work read, held where the organization's other
-- settings already live (tenancy.organization_settings, 1:1, written by
-- PATCH /tenancy/organization/settings — the plan's RC-201):
--   default_day_float          opening cash when no previous close carries over (₹2,000)
--   lead_hold_days             idle days before a held lead opens to the team (3)
--   reminder_hour              hour (0–23, organization timezone) of the day-before reminder (16, D34)
--   retarget_after_days        days without a visit before a re-target lead (90, D35)
--   deleted_record_purge_days  days a deleted clinic record stays restorable (7, D38)
--
-- NOT NULL with constant defaults: metadata-only, existing rows take the defaults, and a reader
-- with no settings row uses the same defaults (organization-settings.constants.ts). The CHECKs
-- are structural bounds only — the business limits live in the settings validator. They go in
-- NOT VALID, then validate without blocking writers.

ALTER TABLE tenancy.organization_settings
  ADD COLUMN IF NOT EXISTS default_day_float NUMERIC(12, 2) NOT NULL DEFAULT 2000.00;
--> statement-breakpoint

ALTER TABLE tenancy.organization_settings
  ADD COLUMN IF NOT EXISTS lead_hold_days INTEGER NOT NULL DEFAULT 3;
--> statement-breakpoint

ALTER TABLE tenancy.organization_settings
  ADD COLUMN IF NOT EXISTS reminder_hour SMALLINT NOT NULL DEFAULT 16;
--> statement-breakpoint

ALTER TABLE tenancy.organization_settings
  ADD COLUMN IF NOT EXISTS retarget_after_days INTEGER NOT NULL DEFAULT 90;
--> statement-breakpoint

ALTER TABLE tenancy.organization_settings
  ADD COLUMN IF NOT EXISTS deleted_record_purge_days INTEGER NOT NULL DEFAULT 7;
--> statement-breakpoint

ALTER TABLE tenancy.organization_settings
  DROP CONSTRAINT IF EXISTS chk_organization_settings_default_day_float;
--> statement-breakpoint

ALTER TABLE tenancy.organization_settings
  ADD CONSTRAINT chk_organization_settings_default_day_float CHECK (default_day_float >= 0) NOT VALID;
--> statement-breakpoint

ALTER TABLE tenancy.organization_settings
  VALIDATE CONSTRAINT chk_organization_settings_default_day_float;
--> statement-breakpoint

ALTER TABLE tenancy.organization_settings
  DROP CONSTRAINT IF EXISTS chk_organization_settings_lead_hold_days;
--> statement-breakpoint

ALTER TABLE tenancy.organization_settings
  ADD CONSTRAINT chk_organization_settings_lead_hold_days CHECK (lead_hold_days >= 1) NOT VALID;
--> statement-breakpoint

ALTER TABLE tenancy.organization_settings
  VALIDATE CONSTRAINT chk_organization_settings_lead_hold_days;
--> statement-breakpoint

ALTER TABLE tenancy.organization_settings
  DROP CONSTRAINT IF EXISTS chk_organization_settings_reminder_hour;
--> statement-breakpoint

ALTER TABLE tenancy.organization_settings
  ADD CONSTRAINT chk_organization_settings_reminder_hour
  CHECK (reminder_hour BETWEEN 0 AND 23) NOT VALID;
--> statement-breakpoint

ALTER TABLE tenancy.organization_settings
  VALIDATE CONSTRAINT chk_organization_settings_reminder_hour;
--> statement-breakpoint

ALTER TABLE tenancy.organization_settings
  DROP CONSTRAINT IF EXISTS chk_organization_settings_retarget_after_days;
--> statement-breakpoint

ALTER TABLE tenancy.organization_settings
  ADD CONSTRAINT chk_organization_settings_retarget_after_days
  CHECK (retarget_after_days >= 1) NOT VALID;
--> statement-breakpoint

ALTER TABLE tenancy.organization_settings
  VALIDATE CONSTRAINT chk_organization_settings_retarget_after_days;
--> statement-breakpoint

ALTER TABLE tenancy.organization_settings
  DROP CONSTRAINT IF EXISTS chk_organization_settings_deleted_record_purge_days;
--> statement-breakpoint

ALTER TABLE tenancy.organization_settings
  ADD CONSTRAINT chk_organization_settings_deleted_record_purge_days
  CHECK (deleted_record_purge_days >= 1) NOT VALID;
--> statement-breakpoint

ALTER TABLE tenancy.organization_settings
  VALIDATE CONSTRAINT chk_organization_settings_deleted_record_purge_days;
