-- Migration: leads_closed_at
-- Created: 2026-10-30T10:36:39.000Z
-- Reference: docs/reference/data/migrations.md
--
-- feat-lead-follows-bookings-2026-10-30-ytqj, ROUTE R1 (routes-final §1 LF4; D7, D10, D13): a lead
-- records when it closed. `closed_at` is set exactly while the status is a closing one
-- (`not_interested`, `invalid`, `lost`, `clinic_visited`) and emptied when the lead reopens; a
-- check-in wins back a lead closed as Lost or Not interested within 90 days of it. The column is
-- nullable with no default (no rewrite). Leads already closed take their last update as their
-- close date — the best this data knows — inside the FORCE ROW LEVEL SECURITY bracket the backfill
-- needs (the migrator is RLS-subject). The CHECK is added NOT VALID and validated after, so writers
-- are never blocked for a scan.

ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS closed_at timestamptz;
--> statement-breakpoint

ALTER TABLE app.leads NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

UPDATE app.leads
SET closed_at = updated_at
WHERE status IN ('not_interested', 'invalid', 'lost', 'clinic_visited')
  AND closed_at IS NULL;
--> statement-breakpoint

ALTER TABLE app.leads FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE app.leads
  ADD CONSTRAINT chk_leads_closed_at
  CHECK ((status IN ('not_interested', 'invalid', 'lost', 'clinic_visited')) = (closed_at IS NOT NULL))
  NOT VALID;
--> statement-breakpoint

ALTER TABLE app.leads VALIDATE CONSTRAINT chk_leads_closed_at;
