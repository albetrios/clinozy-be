-- migration-transaction: none reason="CREATE/DROP INDEX CONCURRENTLY cannot run inside a transaction"
--
-- Index hygiene from the 2026-10-10 review: indexes that serve the reads we run, none that only
-- slow the writes.
--
-- 1. The webhook-delivery reclaim (`findStalePendingDeliveryAttempts`: status = 'PENDING' AND
--    created_at < cutoff ORDER BY created_at, every five minutes) had no matching index and walked
--    the attempts table. A partial index on the pending rows only — a handful at any time.
--
-- 2. The nightly tombstone purges delete `WHERE deleted_at IS NOT NULL AND deleted_at < cutoff` in
--    batches, and no table had an index leading with deleted_at: every batch scanned the whole
--    table. Partial on `deleted_at IS NOT NULL`, so the index holds only the tombstones and live
--    writes never touch it. tenancy.idx_api_keys_deleted was the inverse (deleted_at, WHERE it IS
--    NULL — every value NULL, useless to any query) and is replaced by the tombstone form.
--
-- 3. Dropped: no query filters or sorts on what they index, and the load-tested dev database shows
--    zero scans for each, while every insert and update on these hot tables maintained them.
--      notify.idx_webhook_attempts_retry        (status, next_retry_at) — no reader of next_retry_at
--      notify.idx_webhook_attempts_webhook      (webhook_id, event_type, created_at) — the attempts
--                                               list uses idx_webhook_attempts_webhook_created_id,
--                                               which also keeps the webhook_id FK covered
--      notify.idx_notifications_type            (type, created_at)
--      auth.idx_users_last_active               (last_active_at)
--      auth.idx_users_last_active_not_deleted   (last_active_at) WHERE deleted_at IS NULL
--      tenancy.idx_api_keys_scopes_gin          GIN (scopes) — scopes are only read per key
--      billing.idx_subscriptions_status_period  (status, current_period_end)
--      audit.idx_audit_outbox_org_status        (organization_public_id, status) — the drain
--                                               reads by status and id
--
-- CONCURRENTLY so writers are never blocked; IF [NOT] EXISTS so the file is idempotent, which a
-- non-transactional migration must be because there is no rollback if a statement fails. New
-- indexes are built before the ones they replace are dropped.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_attempts_pending_created_at
  ON notify.webhook_delivery_attempts (created_at)
  WHERE status = 'PENDING';
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_uploads_tombstoned
  ON upload.uploads (deleted_at)
  WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_tombstoned
  ON auth.users (deleted_at)
  WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_memberships_tombstoned
  ON tenancy.memberships (deleted_at)
  WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhooks_tombstoned
  ON notify.webhooks (deleted_at)
  WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_organizations_tombstoned
  ON tenancy.organizations (deleted_at)
  WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_roles_tombstoned
  ON tenancy.roles (deleted_at)
  WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_organization_notification_policies_tombstoned
  ON tenancy.organization_notification_policies (deleted_at)
  WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_keys_tombstoned
  ON tenancy.api_keys (deleted_at)
  WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
DROP INDEX CONCURRENTLY IF EXISTS tenancy.idx_api_keys_deleted;
--> statement-breakpoint
DROP INDEX CONCURRENTLY IF EXISTS notify.idx_webhook_attempts_retry;
--> statement-breakpoint
DROP INDEX CONCURRENTLY IF EXISTS notify.idx_webhook_attempts_webhook;
--> statement-breakpoint
DROP INDEX CONCURRENTLY IF EXISTS notify.idx_notifications_type;
--> statement-breakpoint
DROP INDEX CONCURRENTLY IF EXISTS auth.idx_users_last_active;
--> statement-breakpoint
DROP INDEX CONCURRENTLY IF EXISTS auth.idx_users_last_active_not_deleted;
--> statement-breakpoint
DROP INDEX CONCURRENTLY IF EXISTS tenancy.idx_api_keys_scopes_gin;
--> statement-breakpoint
DROP INDEX CONCURRENTLY IF EXISTS billing.idx_subscriptions_status_period;
--> statement-breakpoint
DROP INDEX CONCURRENTLY IF EXISTS audit.idx_audit_outbox_org_status;
