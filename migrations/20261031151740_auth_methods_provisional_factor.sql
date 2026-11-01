-- Migration: auth_methods_provisional_factor
-- Created: 2026-10-31T15:17:40.823Z
-- Reference: docs/reference/data/migrations.md
--
-- A-1: a second factor enrolled under an email-code step-up window — the only step-up a
-- passwordless account without MFA has, so one that brief mailbox access also opens — is
-- provisional. `provisional_until` is when it starts to count as a strong step-up factor (72 h
-- after enrollment); `enrolled_on_session_public_id` is the session that enrolled it, on which it
-- never counts as strong. Both are NULL for a factor enrolled under a password or MFA step-up
-- (strong at once) and for every existing row. Nullable, no backfill; RLS is unchanged.

ALTER TABLE auth.auth_methods
  ADD COLUMN IF NOT EXISTS provisional_until TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS enrolled_on_session_public_id VARCHAR(28) NULL;
