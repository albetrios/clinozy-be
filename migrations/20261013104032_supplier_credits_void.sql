-- Migration: supplier_credits_void
-- Created: 2026-10-13T10:40:32.000Z
-- Reference: docs/reference/data/migrations.md
--
-- Launch D89, MD32, ROUTE #194: a supplier credit can be voided and the void undone. Voiding puts
-- the packs back into their batch and takes the credit off the supplier's orders; the undo takes
-- the packs again and re-applies it. A voided credit is kept (never purged — its batch and the
-- supplier's account name it), with why: `delete_reason` (mistake, wrong_quantity,
-- supplier_refused, other) and a `delete_note`, required for other.
--
-- Three nullable columns on `app.supplier_credits` — null while the credit is live. The CHECKs are
-- added NOT VALID and validated after, so the table is never locked against writers for a scan.

ALTER TABLE app.supplier_credits
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS delete_reason VARCHAR(16) NULL,
  ADD COLUMN IF NOT EXISTS delete_note VARCHAR(280) NULL;
--> statement-breakpoint

ALTER TABLE app.supplier_credits
  DROP CONSTRAINT IF EXISTS chk_supplier_credits_delete_reason;
--> statement-breakpoint

ALTER TABLE app.supplier_credits
  ADD CONSTRAINT chk_supplier_credits_delete_reason
  CHECK (delete_reason IN ('mistake', 'wrong_quantity', 'supplier_refused', 'other'))
  NOT VALID;
--> statement-breakpoint

ALTER TABLE app.supplier_credits
  VALIDATE CONSTRAINT chk_supplier_credits_delete_reason;
--> statement-breakpoint

ALTER TABLE app.supplier_credits
  DROP CONSTRAINT IF EXISTS chk_supplier_credits_delete_reason_when_deleted;
--> statement-breakpoint

ALTER TABLE app.supplier_credits
  ADD CONSTRAINT chk_supplier_credits_delete_reason_when_deleted
  CHECK ((deleted_at IS NULL) = (delete_reason IS NULL))
  NOT VALID;
--> statement-breakpoint

ALTER TABLE app.supplier_credits
  VALIDATE CONSTRAINT chk_supplier_credits_delete_reason_when_deleted;
--> statement-breakpoint

ALTER TABLE app.supplier_credits
  DROP CONSTRAINT IF EXISTS chk_supplier_credits_delete_note_when_other;
--> statement-breakpoint

ALTER TABLE app.supplier_credits
  ADD CONSTRAINT chk_supplier_credits_delete_note_when_other
  CHECK (delete_reason IS DISTINCT FROM 'other' OR delete_note IS NOT NULL)
  NOT VALID;
--> statement-breakpoint

ALTER TABLE app.supplier_credits
  VALIDATE CONSTRAINT chk_supplier_credits_delete_note_when_other;
