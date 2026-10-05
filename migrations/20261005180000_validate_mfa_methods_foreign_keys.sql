-- Validate the two auth.mfa_methods foreign keys that 20260611010000 added NOT VALID.
--
-- The migration-safety rule adds a foreign key NOT VALID (no full-table scan under the ADD's lock)
-- and VALIDATEs it in a follow-up step; the follow-up never shipped, so these were the only
-- constraints in the schema still unproven for the rows that predate them. NOT VALID constraints
-- are enforced for new rows but not trusted by the planner, and nothing proved an older row
-- references a live user. VALIDATE CONSTRAINT scans under SHARE UPDATE EXCLUSIVE — reads and
-- writes keep flowing — and fails loudly if an orphan exists, rather than leaving one hidden.
ALTER TABLE auth.mfa_methods VALIDATE CONSTRAINT mfa_methods_user_id_users_id_fk;
--> statement-breakpoint
ALTER TABLE auth.mfa_methods VALIDATE CONSTRAINT mfa_methods_created_by_user_id_users_id_fk;
