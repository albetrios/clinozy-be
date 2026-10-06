-- Give every auth.mail_outbox row a random token for its Resend Idempotency-Key.
--
-- Why: the mail worker sent `mail-outbox-<id>` as the key, but `id` is a bigserial that only
-- counts within one database's lifetime. It starts again at 1 after `TRUNCATE ... RESTART
-- IDENTITY` (the test harness's cleanupDatabase) or on a fresh database, and every other
-- database sending through the same Resend account (local machines copy the development key)
-- counts from 1 too. Resend keeps an Idempotency-Key for 24 hours per account, so a repeated
-- key with a different body is rejected (409 invalid_idempotent_request) on every retry and the
-- email is never delivered. A random uuid per row is unique across databases by construction,
-- and because it is stored on the row it stays the same across BullMQ retries and outbox
-- sweeper reclaims — the duplicate-send protection the key exists for (audit #20).
--
-- How: one statement. The default is volatile, so Postgres rewrites the table and gives every
-- existing row its own token; every row inserted later gets one from the same default. NOT NULL,
-- so a key never falls back to the bigserial.

ALTER TABLE auth.mail_outbox ADD COLUMN IF NOT EXISTS resend_idempotency_token UUID NOT NULL DEFAULT gen_random_uuid();
