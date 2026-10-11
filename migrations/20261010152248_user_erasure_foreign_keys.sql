-- Migration: user_erasure_foreign_keys
-- Created: 2026-10-10T15:22:48.658Z
-- Reference: docs/reference/data/migrations.md
--
-- A deleted user's row is hard-deleted after TOMBSTONE_RETENTION_DAYS, and every foreign key to
-- auth.users without an ON DELETE action blocked that purge (the retention job skips a blocked
-- row, so the account — email, name, password hash — was kept forever). Each reference is now
-- what the data means:
-- - attribution (created_by / updated_by, a membership's inviter): the record outlives the person
--   who touched it — SET NULL;
-- - an invitation's inviter: nullable, SET NULL (the invitation belongs to the organization);
-- - an upload's uploader: nullable, SET NULL — an organization's file stays the organization's,
--   and a personal upload is tombstoned at account deletion and purged with its object;
-- - a verification token: belongs to the user — CASCADE.
-- organizations.owner_user_id stays NO ACTION: a user who owns a team organization cannot be
-- deleted, and account deletion tombstones the personal organization, which is purged with it.
-- Constraint names are kept; each is re-added NOT VALID and validated (no long lock).
ALTER TABLE tenancy.membership_invitations ALTER COLUMN "invited_by_user_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE upload.uploads ALTER COLUMN "user_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE auth.auth_methods DROP CONSTRAINT "auth_methods_created_by_user_id_users_id_fk", ADD CONSTRAINT "auth_methods_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE auth.auth_methods VALIDATE CONSTRAINT "auth_methods_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE auth.user_notification_preferences DROP CONSTRAINT "user_notification_preferences_created_by_user_id_users_id_fk", ADD CONSTRAINT "user_notification_preferences_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE auth.user_notification_preferences VALIDATE CONSTRAINT "user_notification_preferences_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE auth.user_notification_preferences DROP CONSTRAINT "user_notification_preferences_updated_by_user_id_users_id_fk", ADD CONSTRAINT "user_notification_preferences_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE auth.user_notification_preferences VALIDATE CONSTRAINT "user_notification_preferences_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE auth.verification_tokens DROP CONSTRAINT "verification_tokens_user_id_users_id_fk", ADD CONSTRAINT "verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES auth.users ("id") ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE auth.verification_tokens VALIDATE CONSTRAINT "verification_tokens_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE billing.plans DROP CONSTRAINT "plans_created_by_user_id_users_id_fk", ADD CONSTRAINT "plans_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE billing.plans VALIDATE CONSTRAINT "plans_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE billing.plans DROP CONSTRAINT "plans_updated_by_user_id_users_id_fk", ADD CONSTRAINT "plans_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE billing.plans VALIDATE CONSTRAINT "plans_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE billing.subscriptions DROP CONSTRAINT "subscriptions_created_by_user_id_users_id_fk", ADD CONSTRAINT "subscriptions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE billing.subscriptions VALIDATE CONSTRAINT "subscriptions_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE billing.subscriptions DROP CONSTRAINT "subscriptions_updated_by_user_id_users_id_fk", ADD CONSTRAINT "subscriptions_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE billing.subscriptions VALIDATE CONSTRAINT "subscriptions_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE notify.webhooks DROP CONSTRAINT "webhooks_created_by_user_id_users_id_fk", ADD CONSTRAINT "webhooks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE notify.webhooks VALIDATE CONSTRAINT "webhooks_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE notify.webhooks DROP CONSTRAINT "webhooks_updated_by_user_id_users_id_fk", ADD CONSTRAINT "webhooks_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE notify.webhooks VALIDATE CONSTRAINT "webhooks_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE tenancy.api_keys DROP CONSTRAINT "api_keys_created_by_user_id_users_id_fk", ADD CONSTRAINT "api_keys_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE tenancy.api_keys VALIDATE CONSTRAINT "api_keys_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE tenancy.api_keys DROP CONSTRAINT "api_keys_updated_by_user_id_users_id_fk", ADD CONSTRAINT "api_keys_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE tenancy.api_keys VALIDATE CONSTRAINT "api_keys_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE tenancy.membership_invitations DROP CONSTRAINT "membership_invitations_created_by_user_id_users_id_fk", ADD CONSTRAINT "membership_invitations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE tenancy.membership_invitations VALIDATE CONSTRAINT "membership_invitations_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE tenancy.membership_invitations DROP CONSTRAINT "membership_invitations_invited_by_user_id_users_id_fk", ADD CONSTRAINT "membership_invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE tenancy.membership_invitations VALIDATE CONSTRAINT "membership_invitations_invited_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE tenancy.memberships DROP CONSTRAINT "memberships_created_by_user_id_users_id_fk", ADD CONSTRAINT "memberships_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE tenancy.memberships VALIDATE CONSTRAINT "memberships_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE tenancy.memberships DROP CONSTRAINT "memberships_invited_by_user_id_users_id_fk", ADD CONSTRAINT "memberships_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE tenancy.memberships VALIDATE CONSTRAINT "memberships_invited_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE tenancy.memberships DROP CONSTRAINT "memberships_updated_by_user_id_users_id_fk", ADD CONSTRAINT "memberships_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE tenancy.memberships VALIDATE CONSTRAINT "memberships_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE tenancy.organization_notification_policies DROP CONSTRAINT "organization_notification_policies_created_by_user_id_users_id_", ADD CONSTRAINT "organization_notification_policies_created_by_user_id_users_id_" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE tenancy.organization_notification_policies VALIDATE CONSTRAINT "organization_notification_policies_created_by_user_id_users_id_";
--> statement-breakpoint
ALTER TABLE tenancy.organization_notification_policies DROP CONSTRAINT "organization_notification_policies_updated_by_user_id_users_id_", ADD CONSTRAINT "organization_notification_policies_updated_by_user_id_users_id_" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE tenancy.organization_notification_policies VALIDATE CONSTRAINT "organization_notification_policies_updated_by_user_id_users_id_";
--> statement-breakpoint
ALTER TABLE tenancy.organization_settings DROP CONSTRAINT "organization_settings_created_by_user_id_users_id_fk", ADD CONSTRAINT "organization_settings_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE tenancy.organization_settings VALIDATE CONSTRAINT "organization_settings_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE tenancy.organization_settings DROP CONSTRAINT "organization_settings_updated_by_user_id_users_id_fk", ADD CONSTRAINT "organization_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE tenancy.organization_settings VALIDATE CONSTRAINT "organization_settings_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE tenancy.organizations DROP CONSTRAINT "organizations_created_by_user_id_users_id_fk", ADD CONSTRAINT "organizations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE tenancy.organizations VALIDATE CONSTRAINT "organizations_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE tenancy.organizations DROP CONSTRAINT "organizations_updated_by_user_id_users_id_fk", ADD CONSTRAINT "organizations_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE tenancy.organizations VALIDATE CONSTRAINT "organizations_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE tenancy.role_permissions DROP CONSTRAINT "role_permissions_created_by_user_id_users_id_fk", ADD CONSTRAINT "role_permissions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE tenancy.role_permissions VALIDATE CONSTRAINT "role_permissions_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE tenancy.roles DROP CONSTRAINT "roles_created_by_user_id_users_id_fk", ADD CONSTRAINT "roles_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE tenancy.roles VALIDATE CONSTRAINT "roles_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE tenancy.roles DROP CONSTRAINT "roles_updated_by_user_id_users_id_fk", ADD CONSTRAINT "roles_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE tenancy.roles VALIDATE CONSTRAINT "roles_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE upload.uploads DROP CONSTRAINT "uploads_created_by_user_id_users_id_fk", ADD CONSTRAINT "uploads_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE upload.uploads VALIDATE CONSTRAINT "uploads_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE upload.uploads DROP CONSTRAINT "uploads_user_id_users_id_fk", ADD CONSTRAINT "uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE upload.uploads VALIDATE CONSTRAINT "uploads_user_id_users_id_fk";
