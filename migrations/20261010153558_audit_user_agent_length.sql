-- Migration: audit_user_agent_length
-- Created: 2026-10-10T15:35:58.159Z
-- Reference: docs/reference/data/migrations.md
--
-- The audit `user_agent` columns were unbounded text, and the header is client-controlled: an
-- unauthenticated flood of failed logins with a huge User-Agent bloated audit.outbox and
-- audit.logs. Both write points now cut it to 512 characters (the session column's width,
-- `truncateUserAgent`); a CHECK holds the line for any other writer. Added NOT VALID, then
-- validated (no long lock).
ALTER TABLE audit.outbox ADD CONSTRAINT "chk_audit_outbox_user_agent_length" CHECK (char_length("user_agent") <= 512) NOT VALID;
--> statement-breakpoint
ALTER TABLE audit.outbox VALIDATE CONSTRAINT "chk_audit_outbox_user_agent_length";
--> statement-breakpoint
ALTER TABLE audit.logs ADD CONSTRAINT "chk_audit_logs_user_agent_length" CHECK (char_length("user_agent") <= 512) NOT VALID;
--> statement-breakpoint
ALTER TABLE audit.logs VALIDATE CONSTRAINT "chk_audit_logs_user_agent_length";
