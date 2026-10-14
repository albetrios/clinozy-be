-- migration-transaction: none reason="CREATE INDEX CONCURRENTLY cannot run inside a transaction"
--
-- Launch D89, MD33, ROUTE #195: the store credit a return left — one return per credit — read by
-- the store's customer credits (route 56) and by the foreign key when a credit is purged.
-- CONCURRENTLY so writers are never blocked; IF NOT EXISTS so the file is idempotent.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_medical_sale_returns_pending_credit_id
  ON app.medical_sale_returns (pending_credit_id)
  WHERE pending_credit_id IS NOT NULL;
