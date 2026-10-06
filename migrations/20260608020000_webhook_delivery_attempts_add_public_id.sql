-- migration-safety: allow add_column_not_null_without_default reason="Pre-release: the table holds no rows when this runs, so the column is NOT NULL from the start — there is nothing to backfill."
-- sec-new-B2: add public_id to notify.webhook_delivery_attempts so the
-- X-Webhook-Delivery-Id outbound header carries an opaque 21-char identifier
-- instead of exposing the bigserial primary key, which would let receivers
-- infer table cardinality or enumerate delivery attempts by guessing.
--
-- The unique index is created in the follow-up migration
-- 20260608030000_webhook_delivery_attempts_public_id_index.sql using
-- CREATE UNIQUE INDEX CONCURRENTLY (requires its own non-transactional migration).

ALTER TABLE notify.webhook_delivery_attempts
  ADD COLUMN IF NOT EXISTS public_id varchar(28) NOT NULL;
