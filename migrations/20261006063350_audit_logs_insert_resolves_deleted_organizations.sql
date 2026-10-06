-- Migration: audit_logs_insert_resolves_deleted_organizations
-- Created: 2026-10-06T06:33:50.545Z
-- Reference: docs/reference/data/migrations.md
--
-- The organization arm of `audit_logs_tenant_isolation_insert` looked the organization up in
-- `tenancy.organizations`, whose row-level security hides soft-deleted organizations. So once an
-- organization was deleted, every audit row for it still waiting in `audit.outbox` — its own
-- `tenancy.organization.delete` event first among them — failed this check in the drain, retried
-- and was lost.
--
-- Resolve through `audit.resolve_organization_ids_for_public_ids` instead: SECURITY DEFINER, sees
-- deleted organizations, already granted to both runtime roles (20260827040000), and the same
-- resolver the drain uses for the row's id. Isolation is unchanged — the row must still carry the
-- organization named by the session's `app.current_organization_public_id`. The system arm for
-- tenantless rows is restated as it was (20261005170000).
ALTER POLICY "audit_logs_tenant_isolation_insert" ON "audit"."logs"
  WITH CHECK (((organization_id = ( SELECT resolved.id
   FROM audit.resolve_organization_ids_for_public_ids(ARRAY[( SELECT current_setting('app.current_organization_public_id'::text, true) AS current_setting)]) AS resolved)) OR ((organization_id IS NULL) AND ((( SELECT current_setting('app.system_audit_insert'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name)))));
