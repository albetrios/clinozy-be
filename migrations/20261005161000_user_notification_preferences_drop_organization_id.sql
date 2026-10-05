-- migration-safety: allow drop_column reason="the column was pinned NULL by chk_user_notif_prefs_no_org (sec-U7) and read by nothing; it was kept only for a rollback that a scratch deployment never needs"
-- auth.user_notification_preferences.organization_id: user preferences are global, organization-
-- scoped ones live in tenancy.organization_notification_policies. The column, its CHECK pinning it
-- to NULL, its FK and the partial index behind the FK all go; dropping the column drops the FK and
-- the index with it.
ALTER TABLE auth.user_notification_preferences DROP CONSTRAINT IF EXISTS chk_user_notif_prefs_no_org;
--> statement-breakpoint
ALTER TABLE auth.user_notification_preferences DROP COLUMN IF EXISTS organization_id;
