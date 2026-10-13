-- Migration: organization_settings_setup_progress
-- Created: 2026-10-13T11:22:41.025Z
-- Reference: docs/reference/data/migrations.md
--
-- feat-clinic-setup-2026-10-13-sltd ROUTE #1 (routes-final §2.A.3, OSC1; decisions D5, D7, D20, D26, D28):
-- a clinic's setup progress, kept on its settings row. Only what has no record of its own is stored — the
-- setup steps answered (`clinic_type`, `you`; step 2 is read back from the main branch), the guide items
-- skipped (`treatments`, `invite_team`), and when setup was deferred ("Explore first"), went live (and who
-- took it live), the guide was hidden and its three items were first all done. Every tick is read from the
-- clinic's records on each read, never stored. Written only by the app's onboarding-setup routes through the
-- organization-settings service; `GET`/`PATCH /tenancy/organization/settings` neither show nor take them.
--
-- Seven columns: the two lists NOT NULL with an empty default, the rest nullable — no table rewrite. The
-- CHECKs and the member key (K2, K8: who took the clinic live stays, inside the clinic) are added NOT VALID
-- and validated after, so writers are never locked out for a scan. The key's index is the next migration
-- (CREATE INDEX CONCURRENTLY).
--
-- The one-time fill (OS8, D7): a clinic that, when this ships, already has an active main branch and an
-- active service counts as live — `setup_completed_at` = now, no completer — and is never offered setup.
-- Its settings row is created when it has none (rows are otherwise created on first read).

ALTER TABLE tenancy.organization_settings
  ADD COLUMN IF NOT EXISTS setup_answered_steps TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS setup_skipped_items TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS setup_deferred_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS setup_completed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS setup_completed_by_membership_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS setup_guide_hidden_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS setup_guide_done_at TIMESTAMPTZ NULL;
--> statement-breakpoint

-- FORCE ROW LEVEL SECURITY binds the migrator (a member of the tables' owner), so every table the statements
-- below read or write — the member key's validation reads tenancy.memberships, the fill reads organizations,
-- branches and offerings and writes the settings — is lifted to NO FORCE first and forced again at the end, in
-- this one transaction (`force_rls_data_migration_without_owner_bracket`).
ALTER TABLE tenancy.organization_settings NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenancy.memberships NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenancy.organizations NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.branches NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.offerings NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE tenancy.organization_settings
  DROP CONSTRAINT IF EXISTS chk_organization_settings_setup_answered_steps,
  DROP CONSTRAINT IF EXISTS chk_organization_settings_setup_skipped_items,
  DROP CONSTRAINT IF EXISTS chk_organization_settings_setup_completed_by,
  DROP CONSTRAINT IF EXISTS organization_settings_setup_completed_by_membership_fk;
--> statement-breakpoint

ALTER TABLE tenancy.organization_settings
  ADD CONSTRAINT chk_organization_settings_setup_answered_steps
  CHECK (setup_answered_steps <@ ARRAY['clinic_type', 'you']::text[] AND cardinality(setup_answered_steps) <= 2)
  NOT VALID,
  ADD CONSTRAINT chk_organization_settings_setup_skipped_items
  CHECK (setup_skipped_items <@ ARRAY['treatments', 'invite_team']::text[] AND cardinality(setup_skipped_items) <= 2)
  NOT VALID,
  ADD CONSTRAINT chk_organization_settings_setup_completed_by
  CHECK (setup_completed_by_membership_id IS NULL OR setup_completed_at IS NOT NULL)
  NOT VALID,
  ADD CONSTRAINT organization_settings_setup_completed_by_membership_fk
  FOREIGN KEY (organization_id, setup_completed_by_membership_id)
  REFERENCES tenancy.memberships (organization_id, id) ON DELETE RESTRICT
  NOT VALID;
--> statement-breakpoint

ALTER TABLE tenancy.organization_settings VALIDATE CONSTRAINT chk_organization_settings_setup_answered_steps;
--> statement-breakpoint
ALTER TABLE tenancy.organization_settings VALIDATE CONSTRAINT chk_organization_settings_setup_skipped_items;
--> statement-breakpoint
ALTER TABLE tenancy.organization_settings VALIDATE CONSTRAINT chk_organization_settings_setup_completed_by;
--> statement-breakpoint
ALTER TABLE tenancy.organization_settings
  VALIDATE CONSTRAINT organization_settings_setup_completed_by_membership_fk;
--> statement-breakpoint

-- The one-time fill (OS8): live clinics are live.
INSERT INTO tenancy.organization_settings (organization_id, setup_completed_at)
SELECT o.id, now()
  FROM tenancy.organizations o
 WHERE o.deleted_at IS NULL
   AND EXISTS (
         SELECT 1 FROM app.branches b
          WHERE b.organization_id = o.id AND b.is_main AND b.is_active
       )
   AND EXISTS (
         SELECT 1 FROM app.offerings f
          WHERE f.organization_id = o.id AND f.is_active AND f.deleted_at IS NULL
       )
ON CONFLICT (organization_id) DO UPDATE
   SET setup_completed_at = coalesce(tenancy.organization_settings.setup_completed_at, excluded.setup_completed_at);
--> statement-breakpoint

ALTER TABLE tenancy.organization_settings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenancy.memberships FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenancy.organizations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.branches FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.offerings FORCE ROW LEVEL SECURITY;
