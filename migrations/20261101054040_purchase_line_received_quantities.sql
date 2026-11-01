-- Migration: purchase_line_received_quantities
-- Created: 2026-11-01T05:40:40.424Z
-- Reference: docs/reference/data/migrations.md
--
-- feat-short-delivery (SD3–SD11): a medical purchase line records what arrived — the received packs
-- and the received free packs, set when the order is received — and whether it came short
-- (`is_short`, generated). The line's amount follows the received quantity once received, so the
-- amount check reads `coalesce(received_quantity, quantity) × rate`.
--
-- Existing received lines are filled with received = ordered (SD10): nothing changes in their amounts.
-- The fill runs between NO FORCE and FORCE ROW LEVEL SECURITY (the migrator is RLS-subject); each
-- CHECK is added NOT VALID and validated after. The generated column is computed from columns already
-- on the row.

ALTER TABLE app.medical_purchase_order_items
  ADD COLUMN IF NOT EXISTS received_quantity INTEGER,
  ADD COLUMN IF NOT EXISTS received_free_quantity INTEGER;

ALTER TABLE app.medical_purchase_order_items NO FORCE ROW LEVEL SECURITY;

UPDATE app.medical_purchase_order_items
SET
  received_quantity = quantity,
  received_free_quantity = free_quantity
WHERE is_received IS TRUE
  AND received_quantity IS NULL;

ALTER TABLE app.medical_purchase_order_items FORCE ROW LEVEL SECURITY;

ALTER TABLE app.medical_purchase_order_items
  ADD COLUMN IF NOT EXISTS is_short BOOLEAN GENERATED ALWAYS AS (
    coalesce(is_received, false) AND (received_quantity < quantity OR received_free_quantity < free_quantity)
  ) STORED;

ALTER TABLE app.medical_purchase_order_items
  ADD CONSTRAINT chk_medical_purchase_order_items_received
  CHECK (
    (is_received IS TRUE) = (received_quantity IS NOT NULL)
    AND (received_quantity IS NULL) = (received_free_quantity IS NULL)
    AND received_quantity BETWEEN 0 AND quantity
    AND received_free_quantity BETWEEN 0 AND free_quantity
  )
  NOT VALID;

ALTER TABLE app.medical_purchase_order_items
  VALIDATE CONSTRAINT chk_medical_purchase_order_items_received;

ALTER TABLE app.medical_purchase_order_items
  DROP CONSTRAINT IF EXISTS chk_medical_purchase_order_items_amount;

ALTER TABLE app.medical_purchase_order_items
  ADD CONSTRAINT chk_medical_purchase_order_items_amount
  CHECK (
    taxable_amount >= 0
    AND gst_amount >= 0
    AND amount = taxable_amount + gst_amount
    AND coalesce(received_quantity, quantity) * rate = CASE WHEN is_gst_inclusive THEN amount ELSE taxable_amount END
  )
  NOT VALID;

ALTER TABLE app.medical_purchase_order_items
  VALIDATE CONSTRAINT chk_medical_purchase_order_items_amount;
