-- migration-transaction: none reason="CREATE INDEX CONCURRENTLY cannot run inside a transaction"
-- Migration: purchase_orders_received_index
-- Created: 2026-10-31T04:28:33.601Z
-- Reference: docs/reference/data/migrations.md
--
-- feat-purchase-line-gst (PG15): the purchase GST summary reads one organization's live received
-- orders by their receive date. A partial index on (organization_id, received_at) over live
-- received orders serves it; the supplier-due index leads with the supplier and leaves paid
-- orders out. Built CONCURRENTLY so no write waits; idempotent through IF NOT EXISTS.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medical_purchase_orders_organization_received
  ON app.medical_purchase_orders USING btree (organization_id, received_at)
  WHERE deleted_at IS NULL AND received_at IS NOT NULL;
