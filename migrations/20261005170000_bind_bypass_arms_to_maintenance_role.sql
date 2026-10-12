-- Bind every RLS bypass arm to the maintenance role.
--
-- Until now a bypass arm opened on its `app.*` GUC alone, from ANY role: a compromised
-- `clinozy_be_app` connection could `SET LOCAL app.global_retention_cleanup = 'true'` (or any
-- other bypass GUC) and read or delete across tenants. Every arm now ALSO requires
-- `current_user = 'clinozy_be_maintenance'` — the role DATABASE_MAINTENANCE_URL connects as (required
-- since this change) — so bypass authority is a property of the maintenance CONNECTION, and
-- the GUC only selects which arm that connection opens. The five arms:
-- app.global_retention_cleanup, app.session_retention_cleanup, app.global_admin,
-- app.system_audit_insert, app.audit_outbox_drain.
--
-- Generated from pg_policies on a database migrated to the previous head: each arm
--   (( SELECT current_setting('app.<kind>'::text, true) AS current_setting) = 'true'::text)
-- becomes
--   (<arm> AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name))
-- and only the clauses that contain an arm are altered. `( SELECT CURRENT_USER)` is an
-- initplan, evaluated once per statement like the GUC read beside it. Superusers and
-- BYPASSRLS roles are exempt from RLS altogether, and SECURITY DEFINER resolvers run as
-- their (exempt) owner, so neither is affected. Pinned by rls-table-scope-map.db.unit.test.ts.
ALTER POLICY "audit_logs_tenant_isolation_delete" ON "audit"."logs"
  USING (((( SELECT current_setting('app.global_retention_cleanup'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name)));
--> statement-breakpoint
ALTER POLICY "audit_logs_tenant_isolation_insert" ON "audit"."logs"
  WITH CHECK (((organization_id = ( SELECT organizations.id
   FROM tenancy.organizations
  WHERE ((organizations.public_id)::text = ( SELECT current_setting('app.current_organization_public_id'::text, true) AS current_setting)))) OR ((organization_id IS NULL) AND ((( SELECT current_setting('app.system_audit_insert'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name)))));
--> statement-breakpoint
ALTER POLICY "audit_logs_tenant_isolation_select" ON "audit"."logs"
  USING (((organization_id = ( SELECT organizations.id
   FROM tenancy.organizations
  WHERE ((organizations.public_id)::text = ( SELECT current_setting('app.current_organization_public_id'::text, true) AS current_setting)))) OR ((( SELECT current_setting('app.global_retention_cleanup'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name)) OR ((( SELECT current_setting('app.global_admin'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name))));
--> statement-breakpoint
ALTER POLICY "audit_outbox_drain_delete" ON "audit"."outbox"
  USING (((( SELECT current_setting('app.audit_outbox_drain'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name)));
--> statement-breakpoint
ALTER POLICY "audit_outbox_drain_select" ON "audit"."outbox"
  USING (((( SELECT current_setting('app.audit_outbox_drain'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name)));
--> statement-breakpoint
ALTER POLICY "audit_outbox_drain_update" ON "audit"."outbox"
  USING (((( SELECT current_setting('app.audit_outbox_drain'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name)))
  WITH CHECK (((( SELECT current_setting('app.audit_outbox_drain'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name)));
--> statement-breakpoint
ALTER POLICY "audit_outbox_tenant_isolation_insert" ON "audit"."outbox"
  WITH CHECK ((((organization_public_id)::text = ( SELECT current_setting('app.current_organization_public_id'::text, true) AS current_setting)) OR ((organization_public_id IS NULL) AND ((( SELECT current_setting('app.system_audit_insert'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name)))));
--> statement-breakpoint
ALTER POLICY "auth_methods_self_or_admin_access" ON "auth"."auth_methods"
  USING (((user_id = ( SELECT users.id
   FROM auth.users
  WHERE (((users.public_id)::text = ( SELECT current_setting('app.current_user_public_id'::text, true) AS current_setting)) AND (users.deleted_at IS NULL)))) OR ((( SELECT current_setting('app.global_admin'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name))))
  WITH CHECK (((user_id = ( SELECT users.id
   FROM auth.users
  WHERE (((users.public_id)::text = ( SELECT current_setting('app.current_user_public_id'::text, true) AS current_setting)) AND (users.deleted_at IS NULL)))) OR ((( SELECT current_setting('app.global_admin'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name))));
--> statement-breakpoint
ALTER POLICY "sessions_user_access" ON "auth"."sessions"
  USING (((user_id = ( SELECT users.id
   FROM auth.users
  WHERE (((users.public_id)::text = ( SELECT current_setting('app.current_user_public_id'::text, true) AS current_setting)) AND (users.deleted_at IS NULL)))) OR ((public_id)::text = ( SELECT current_setting('app.current_session_public_id'::text, true) AS current_setting)) OR ((token_hash)::text = ( SELECT current_setting('app.current_session_token_hash'::text, true) AS current_setting)) OR ((( SELECT current_setting('app.session_retention_cleanup'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name))))
  WITH CHECK (((user_id = ( SELECT users.id
   FROM auth.users
  WHERE (((users.public_id)::text = ( SELECT current_setting('app.current_user_public_id'::text, true) AS current_setting)) AND (users.deleted_at IS NULL)))) OR ((public_id)::text = ( SELECT current_setting('app.current_session_public_id'::text, true) AS current_setting)) OR ((token_hash)::text = ( SELECT current_setting('app.current_session_token_hash'::text, true) AS current_setting)) OR ((( SELECT current_setting('app.session_retention_cleanup'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name))));
--> statement-breakpoint
ALTER POLICY "user_data_exports_owner_access" ON "auth"."user_data_exports"
  USING (((user_id = ( SELECT users.id
   FROM auth.users
  WHERE (((users.public_id)::text = ( SELECT current_setting('app.current_user_public_id'::text, true) AS current_setting)) AND (users.deleted_at IS NULL)))) OR ((( SELECT current_setting('app.global_retention_cleanup'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name))))
  WITH CHECK (((user_id = ( SELECT users.id
   FROM auth.users
  WHERE (((users.public_id)::text = ( SELECT current_setting('app.current_user_public_id'::text, true) AS current_setting)) AND (users.deleted_at IS NULL)))) OR ((( SELECT current_setting('app.global_retention_cleanup'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name))));
--> statement-breakpoint
ALTER POLICY "users_self_or_admin_access" ON "auth"."users"
  USING (((((public_id)::text = ( SELECT current_setting('app.current_user_public_id'::text, true) AS current_setting)) AND (deleted_at IS NULL)) OR ((( SELECT current_setting('app.global_admin'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name)) OR ((( SELECT current_setting('app.global_retention_cleanup'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name))))
  WITH CHECK ((((public_id)::text = ( SELECT current_setting('app.current_user_public_id'::text, true) AS current_setting)) OR ((( SELECT current_setting('app.global_admin'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name))));
--> statement-breakpoint
ALTER POLICY "subscriptions_tenant_isolation" ON "billing"."subscriptions"
  USING (((organization_id = ( SELECT organizations.id
   FROM tenancy.organizations
  WHERE ((organizations.public_id)::text = ( SELECT current_setting('app.current_organization_public_id'::text, true) AS current_setting)))) OR ((( SELECT current_setting('app.global_retention_cleanup'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name))));
--> statement-breakpoint
ALTER POLICY "notifications_tenant_isolation" ON "notify"."notifications"
  USING ((((organization_id IS NOT NULL) AND (organization_id = ( SELECT organizations.id
   FROM tenancy.organizations
  WHERE ((organizations.public_id)::text = ( SELECT current_setting('app.current_organization_public_id'::text, true) AS current_setting))))) OR ((( SELECT current_setting('app.global_retention_cleanup'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name))));
--> statement-breakpoint
ALTER POLICY "webhook_delivery_attempts_tenant_isolation" ON "notify"."webhook_delivery_attempts"
  USING (((webhook_id IN ( SELECT webhooks.id
   FROM notify.webhooks
  WHERE (webhooks.organization_id = ( SELECT organizations.id
           FROM tenancy.organizations
          WHERE ((organizations.public_id)::text = ( SELECT current_setting('app.current_organization_public_id'::text, true) AS current_setting)))))) OR ((( SELECT current_setting('app.global_retention_cleanup'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name))));
--> statement-breakpoint
ALTER POLICY "webhooks_tenant_isolation" ON "notify"."webhooks"
  USING (((organization_id = ( SELECT organizations.id
   FROM tenancy.organizations
  WHERE ((organizations.public_id)::text = ( SELECT current_setting('app.current_organization_public_id'::text, true) AS current_setting)))) OR ((( SELECT current_setting('app.global_retention_cleanup'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name))));
--> statement-breakpoint
ALTER POLICY "api_keys_tenant_isolation" ON "tenancy"."api_keys"
  USING (((organization_id = ( SELECT organizations.id
   FROM tenancy.organizations
  WHERE ((organizations.public_id)::text = ( SELECT current_setting('app.current_organization_public_id'::text, true) AS current_setting)))) OR ((( SELECT current_setting('app.global_retention_cleanup'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name))));
--> statement-breakpoint
ALTER POLICY "membership_invitations_tenant_isolation" ON "tenancy"."membership_invitations"
  USING (((membership_id IN ( SELECT memberships.id
   FROM tenancy.memberships
  WHERE (memberships.organization_id = ( SELECT organizations.id
           FROM tenancy.organizations
          WHERE ((organizations.public_id)::text = ( SELECT current_setting('app.current_organization_public_id'::text, true) AS current_setting)))))) OR ((( SELECT current_setting('app.global_retention_cleanup'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name))));
--> statement-breakpoint
ALTER POLICY "memberships_tenant_isolation" ON "tenancy"."memberships"
  USING (((organization_id = ( SELECT organizations.id
   FROM tenancy.organizations
  WHERE ((organizations.public_id)::text = ( SELECT current_setting('app.current_organization_public_id'::text, true) AS current_setting)))) OR ((( SELECT current_setting('app.global_retention_cleanup'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name))));
--> statement-breakpoint
ALTER POLICY "organization_notification_policies_tenant_isolation" ON "tenancy"."organization_notification_policies"
  USING (((organization_id = ( SELECT organizations.id
   FROM tenancy.organizations
  WHERE ((organizations.public_id)::text = ( SELECT current_setting('app.current_organization_public_id'::text, true) AS current_setting)))) OR ((( SELECT current_setting('app.global_retention_cleanup'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name))));
--> statement-breakpoint
ALTER POLICY "organization_settings_tenant_isolation" ON "tenancy"."organization_settings"
  USING (((organization_id = ( SELECT organizations.id
   FROM tenancy.organizations
  WHERE ((organizations.public_id)::text = ( SELECT current_setting('app.current_organization_public_id'::text, true) AS current_setting)))) OR ((( SELECT current_setting('app.global_retention_cleanup'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name))));
--> statement-breakpoint
ALTER POLICY "organizations_tenant_isolation" ON "tenancy"."organizations"
  USING (((((public_id)::text = ( SELECT current_setting('app.current_organization_public_id'::text, true) AS current_setting)) AND (deleted_at IS NULL)) OR ((( SELECT current_setting('app.global_retention_cleanup'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name))))
  WITH CHECK ((((public_id)::text = ( SELECT current_setting('app.current_organization_public_id'::text, true) AS current_setting)) OR ((( SELECT current_setting('app.global_retention_cleanup'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name))));
--> statement-breakpoint
ALTER POLICY "role_permissions_tenant_isolation" ON "tenancy"."role_permissions"
  USING (((role_id IN ( SELECT roles.id
   FROM tenancy.roles
  WHERE (roles.organization_id = ( SELECT organizations.id
           FROM tenancy.organizations
          WHERE ((organizations.public_id)::text = ( SELECT current_setting('app.current_organization_public_id'::text, true) AS current_setting)))))) OR ((( SELECT current_setting('app.global_retention_cleanup'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name))));
--> statement-breakpoint
ALTER POLICY "roles_tenant_isolation" ON "tenancy"."roles"
  USING (((organization_id = ( SELECT organizations.id
   FROM tenancy.organizations
  WHERE ((organizations.public_id)::text = ( SELECT current_setting('app.current_organization_public_id'::text, true) AS current_setting)))) OR ((( SELECT current_setting('app.global_retention_cleanup'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name))));
--> statement-breakpoint
ALTER POLICY "uploads_tenant_isolation" ON "upload"."uploads"
  USING ((((organization_id IS NOT NULL) AND (organization_id = ( SELECT organizations.id
   FROM tenancy.organizations
  WHERE ((organizations.public_id)::text = ( SELECT current_setting('app.current_organization_public_id'::text, true) AS current_setting))))) OR ((( SELECT current_setting('app.global_retention_cleanup'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name))))
  WITH CHECK ((((organization_id IS NOT NULL) AND (organization_id = ( SELECT organizations.id
   FROM tenancy.organizations
  WHERE ((organizations.public_id)::text = ( SELECT current_setting('app.current_organization_public_id'::text, true) AS current_setting))))) OR ((( SELECT current_setting('app.global_retention_cleanup'::text, true) AS current_setting) = 'true'::text) AND (( SELECT CURRENT_USER AS "current_user") = 'clinozy_be_maintenance'::name))));
