-- migration-safety: allow set_not_null_on_existing_column reason="the three line columns are filled by the UPDATE just before, in the same transaction, and a validated IS NOT NULL check lets SET NOT NULL skip its scan"
-- Migration: purchase_line_gst
-- Created: 2026-10-31T04:28:06.060Z
-- Reference: docs/reference/data/migrations.md
--
--
-- feat-purchase-line-gst (PG3–PG8): a medical purchase line carries its GST the way an invoice line
-- does — the rate (0, 5, 12, 18 or 28 %), whether the line's rate includes it, the taxable value and
-- the GST — and an order its taxable and GST totals (total = taxable_total + gst_total).
--
-- Existing rows are filled here (PG8): each line takes its medicine's GST rate, GST-inclusive (the
-- rate always included GST), its taxable value = round(amount × 100 ÷ (100 + rate), 2) and its GST
-- the rest — the invoice calculation's rounding — so `amount` is unchanged. Each order's
-- taxable_total is the sum over the lines that count in its total (every line while ordered, the
-- received ones once received) and its gst_total the rest of `total`, so `total` is unchanged.
--
-- The three tables the fill reads or writes are FORCE RLS: the fill runs between NO FORCE and FORCE
-- (the migrator is RLS-subject). The new columns are added nullable, filled, then made NOT NULL
-- behind a validated IS NOT NULL check; each CHECK is added NOT VALID and
-- validated after. The summary's index is the next migration (CONCURRENTLY).

ALTER TABLE app.medical_purchase_order_items
  ADD COLUMN IF NOT EXISTS gst_percent SMALLINT,
  ADD COLUMN IF NOT EXISTS is_gst_inclusive BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS gst_amount NUMERIC(12, 2);

ALTER TABLE app.medical_purchase_orders
  ADD COLUMN IF NOT EXISTS taxable_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS gst_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE app.medical_purchase_order_items NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.medical_purchase_orders NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.medicines NO FORCE ROW LEVEL SECURITY;

UPDATE app.medical_purchase_order_items AS item
SET
  gst_percent = medicine.gst_percent,
  is_gst_inclusive = true,
  taxable_amount = round(item.amount * 100 / (100 + medicine.gst_percent), 2),
  gst_amount = item.amount - round(item.amount * 100 / (100 + medicine.gst_percent), 2)
FROM app.medicines AS medicine
WHERE medicine.id = item.medicine_id
  AND item.gst_percent IS NULL;

UPDATE app.medical_purchase_orders AS purchase_order
SET
  taxable_total = counted.taxable_total,
  gst_total = purchase_order.total - counted.taxable_total
FROM (
  SELECT
    item.medical_purchase_order_id,
    coalesce(sum(item.taxable_amount), 0) AS taxable_total
  FROM app.medical_purchase_order_items AS item
  JOIN app.medical_purchase_orders AS line_order ON line_order.id = item.medical_purchase_order_id
  WHERE line_order.stage = 'ordered' OR item.is_received IS TRUE
  GROUP BY item.medical_purchase_order_id
) AS counted
WHERE counted.medical_purchase_order_id = purchase_order.id;

ALTER TABLE app.medical_purchase_order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE app.medical_purchase_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE app.medicines FORCE ROW LEVEL SECURITY;

ALTER TABLE app.medical_purchase_order_items
  ADD CONSTRAINT chk_medical_purchase_order_items_gst_filled
  CHECK (gst_percent IS NOT NULL AND taxable_amount IS NOT NULL AND gst_amount IS NOT NULL)
  NOT VALID;

ALTER TABLE app.medical_purchase_order_items
  VALIDATE CONSTRAINT chk_medical_purchase_order_items_gst_filled;

ALTER TABLE app.medical_purchase_order_items
  ALTER COLUMN gst_percent SET NOT NULL,
  ALTER COLUMN taxable_amount SET NOT NULL,
  ALTER COLUMN gst_amount SET NOT NULL;

ALTER TABLE app.medical_purchase_order_items
  DROP CONSTRAINT chk_medical_purchase_order_items_gst_filled;

ALTER TABLE app.medical_purchase_order_items
  ADD CONSTRAINT chk_medical_purchase_order_items_gst_percent
  CHECK (gst_percent IN (0, 5, 12, 18, 28))
  NOT VALID;

ALTER TABLE app.medical_purchase_order_items
  VALIDATE CONSTRAINT chk_medical_purchase_order_items_gst_percent;

ALTER TABLE app.medical_purchase_order_items
  DROP CONSTRAINT IF EXISTS chk_medical_purchase_order_items_amount;

ALTER TABLE app.medical_purchase_order_items
  ADD CONSTRAINT chk_medical_purchase_order_items_amount
  CHECK (
    taxable_amount >= 0
    AND gst_amount >= 0
    AND amount = taxable_amount + gst_amount
    AND quantity * rate = CASE WHEN is_gst_inclusive THEN amount ELSE taxable_amount END
  )
  NOT VALID;

ALTER TABLE app.medical_purchase_order_items
  VALIDATE CONSTRAINT chk_medical_purchase_order_items_amount;

ALTER TABLE app.medical_purchase_orders
  ADD CONSTRAINT chk_medical_purchase_orders_totals
  CHECK (taxable_total >= 0 AND gst_total >= 0 AND total = taxable_total + gst_total)
  NOT VALID;

ALTER TABLE app.medical_purchase_orders
  VALIDATE CONSTRAINT chk_medical_purchase_orders_totals;
