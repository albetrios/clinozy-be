-- Migration: invoices_refunded_amount
-- Created: 2026-10-13T12:47:09.292Z
-- Reference: docs/reference/data/migrations.md
--
-- A refunded invoice read as due again (B5, B16): a refund lowered the invoice's `paid_amount`
-- while its credit note lowered nothing, so `due_amount` (total − paid) rose by the money handed
-- back — the `payment_due` task, the invoices' due filter and every reader saw a debt the patient
-- does not owe. A refund on an invoice now moves its money from `paid_amount` to the new
-- `refunded_amount` in one guarded statement (its reversal or delete moves it back), and the
-- invoice owes total − paid − refunded.
--
-- The backfill writes each invoice's live refunds less the reversals of them — the money the
-- existing rows already took out of `paid_amount` — kept within total − paid, so an invoice the
-- old reading had collected again reads owing nothing rather than refusing the CHECK. The two
-- generated columns take their new expression in place (Postgres 17, `SET EXPRESSION`; the
-- table is rewritten once and the due index with it). The CHECK is added NOT VALID and
-- validated after.

ALTER TABLE app.invoices
  ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00;

-- FORCE ROW LEVEL SECURITY binds the migrator (a member of the tables' owner), so the backfill
-- lifts it on the two tables it reads and writes, and sets it back after.
ALTER TABLE app.invoices NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.payments NO FORCE ROW LEVEL SECURITY;

UPDATE app.invoices AS invoice
SET refunded_amount = LEAST(
  GREATEST(refunds.amount, 0),
  GREATEST(invoice.total - invoice.paid_amount, 0)
)
FROM (
  SELECT
    refund.invoice_id,
    SUM(refund.amount) - COALESCE(SUM(reversal.amount), 0) AS amount
  FROM app.payments AS refund
  LEFT JOIN app.payments AS reversal
    ON reversal.reverses_payment_id = refund.id
    AND reversal.kind = 'reversal'
    AND reversal.deleted_at IS NULL
  WHERE refund.kind = 'refund'
    AND refund.invoice_id IS NOT NULL
    AND refund.deleted_at IS NULL
  GROUP BY refund.invoice_id
) AS refunds
WHERE invoice.id = refunds.invoice_id;

ALTER TABLE app.invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE app.payments FORCE ROW LEVEL SECURITY;

ALTER TABLE app.invoices
  ALTER COLUMN due_amount SET EXPRESSION AS (total - paid_amount - refunded_amount);

ALTER TABLE app.invoices
  ALTER COLUMN payment_status SET EXPRESSION AS (
    CASE
      WHEN total - paid_amount - refunded_amount <= 0 THEN 'paid'
      WHEN paid_amount + refunded_amount > 0 THEN 'partial'
      ELSE 'unpaid'
    END
  );

ALTER TABLE app.invoices
  DROP CONSTRAINT IF EXISTS chk_invoices_paid_amount;

ALTER TABLE app.invoices
  ADD CONSTRAINT chk_invoices_paid_amount
  CHECK (paid_amount >= 0 AND refunded_amount >= 0 AND paid_amount + refunded_amount <= total)
  NOT VALID;

ALTER TABLE app.invoices
  VALIDATE CONSTRAINT chk_invoices_paid_amount;
