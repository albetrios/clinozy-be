-- migration-transaction: none reason="CREATE/DROP INDEX CONCURRENTLY cannot run inside a transaction"
--
-- Launch D89, MD32, ROUTE #194: a supplier's open credits — applied to its dues oldest first
-- (MD11) and counted in what the store owes it — are its live credits only. The partial index the
-- ledger reads them through skips a voided credit (`deleted_at IS NOT NULL`), which keeps none of
-- its applied amount and would otherwise sit in it forever.
--
-- CONCURRENTLY so writers are never blocked; IF [NOT] EXISTS so the file is idempotent, which a
-- non-transactional migration must be because there is no rollback if a statement fails. The new
-- index is built before the one it replaces is dropped.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_supplier_credits_supplier_live_open
  ON app.supplier_credits (supplier_id, created_at, id)
  WHERE deleted_at IS NULL AND applied_amount < amount;
--> statement-breakpoint
DROP INDEX CONCURRENTLY IF EXISTS app.idx_supplier_credits_supplier_open;
