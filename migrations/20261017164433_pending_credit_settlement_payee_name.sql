-- Migration: pending_credit_settlement_payee_name
-- Created: 2026-10-17T16:44:33.485Z
-- Reference: docs/reference/data/migrations.md
--
-- A pending credit with a typed party (`party_name`, no `contact_id`) settled in money wrote its
-- refund (`give`) or money-back (`take`) payment with neither a contact nor a `payee_name`, so the
-- ledger's FROM / TO and Day-close review showed nobody and the payments' `q` never found the
-- party (QA FIN-001, issue #94). The settlement writers now carry the party's name as the
-- payment's `payee_name`; this backfill names the existing ones from their credit, matched within
-- the same organization. Contact-linked settlements are left as they are — the contact names them.

-- FORCE ROW LEVEL SECURITY binds the migrator (a member of the tables' owner), so the backfill
-- lifts it on the two tables it reads and writes, and sets it back after.
ALTER TABLE app.payments NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.pending_credits NO FORCE ROW LEVEL SECURITY;

UPDATE app.payments AS payment
SET payee_name = credit.party_name
FROM app.pending_credits AS credit
WHERE payment.pending_credit_id = credit.id
  AND payment.organization_id = credit.organization_id
  AND payment.kind IN ('refund', 'money_back')
  AND payment.contact_id IS NULL
  AND payment.payee_name IS NULL
  AND credit.contact_id IS NULL
  AND credit.party_name IS NOT NULL;

ALTER TABLE app.payments FORCE ROW LEVEL SECURITY;
ALTER TABLE app.pending_credits FORCE ROW LEVEL SECURITY;
