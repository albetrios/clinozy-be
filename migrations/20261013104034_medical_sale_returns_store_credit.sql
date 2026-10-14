-- migration-safety: allow alter_column_type reason="Widening a varchar (4 to 6) is a catalog-only change in Postgres: no table rewrite, no scan."
-- Migration: medical_sale_returns_store_credit
-- Created: 2026-10-13T10:40:34.000Z
-- Reference: docs/reference/data/migrations.md
--
-- Launch D89, MD33, ROUTE #195: a return from a patient may leave its refund as store credit —
-- `refund_mode` gains `credit`: the credit note lowers the bill, no money moves, and a `give`
-- pending credit holds what the store owes the customer. The return names that credit
-- (`pending_credit_id` — set only on a store-credit return; a purged credit leaves it null). The
-- column widens to fit the word; the CHECKs and the foreign key are added NOT VALID and validated
-- after, so writers are never blocked for a scan. Its index is the next migration (concurrent).

ALTER TABLE app.medical_sale_returns
  ALTER COLUMN refund_mode TYPE VARCHAR(6);
--> statement-breakpoint

ALTER TABLE app.medical_sale_returns
  DROP CONSTRAINT IF EXISTS chk_medical_sale_returns_refund_mode;
--> statement-breakpoint

ALTER TABLE app.medical_sale_returns
  ADD CONSTRAINT chk_medical_sale_returns_refund_mode
  CHECK (refund_mode IN ('cash', 'upi', 'card', 'credit'))
  NOT VALID;
--> statement-breakpoint

ALTER TABLE app.medical_sale_returns
  VALIDATE CONSTRAINT chk_medical_sale_returns_refund_mode;
--> statement-breakpoint

ALTER TABLE app.medical_sale_returns
  ADD COLUMN IF NOT EXISTS pending_credit_id BIGINT NULL;
--> statement-breakpoint

ALTER TABLE app.medical_sale_returns
  DROP CONSTRAINT IF EXISTS medical_sale_returns_pending_credit_id_pending_credits_id_fk;
--> statement-breakpoint

ALTER TABLE app.medical_sale_returns
  ADD CONSTRAINT medical_sale_returns_pending_credit_id_pending_credits_id_fk
  FOREIGN KEY (pending_credit_id) REFERENCES app.pending_credits (id) ON DELETE SET NULL
  NOT VALID;
--> statement-breakpoint

ALTER TABLE app.medical_sale_returns
  VALIDATE CONSTRAINT medical_sale_returns_pending_credit_id_pending_credits_id_fk;
--> statement-breakpoint

ALTER TABLE app.medical_sale_returns
  DROP CONSTRAINT IF EXISTS chk_medical_sale_returns_pending_credit;
--> statement-breakpoint

ALTER TABLE app.medical_sale_returns
  ADD CONSTRAINT chk_medical_sale_returns_pending_credit
  CHECK (pending_credit_id IS NULL OR refund_mode = 'credit')
  NOT VALID;
--> statement-breakpoint

ALTER TABLE app.medical_sale_returns
  VALIDATE CONSTRAINT chk_medical_sale_returns_pending_credit;
