-- Migration: permissions_branches_category
-- Created: 2026-10-14T18:54:40.000Z
-- Reference: docs/reference/data/migrations.md
--
-- change-branches-in-navbar: the four branch codes leave the Users row of the Roles matrix for
-- their own Branches row, so their catalogue `category` becomes `branches` (the section key in
-- `APP_ACCESS_SECTION_RESOURCES`). The codes themselves do not change, so no role, membership or
-- API key gains or loses anything. A deploy migrates before it runs the reference seed, whose
-- ON CONFLICT DO NOTHING never rewrites an existing row — so the rows move here.
--
-- FORCE ROW LEVEL SECURITY binds the migrator (a member of the table's owner), so the table is
-- lifted to NO FORCE for the update and forced again before the end, in this one transaction
-- (`force_rls_data_migration_without_owner_bracket`).

ALTER TABLE tenancy.permissions NO FORCE ROW LEVEL SECURITY;

UPDATE tenancy.permissions
SET category = 'branches'
WHERE code IN ('branch:read', 'branch:create', 'branch:update', 'branch:delete')
  AND category IS DISTINCT FROM 'branches';

ALTER TABLE tenancy.permissions FORCE ROW LEVEL SECURITY;
