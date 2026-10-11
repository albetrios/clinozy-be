-- Migration: user_identity_policies_read_only
-- Created: 2026-10-10T13:17:28.810Z
-- Reference: docs/reference/data/migrations.md
--
-- The user-identity arms let a principal reach rows by `app.current_user_public_id` alone — every
-- signed-in request sets it. They were `FOR ALL`, so they also granted writes the application never
-- makes through them:
-- - `organizations_user_discovery`: any active member could UPDATE the organization (its WITH CHECK
--   only asked that `owner_user_id` be the current user, so a member could make themselves owner)
--   or DELETE it outright.
-- - `memberships_user_self_discovery` (no WITH CHECK): a member could rewrite their own membership
--   — role, status, organization — or delete it.
-- - `notifications_owner_access` (no WITH CHECK): a user could INSERT a notification into any
--   organization, or move one of theirs there.
-- Organization and membership writes run in the organization's context (the tenant-isolation
-- arm), never through these arms — organization creation included (`provisionOrganizationWithOwner`
-- opens the new organization's context). So the two discovery arms become read-only, and the
-- notification owner arm keeps exactly what the inbox does: read, mark read, delete. Notifications
-- are created in the organization's context or by the worker.
--
-- The application role may now UPDATE only a notification's read state (`is_read`, `read_at` — the
-- only columns any code path changes), so no arm can move a notification to another organization
-- or user. The USING expressions below are the current ones, unchanged.
DROP POLICY IF EXISTS "organizations_user_discovery" ON "tenancy"."organizations";
--> statement-breakpoint
CREATE POLICY "organizations_user_discovery" ON "tenancy"."organizations"
  FOR SELECT
  USING (((deleted_at IS NULL) AND (( SELECT current_setting('app.current_user_public_id'::text, true) AS current_setting) IS NOT NULL) AND (( SELECT current_setting('app.current_user_public_id'::text, true) AS current_setting) <> ''::text) AND ((owner_user_id = ( SELECT users.id
   FROM auth.users
  WHERE (((users.public_id)::text = ( SELECT current_setting('app.current_user_public_id'::text, true) AS current_setting)) AND (users.deleted_at IS NULL)))) OR tenancy.user_has_active_membership_for_organization(id, ( SELECT current_setting('app.current_user_public_id'::text, true) AS current_setting)))));
--> statement-breakpoint
DROP POLICY IF EXISTS "memberships_user_self_discovery" ON "tenancy"."memberships";
--> statement-breakpoint
CREATE POLICY "memberships_user_self_discovery" ON "tenancy"."memberships"
  FOR SELECT
  USING (((( SELECT current_setting('app.current_user_public_id'::text, true) AS current_setting) IS NOT NULL) AND (( SELECT current_setting('app.current_user_public_id'::text, true) AS current_setting) <> ''::text) AND (user_id = ( SELECT users.id
   FROM auth.users
  WHERE (((users.public_id)::text = ( SELECT current_setting('app.current_user_public_id'::text, true) AS current_setting)) AND (users.deleted_at IS NULL))))));
--> statement-breakpoint
DROP POLICY IF EXISTS "notifications_owner_access" ON "notify"."notifications";
--> statement-breakpoint
CREATE POLICY "notifications_owner_select" ON "notify"."notifications"
  FOR SELECT
  USING ((user_id = ( SELECT users.id
   FROM auth.users
  WHERE (((users.public_id)::text = ( SELECT current_setting('app.current_user_public_id'::text, true) AS current_setting)) AND (users.deleted_at IS NULL)))));
--> statement-breakpoint
CREATE POLICY "notifications_owner_update" ON "notify"."notifications"
  FOR UPDATE
  USING ((user_id = ( SELECT users.id
   FROM auth.users
  WHERE (((users.public_id)::text = ( SELECT current_setting('app.current_user_public_id'::text, true) AS current_setting)) AND (users.deleted_at IS NULL)))))
  WITH CHECK ((user_id = ( SELECT users.id
   FROM auth.users
  WHERE (((users.public_id)::text = ( SELECT current_setting('app.current_user_public_id'::text, true) AS current_setting)) AND (users.deleted_at IS NULL)))));
--> statement-breakpoint
CREATE POLICY "notifications_owner_delete" ON "notify"."notifications"
  FOR DELETE
  USING ((user_id = ( SELECT users.id
   FROM auth.users
  WHERE (((users.public_id)::text = ( SELECT current_setting('app.current_user_public_id'::text, true) AS current_setting)) AND (users.deleted_at IS NULL)))));
--> statement-breakpoint
REVOKE UPDATE ON "notify"."notifications" FROM clinozy_be_app;
--> statement-breakpoint
GRANT UPDATE ("is_read", "read_at") ON "notify"."notifications" TO clinozy_be_app;
