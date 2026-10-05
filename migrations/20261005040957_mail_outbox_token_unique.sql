-- migration-transaction: none reason="CREATE INDEX CONCURRENTLY cannot run inside a transaction"
--
-- Make auth.mail_outbox.resend_idempotency_token the row's unique handle.
--
-- The mail job used to carry the row's bigserial id. That id restarts at 1 after
-- `TRUNCATE ... RESTART IDENTITY` or a database restore while queued and retrying jobs live on in
-- Redis, so a job could load and send a different row. The job now carries the token instead — a
-- uuid Postgres generates on insert, already the Resend Idempotency-Key — and the worker, the
-- outbox sweeper and the post-commit dispatch look rows up by it. This index serves those lookups
-- and guarantees the token names one row.
--
-- CONCURRENTLY so writers are never blocked; IF NOT EXISTS so the file is idempotent, which a
-- non-transactional migration must be because there is no rollback if the statement fails.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_mail_outbox_resend_idempotency_token
  ON auth.mail_outbox (resend_idempotency_token);
