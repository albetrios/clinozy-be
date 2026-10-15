-- Migration: user_settings_default_organization
-- Created: 2026-10-15T03:05:34.467Z
-- Reference: docs/reference/data/migrations.md
--
-- The clinic a person pins to open at sign-in (feat-choose-default-clinic CD3/CD4). NULL keeps the
-- automatic default: the clinic they last switched to (auth.users.last_active_organization_id),
-- else their newest clinic. A soft pointer with no foreign key, like last_active_organization_id:
-- writes are validated against an active membership in an active clinic, and every read honours it
-- only through one, so a clinic left, suspended or deleted is simply skipped.
--
-- Nullable with no default: a metadata-only change, no table rewrite. No index — the row is read
-- by its primary key. auth.user_settings keeps its owner-only FORCE RLS policy.

ALTER TABLE auth.user_settings
  ADD COLUMN IF NOT EXISTS default_organization_id bigint;
