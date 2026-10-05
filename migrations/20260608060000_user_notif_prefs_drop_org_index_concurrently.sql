-- migration-transaction: none reason="DROP INDEX CONCURRENTLY cannot run inside a transaction"
--
-- Drops `auth.idx_user_notif_prefs_org`: it indexed `organization_id`, which 20260606010000 pins
-- to NULL, and the user/type/channel index covers every read path. CONCURRENTLY, so the drop
-- never blocks writes to the table.

DROP INDEX CONCURRENTLY IF EXISTS auth.idx_user_notif_prefs_org;
