-- Migration: security_definer_functions_revoke_public
-- Created: 2026-10-10T13:55:29.178Z
-- Reference: docs/reference/data/migrations.md
--
-- Every SECURITY DEFINER resolver was executable by PUBLIC — Postgres grants EXECUTE on a new
-- function to PUBLIC by default — so any role that could log in could call them, and they run as
-- their RLS-exempt owner: `auth.resolve_user_for_authentication_by_email` returns a user's password
-- hash. Only the two runtime roles call them: the application role, and the maintenance role (its
-- contexts call some directly, and the `organizations_user_discovery` / audit insert policies call
-- others on every query it makes on those tables). So EXECUTE is revoked from PUBLIC and granted to
-- exactly those two; functions created later by the migration role no longer default to PUBLIC.
-- Pinned by role-taxonomy.db.unit.test.ts.
REVOKE EXECUTE ON FUNCTION audit.resolve_api_key_ids_for_public_ids(text[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION audit.resolve_api_key_ids_for_public_ids(text[]) TO clinozy_be_app, clinozy_be_maintenance;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION audit.resolve_organization_ids_for_public_ids(text[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION audit.resolve_organization_ids_for_public_ids(text[]) TO clinozy_be_app, clinozy_be_maintenance;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION auth.resolve_auth_method_by_provider(text,text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth.resolve_auth_method_by_provider(text,text) TO clinozy_be_app, clinozy_be_maintenance;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION auth.resolve_user_by_internal_id(bigint) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth.resolve_user_by_internal_id(bigint) TO clinozy_be_app, clinozy_be_maintenance;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION auth.resolve_user_for_authentication_by_email(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth.resolve_user_for_authentication_by_email(text) TO clinozy_be_app, clinozy_be_maintenance;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION auth.resolve_user_id_by_public_id(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth.resolve_user_id_by_public_id(text) TO clinozy_be_app, clinozy_be_maintenance;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION auth.resolve_user_public_ids_by_ids(bigint[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth.resolve_user_public_ids_by_ids(bigint[]) TO clinozy_be_app, clinozy_be_maintenance;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION auth.resolve_user_summaries_by_ids(bigint[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth.resolve_user_summaries_by_ids(bigint[]) TO clinozy_be_app, clinozy_be_maintenance;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION billing.resolve_organization_public_id_for_stripe_customer(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION billing.resolve_organization_public_id_for_stripe_customer(text) TO clinozy_be_app, clinozy_be_maintenance;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION billing.resolve_organization_public_id_for_stripe_subscription(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION billing.resolve_organization_public_id_for_stripe_subscription(text) TO clinozy_be_app, clinozy_be_maintenance;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION tenancy.list_organization_membership_ids_by_name(bigint,text,boolean,text,bigint,integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION tenancy.list_organization_membership_ids_by_name(bigint,text,boolean,text,bigint,integer) TO clinozy_be_app, clinozy_be_maintenance;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION tenancy.list_pending_member_invitations_for_email(text,integer,timestamp with time zone,bigint) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION tenancy.list_pending_member_invitations_for_email(text,integer,timestamp with time zone,bigint) TO clinozy_be_app, clinozy_be_maintenance;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION tenancy.organization_requires_mfa(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION tenancy.organization_requires_mfa(text) TO clinozy_be_app, clinozy_be_maintenance;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION tenancy.resolve_api_key_for_authentication(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION tenancy.resolve_api_key_for_authentication(text) TO clinozy_be_app, clinozy_be_maintenance;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION tenancy.resolve_member_invitation_lookup_by_public_id(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION tenancy.resolve_member_invitation_lookup_by_public_id(text) TO clinozy_be_app, clinozy_be_maintenance;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION tenancy.resolve_organization_default_locale(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION tenancy.resolve_organization_default_locale(text) TO clinozy_be_app, clinozy_be_maintenance;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION tenancy.search_organization_membership_ids(bigint,text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION tenancy.search_organization_membership_ids(bigint,text) TO clinozy_be_app, clinozy_be_maintenance;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION tenancy.user_has_active_membership_for_organization(bigint,text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION tenancy.user_has_active_membership_for_organization(bigint,text) TO clinozy_be_app, clinozy_be_maintenance;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION tenancy.user_has_organization_requiring_mfa(bigint) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION tenancy.user_has_organization_requiring_mfa(bigint) TO clinozy_be_app, clinozy_be_maintenance;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
