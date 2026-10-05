-- migration-safety: allow add_column_not_null_without_default reason="Pre-release: the table holds no rows when this runs, so the column is NOT NULL from the start — there is nothing to backfill."
-- sec-new-B4: add public_id to auth.auth_methods so the auth-method management API
-- returns and accepts an opaque stable identifier instead of the bigserial `id`.
-- New rows are minted by the app via generatePublicId('authMethod').

ALTER TABLE auth.auth_methods
  ADD COLUMN IF NOT EXISTS public_id varchar(28) NOT NULL;
