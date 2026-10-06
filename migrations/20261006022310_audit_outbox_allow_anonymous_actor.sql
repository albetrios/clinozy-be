-- Pre-authentication audit events — auth.login_failure — have no actor by design: the caller is not
-- authenticated, and naming the account they tried would put an enumeration list in the audit
-- trail. chk_audit_outbox_actor_present required an actor on every row, so the application dropped
-- these events before staging them, and no failed login (password, email code, MFA, OAuth) was ever
-- recorded.
--
-- The check now also accepts a row that declares itself anonymous (metadata.actor_kind =
-- 'anonymous'); every other row still needs a user or API-key actor. IS NOT DISTINCT FROM keeps it
-- strict: a missing key yields NULL, which a plain `=` would let pass. The new check accepts a
-- superset of the old one, so VALIDATE cannot fail on existing rows.
ALTER TABLE audit.outbox DROP CONSTRAINT IF EXISTS chk_audit_outbox_actor_present;
--> statement-breakpoint
ALTER TABLE audit.outbox ADD CONSTRAINT chk_audit_outbox_actor_present CHECK (
  actor_user_public_id IS NOT NULL
  OR actor_api_key_public_id IS NOT NULL
  OR (metadata ->> 'actor_kind') IS NOT DISTINCT FROM 'anonymous'
) NOT VALID;
--> statement-breakpoint
ALTER TABLE audit.outbox VALIDATE CONSTRAINT chk_audit_outbox_actor_present;
