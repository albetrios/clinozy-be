-- migration-transaction: none reason="CREATE INDEX CONCURRENTLY cannot run inside a transaction"
-- Migration: organization_settings_setup_completed_by_index
-- Created: 2026-10-13T11:22:43.428Z
-- Reference: docs/reference/data/migrations.md
--
-- feat-clinic-setup-2026-10-13-sltd ROUTE #1 (routes-final §2.A.3, OSC1): the index behind the member key
-- `organization_settings_setup_completed_by_membership_fk` added by the previous migration — its
-- `ON DELETE RESTRICT` check looks the member up through it (the index-hygiene gate requires every foreign key
-- to lead a usable index). Partial on `IS NOT NULL`: only a clinic taken live through the setup route names a
-- member, so the index stays tiny.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_organization_settings_setup_completed_by_membership_id
  ON tenancy.organization_settings (organization_id, setup_completed_by_membership_id)
  WHERE setup_completed_by_membership_id IS NOT NULL;
