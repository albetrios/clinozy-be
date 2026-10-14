-- Migration: membership_preferences_branches_section
-- Created: 2026-10-14T18:54:37.000Z
-- Reference: docs/reference/data/migrations.md
--
-- change-branches-in-navbar: Branches leaves the Users room for a section of its own in the app's
-- navbar, so a member may pin it — `pinned_sections` gains `branches` (the allowed values stay
-- `['today', ...APP_MATRIX_SECTIONS]`, now with `branches` after `users`), and a member who has
-- not saved their own pins starts with it pinned after Payments. Rows already saved are left as
-- they are: every value they hold is still allowed. The CHECK is added NOT VALID and validated
-- after, so writers are never blocked for a scan.

ALTER TABLE app.membership_preferences
  DROP CONSTRAINT IF EXISTS chk_membership_preferences_pinned_sections;
--> statement-breakpoint

ALTER TABLE app.membership_preferences
  ADD CONSTRAINT chk_membership_preferences_pinned_sections
  CHECK (
    pinned_sections <@ ARRAY['today', 'contacts', 'activity', 'leads', 'appointments', 'patients', 'medical', 'stock', 'payments', 'tasks', 'offerings', 'users', 'branches']::text[]
    AND cardinality(pinned_sections) <= 10
  )
  NOT VALID;
--> statement-breakpoint

ALTER TABLE app.membership_preferences
  VALIDATE CONSTRAINT chk_membership_preferences_pinned_sections;
--> statement-breakpoint

ALTER TABLE app.membership_preferences
  ALTER COLUMN pinned_sections SET DEFAULT '{"appointments","leads","patients","payments","branches"}';
