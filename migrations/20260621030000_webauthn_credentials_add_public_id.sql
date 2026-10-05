-- migration-safety: allow add_column_not_null_without_default reason="Pre-release: the table holds no rows when this runs, so the column is NOT NULL from the start — there is nothing to backfill."
-- audit R5b / M3: add public_id to auth.webauthn_credentials so the passkey-management API
-- (GET /auth/me/webauthn/credentials, DELETE /auth/me/webauthn/credentials/:credential_id) can
-- return and accept an opaque stable identifier instead of the bigserial `id` or the raw WebAuthn
-- `credential_id` (a long, non-Paddle-style base64url blob). New rows are minted by the app via
-- generatePublicId('webauthnCredential') => `wac_<21 [a-z0-9]>`.
--
-- RLS: webauthn_credentials is FORCE RLS keyed on the current user; adding a non-key column does
-- not touch the `webauthn_credentials_owner_access` USING/WITH CHECK predicates.
--
-- The matching unique index is added in the follow-up migration 20260621030100 with
-- CREATE INDEX CONCURRENTLY (which cannot run inside this transactional migration).

ALTER TABLE auth.webauthn_credentials
  ADD COLUMN IF NOT EXISTS public_id varchar(28) NOT NULL;
