-- Migration: contacts_date_of_birth_is_approximate
-- Created: 2026-10-31T04:06:02.306Z
-- Reference: docs/reference/data/migrations.md
--
-- A contact registered by age instead of a birth date (feat-approximate-age AA2): the typed age is
-- stored as an approximate `date_of_birth` (the organization's today minus that many years) and
-- this flag says so, so the age keeps counting up and a real date picked later clears it.
--
-- A constant DEFAULT makes the NOT NULL column a metadata-only change (no table rewrite, every
-- existing row reads false). The CHECK — the flag only with a birth date (AA9) — is added NOT VALID
-- and validated right after; every existing row holds false, so validation cannot fail. No index
-- (AA7). app.contacts keeps its FORCE RLS organization policy.

ALTER TABLE app.contacts
  ADD COLUMN IF NOT EXISTS date_of_birth_is_approximate boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE app.contacts
  ADD CONSTRAINT chk_contacts_date_of_birth_approximate
  CHECK (NOT date_of_birth_is_approximate OR date_of_birth IS NOT NULL)
  NOT VALID;
--> statement-breakpoint
ALTER TABLE app.contacts
  VALIDATE CONSTRAINT chk_contacts_date_of_birth_approximate;
