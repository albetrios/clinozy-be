-- migration-safety: allow missing_if_not_exists_on_create reason="Single scratch-database init migration; applied once to an empty database by schema_migrations."
-- migration-safety: allow create_index_without_concurrently reason="Transactional migrate.ts runner cannot execute CREATE INDEX CONCURRENTLY."
-- migration-safety: allow add_foreign_key_without_not_valid reason="Single scratch-database init migration creates empty tables before data exists."
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
-- btree_gist: the contacts' exclusion constraint (a number lives in one household, launch CT3).
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
CREATE SCHEMA "audit";
--> statement-breakpoint
CREATE SCHEMA "auth";
--> statement-breakpoint
CREATE SCHEMA "billing";
--> statement-breakpoint
CREATE SCHEMA "notify";
--> statement-breakpoint
CREATE SCHEMA "tenancy";
--> statement-breakpoint
CREATE SCHEMA "upload";
--> statement-breakpoint
CREATE SCHEMA "app";
--> statement-breakpoint
DO $$
BEGIN
	CREATE ROLE clinozy_be_app NOLOGIN;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE "audit"."logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_user_id" bigint,
	"target_user_id" bigint,
	"organization_id" bigint,
	"action" varchar(100) NOT NULL,
	"resource_type" varchar(50) NOT NULL,
	"resource_id" bigint,
	"ip_address" varchar(45),
	"user_agent" text,
	"severity" varchar(20) DEFAULT 'INFO' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_audit_severity" CHECK ("audit"."logs"."severity" IN ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'))
);
--> statement-breakpoint
ALTER TABLE "audit"."logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auth"."auth_methods" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"method_type" varchar(20) NOT NULL,
	"provider" varchar(50),
	"provider_user_id" varchar(255),
	"encrypted_secret" text,
	"phone_number" varchar(20),
	"is_primary" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by_user_id" bigint,
	CONSTRAINT "chk_auth_methods_type" CHECK ("auth"."auth_methods"."method_type" IN ('PASSWORD', 'EMAIL_CODE', 'OAUTH', 'MFA_TOTP', 'MFA_SMS', 'MFA_EMAIL'))
);
--> statement-breakpoint
CREATE TABLE "auth"."mail_outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"to_addresses" jsonb NOT NULL,
	"subject" varchar(500) NOT NULL,
	"html" text NOT NULL,
	"text_body" text,
	"reply_to" varchar(320),
	"tags" jsonb,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"resend_message_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "mail_outbox_status_check" CHECK ("auth"."mail_outbox"."status" IN ('pending', 'sending', 'sent', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "auth"."verification_tokens" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"token_type" varchar(30) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"user_id" bigint NOT NULL,
	"email" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "auth"."verification_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auth"."sessions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"user_id" bigint NOT NULL,
	"organization_id" bigint,
	"token_hash" varchar(64) NOT NULL,
	"ip_address" "inet" NOT NULL,
	"user_agent" text,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"is_revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "chk_sessions_expires" CHECK ("auth"."sessions"."expires_at" > "auth"."sessions"."created_at"),
	CONSTRAINT "chk_sessions_last_active" CHECK ("auth"."sessions"."last_active_at" >= "auth"."sessions"."created_at")
);
--> statement-breakpoint
ALTER TABLE "auth"."sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auth"."mfa_methods" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"user_id" bigint NOT NULL,
	"method_type" varchar(20) NOT NULL,
	"encrypted_secret" text,
	"phone_number" varchar(20),
	"is_verified" boolean DEFAULT false NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"last_used_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	CONSTRAINT "mfa_methods_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "auth"."mfa_recovery_codes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."webauthn_credentials" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"counter" bigint DEFAULT 0 NOT NULL,
	"device_type" varchar(32) DEFAULT 'singleDevice' NOT NULL,
	"backed_up" boolean DEFAULT false NOT NULL,
	"transports" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "billing"."plans" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"price_monthly" numeric(10, 2) NOT NULL,
	"price_yearly" numeric(10, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"stripe_product_id" varchar(255),
	"stripe_price_monthly_id" varchar(255),
	"stripe_price_yearly_id" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	CONSTRAINT "chk_plans_price_m" CHECK ("billing"."plans"."price_monthly" >= 0),
	CONSTRAINT "chk_plans_price_y" CHECK ("billing"."plans"."price_yearly" >= 0),
	CONSTRAINT "chk_plans_currency" CHECK ("billing"."plans"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "chk_plans_updated" CHECK ("billing"."plans"."updated_at" >= "billing"."plans"."created_at")
);
--> statement-breakpoint
CREATE TABLE "billing"."stripe_webhook_events" (
	"stripe_event_id" varchar(255) PRIMARY KEY NOT NULL,
	"event_type" varchar(128) NOT NULL,
	"stripe_created_at" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone,
	"processing_status" varchar(32) DEFAULT 'processing' NOT NULL,
	"failure_reason" text,
	"request_id" varchar(255),
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_webhook_events_processing_status_check" CHECK ("billing"."stripe_webhook_events"."processing_status" IN ('processing', 'processed', 'skipped_duplicate', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "billing"."subscriptions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"plan_id" bigint NOT NULL,
	"provider" varchar(50),
	"provider_subscription_id" varchar(255),
	"provider_customer_id" varchar(255),
	"billing_cycle" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'TRIALING' NOT NULL,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"trial_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp with time zone,
	"last_stripe_event_created_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	CONSTRAINT "chk_subs_status" CHECK ("billing"."subscriptions"."status" IN ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'PAUSED')),
	CONSTRAINT "chk_subs_cycle" CHECK ("billing"."subscriptions"."billing_cycle" IN ('MONTHLY', 'YEARLY')),
	CONSTRAINT "chk_subs_period" CHECK ("billing"."subscriptions"."current_period_end" > "billing"."subscriptions"."current_period_start"),
	CONSTRAINT "chk_subs_updated" CHECK ("billing"."subscriptions"."updated_at" >= "billing"."subscriptions"."created_at")
);
--> statement-breakpoint
ALTER TABLE "billing"."subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notify"."notifications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"user_id" bigint NOT NULL,
	"organization_id" bigint,
	"type" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"action_url" varchar(512),
	"action_label" varchar(50),
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_notifications_read" CHECK (NOT "notify"."notifications"."is_read" OR "notify"."notifications"."read_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "notify"."notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notify"."webhook_delivery_attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"webhook_id" bigint NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"event_key" varchar(255),
	"payload" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"http_status_code" integer,
	"response_body" text,
	"sent_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_webhook_attempts_status" CHECK ("notify"."webhook_delivery_attempts"."status" IN ('PENDING', 'SENDING', 'SENT', 'FAILED')),
	CONSTRAINT "chk_webhook_attempts_count" CHECK ("notify"."webhook_delivery_attempts"."attempt_count" >= 0 AND "notify"."webhook_delivery_attempts"."attempt_count" <= 5)
);
--> statement-breakpoint
ALTER TABLE "notify"."webhook_delivery_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notify"."webhooks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"url" text NOT NULL,
	"encrypted_secret" varchar(255) NOT NULL,
	"events" jsonb NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	CONSTRAINT "chk_webhooks_url" CHECK ("notify"."webhooks"."url" ~ '^https://'),
	CONSTRAINT "chk_webhooks_updated" CHECK ("notify"."webhooks"."updated_at" >= "notify"."webhooks"."created_at")
);
--> statement-breakpoint
ALTER TABLE "notify"."webhooks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenancy"."role_permissions" (
	"role_id" bigint NOT NULL,
	"permission_code" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	CONSTRAINT "pk_role_permissions" PRIMARY KEY("role_id","permission_code")
);
--> statement-breakpoint
ALTER TABLE "tenancy"."role_permissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenancy"."roles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"tone" varchar(10) DEFAULT 'sky' NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_roles_updated" CHECK ("tenancy"."roles"."updated_at" >= "tenancy"."roles"."created_at"),
	CONSTRAINT "chk_roles_tone" CHECK ("tenancy"."roles"."tone" IN ('butter', 'lav', 'sky', 'sage', 'blush', 'mint', 'peach', 'plum', 'lime', 'slate', 'stone')),
	CONSTRAINT "chk_roles_delete_reason" CHECK ("tenancy"."roles"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_roles_delete_reason_when_deleted" CHECK ("tenancy"."roles"."delete_reason" IS NULL OR "tenancy"."roles"."deleted_at" IS NOT NULL),
	CONSTRAINT "chk_roles_delete_note_when_other" CHECK ("tenancy"."roles"."delete_reason" IS DISTINCT FROM 'other' OR "tenancy"."roles"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "tenancy"."roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenancy"."membership_invitations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"membership_id" bigint NOT NULL,
	"email" varchar(255) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"invited_by_user_id" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	CONSTRAINT "chk_membership_invitations_expires" CHECK ("tenancy"."membership_invitations"."expires_at" > "tenancy"."membership_invitations"."created_at"),
	CONSTRAINT "chk_membership_invitations_accepted" CHECK ("tenancy"."membership_invitations"."accepted_at" IS NULL OR "tenancy"."membership_invitations"."revoked_at" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "tenancy"."membership_invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenancy"."memberships" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"user_id" bigint NOT NULL,
	"organization_id" bigint NOT NULL,
	"role_id" bigint NOT NULL,
	"status" varchar(20) DEFAULT 'invited' NOT NULL,
	"invited_by_user_id" bigint,
	"joined_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"staff_number" integer DEFAULT 0 NOT NULL,
	"phone" varchar(16),
	"tone" varchar(10) DEFAULT 'sky' NOT NULL,
	"working_days" text[] DEFAULT '{"mon","tue","wed","thu","fri","sat"}' NOT NULL,
	"work_starts_at" time DEFAULT '10:00' NOT NULL,
	"work_ends_at" time DEFAULT '19:00' NOT NULL,
	"commission_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	"display_name" varchar(120) DEFAULT '' NOT NULL,
	CONSTRAINT "chk_memberships_status" CHECK ("tenancy"."memberships"."status" IN ('invited', 'active', 'suspended')),
	CONSTRAINT "chk_memberships_joined" CHECK ("tenancy"."memberships"."status" != 'active' OR "tenancy"."memberships"."joined_at" IS NOT NULL),
	CONSTRAINT "chk_memberships_updated" CHECK ("tenancy"."memberships"."updated_at" >= "tenancy"."memberships"."created_at"),
	CONSTRAINT "chk_memberships_staff_number" CHECK ("tenancy"."memberships"."staff_number" > 0),
	CONSTRAINT "chk_memberships_phone" CHECK ("tenancy"."memberships"."phone" ~ '^\+91\d{10}$'),
	CONSTRAINT "chk_memberships_tone" CHECK ("tenancy"."memberships"."tone" IN ('butter', 'lav', 'sky', 'sage', 'blush', 'mint', 'peach', 'plum', 'lime', 'slate', 'stone')),
	CONSTRAINT "chk_memberships_working_days_allowed" CHECK ("tenancy"."memberships"."working_days" <@ ARRAY['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']::text[]),
	CONSTRAINT "chk_memberships_working_days_count" CHECK (cardinality("tenancy"."memberships"."working_days") BETWEEN 1 AND 7),
	CONSTRAINT "chk_memberships_work_hours" CHECK ("tenancy"."memberships"."work_ends_at" > "tenancy"."memberships"."work_starts_at"),
	CONSTRAINT "chk_memberships_commission_percent" CHECK ("tenancy"."memberships"."commission_percent" BETWEEN 0 AND 100),
	CONSTRAINT "chk_memberships_delete_reason" CHECK ("tenancy"."memberships"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other', 'left', 'account_deleted')),
	CONSTRAINT "chk_memberships_delete_reason_when_deleted" CHECK ("tenancy"."memberships"."delete_reason" IS NULL OR "tenancy"."memberships"."deleted_at" IS NOT NULL),
	CONSTRAINT "chk_memberships_delete_note_when_other" CHECK ("tenancy"."memberships"."delete_reason" IS DISTINCT FROM 'other' OR "tenancy"."memberships"."delete_note" IS NOT NULL),
	CONSTRAINT "chk_memberships_display_name" CHECK (btrim("tenancy"."memberships"."display_name") <> '')
);
--> statement-breakpoint
ALTER TABLE "tenancy"."memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenancy"."api_keys" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"name" varchar(255) NOT NULL,
	"key_hash" varchar(255) NOT NULL,
	"key_prefix" varchar(10) NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	CONSTRAINT "chk_api_keys_status" CHECK ("tenancy"."api_keys"."status" IN ('ACTIVE', 'REVOKED')),
	CONSTRAINT "chk_api_keys_updated" CHECK ("tenancy"."api_keys"."updated_at" >= "tenancy"."api_keys"."created_at")
);
--> statement-breakpoint
ALTER TABLE "tenancy"."api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenancy"."organization_notification_policies" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"notification_type" varchar(50) NOT NULL,
	"channel" varchar(20) NOT NULL,
	"default_enabled" boolean DEFAULT true NOT NULL,
	"is_mandatory" boolean DEFAULT false NOT NULL,
	"muted_until" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	CONSTRAINT "chk_org_notif_channel" CHECK ("tenancy"."organization_notification_policies"."channel" IN ('EMAIL', 'SMS', 'WEB_PUSH', 'IN_APP')),
	CONSTRAINT "chk_org_notif_muted" CHECK ("tenancy"."organization_notification_policies"."muted_until" IS NULL OR "tenancy"."organization_notification_policies"."muted_until" > now()),
	CONSTRAINT "chk_org_notif_updated" CHECK ("tenancy"."organization_notification_policies"."updated_at" >= "tenancy"."organization_notification_policies"."created_at")
);
--> statement-breakpoint
ALTER TABLE "tenancy"."organization_notification_policies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenancy"."organization_settings" (
	"organization_id" bigint PRIMARY KEY NOT NULL,
	"is_email_notifications_enabled" boolean DEFAULT true NOT NULL,
	"default_locale" varchar(5) DEFAULT 'en' NOT NULL,
	"security_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"default_day_float" numeric(12, 2) DEFAULT '2000.00' NOT NULL,
	"lead_hold_days" integer DEFAULT 3 NOT NULL,
	"reminder_hour" smallint DEFAULT 16 NOT NULL,
	"retarget_after_days" integer DEFAULT 90 NOT NULL,
	"deleted_record_purge_days" integer DEFAULT 7 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	CONSTRAINT "chk_org_settings_updated" CHECK ("tenancy"."organization_settings"."updated_at" >= "tenancy"."organization_settings"."created_at"),
	CONSTRAINT "chk_organization_settings_default_locale" CHECK ("tenancy"."organization_settings"."default_locale" IN ('en', 'es')),
	CONSTRAINT "chk_organization_settings_default_day_float" CHECK ("tenancy"."organization_settings"."default_day_float" >= 0),
	CONSTRAINT "chk_organization_settings_lead_hold_days" CHECK ("tenancy"."organization_settings"."lead_hold_days" >= 1),
	CONSTRAINT "chk_organization_settings_reminder_hour" CHECK ("tenancy"."organization_settings"."reminder_hour" BETWEEN 0 AND 23),
	CONSTRAINT "chk_organization_settings_retarget_after_days" CHECK ("tenancy"."organization_settings"."retarget_after_days" >= 1),
	CONSTRAINT "chk_organization_settings_deleted_record_purge_days" CHECK ("tenancy"."organization_settings"."deleted_record_purge_days" >= 1)
);
--> statement-breakpoint
ALTER TABLE "tenancy"."organization_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenancy"."organizations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100),
	"type" varchar(20) DEFAULT 'TEAM' NOT NULL,
	"owner_user_id" bigint NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"logo_url" varchar(512),
	"stripe_customer_id" varchar(255),
	"specialties" text[] DEFAULT ARRAY['skin']::text[] NOT NULL,
	"timezone" varchar(64) DEFAULT 'Asia/Kolkata' NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	CONSTRAINT "chk_organizations_status" CHECK ("tenancy"."organizations"."status" IN ('ACTIVE', 'SUSPENDED', 'ARCHIVED')),
	CONSTRAINT "chk_organizations_type" CHECK ("tenancy"."organizations"."type" IN ('PERSONAL', 'TEAM')),
	CONSTRAINT "chk_organizations_slug" CHECK ("tenancy"."organizations"."slug" ~ '^[a-z0-9-]+$'),
	CONSTRAINT "chk_organizations_updated" CHECK ("tenancy"."organizations"."updated_at" >= "tenancy"."organizations"."created_at"),
	CONSTRAINT "chk_organizations_specialties_allowed" CHECK ("tenancy"."organizations"."specialties" <@ ARRAY['skin', 'hair', 'dental', 'gynac', 'physio', 'general']::text[]),
	CONSTRAINT "chk_organizations_specialties_count" CHECK (cardinality("tenancy"."organizations"."specialties") BETWEEN 1 AND 6),
	CONSTRAINT "chk_organizations_currency" CHECK ("tenancy"."organizations"."currency" = 'INR')
);
--> statement-breakpoint
ALTER TABLE "tenancy"."organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenancy"."permissions" (
	"code" varchar(100) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"category" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upload"."uploads" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"user_id" bigint NOT NULL,
	"organization_id" bigint,
	"file_name" varchar(255) NOT NULL,
	"file_key" varchar(512) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"file_size" integer NOT NULL,
	"storage_provider" varchar(20) DEFAULT 's3' NOT NULL,
	"bucket" varchar(100) NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"uploaded_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	CONSTRAINT "chk_uploads_file_size" CHECK ("upload"."uploads"."file_size" >= 0),
	CONSTRAINT "chk_uploads_status" CHECK ("upload"."uploads"."status" IN ('PENDING', 'UPLOADED', 'FAILED'))
);
--> statement-breakpoint
ALTER TABLE "upload"."uploads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auth"."user_data_exports" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"user_id" bigint NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"s3_key" varchar(512),
	"expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"error_code" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_data_exports_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "user_data_exports_status_check" CHECK ("auth"."user_data_exports"."status" IN ('pending', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "auth"."user_notification_preferences" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"organization_id" bigint,
	"notification_type" varchar(50) NOT NULL,
	"channel" varchar(20) NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	CONSTRAINT "chk_user_notif_prefs_channel" CHECK ("auth"."user_notification_preferences"."channel" IN ('EMAIL', 'SMS', 'WEB_PUSH', 'IN_APP')),
	CONSTRAINT "chk_user_notif_prefs_updated" CHECK ("auth"."user_notification_preferences"."updated_at" >= "auth"."user_notification_preferences"."created_at")
);
--> statement-breakpoint
ALTER TABLE "auth"."user_notification_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auth"."user_settings" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"is_dark_mode_enabled" boolean DEFAULT false NOT NULL,
	"is_notifications_enabled" boolean DEFAULT true NOT NULL,
	"language" varchar(10) DEFAULT 'en' NOT NULL,
	"preferred_locales" jsonb DEFAULT '["en"]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_user_settings_updated" CHECK ("auth"."user_settings"."updated_at" >= "auth"."user_settings"."created_at")
);
--> statement-breakpoint
CREATE TABLE "auth"."users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"email" varchar(255) NOT NULL,
	"email_hash" varchar(64) NOT NULL,
	"is_email_verified" boolean DEFAULT false NOT NULL,
	"first_name" varchar(100),
	"last_name" varchar(100),
	"avatar_url" varchar(512),
	"password_hash" varchar(255),
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"account_locked_until" timestamp with time zone,
	"last_password_change_at" timestamp with time zone,
	"is_mfa_enabled" boolean DEFAULT false NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"last_active_at" timestamp with time zone,
	"presence" varchar(10) DEFAULT 'online' NOT NULL,
	"last_active_organization_id" bigint,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_users_status" CHECK ("auth"."users"."status" IN ('ACTIVE', 'LOCKED', 'SUSPENDED')),
	CONSTRAINT "chk_users_failed_login" CHECK ("auth"."users"."failed_login_count" >= 0),
	CONSTRAINT "chk_users_updated" CHECK ("auth"."users"."updated_at" >= "auth"."users"."created_at"),
	CONSTRAINT "chk_users_presence" CHECK ("auth"."users"."presence" IN ('online', 'busy', 'away'))
);
--> statement-breakpoint
ALTER TABLE "audit"."logs" ADD CONSTRAINT "logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit"."logs" ADD CONSTRAINT "logs_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit"."logs" ADD CONSTRAINT "logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."auth_methods" ADD CONSTRAINT "auth_methods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."auth_methods" ADD CONSTRAINT "auth_methods_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."sessions" ADD CONSTRAINT "sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."plans" ADD CONSTRAINT "plans_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."plans" ADD CONSTRAINT "plans_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "billing"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."subscriptions" ADD CONSTRAINT "subscriptions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."subscriptions" ADD CONSTRAINT "subscriptions_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notify"."notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notify"."notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notify"."webhook_delivery_attempts" ADD CONSTRAINT "webhook_delivery_attempts_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "notify"."webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notify"."webhooks" ADD CONSTRAINT "webhooks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notify"."webhooks" ADD CONSTRAINT "webhooks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notify"."webhooks" ADD CONSTRAINT "webhooks_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "tenancy"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."role_permissions" ADD CONSTRAINT "role_permissions_permission_code_permissions_code_fk" FOREIGN KEY ("permission_code") REFERENCES "tenancy"."permissions"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."role_permissions" ADD CONSTRAINT "role_permissions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."roles" ADD CONSTRAINT "roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."roles" ADD CONSTRAINT "roles_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."roles" ADD CONSTRAINT "roles_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."membership_invitations" ADD CONSTRAINT "membership_invitations_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "tenancy"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."membership_invitations" ADD CONSTRAINT "membership_invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."membership_invitations" ADD CONSTRAINT "membership_invitations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."memberships" ADD CONSTRAINT "memberships_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "tenancy"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."memberships" ADD CONSTRAINT "memberships_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."memberships" ADD CONSTRAINT "memberships_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."memberships" ADD CONSTRAINT "memberships_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."api_keys" ADD CONSTRAINT "api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."api_keys" ADD CONSTRAINT "api_keys_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."api_keys" ADD CONSTRAINT "api_keys_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."organization_notification_policies" ADD CONSTRAINT "organization_notification_policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."organization_notification_policies" ADD CONSTRAINT "organization_notification_policies_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."organization_notification_policies" ADD CONSTRAINT "organization_notification_policies_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."organization_settings" ADD CONSTRAINT "organization_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."organization_settings" ADD CONSTRAINT "organization_settings_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."organization_settings" ADD CONSTRAINT "organization_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."organizations" ADD CONSTRAINT "organizations_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."organizations" ADD CONSTRAINT "organizations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."organizations" ADD CONSTRAINT "organizations_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload"."uploads" ADD CONSTRAINT "uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload"."uploads" ADD CONSTRAINT "uploads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload"."uploads" ADD CONSTRAINT "uploads_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."user_data_exports" ADD CONSTRAINT "user_data_exports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_logs_org_created" ON "audit"."logs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_actor_created" ON "audit"."logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_resource" ON "audit"."logs" USING btree ("resource_type","resource_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_created_at" ON "audit"."logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_severity_created" ON "audit"."logs" USING btree ("severity","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_action_created" ON "audit"."logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "idx_auth_methods_user_type" ON "auth"."auth_methods" USING btree ("user_id","method_type");--> statement-breakpoint
CREATE INDEX "idx_auth_methods_provider" ON "auth"."auth_methods" USING btree ("provider","provider_user_id");--> statement-breakpoint
CREATE INDEX "idx_auth_methods_user_revoked" ON "auth"."auth_methods" USING btree ("user_id","revoked_at");--> statement-breakpoint
CREATE INDEX "idx_auth_methods_user_primary" ON "auth"."auth_methods" USING btree ("user_id","is_primary");--> statement-breakpoint
CREATE INDEX "idx_mail_outbox_status_created_at" ON "auth"."mail_outbox" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_verification_tokens_token_hash" ON "auth"."verification_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_verification_tokens_user_type" ON "auth"."verification_tokens" USING btree ("user_id","token_type");--> statement-breakpoint
CREATE INDEX "idx_sessions_user_status" ON "auth"."sessions" USING btree ("user_id","is_revoked","expires_at");--> statement-breakpoint
CREATE INDEX "idx_sessions_expires" ON "auth"."sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_mfa_recovery_codes_user_code_hash" ON "auth"."mfa_recovery_codes" USING btree ("user_id","code_hash");--> statement-breakpoint
CREATE INDEX "idx_mfa_recovery_codes_user_unused" ON "auth"."mfa_recovery_codes" USING btree ("user_id") WHERE "auth"."mfa_recovery_codes"."used_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "webauthn_credentials_credential_id_unique" ON "auth"."webauthn_credentials" USING btree ("credential_id") WHERE "auth"."webauthn_credentials"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "webauthn_credentials_user_id_idx" ON "auth"."webauthn_credentials" USING btree ("user_id") WHERE "auth"."webauthn_credentials"."revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_plans_public_id" ON "billing"."plans" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_plans_name" ON "billing"."plans" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_plans_active" ON "billing"."plans" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_plans_active_price" ON "billing"."plans" USING btree ("is_active","price_monthly");--> statement-breakpoint
CREATE INDEX "idx_stripe_webhook_events_status_created" ON "billing"."stripe_webhook_events" USING btree ("processing_status","stripe_created_at");--> statement-breakpoint
CREATE INDEX "idx_stripe_webhook_events_status_updated" ON "billing"."stripe_webhook_events" USING btree ("processing_status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_subscriptions_public_id" ON "billing"."subscriptions" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_subscriptions_org" ON "billing"."subscriptions" USING btree ("organization_id") WHERE "billing"."subscriptions"."status" <> 'CANCELED';--> statement-breakpoint
CREATE INDEX "idx_subscriptions_org_status" ON "billing"."subscriptions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_plan" ON "billing"."subscriptions" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_status_period" ON "billing"."subscriptions" USING btree ("status","current_period_end");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_provider_subscription_id" ON "billing"."subscriptions" USING btree ("provider_subscription_id") WHERE "billing"."subscriptions"."provider_subscription_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_notifications_public_id" ON "notify"."notifications" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_read" ON "notify"."notifications" USING btree ("user_id","is_read","created_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_org" ON "notify"."notifications" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_type" ON "notify"."notifications" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_created" ON "notify"."notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_webhook_attempts_webhook" ON "notify"."webhook_delivery_attempts" USING btree ("webhook_id","event_type","created_at");--> statement-breakpoint
CREATE INDEX "idx_webhook_attempts_retry" ON "notify"."webhook_delivery_attempts" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_webhook_delivery_attempts_pending_event_key" ON "notify"."webhook_delivery_attempts" USING btree ("webhook_id","event_key") WHERE "notify"."webhook_delivery_attempts"."status" = 'PENDING' AND "notify"."webhook_delivery_attempts"."event_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_webhooks_public_id" ON "notify"."webhooks" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "idx_webhooks_org_enabled" ON "notify"."webhooks" USING btree ("organization_id","is_enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_webhooks_organization_id_url_unique" ON "notify"."webhooks" USING btree ("organization_id","url");--> statement-breakpoint
CREATE INDEX "idx_role_permissions_code" ON "tenancy"."role_permissions" USING btree ("permission_code");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_roles_public_id" ON "tenancy"."roles" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "idx_roles_org_name" ON "tenancy"."roles" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "idx_roles_org_system" ON "tenancy"."roles" USING btree ("organization_id","is_system");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_roles_org_name_unique" ON "tenancy"."roles" USING btree ("organization_id","name") WHERE "tenancy"."roles"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_membership_invitations_public_id" ON "tenancy"."membership_invitations" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_membership_invitations_token" ON "tenancy"."membership_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_membership_invitations_membership" ON "tenancy"."membership_invitations" USING btree ("membership_id");--> statement-breakpoint
CREATE INDEX "idx_membership_invitations_email" ON "tenancy"."membership_invitations" USING btree ("email","accepted_at");--> statement-breakpoint
CREATE INDEX "idx_membership_invitations_expires" ON "tenancy"."membership_invitations" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_memberships_public_id" ON "tenancy"."memberships" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "idx_memberships_user_org" ON "tenancy"."memberships" USING btree ("user_id","organization_id");--> statement-breakpoint
CREATE INDEX "idx_memberships_org_status" ON "tenancy"."memberships" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "idx_memberships_user_status" ON "tenancy"."memberships" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_memberships_role" ON "tenancy"."memberships" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_memberships_user_org_unique" ON "tenancy"."memberships" USING btree ("user_id","organization_id") WHERE "tenancy"."memberships"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_memberships_organization_staff_number" ON "tenancy"."memberships" USING btree ("organization_id","staff_number");--> statement-breakpoint
-- (organization_id, id): the target of the app's composite membership foreign keys, so a record can only
-- point at a member of its own organization (launch K8).
CREATE UNIQUE INDEX "idx_memberships_organization_id_id" ON "tenancy"."memberships" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_api_keys_public_id" ON "tenancy"."api_keys" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "idx_api_keys_organization" ON "tenancy"."api_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_api_keys_organization_status" ON "tenancy"."api_keys" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "idx_api_keys_key_prefix" ON "tenancy"."api_keys" USING btree ("key_prefix");--> statement-breakpoint
CREATE INDEX "idx_api_keys_deleted" ON "tenancy"."api_keys" USING btree ("deleted_at") WHERE "tenancy"."api_keys"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_api_keys_scopes_gin" ON "tenancy"."api_keys" USING gin ("scopes");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_organization_notification_policies_public_id" ON "tenancy"."organization_notification_policies" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_org_notif_policy_unique" ON "tenancy"."organization_notification_policies" USING btree ("organization_id","notification_type","channel");--> statement-breakpoint
CREATE INDEX "idx_org_notif_policy_mandatory" ON "tenancy"."organization_notification_policies" USING btree ("organization_id","is_mandatory");--> statement-breakpoint
CREATE INDEX "idx_org_notif_policy_muted" ON "tenancy"."organization_notification_policies" USING btree ("muted_until");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_organizations_public_id" ON "tenancy"."organizations" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_organizations_slug" ON "tenancy"."organizations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_org_one_personal_per_owner" ON "tenancy"."organizations" USING btree ("owner_user_id") WHERE "tenancy"."organizations"."type" = 'PERSONAL';--> statement-breakpoint
CREATE INDEX "idx_organizations_owner" ON "tenancy"."organizations" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "idx_organizations_status_deleted" ON "tenancy"."organizations" USING btree ("status","deleted_at");--> statement-breakpoint
CREATE INDEX "idx_organizations_created_at" ON "tenancy"."organizations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_organizations_active" ON "tenancy"."organizations" USING btree ("name") WHERE "tenancy"."organizations"."deleted_at" IS NULL AND "tenancy"."organizations"."status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "idx_organizations_stripe_customer_id" ON "tenancy"."organizations" USING btree ("stripe_customer_id") WHERE "tenancy"."organizations"."stripe_customer_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_permissions_category" ON "tenancy"."permissions" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_permissions_name" ON "tenancy"."permissions" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_uploads_public_id" ON "upload"."uploads" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "idx_uploads_user_id" ON "upload"."uploads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_uploads_organization_id" ON "upload"."uploads" USING btree ("organization_id") WHERE "upload"."uploads"."organization_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_user_data_exports_user_id" ON "auth"."user_data_exports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_data_exports_user_id_status" ON "auth"."user_data_exports" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_user_data_exports_expires_at" ON "auth"."user_data_exports" USING btree ("expires_at") WHERE "auth"."user_data_exports"."expires_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_user_notif_prefs_user_type" ON "auth"."user_notification_preferences" USING btree ("user_id","notification_type","channel");--> statement-breakpoint
CREATE INDEX "idx_user_notif_prefs_org" ON "auth"."user_notification_preferences" USING btree ("organization_id","notification_type");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_users_public_id" ON "auth"."users" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "auth"."users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_users_email_hash" ON "auth"."users" USING btree ("email_hash");--> statement-breakpoint
CREATE INDEX "idx_users_status_deleted" ON "auth"."users" USING btree ("status","deleted_at");--> statement-breakpoint
CREATE INDEX "idx_users_last_active" ON "auth"."users" USING btree ("last_active_at");--> statement-breakpoint
CREATE INDEX "idx_users_verified_status" ON "auth"."users" USING btree ("is_email_verified","status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_users_email_unique" ON "auth"."users" USING btree ("email") WHERE "auth"."users"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_users_last_active_not_deleted" ON "auth"."users" USING btree ("last_active_at") WHERE "auth"."users"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_users_locked" ON "auth"."users" USING btree ("account_locked_until") WHERE "auth"."users"."account_locked_until" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_users_email_trgm" ON "auth"."users" USING gin ("email" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_users_display_name_trgm" ON "auth"."users" USING gin ((coalesce("first_name", '') || ' ' || coalesce("last_name", '')) gin_trgm_ops);--> statement-breakpoint
CREATE POLICY "audit_logs_tenant_isolation" ON "audit"."logs" AS PERMISSIVE FOR ALL TO public USING ("audit"."logs"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_id', true)
          )
          OR current_setting('app.global_retention_cleanup', true) = 'true');--> statement-breakpoint
CREATE POLICY "verification_tokens_application_access" ON "auth"."verification_tokens" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "sessions_user_access" ON "auth"."sessions" AS PERMISSIVE FOR ALL TO public USING ((
          "auth"."sessions"."user_id" = (
            SELECT id FROM auth.users
            WHERE public_id = current_setting('app.current_user_id', true)
              AND deleted_at IS NULL
          )
          OR "auth"."sessions"."public_id" = current_setting('app.current_session_public_id', true)
          OR "auth"."sessions"."token_hash" = current_setting('app.current_session_token_hash', true)
          OR current_setting('app.session_retention_cleanup', true) = 'true'
        )) WITH CHECK ((
          "auth"."sessions"."user_id" = (
            SELECT id FROM auth.users
            WHERE public_id = current_setting('app.current_user_id', true)
              AND deleted_at IS NULL
          )
          OR "auth"."sessions"."public_id" = current_setting('app.current_session_public_id', true)
          OR "auth"."sessions"."token_hash" = current_setting('app.current_session_token_hash', true)
          OR current_setting('app.session_retention_cleanup', true) = 'true'
        ));--> statement-breakpoint
CREATE POLICY "subscriptions_tenant_isolation" ON "billing"."subscriptions" AS PERMISSIVE FOR ALL TO public USING ("billing"."subscriptions"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_id', true)
          )
          OR current_setting('app.global_retention_cleanup', true) = 'true');--> statement-breakpoint
CREATE POLICY "notifications_tenant_isolation" ON "notify"."notifications" AS PERMISSIVE FOR ALL TO public USING ((
            "notify"."notifications"."organization_id" IS NOT NULL
            AND "notify"."notifications"."organization_id" = (
              SELECT id FROM tenancy.organizations
              WHERE public_id = current_setting('app.current_organization_id', true)
            )
          )
          OR current_setting('app.global_retention_cleanup', true) = 'true');--> statement-breakpoint
CREATE POLICY "webhook_delivery_attempts_tenant_isolation" ON "notify"."webhook_delivery_attempts" AS PERMISSIVE FOR ALL TO public USING ("notify"."webhook_delivery_attempts"."webhook_id" IN (
            SELECT id FROM notify.webhooks
            WHERE organization_id = (
              SELECT id FROM tenancy.organizations
              WHERE public_id = current_setting('app.current_organization_id', true)
            )
          )
          OR current_setting('app.global_retention_cleanup', true) = 'true');--> statement-breakpoint
CREATE POLICY "webhooks_tenant_isolation" ON "notify"."webhooks" AS PERMISSIVE FOR ALL TO public USING ("notify"."webhooks"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_id', true)
          )
          OR current_setting('app.global_retention_cleanup', true) = 'true');--> statement-breakpoint
CREATE POLICY "role_permissions_tenant_isolation" ON "tenancy"."role_permissions" AS PERMISSIVE FOR ALL TO public USING ("tenancy"."role_permissions"."role_id" IN (
            SELECT id FROM tenancy.roles
            WHERE organization_id = (
              SELECT id FROM tenancy.organizations
              WHERE public_id = current_setting('app.current_organization_id', true)
            )
          )
          OR current_setting('app.global_retention_cleanup', true) = 'true');--> statement-breakpoint
CREATE POLICY "roles_tenant_isolation" ON "tenancy"."roles" AS PERMISSIVE FOR ALL TO public USING ("tenancy"."roles"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_id', true)
          )
          OR current_setting('app.global_retention_cleanup', true) = 'true');--> statement-breakpoint
CREATE POLICY "membership_invitations_tenant_isolation" ON "tenancy"."membership_invitations" AS PERMISSIVE FOR ALL TO public USING ("tenancy"."membership_invitations"."membership_id" IN (
            SELECT id FROM tenancy.memberships
            WHERE organization_id = (
              SELECT id FROM tenancy.organizations
              WHERE public_id = current_setting('app.current_organization_id', true)
            )
          )
          OR current_setting('app.global_retention_cleanup', true) = 'true');--> statement-breakpoint
CREATE POLICY "memberships_tenant_isolation" ON "tenancy"."memberships" AS PERMISSIVE FOR ALL TO public USING ("tenancy"."memberships"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_id', true)
          )
          OR current_setting('app.global_retention_cleanup', true) = 'true');--> statement-breakpoint
CREATE POLICY "api_keys_tenant_isolation" ON "tenancy"."api_keys" AS PERMISSIVE FOR ALL TO public USING ("tenancy"."api_keys"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_id', true)
          )
          OR current_setting('app.global_retention_cleanup', true) = 'true');--> statement-breakpoint
CREATE POLICY "organization_notification_policies_tenant_isolation" ON "tenancy"."organization_notification_policies" AS PERMISSIVE FOR ALL TO public USING ("tenancy"."organization_notification_policies"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_id', true)
          )
          OR current_setting('app.global_retention_cleanup', true) = 'true');--> statement-breakpoint
CREATE POLICY "organization_settings_tenant_isolation" ON "tenancy"."organization_settings" AS PERMISSIVE FOR ALL TO public USING ("tenancy"."organization_settings"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_id', true)
          )
          OR current_setting('app.global_retention_cleanup', true) = 'true');--> statement-breakpoint
CREATE POLICY "organizations_tenant_isolation" ON "tenancy"."organizations" AS PERMISSIVE FOR ALL TO public USING ("tenancy"."organizations"."public_id" = current_setting('app.current_organization_id', true)
          OR current_setting('app.global_retention_cleanup', true) = 'true');--> statement-breakpoint
CREATE POLICY "uploads_tenant_isolation" ON "upload"."uploads" AS PERMISSIVE FOR ALL TO public USING ((
            "upload"."uploads"."organization_id" IS NOT NULL
            AND "upload"."uploads"."organization_id" = (
              SELECT id FROM tenancy.organizations
              WHERE public_id = current_setting('app.current_organization_id', true)
            )
          )
          OR current_setting('app.global_retention_cleanup', true) = 'true');--> statement-breakpoint
CREATE POLICY "user_notification_preferences_user_org_access" ON "auth"."user_notification_preferences" AS PERMISSIVE FOR ALL TO public USING ("auth"."user_notification_preferences"."user_id" = (
            SELECT id FROM auth.users
            WHERE public_id = current_setting('app.current_user_id', true)
              AND deleted_at IS NULL
          )
          AND (
            "auth"."user_notification_preferences"."organization_id" IS NULL
            OR "auth"."user_notification_preferences"."organization_id" = (
              SELECT id FROM tenancy.organizations
              WHERE public_id = current_setting('app.current_organization_id', true)
            )
          )) WITH CHECK ("auth"."user_notification_preferences"."user_id" = (
            SELECT id FROM auth.users
            WHERE public_id = current_setting('app.current_user_id', true)
              AND deleted_at IS NULL
          )
          AND (
            "auth"."user_notification_preferences"."organization_id" IS NULL
            OR "auth"."user_notification_preferences"."organization_id" = (
              SELECT id FROM tenancy.organizations
              WHERE public_id = current_setting('app.current_organization_id', true)
            )
          ));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION billing.resolve_organization_public_id_for_stripe_subscription (
  provider_subscription_id_param TEXT
) RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = billing, tenancy, public
AS $$
  SELECT o.public_id
  FROM billing.subscriptions AS s
  INNER JOIN tenancy.organizations AS o ON o.id = s.organization_id
  WHERE s.provider_subscription_id = provider_subscription_id_param
  LIMIT 1;
$$;
--> statement-breakpoint
DO $$
DECLARE
  database_name TEXT := current_database();
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO clinozy_be_app', database_name);
END $$;
--> statement-breakpoint
-- app.branches — a location of an organization (launch ROUTE #2).
CREATE TABLE IF NOT EXISTS "app"."branches" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"name" varchar(60) NOT NULL,
	"tone" varchar(10) DEFAULT 'sage' NOT NULL,
	"is_main" boolean DEFAULT false NOT NULL,
	"address_line_one" varchar(120) NOT NULL,
	"address_line_two" varchar(120),
	"area" varchar(60) NOT NULL,
	"city" varchar(60) NOT NULL,
	"state" varchar(60) DEFAULT 'Gujarat' NOT NULL,
	"postal_code" varchar(6) NOT NULL,
	"phone" varchar(16) NOT NULL,
	"email" varchar(120) NOT NULL,
	"gst_number" varchar(15),
	"opens_at" time DEFAULT '10:00' NOT NULL,
	"closes_at" time DEFAULT '20:00' NOT NULL,
	"working_days" text[] DEFAULT ARRAY['mon', 'tue', 'wed', 'thu', 'fri', 'sat']::text[] NOT NULL,
	"default_doctor_membership_id" bigint,
	"default_front_desk_membership_id" bigint,
	"default_therapist_membership_id" bigint,
	"default_pharmacist_membership_id" bigint,
	"is_active" boolean DEFAULT true NOT NULL,
	"maps_link" varchar(512),
	"review_link" varchar(512),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	CONSTRAINT "chk_branches_tone" CHECK ("app"."branches"."tone" IN ('butter', 'lav', 'sky', 'sage', 'blush', 'mint', 'peach', 'plum', 'lime', 'slate', 'stone')),
	CONSTRAINT "chk_branches_postal_code" CHECK ("app"."branches"."postal_code" ~ '^\d{6}$'),
	CONSTRAINT "chk_branches_phone" CHECK ("app"."branches"."phone" ~ '^\+91\d{10}$'),
	CONSTRAINT "chk_branches_gst_number" CHECK ("app"."branches"."gst_number" ~ '^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$'),
	CONSTRAINT "chk_branches_hours" CHECK ("app"."branches"."closes_at" > "app"."branches"."opens_at"),
	CONSTRAINT "chk_branches_working_days_allowed" CHECK ("app"."branches"."working_days" <@ ARRAY['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']::text[]),
	CONSTRAINT "chk_branches_working_days_count" CHECK (cardinality("app"."branches"."working_days") BETWEEN 1 AND 7),
	CONSTRAINT "chk_branches_maps_link" CHECK ("app"."branches"."maps_link" ~ '^https://'),
	CONSTRAINT "chk_branches_review_link" CHECK ("app"."branches"."review_link" ~ '^https://'),
	CONSTRAINT "chk_branches_updated" CHECK ("app"."branches"."updated_at" >= "app"."branches"."created_at")
);
--> statement-breakpoint
ALTER TABLE "app"."branches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."branches" ADD CONSTRAINT "branches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."branches" ADD CONSTRAINT "branches_default_doctor_membership_id_fk" FOREIGN KEY ("organization_id","default_doctor_membership_id") REFERENCES "tenancy"."memberships"("organization_id","id") ON DELETE SET NULL ("default_doctor_membership_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."branches" ADD CONSTRAINT "branches_default_front_desk_membership_id_fk" FOREIGN KEY ("organization_id","default_front_desk_membership_id") REFERENCES "tenancy"."memberships"("organization_id","id") ON DELETE SET NULL ("default_front_desk_membership_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."branches" ADD CONSTRAINT "branches_default_therapist_membership_id_fk" FOREIGN KEY ("organization_id","default_therapist_membership_id") REFERENCES "tenancy"."memberships"("organization_id","id") ON DELETE SET NULL ("default_therapist_membership_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."branches" ADD CONSTRAINT "branches_default_pharmacist_membership_id_fk" FOREIGN KEY ("organization_id","default_pharmacist_membership_id") REFERENCES "tenancy"."memberships"("organization_id","id") ON DELETE SET NULL ("default_pharmacist_membership_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."branches" ADD CONSTRAINT "branches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."branches" ADD CONSTRAINT "branches_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_branches_public_id" ON "app"."branches" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_branches_organization_name_unique" ON "app"."branches" USING btree ("organization_id", lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_branches_one_main_per_organization" ON "app"."branches" USING btree ("organization_id") WHERE "app"."branches"."is_main";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_branches_organization_id_name" ON "app"."branches" USING btree ("organization_id", "name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_branches_organization_id_default_doctor_membership_id" ON "app"."branches" USING btree ("organization_id","default_doctor_membership_id") WHERE "app"."branches"."default_doctor_membership_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_branches_organization_id_default_front_desk_membership_id" ON "app"."branches" USING btree ("organization_id","default_front_desk_membership_id") WHERE "app"."branches"."default_front_desk_membership_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_branches_organization_id_default_therapist_membership_id" ON "app"."branches" USING btree ("organization_id","default_therapist_membership_id") WHERE "app"."branches"."default_therapist_membership_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_branches_organization_id_default_pharmacist_membership_id" ON "app"."branches" USING btree ("organization_id","default_pharmacist_membership_id") WHERE "app"."branches"."default_pharmacist_membership_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_branches_created_by_user_id" ON "app"."branches" USING btree ("created_by_user_id") WHERE "app"."branches"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_branches_updated_by_user_id" ON "app"."branches" USING btree ("updated_by_user_id") WHERE "app"."branches"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE POLICY "branches_tenant_isolation" ON "app"."branches" AS PERMISSIVE FOR ALL TO public USING ("app"."branches"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."branches"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
-- app.branch_members — who works at which branch (launch ROUTE #2; renamed from branch_members at ROUTE #125, D9).
-- The member pointer is composite (organization_id, membership_id) so a branch can only list a member
-- of its own organization (K8); the rows stay when a membership ends (hidden while ended, D57).
CREATE TABLE IF NOT EXISTS "app"."branch_members" (
	"branch_id" bigint NOT NULL,
	"membership_id" bigint NOT NULL,
	"organization_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	CONSTRAINT "branch_members_pkey" PRIMARY KEY ("branch_id", "membership_id")
);
--> statement-breakpoint
ALTER TABLE "app"."branch_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."branch_members" ADD CONSTRAINT "branch_members_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "app"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."branch_members" ADD CONSTRAINT "branch_members_membership_fk" FOREIGN KEY ("organization_id","membership_id") REFERENCES "tenancy"."memberships"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."branch_members" ADD CONSTRAINT "branch_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."branch_members" ADD CONSTRAINT "branch_members_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_branch_members_organization_id_membership_id" ON "app"."branch_members" USING btree ("organization_id","membership_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_branch_members_created_by_user_id" ON "app"."branch_members" USING btree ("created_by_user_id") WHERE "app"."branch_members"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE POLICY "branch_members_tenant_isolation" ON "app"."branch_members" AS PERMISSIVE FOR ALL TO public USING ("app"."branch_members"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )) WITH CHECK ("app"."branch_members"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
-- app.membership_preferences — a member's own settings in the organization: pinned sections, theme,
-- patient-file pins, recent picks (launch §2.F; renamed from user_preferences at ROUTE #127, U1/U4).
-- One row per membership, upserted on (membership_id); no soft delete — the leave step deletes it
-- (K4). The member pointer is composite (organization_id, membership_id), so a row can only belong to
-- a member of its own organization (K8).
CREATE TABLE IF NOT EXISTS "app"."membership_preferences" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"membership_id" bigint NOT NULL,
	"pinned_sections" text[] DEFAULT '{"appointments","leads","patients","payments"}' NOT NULL,
	"theme" varchar(6) DEFAULT 'light' NOT NULL,
	"patient_file_pins" text[] DEFAULT '{"clinical_notes","appointments","prescriptions","invoices"}' NOT NULL,
	"recent_picks" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	CONSTRAINT "chk_membership_preferences_pinned_sections" CHECK ("app"."membership_preferences"."pinned_sections" <@ ARRAY['today', 'contacts', 'activity', 'leads', 'appointments', 'patients', 'medical', 'stock', 'payments', 'tasks', 'offerings', 'users']::text[] AND cardinality("app"."membership_preferences"."pinned_sections") <= 10),
	CONSTRAINT "chk_membership_preferences_theme" CHECK ("app"."membership_preferences"."theme" IN ('light', 'dark', 'system')),
	CONSTRAINT "chk_membership_preferences_patient_file_pins" CHECK ("app"."membership_preferences"."patient_file_pins" <@ ARRAY['overview', 'activity', 'clinical_notes', 'appointments', 'prescriptions', 'treatments', 'images', 'reports', 'packages', 'invoices', 'payments']::text[] AND cardinality("app"."membership_preferences"."patient_file_pins") <= 11),
	CONSTRAINT "chk_membership_preferences_recent_picks" CHECK (cardinality("app"."membership_preferences"."recent_picks") <= 60),
	CONSTRAINT "chk_membership_preferences_updated" CHECK ("app"."membership_preferences"."updated_at" >= "app"."membership_preferences"."created_at")
);
--> statement-breakpoint
ALTER TABLE "app"."membership_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."membership_preferences" ADD CONSTRAINT "membership_preferences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."membership_preferences" ADD CONSTRAINT "membership_preferences_membership_fk" FOREIGN KEY ("organization_id","membership_id") REFERENCES "tenancy"."memberships"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."membership_preferences" ADD CONSTRAINT "membership_preferences_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."membership_preferences" ADD CONSTRAINT "membership_preferences_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_membership_preferences_public_id" ON "app"."membership_preferences" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_membership_preferences_membership_id_unique" ON "app"."membership_preferences" USING btree ("membership_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_membership_preferences_organization_id_membership_id" ON "app"."membership_preferences" USING btree ("organization_id","membership_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_membership_preferences_created_by_user_id" ON "app"."membership_preferences" USING btree ("created_by_user_id") WHERE "app"."membership_preferences"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_membership_preferences_updated_by_user_id" ON "app"."membership_preferences" USING btree ("updated_by_user_id") WHERE "app"."membership_preferences"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE POLICY "membership_preferences_tenant_isolation" ON "app"."membership_preferences" AS PERMISSIVE FOR ALL TO public USING ("app"."membership_preferences"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )) WITH CHECK ("app"."membership_preferences"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."membership_preferences" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.membership_preference_branches — the branch_ids of a member's preferences, the header's branch
-- filter (launch §2.F; renamed from user_preference_branches at ROUTE #127, U4). Removing either side
-- removes the row.
CREATE TABLE IF NOT EXISTS "app"."membership_preference_branches" (
	"membership_preference_id" bigint NOT NULL,
	"branch_id" bigint NOT NULL,
	"organization_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_preference_branches_pkey" PRIMARY KEY ("membership_preference_id", "branch_id")
);
--> statement-breakpoint
ALTER TABLE "app"."membership_preference_branches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."membership_preference_branches" ADD CONSTRAINT "membership_preference_branches_membership_preference_id_fk" FOREIGN KEY ("membership_preference_id") REFERENCES "app"."membership_preferences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."membership_preference_branches" ADD CONSTRAINT "membership_preference_branches_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "app"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."membership_preference_branches" ADD CONSTRAINT "membership_preference_branches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_membership_preference_branches_branch_id" ON "app"."membership_preference_branches" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_membership_preference_branches_organization_id" ON "app"."membership_preference_branches" USING btree ("organization_id");--> statement-breakpoint
CREATE POLICY "membership_preference_branches_tenant_isolation" ON "app"."membership_preference_branches" AS PERMISSIVE FOR ALL TO public USING ("app"."membership_preference_branches"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )) WITH CHECK ("app"."membership_preference_branches"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."membership_preference_branches" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.membership_saved_views — a list's filters under a label, the member's own shortcut (launch §2.G;
-- renamed from saved_views at ROUTE #127, U1/U5). Removed for good (U6) — no soft delete; the leave
-- step deletes them (K4). Composite member pointer (K8).
CREATE TABLE IF NOT EXISTS "app"."membership_saved_views" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"membership_id" bigint NOT NULL,
	"list_key" varchar(40) NOT NULL,
	"label" varchar(60) NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"hidden_columns" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	CONSTRAINT "chk_membership_saved_views_list_key" CHECK ("app"."membership_saved_views"."list_key" ~ '^[a-z_]+$'),
	CONSTRAINT "chk_membership_saved_views_label" CHECK (char_length(btrim("app"."membership_saved_views"."label")) >= 1),
	CONSTRAINT "chk_membership_saved_views_filters" CHECK (jsonb_typeof("app"."membership_saved_views"."filters") = 'object'),
	CONSTRAINT "chk_membership_saved_views_hidden_columns" CHECK (cardinality("app"."membership_saved_views"."hidden_columns") <= 40),
	CONSTRAINT "chk_membership_saved_views_updated" CHECK ("app"."membership_saved_views"."updated_at" >= "app"."membership_saved_views"."created_at")
);
--> statement-breakpoint
ALTER TABLE "app"."membership_saved_views" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."membership_saved_views" ADD CONSTRAINT "membership_saved_views_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."membership_saved_views" ADD CONSTRAINT "membership_saved_views_membership_fk" FOREIGN KEY ("organization_id","membership_id") REFERENCES "tenancy"."memberships"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."membership_saved_views" ADD CONSTRAINT "membership_saved_views_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."membership_saved_views" ADD CONSTRAINT "membership_saved_views_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_membership_saved_views_public_id" ON "app"."membership_saved_views" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_membership_saved_views_membership_list_label_unique" ON "app"."membership_saved_views" USING btree ("membership_id","list_key",lower("label"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_membership_saved_views_membership_list_created" ON "app"."membership_saved_views" USING btree ("membership_id","list_key","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_membership_saved_views_organization_id_membership_id" ON "app"."membership_saved_views" USING btree ("organization_id","membership_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_membership_saved_views_created_by_user_id" ON "app"."membership_saved_views" USING btree ("created_by_user_id") WHERE "app"."membership_saved_views"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_membership_saved_views_updated_by_user_id" ON "app"."membership_saved_views" USING btree ("updated_by_user_id") WHERE "app"."membership_saved_views"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE POLICY "membership_saved_views_tenant_isolation" ON "app"."membership_saved_views" AS PERMISSIVE FOR ALL TO public USING ("app"."membership_saved_views"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )) WITH CHECK ("app"."membership_saved_views"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."membership_saved_views" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- tenancy.memberships.staff_number — the "#12" of the team table (launch ROUTE #4): a row inserted
-- with 0 gets the organization's next number, never reused. One assignment at a time per
-- organization: the advisory lock space 1398030662 is ASCII `STAF`
-- (RESOURCE_QUOTA_LOCK_NAMESPACE.MEMBERSHIP_STAFF_NUMBER). Runs as the inserting role, so the
-- MAX reads the rows RLS shows it — every insert runs under its organization's context.
CREATE OR REPLACE FUNCTION tenancy.fn_assign_membership_staff_number() RETURNS trigger
LANGUAGE plpgsql
SET search_path = tenancy, pg_catalog
AS $$
BEGIN
  IF NEW.staff_number = 0 THEN
    PERFORM pg_advisory_xact_lock(
      1398030662,
      (hashtextextended(NEW.organization_id::text, 0) & 2147483647::bigint)::int
    );
    SELECT COALESCE(MAX(m.staff_number), 0) + 1 INTO NEW.staff_number
    FROM tenancy.memberships AS m
    WHERE m.organization_id = NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER trg_memberships_staff_number
BEFORE INSERT ON tenancy.memberships
FOR EACH ROW EXECUTE FUNCTION tenancy.fn_assign_membership_staff_number();
--> statement-breakpoint
-- tenancy.memberships.display_name — the name the organization keeps for a member (launch K3): copied
-- from the login at join and kept equal to the profile while the membership is live; frozen once it
-- ends, so a clinic they left keeps the name it knew. The name is the login's first and last name, or
-- its email when both are empty (the team list's rule), cut to 120 characters. SECURITY DEFINER: the
-- inviter's session cannot see the invitee's `auth.users` row, and a profile update must reach the
-- member's rows in every organization; both functions are narrow — one login's name, its own rows.
CREATE OR REPLACE FUNCTION tenancy.fn_membership_display_name(
  first_name_param text,
  last_name_param text,
  email_param text
) RETURNS varchar
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT left(
    COALESCE(NULLIF(btrim(concat_ws(' ', first_name_param, last_name_param)), ''), email_param),
    120
  )::varchar;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION tenancy.fn_set_membership_display_name() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tenancy, auth, pg_catalog
AS $$
BEGIN
  -- At join (an empty name), and when an ended membership is live again (restore, re-add): the name
  -- follows the profile while the membership lasts (launch K3).
  IF NEW.display_name IS NULL OR btrim(NEW.display_name) = ''
     OR (TG_OP = 'UPDATE' AND OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL) THEN
    SELECT tenancy.fn_membership_display_name(u.first_name, u.last_name, u.email)
      INTO NEW.display_name
    FROM auth.users AS u
    WHERE u.id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER trg_memberships_display_name
BEFORE INSERT OR UPDATE OF deleted_at ON tenancy.memberships
FOR EACH ROW EXECUTE FUNCTION tenancy.fn_set_membership_display_name();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION tenancy.fn_sync_membership_display_names() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tenancy, auth, pg_catalog
AS $$
BEGIN
  UPDATE tenancy.memberships AS m
  SET display_name = tenancy.fn_membership_display_name(NEW.first_name, NEW.last_name, NEW.email),
      updated_at = now()
  WHERE m.user_id = NEW.id
    AND m.deleted_at IS NULL
    AND m.display_name IS DISTINCT FROM
      tenancy.fn_membership_display_name(NEW.first_name, NEW.last_name, NEW.email);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER trg_users_sync_membership_display_names
AFTER UPDATE OF first_name, last_name, email ON auth.users
FOR EACH ROW
WHEN (
  OLD.first_name IS DISTINCT FROM NEW.first_name
  OR OLD.last_name IS DISTINCT FROM NEW.last_name
  OR OLD.email IS DISTINCT FROM NEW.email
)
EXECUTE FUNCTION tenancy.fn_sync_membership_display_names();
--> statement-breakpoint
-- tenancy.membership_additional_roles — the roles a person holds besides their main one (launch ROUTE #4, D5).
CREATE TABLE IF NOT EXISTS "tenancy"."membership_additional_roles" (
	"membership_id" bigint NOT NULL,
	"role_id" bigint NOT NULL,
	"organization_id" bigint NOT NULL,
	"position" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	CONSTRAINT "membership_additional_roles_pkey" PRIMARY KEY ("membership_id", "role_id"),
	CONSTRAINT "chk_membership_additional_roles_position" CHECK ("tenancy"."membership_additional_roles"."position" BETWEEN 1 AND 9)
);
--> statement-breakpoint
ALTER TABLE "tenancy"."membership_additional_roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenancy"."membership_additional_roles" ADD CONSTRAINT "membership_additional_roles_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "tenancy"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."membership_additional_roles" ADD CONSTRAINT "membership_additional_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "tenancy"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."membership_additional_roles" ADD CONSTRAINT "membership_additional_roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenancy"."membership_additional_roles" ADD CONSTRAINT "membership_additional_roles_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_membership_additional_roles_role_id" ON "tenancy"."membership_additional_roles" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_membership_additional_roles_organization_id" ON "tenancy"."membership_additional_roles" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_membership_additional_roles_created_by_user_id" ON "tenancy"."membership_additional_roles" USING btree ("created_by_user_id") WHERE "tenancy"."membership_additional_roles"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE POLICY "membership_additional_roles_tenant_isolation" ON "tenancy"."membership_additional_roles" AS PERMISSIVE FOR ALL TO public USING ("tenancy"."membership_additional_roles"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )) WITH CHECK ("tenancy"."membership_additional_roles"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
-- ── app records (launch iteration — generated from the table specs) ──
-- app.record_counters — the last running number handed out per organization and counter
-- (`patients.patient_number`, `invoices:<branch_id>:<financial year>`). Numbers only grow: a purged
-- row never gives its number back (schema review H7). RLS on the organization GUC.
CREATE TABLE IF NOT EXISTS "app"."record_counters" (
	"organization_id" bigint NOT NULL,
	"counter_key" varchar(80) NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "record_counters_pkey" PRIMARY KEY ("organization_id","counter_key"),
	CONSTRAINT "chk_record_counters_last_value" CHECK ("app"."record_counters"."last_value" >= 0)
);
--> statement-breakpoint
ALTER TABLE "app"."record_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."record_counters" ADD CONSTRAINT "record_counters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "record_counters_tenant_isolation" ON "app"."record_counters" AS PERMISSIVE FOR ALL TO public USING ("app"."record_counters"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )) WITH CHECK ("app"."record_counters"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."record_counters" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.fn_assign_record_number(column) — the "#12" of an app record: a row inserted with 0 in
-- the named column gets the organization's next number for that table, never reused — one
-- counter row per (organization, table.column), incremented under its row lock.
CREATE OR REPLACE FUNCTION app.fn_assign_record_number() RETURNS trigger
LANGUAGE plpgsql
SET search_path = app, pg_catalog
AS $$
DECLARE
  number_column text := TG_ARGV[0];
  next_number integer;
BEGIN
  IF (to_jsonb(NEW) ->> number_column)::integer = 0 THEN
    INSERT INTO app.record_counters AS c (organization_id, counter_key, last_value)
    VALUES (NEW.organization_id, TG_TABLE_NAME || '.' || number_column, 1)
    ON CONFLICT (organization_id, counter_key) DO UPDATE SET last_value = c.last_value + 1
    RETURNING c.last_value INTO next_number;
    NEW := jsonb_populate_record(NEW, jsonb_build_object(number_column, next_number));
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
-- app.fn_assign_invoice_number() — the GST invoice number (D23): consecutive per branch (its
-- GSTIN) and financial year (April–March), `2026-27/0042`; the financial year comes from the
-- invoice date. Never reused (a cancelled invoice keeps its number).
CREATE OR REPLACE FUNCTION app.fn_assign_invoice_number() RETURNS trigger
LANGUAGE plpgsql
SET search_path = app, pg_catalog
AS $$
DECLARE
  year_start integer;
  next_number integer;
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    year_start := extract(year FROM NEW.invoice_date)::integer
      - CASE WHEN extract(month FROM NEW.invoice_date) >= 4 THEN 0 ELSE 1 END;
    NEW.financial_year := year_start::text || '-' || lpad(((year_start + 1) % 100)::text, 2, '0');
    INSERT INTO app.record_counters AS c (organization_id, counter_key, last_value)
    VALUES (NEW.organization_id, 'invoices:' || NEW.branch_id::text || ':' || NEW.financial_year, 1)
    ON CONFLICT (organization_id, counter_key) DO UPDATE SET last_value = c.last_value + 1
    RETURNING c.last_value INTO next_number;
    NEW.invoice_number := NEW.financial_year || '/' || lpad(next_number::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
-- app.offering_groups — A group for browsing offerings — Facial, Hair, Peel, Laser (D29) (launch ROUTE #10).
CREATE TABLE IF NOT EXISTS "app"."offering_groups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"name" varchar(60) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_offering_groups_sort_order" CHECK ("app"."offering_groups"."sort_order" BETWEEN 0 AND 9999),
	CONSTRAINT "chk_offering_groups_updated" CHECK ("app"."offering_groups"."updated_at" >= "app"."offering_groups"."created_at"),
	CONSTRAINT "chk_offering_groups_delete_reason" CHECK ("app"."offering_groups"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_offering_groups_delete_reason_when_deleted" CHECK (("app"."offering_groups"."deleted_at" IS NULL) = ("app"."offering_groups"."delete_reason" IS NULL)),
	CONSTRAINT "chk_offering_groups_delete_note_when_other" CHECK ("app"."offering_groups"."delete_reason" IS DISTINCT FROM 'other' OR "app"."offering_groups"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."offering_groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.branch_rooms — A bookable room of a branch (D28) (launch ROUTE #19; renamed from rooms at ROUTE #125, D9).
CREATE TABLE IF NOT EXISTS "app"."branch_rooms" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"branch_id" bigint NOT NULL,
	"name" varchar(60) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_branch_rooms_updated" CHECK ("app"."branch_rooms"."updated_at" >= "app"."branch_rooms"."created_at"),
	CONSTRAINT "chk_branch_rooms_delete_reason" CHECK ("app"."branch_rooms"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_branch_rooms_delete_reason_when_deleted" CHECK (("app"."branch_rooms"."deleted_at" IS NULL) = ("app"."branch_rooms"."delete_reason" IS NULL)),
	CONSTRAINT "chk_branch_rooms_delete_note_when_other" CHECK ("app"."branch_rooms"."delete_reason" IS DISTINCT FROM 'other' OR "app"."branch_rooms"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."branch_rooms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.branch_machines — A bookable machine of a branch, e.g. a laser (D28) (launch ROUTE #20; renamed from machines at ROUTE #125, D9).
CREATE TABLE IF NOT EXISTS "app"."branch_machines" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"branch_id" bigint NOT NULL,
	"name" varchar(60) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_branch_machines_updated" CHECK ("app"."branch_machines"."updated_at" >= "app"."branch_machines"."created_at"),
	CONSTRAINT "chk_branch_machines_delete_reason" CHECK ("app"."branch_machines"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_branch_machines_delete_reason_when_deleted" CHECK (("app"."branch_machines"."deleted_at" IS NULL) = ("app"."branch_machines"."delete_reason" IS NULL)),
	CONSTRAINT "chk_branch_machines_delete_note_when_other" CHECK ("app"."branch_machines"."delete_reason" IS DISTINCT FROM 'other' OR "app"."branch_machines"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."branch_machines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.branch_holidays — A day a branch is closed — no slots are offered (D41) (launch ROUTE #18).
CREATE TABLE IF NOT EXISTS "app"."branch_holidays" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"branch_id" bigint NOT NULL,
	"holiday_date" date NOT NULL,
	"label" varchar(60) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_branch_holidays_updated" CHECK ("app"."branch_holidays"."updated_at" >= "app"."branch_holidays"."created_at"),
	CONSTRAINT "chk_branch_holidays_delete_reason" CHECK ("app"."branch_holidays"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_branch_holidays_delete_reason_when_deleted" CHECK (("app"."branch_holidays"."deleted_at" IS NULL) = ("app"."branch_holidays"."delete_reason" IS NULL)),
	CONSTRAINT "chk_branch_holidays_delete_note_when_other" CHECK ("app"."branch_holidays"."delete_reason" IS DISTINCT FROM 'other' OR "app"."branch_holidays"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."branch_holidays" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.offerings — A sellable service, package or product (launch ROUTE #11).
CREATE TABLE IF NOT EXISTS "app"."offerings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"offering_number" integer DEFAULT 0 NOT NULL,
	"name" varchar(120) NOT NULL,
	"category" varchar(12) DEFAULT 'treatment' NOT NULL,
	"specialty" varchar(7) DEFAULT 'skin' NOT NULL,
	"tone" varchar(10) DEFAULT 'sage' NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"min_price" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"sessions" integer DEFAULT 1 NOT NULL,
	"validity_days" integer DEFAULT 0 NOT NULL,
	"gst_percent" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"offering_group_id" bigint,
	"offer_price" numeric(12, 2),
	"is_gst_inclusive" boolean DEFAULT false NOT NULL,
	"search_terms" text[] DEFAULT '{}' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_offerings_offering_number" CHECK ("app"."offerings"."offering_number" > 0),
	CONSTRAINT "chk_offerings_category" CHECK ("app"."offerings"."category" IN ('consultation', 'treatment', 'package', 'lhr', 'product')),
	CONSTRAINT "chk_offerings_specialty" CHECK ("app"."offerings"."specialty" IN ('skin', 'hair', 'dental', 'gynac', 'physio', 'general')),
	CONSTRAINT "chk_offerings_tone" CHECK ("app"."offerings"."tone" IN ('butter', 'lav', 'sky', 'sage', 'blush', 'mint', 'peach', 'plum', 'lime', 'slate', 'stone')),
	CONSTRAINT "chk_offerings_price" CHECK ("app"."offerings"."price" >= 0),
	CONSTRAINT "chk_offerings_min_price" CHECK ("app"."offerings"."min_price" >= 0),
	CONSTRAINT "chk_offerings_duration_minutes" CHECK ("app"."offerings"."duration_minutes" BETWEEN 5 AND 480),
	CONSTRAINT "chk_offerings_sessions" CHECK ("app"."offerings"."sessions" BETWEEN 1 AND 99),
	CONSTRAINT "chk_offerings_validity_days" CHECK ("app"."offerings"."validity_days" BETWEEN 0 AND 1095),
	CONSTRAINT "chk_offerings_gst_percent" CHECK ("app"."offerings"."gst_percent" IN (0, 5, 12, 18, 28)),
	CONSTRAINT "chk_offerings_offer_price" CHECK ("app"."offerings"."offer_price" >= 0),
	CONSTRAINT "chk_offerings_min_price_within_price" CHECK ("app"."offerings"."min_price" <= "app"."offerings"."price"),
	CONSTRAINT "chk_offerings_offer_price_within_price" CHECK ("app"."offerings"."offer_price" IS NULL OR "app"."offerings"."offer_price" <= "app"."offerings"."price"),
	CONSTRAINT "chk_offerings_min_price_within_offer_price" CHECK ("app"."offerings"."offer_price" IS NULL OR "app"."offerings"."min_price" <= "app"."offerings"."offer_price"),
	CONSTRAINT "chk_offerings_updated" CHECK ("app"."offerings"."updated_at" >= "app"."offerings"."created_at"),
	CONSTRAINT "chk_offerings_delete_reason" CHECK ("app"."offerings"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_offerings_delete_reason_when_deleted" CHECK (("app"."offerings"."deleted_at" IS NULL) = ("app"."offerings"."delete_reason" IS NULL)),
	CONSTRAINT "chk_offerings_delete_note_when_other" CHECK ("app"."offerings"."delete_reason" IS DISTINCT FROM 'other' OR "app"."offerings"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."offerings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.offering_branches — the branch_ids of an offering (launch ROUTE #11).
CREATE TABLE IF NOT EXISTS "app"."offering_branches" (
	"offering_id" bigint NOT NULL,
	"branch_id" bigint NOT NULL,
	"organization_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	CONSTRAINT "offering_branches_pkey" PRIMARY KEY ("offering_id", "branch_id")
);
--> statement-breakpoint
ALTER TABLE "app"."offering_branches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.offers — A limited-time price on offerings (launch ROUTE #12).
CREATE TABLE IF NOT EXISTS "app"."offers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"name" varchar(80) NOT NULL,
	"code" varchar(16),
	"kind" varchar(7) DEFAULT 'percent' NOT NULL,
	"value" numeric(12, 2) NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"tone" varchar(10) DEFAULT 'blush' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_offers_kind" CHECK ("app"."offers"."kind" IN ('percent', 'amount', 'fixed', 'extra')),
	CONSTRAINT "chk_offers_value_for_kind" CHECK (("app"."offers"."kind" = 'percent' AND "app"."offers"."value" BETWEEN 1 AND 100 AND "app"."offers"."value" = trunc("app"."offers"."value"))
          OR ("app"."offers"."kind" IN ('amount', 'fixed') AND "app"."offers"."value" > 0)
          OR ("app"."offers"."kind" = 'extra' AND "app"."offers"."value" BETWEEN 1 AND 99 AND "app"."offers"."value" = trunc("app"."offers"."value"))),
	CONSTRAINT "chk_offers_tone" CHECK ("app"."offers"."tone" IN ('butter', 'lav', 'sky', 'sage', 'blush', 'mint', 'peach', 'plum', 'lime', 'slate', 'stone')),
	CONSTRAINT "chk_offers_ends_after_starts" CHECK ("app"."offers"."ends_on" IS NULL OR "app"."offers"."starts_on" IS NULL OR "app"."offers"."ends_on" >= "app"."offers"."starts_on"),
	CONSTRAINT "chk_offers_code" CHECK ("app"."offers"."code" ~ '^[A-Z0-9]+$'),
	CONSTRAINT "chk_offers_updated" CHECK ("app"."offers"."updated_at" >= "app"."offers"."created_at"),
	CONSTRAINT "chk_offers_delete_reason" CHECK ("app"."offers"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_offers_delete_reason_when_deleted" CHECK (("app"."offers"."deleted_at" IS NULL) = ("app"."offers"."delete_reason" IS NULL)),
	CONSTRAINT "chk_offers_delete_note_when_other" CHECK ("app"."offers"."delete_reason" IS DISTINCT FROM 'other' OR "app"."offers"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."offers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.offer_offerings — the offering_ids of an offer (launch ROUTE #12).
CREATE TABLE IF NOT EXISTS "app"."offer_offerings" (
	"offer_id" bigint NOT NULL,
	"offering_id" bigint NOT NULL,
	"organization_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	CONSTRAINT "offer_offerings_pkey" PRIMARY KEY ("offer_id", "offering_id")
);
--> statement-breakpoint
ALTER TABLE "app"."offer_offerings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.offer_branches — the branch_ids of an offer (launch ROUTE #12).
CREATE TABLE IF NOT EXISTS "app"."offer_branches" (
	"offer_id" bigint NOT NULL,
	"branch_id" bigint NOT NULL,
	"organization_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	CONSTRAINT "offer_branches_pkey" PRIMARY KEY ("offer_id", "branch_id")
);
--> statement-breakpoint
ALTER TABLE "app"."offer_branches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.contacts — one person, shared by their leads, conversation, patient file and appointments (launch ROUTE #129, routes-final 4.A).
CREATE TABLE IF NOT EXISTS "app"."contacts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"contact_number" integer DEFAULT 0 NOT NULL,
	"first_name" varchar(60) NOT NULL,
	"last_name" varchar(60),
	"gender" varchar(6),
	"date_of_birth" date,
	"email" varchar(120),
	"address" varchar(240),
	"instagram_handles" text[] DEFAULT '{}' NOT NULL,
	"default_channel" varchar(9) DEFAULT 'whatsapp' NOT NULL,
	"preference_tags" text[] DEFAULT '{}' NOT NULL,
	"has_marketing_consent" boolean DEFAULT false NOT NULL,
	"referral_source" varchar(9),
	"referred_by_contact_id" bigint,
	"referred_by_name" varchar(120),
	"household_contact_id" bigint NOT NULL,
	"primary_phone" varchar(13) NOT NULL,
	"last_activity_at" timestamp with time zone,
	"last_sent_at" timestamp with time zone,
	"last_received_at" timestamp with time zone,
	"search_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_contacts_contact_number" CHECK ("app"."contacts"."contact_number" > 0),
	CONSTRAINT "chk_contacts_first_name" CHECK (length(btrim("app"."contacts"."first_name")) > 0),
	CONSTRAINT "chk_contacts_gender" CHECK ("app"."contacts"."gender" IN ('female', 'male', 'other')),
	CONSTRAINT "chk_contacts_date_of_birth_past" CHECK ("app"."contacts"."date_of_birth" IS NULL OR "app"."contacts"."date_of_birth" <= CURRENT_DATE),
	CONSTRAINT "chk_contacts_instagram_handles" CHECK (cardinality("app"."contacts"."instagram_handles") <= 5),
	CONSTRAINT "chk_contacts_default_channel" CHECK ("app"."contacts"."default_channel" IN ('whatsapp', 'call', 'instagram')),
	CONSTRAINT "chk_contacts_preference_tags" CHECK (cardinality("app"."contacts"."preference_tags") <= 12 AND array_to_string("app"."contacts"."preference_tags", ',') ~ '^([a-z][a-z0-9_]{1,39}(,[a-z][a-z0-9_]{1,39})*)?$'),
	CONSTRAINT "chk_contacts_referral_source" CHECK ("app"."contacts"."referral_source" IN ('patient', 'doctor', 'instagram', 'google', 'walk_in', 'other')),
	CONSTRAINT "chk_contacts_referred_by_patient" CHECK ("app"."contacts"."referred_by_contact_id" IS NULL OR "app"."contacts"."referral_source" = 'patient'),
	CONSTRAINT "chk_contacts_primary_phone" CHECK ("app"."contacts"."primary_phone" ~ '^\+91\d{10}$'),
	CONSTRAINT "chk_contacts_updated" CHECK ("app"."contacts"."updated_at" >= "app"."contacts"."created_at"),
	CONSTRAINT "chk_contacts_delete_reason" CHECK ("app"."contacts"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_contacts_delete_reason_when_deleted" CHECK (("app"."contacts"."deleted_at" IS NULL) = ("app"."contacts"."delete_reason" IS NULL)),
	CONSTRAINT "chk_contacts_delete_note_when_other" CHECK ("app"."contacts"."delete_reason" IS DISTINCT FROM 'other' OR "app"."contacts"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."contacts" ADD CONSTRAINT "contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contacts" ADD CONSTRAINT "contacts_referred_by_contact_id_contacts_id_fk" FOREIGN KEY ("referred_by_contact_id") REFERENCES "app"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contacts" ADD CONSTRAINT "contacts_household_contact_id_contacts_id_fk" FOREIGN KEY ("household_contact_id") REFERENCES "app"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contacts" ADD CONSTRAINT "contacts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contacts" ADD CONSTRAINT "contacts_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_contacts_public_id" ON "app"."contacts" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_contacts_organization_contact_number" ON "app"."contacts" USING btree ("organization_id","contact_number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_contacts_id_household_contact_id" ON "app"."contacts" USING btree ("id","household_contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contacts_search_text_trgm" ON "app"."contacts" USING gin ("search_text" gin_trgm_ops) WHERE "app"."contacts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contacts_organization_name" ON "app"."contacts" USING btree ("organization_id","first_name",coalesce("last_name", ''),"id") WHERE "app"."contacts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contacts_organization_created" ON "app"."contacts" USING btree ("organization_id","created_at","id") WHERE "app"."contacts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contacts_organization_last_activity_at" ON "app"."contacts" USING btree ("organization_id",coalesce("last_activity_at", '-infinity'::timestamptz),"id") WHERE "app"."contacts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contacts_preference_tags_gin" ON "app"."contacts" USING gin ("preference_tags") WHERE "app"."contacts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contacts_household_contact_id" ON "app"."contacts" USING btree ("household_contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contacts_referred_by_contact_id" ON "app"."contacts" USING btree ("referred_by_contact_id") WHERE "app"."contacts"."referred_by_contact_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contacts_deleted_at" ON "app"."contacts" USING btree ("deleted_at") WHERE "app"."contacts"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contacts_created_by_user_id" ON "app"."contacts" USING btree ("created_by_user_id") WHERE "app"."contacts"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contacts_updated_by_user_id" ON "app"."contacts" USING btree ("updated_by_user_id") WHERE "app"."contacts"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE POLICY "contacts_tenant_isolation" ON "app"."contacts" AS PERMISSIVE FOR ALL TO public USING ("app"."contacts"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."contacts"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."contacts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.contact_phones — a contact's numbers (CT2, CT3): no public id, part of the contact.
CREATE TABLE IF NOT EXISTS "app"."contact_phones" (
	"contact_id" bigint NOT NULL,
	"household_contact_id" bigint NOT NULL,
	"organization_id" bigint NOT NULL,
	"phone" varchar(13) NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_on_whatsapp" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "contact_phones_pkey" PRIMARY KEY ("contact_id", "phone"),
	CONSTRAINT "chk_contact_phones_phone" CHECK ("app"."contact_phones"."phone" ~ '^\+91\d{10}$')
);
--> statement-breakpoint
ALTER TABLE "app"."contact_phones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."contact_phones" ADD CONSTRAINT "contact_phones_contact_household_fk" FOREIGN KEY ("contact_id","household_contact_id") REFERENCES "app"."contacts"("id","household_contact_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "app"."contact_phones" ADD CONSTRAINT "contact_phones_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- A live number belongs to one household (CT3): the same number may sit on several contacts only
-- when they share a household. Moving a contact to another household re-checks its numbers (the
-- composite key cascades the new household onto them).
ALTER TABLE "app"."contact_phones" ADD CONSTRAINT "excl_contact_phones_phone_household" EXCLUDE USING gist ("organization_id" WITH =, "phone" WITH =, "household_contact_id" WITH <>) WHERE ("deleted_at" IS NULL);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_contact_phones_contact_id_primary" ON "app"."contact_phones" USING btree ("contact_id") WHERE "app"."contact_phones"."is_primary";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_phones_organization_id_phone" ON "app"."contact_phones" USING btree ("organization_id","phone") WHERE "app"."contact_phones"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_phones_household_contact_id" ON "app"."contact_phones" USING btree ("household_contact_id");--> statement-breakpoint
CREATE POLICY "contact_phones_tenant_isolation" ON "app"."contact_phones" AS PERMISSIVE FOR ALL TO public USING ("app"."contact_phones"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )) WITH CHECK ("app"."contact_phones"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."contact_phones" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.fn_set_contact_household() — a new contact's household is itself unless it names one (CT3).
CREATE OR REPLACE FUNCTION app.fn_set_contact_household() RETURNS trigger
LANGUAGE plpgsql
SET search_path = app, pg_catalog
AS $$
BEGIN
  IF NEW.household_contact_id IS NULL THEN
    NEW.household_contact_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
-- app.fn_set_contact_search_text() — one string for every picker's search (CT9): the names, email,
-- Instagram handles, the contact number ("c-12345") and every live number's 10 digits, lowercase.
CREATE OR REPLACE FUNCTION app.fn_set_contact_search_text() RETURNS trigger
LANGUAGE plpgsql
SET search_path = app, pg_catalog
AS $$
BEGIN
  NEW.search_text := lower(concat_ws(' ',
    NEW.first_name,
    NEW.last_name,
    NEW.email,
    array_to_string(NEW.instagram_handles, ' '),
    'c-' || NEW.contact_number,
    (SELECT string_agg(right(phone.phone, 10), ' ' ORDER BY phone.phone)
       FROM app.contact_phones AS phone
      WHERE phone.contact_id = NEW.id AND phone.deleted_at IS NULL)));
  RETURN NEW;
END;
$$;
--> statement-breakpoint
-- app.fn_touch_contact_search_text() — a contact's numbers changed: recompute its search_text.
CREATE OR REPLACE FUNCTION app.fn_touch_contact_search_text() RETURNS trigger
LANGUAGE plpgsql
SET search_path = app, pg_catalog
AS $$
BEGIN
  UPDATE app.contacts SET search_text = search_text
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.contact_id ELSE NEW.contact_id END;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER trg_contacts_contact_number BEFORE INSERT ON "app"."contacts" FOR EACH ROW EXECUTE FUNCTION app.fn_assign_record_number('contact_number');--> statement-breakpoint
CREATE TRIGGER trg_contacts_household BEFORE INSERT ON "app"."contacts" FOR EACH ROW EXECUTE FUNCTION app.fn_set_contact_household();--> statement-breakpoint
CREATE TRIGGER trg_contacts_search_text BEFORE INSERT OR UPDATE ON "app"."contacts" FOR EACH ROW EXECUTE FUNCTION app.fn_set_contact_search_text();--> statement-breakpoint
CREATE TRIGGER trg_contact_phones_search_text AFTER INSERT OR UPDATE OR DELETE ON "app"."contact_phones" FOR EACH ROW EXECUTE FUNCTION app.fn_touch_contact_search_text();--> statement-breakpoint
-- app.contact_members — the team members who handle a person (launch ROUTE #129, routes-final 4.B, CT11).
CREATE TABLE IF NOT EXISTS "app"."contact_members" (
	"contact_id" bigint NOT NULL,
	"membership_id" bigint NOT NULL,
	"organization_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	CONSTRAINT "contact_members_pkey" PRIMARY KEY ("contact_id", "membership_id")
);
--> statement-breakpoint
ALTER TABLE "app"."contact_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."contact_members" ADD CONSTRAINT "contact_members_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "app"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_members" ADD CONSTRAINT "contact_members_membership_fk" FOREIGN KEY ("organization_id","membership_id") REFERENCES "tenancy"."memberships"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_members" ADD CONSTRAINT "contact_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_members" ADD CONSTRAINT "contact_members_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_members_organization_id_membership_id" ON "app"."contact_members" USING btree ("organization_id","membership_id","contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_members_created_by_user_id" ON "app"."contact_members" USING btree ("created_by_user_id") WHERE "app"."contact_members"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE POLICY "contact_members_tenant_isolation" ON "app"."contact_members" AS PERMISSIVE FOR ALL TO public USING ("app"."contact_members"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )) WITH CHECK ("app"."contact_members"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."contact_members" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.patients — A registered patient (launch ROUTE #13).
CREATE TABLE IF NOT EXISTS "app"."patients" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"patient_number" integer DEFAULT 0 NOT NULL,
	"first_name" varchar(60) NOT NULL,
	"last_name" varchar(60),
	"phone" varchar(16) NOT NULL,
	"phones" text[] DEFAULT '{}' NOT NULL,
	"email" varchar(254),
	"gender" varchar(6),
	"date_of_birth" date,
	"address" varchar(240),
	"home_branch_id" bigint NOT NULL,
	"types" text[] DEFAULT '{}' NOT NULL,
	"status" varchar(8) DEFAULT 'new' NOT NULL,
	"conversion" varchar(13) DEFAULT 'not_converted' NOT NULL,
	"referral_source" varchar(9),
	"referred_by_patient_id" bigint,
	"referred_by_name" varchar(120),
	"doctor_membership_id" bigint,
	"follow_up_at" timestamp with time zone,
	"notes" text,
	"lead_id" bigint,
	"has_data_consent" boolean DEFAULT false NOT NULL,
	"has_photo_consent" boolean DEFAULT false NOT NULL,
	"has_marketing_consent" boolean DEFAULT false NOT NULL,
	"language" varchar(20),
	"instagram_handles" text[] DEFAULT '{}' NOT NULL,
	"default_channel" varchar(9),
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"household" varchar(240),
	"allergies" text[] DEFAULT '{}' NOT NULL,
	"contraindications" text[] DEFAULT '{}' NOT NULL,
	"search_text" text GENERATED ALWAYS AS ("first_name" || ' ' || coalesce("last_name", '') || ' ' || "phone" || ' ' || coalesce("email", '')) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_patients_patient_number" CHECK ("app"."patients"."patient_number" > 0),
	CONSTRAINT "chk_patients_phone" CHECK ("app"."patients"."phone" ~ '^\+91\d{10}$'),
	CONSTRAINT "chk_patients_gender" CHECK ("app"."patients"."gender" IN ('female', 'male', 'other')),
	CONSTRAINT "chk_patients_types" CHECK ("app"."patients"."types" <@ ARRAY['aesthetic', 'clinical', 'lhr', 'dental', 'physio', 'gynac']::text[]),
	CONSTRAINT "chk_patients_status" CHECK ("app"."patients"."status" IN ('new', 'regular', 'vip', 'inactive')),
	CONSTRAINT "chk_patients_conversion" CHECK ("app"."patients"."conversion" IN ('converted', 'not_converted')),
	CONSTRAINT "chk_patients_referral_source" CHECK ("app"."patients"."referral_source" IN ('patient', 'doctor', 'instagram', 'google', 'walk_in', 'other')),
	CONSTRAINT "chk_patients_default_channel" CHECK ("app"."patients"."default_channel" IN ('whatsapp', 'call', 'sms', 'instagram', 'email', 'note')),
	CONSTRAINT "chk_patients_referred_by_patient" CHECK ("app"."patients"."referred_by_patient_id" IS NULL OR "app"."patients"."referral_source" = 'patient'),
	CONSTRAINT "chk_patients_date_of_birth_past" CHECK ("app"."patients"."date_of_birth" IS NULL OR "app"."patients"."date_of_birth" <= CURRENT_DATE),
	CONSTRAINT "chk_patients_updated" CHECK ("app"."patients"."updated_at" >= "app"."patients"."created_at"),
	CONSTRAINT "chk_patients_delete_reason" CHECK ("app"."patients"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_patients_delete_reason_when_deleted" CHECK (("app"."patients"."deleted_at" IS NULL) = ("app"."patients"."delete_reason" IS NULL)),
	CONSTRAINT "chk_patients_delete_note_when_other" CHECK ("app"."patients"."delete_reason" IS DISTINCT FROM 'other' OR "app"."patients"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."patients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.leads — one enquiry and its working state (status, source, interests, owner and hold, follow-up) for a contact; the person lives on the contact (launch ROUTE #131, routes-final §5).
CREATE TABLE IF NOT EXISTS "app"."leads" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"lead_number" integer DEFAULT 0 NOT NULL,
	"contact_id" bigint NOT NULL,
	"status" varchar(14) DEFAULT 'new' NOT NULL,
	"source" varchar(9),
	"interests" text[] DEFAULT '{}' NOT NULL,
	"kind" varchar(8) DEFAULT 'enquiry' NOT NULL,
	"retarget_reason" varchar(160),
	"owner_membership_id" bigint,
	"held_until" timestamp with time zone,
	"follow_up_at" timestamp with time zone,
	"branch_id" bigint,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_leads_lead_number" CHECK ("app"."leads"."lead_number" > 0),
	CONSTRAINT "chk_leads_status" CHECK ("app"."leads"."status" IN ('new', 'contacted', 'follow_up', 'no_response', 'not_interested', 'invalid', 'lost', 'clinic_visited')),
	CONSTRAINT "chk_leads_source" CHECK ("app"."leads"."source" IN ('instagram', 'google', 'whatsapp', 'facebook', 'walk_in', 'referral', 'retarget')),
	CONSTRAINT "chk_leads_interests" CHECK ("app"."leads"."interests" <@ ARRAY['clinical', 'peel', 'lhr', 'hydrafacial', 'prp', 'others']::text[] AND cardinality("app"."leads"."interests") <= 6),
	CONSTRAINT "chk_leads_kind" CHECK ("app"."leads"."kind" IN ('enquiry', 'retarget')),
	CONSTRAINT "chk_leads_retarget_reason" CHECK ("app"."leads"."kind" = 'retarget' OR "app"."leads"."retarget_reason" IS NULL),
	CONSTRAINT "chk_leads_held_until_owner" CHECK ("app"."leads"."held_until" IS NULL OR "app"."leads"."owner_membership_id" IS NOT NULL),
	CONSTRAINT "chk_leads_notes" CHECK (char_length("app"."leads"."notes") <= 2000),
	CONSTRAINT "chk_leads_updated" CHECK ("app"."leads"."updated_at" >= "app"."leads"."created_at"),
	CONSTRAINT "chk_leads_delete_reason" CHECK ("app"."leads"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_leads_delete_reason_when_deleted" CHECK (("app"."leads"."deleted_at" IS NULL) = ("app"."leads"."delete_reason" IS NULL)),
	CONSTRAINT "chk_leads_delete_note_when_other" CHECK ("app"."leads"."delete_reason" IS DISTINCT FROM 'other' OR "app"."leads"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."leads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.lead_involved_memberships — who else works a lead (up to 10); kept when they leave (K2) (launch ROUTE #131, routes-final §5).
CREATE TABLE IF NOT EXISTS "app"."lead_involved_memberships" (
	"lead_id" bigint NOT NULL,
	"membership_id" bigint NOT NULL,
	"organization_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	CONSTRAINT "lead_involved_memberships_pkey" PRIMARY KEY ("lead_id", "membership_id")
);
--> statement-breakpoint
ALTER TABLE "app"."lead_involved_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.appointments — A booked slot for a patient or a lead with a doctor, in a branch — a room and a machine may be named (D28) (launch ROUTE #21).
CREATE TABLE IF NOT EXISTS "app"."appointments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"appointment_number" integer DEFAULT 0 NOT NULL,
	"patient_id" bigint,
	"lead_id" bigint,
	"branch_id" bigint NOT NULL,
	"type" varchar(15) DEFAULT 'consultation' NOT NULL,
	"offering_id" bigint,
	"service_label" varchar(120) NOT NULL,
	"doctor_membership_id" bigint NOT NULL,
	"therapist_membership_id" bigint,
	"branch_room_id" bigint,
	"branch_machine_id" bigint,
	"appointment_date" date NOT NULL,
	"start_time" time NOT NULL,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"status" varchar(10) DEFAULT 'scheduled' NOT NULL,
	"cancel_reason" varchar(20),
	"cancel_note" varchar(280),
	"rescheduled_from" timestamp with time zone,
	"reason" varchar(160),
	"notes" text,
	"follow_up_at" timestamp with time zone,
	"checked_in_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"copied_from_appointment_id" bigint,
	"reminder_status" varchar(17) DEFAULT 'not_sent' NOT NULL,
	"is_confirmed_by_reply" boolean DEFAULT false NOT NULL,
	"move_count" integer DEFAULT 0 NOT NULL,
	"is_walk_in" boolean DEFAULT false NOT NULL,
	"patient_package_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_appointments_appointment_number" CHECK ("app"."appointments"."appointment_number" > 0),
	CONSTRAINT "chk_appointments_type" CHECK ("app"."appointments"."type" IN ('consultation', 'follow_up', 'treatment', 'package_session', 'other')),
	CONSTRAINT "chk_appointments_duration_minutes" CHECK ("app"."appointments"."duration_minutes" BETWEEN 5 AND 240),
	CONSTRAINT "chk_appointments_status" CHECK ("app"."appointments"."status" IN ('scheduled', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show')),
	CONSTRAINT "chk_appointments_cancel_reason" CHECK ("app"."appointments"."cancel_reason" IN ('patient_asked', 'unreachable', 'doctor_unavailable', 'resource_unavailable', 'rescheduling_later', 'booked_by_mistake', 'other')),
	CONSTRAINT "chk_appointments_reminder_status" CHECK ("app"."appointments"."reminder_status" IN ('not_sent', 'confirm_requested', 'reminder_queued', 'reminder_sent', 'failed')),
	CONSTRAINT "chk_appointments_move_count" CHECK ("app"."appointments"."move_count" >= 0),
	CONSTRAINT "chk_appointments_patient_or_lead" CHECK (("app"."appointments"."patient_id" IS NULL) <> ("app"."appointments"."lead_id" IS NULL)),
	CONSTRAINT "chk_appointments_duration_step" CHECK ("app"."appointments"."duration_minutes" % 5 = 0),
	CONSTRAINT "chk_appointments_cancel_reason_when_cancelled" CHECK (("app"."appointments"."status" = 'cancelled') = ("app"."appointments"."cancel_reason" IS NOT NULL)),
	CONSTRAINT "chk_appointments_updated" CHECK ("app"."appointments"."updated_at" >= "app"."appointments"."created_at"),
	CONSTRAINT "chk_appointments_delete_reason" CHECK ("app"."appointments"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_appointments_delete_reason_when_deleted" CHECK (("app"."appointments"."deleted_at" IS NULL) = ("app"."appointments"."delete_reason" IS NULL)),
	CONSTRAINT "chk_appointments_delete_note_when_other" CHECK ("app"."appointments"."delete_reason" IS DISTINCT FROM 'other' OR "app"."appointments"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."appointments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.visits — One visit in progress — the floor stage, the consult note and the safety checks (frontend D18) (launch ROUTE #22).
CREATE TABLE IF NOT EXISTS "app"."visits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"appointment_id" bigint NOT NULL,
	"patient_id" bigint NOT NULL,
	"stage" varchar(11) DEFAULT 'waiting' NOT NULL,
	"stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paused_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_saved_at" timestamp with time zone,
	"consult_complaint" text,
	"consult_findings" text,
	"consult_plan" text,
	"diagnoses" text[] DEFAULT '{}' NOT NULL,
	"is_safety_consent_checked" boolean DEFAULT false NOT NULL,
	"is_safety_before_photos_taken" boolean DEFAULT false NOT NULL,
	"is_safety_allergies_checked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_visits_stage" CHECK ("app"."visits"."stage" IN ('waiting', 'with_doctor', 'treatment', 'checkout', 'pharmacy', 'done')),
	CONSTRAINT "chk_visits_updated" CHECK ("app"."visits"."updated_at" >= "app"."visits"."created_at"),
	CONSTRAINT "chk_visits_delete_reason" CHECK ("app"."visits"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_visits_delete_reason_when_deleted" CHECK (("app"."visits"."deleted_at" IS NULL) = ("app"."visits"."delete_reason" IS NULL)),
	CONSTRAINT "chk_visits_delete_note_when_other" CHECK ("app"."visits"."delete_reason" IS DISTINCT FROM 'other' OR "app"."visits"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."visits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.diagnoses — The diagnosis catalogue the consult note picks from (launch ROUTE #23).
CREATE TABLE IF NOT EXISTS "app"."diagnoses" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"name" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_diagnoses_updated" CHECK ("app"."diagnoses"."updated_at" >= "app"."diagnoses"."created_at"),
	CONSTRAINT "chk_diagnoses_delete_reason" CHECK ("app"."diagnoses"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_diagnoses_delete_reason_when_deleted" CHECK (("app"."diagnoses"."deleted_at" IS NULL) = ("app"."diagnoses"."delete_reason" IS NULL)),
	CONSTRAINT "chk_diagnoses_delete_note_when_other" CHECK ("app"."diagnoses"."delete_reason" IS DISTINCT FROM 'other' OR "app"."diagnoses"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."diagnoses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.patient_clinical_notes — One short clinical note item — a complaint, diagnosis, treatment or future suggestion — with who added it and when (launch ROUTE #24).
CREATE TABLE IF NOT EXISTS "app"."patient_clinical_notes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"patient_id" bigint NOT NULL,
	"kind" varchar(20) NOT NULL,
	"text" varchar(500) NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_patient_clinical_notes_kind" CHECK ("app"."patient_clinical_notes"."kind" IN ('complaint', 'diagnosis', 'treatment_suggestion', 'future_suggestion')),
	CONSTRAINT "chk_patient_clinical_notes_updated" CHECK ("app"."patient_clinical_notes"."updated_at" >= "app"."patient_clinical_notes"."created_at"),
	CONSTRAINT "chk_patient_clinical_notes_delete_reason" CHECK ("app"."patient_clinical_notes"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_patient_clinical_notes_delete_reason_when_deleted" CHECK (("app"."patient_clinical_notes"."deleted_at" IS NULL) = ("app"."patient_clinical_notes"."delete_reason" IS NULL)),
	CONSTRAINT "chk_patient_clinical_notes_delete_note_when_other" CHECK ("app"."patient_clinical_notes"."delete_reason" IS DISTINCT FROM 'other' OR "app"."patient_clinical_notes"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."patient_clinical_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.prescriptions — A doctor's prescription for a patient — a draft until a prescriber approves it (D31) (launch ROUTE #25).
CREATE TABLE IF NOT EXISTS "app"."prescriptions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"prescription_number" integer DEFAULT 0 NOT NULL,
	"patient_id" bigint NOT NULL,
	"appointment_id" bigint,
	"doctor_membership_id" bigint NOT NULL,
	"prescription_date" date NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"advice" text,
	"lab_report" text,
	"procedure_today" text,
	"follow_up_date" date,
	"status" varchar(8) DEFAULT 'draft' NOT NULL,
	"approved_at" timestamp with time zone,
	"print_language" varchar(8) DEFAULT 'english' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_prescriptions_prescription_number" CHECK ("app"."prescriptions"."prescription_number" > 0),
	CONSTRAINT "chk_prescriptions_status" CHECK ("app"."prescriptions"."status" IN ('draft', 'approved')),
	CONSTRAINT "chk_prescriptions_print_language" CHECK ("app"."prescriptions"."print_language" IN ('english', 'gujarati', 'hindi')),
	CONSTRAINT "chk_prescriptions_updated" CHECK ("app"."prescriptions"."updated_at" >= "app"."prescriptions"."created_at"),
	CONSTRAINT "chk_prescriptions_delete_reason" CHECK ("app"."prescriptions"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_prescriptions_delete_reason_when_deleted" CHECK (("app"."prescriptions"."deleted_at" IS NULL) = ("app"."prescriptions"."delete_reason" IS NULL)),
	CONSTRAINT "chk_prescriptions_delete_note_when_other" CHECK ("app"."prescriptions"."delete_reason" IS DISTINCT FROM 'other' OR "app"."prescriptions"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."prescriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.prescription_kits — A doctor's one-tap prescription — a named set of medicine lines (the doctor's own) (launch ROUTE #26).
CREATE TABLE IF NOT EXISTS "app"."prescription_kits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"name" varchar(80) NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_prescription_kits_updated" CHECK ("app"."prescription_kits"."updated_at" >= "app"."prescription_kits"."created_at"),
	CONSTRAINT "chk_prescription_kits_delete_reason" CHECK ("app"."prescription_kits"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_prescription_kits_delete_reason_when_deleted" CHECK (("app"."prescription_kits"."deleted_at" IS NULL) = ("app"."prescription_kits"."delete_reason" IS NULL)),
	CONSTRAINT "chk_prescription_kits_delete_note_when_other" CHECK ("app"."prescription_kits"."delete_reason" IS DISTINCT FROM 'other' OR "app"."prescription_kits"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."prescription_kits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.patient_images — A clinical photo of a patient (the Private album is Doctor and Admin only) (launch ROUTE #27).
CREATE TABLE IF NOT EXISTS "app"."patient_images" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"patient_id" bigint NOT NULL,
	"appointment_id" bigint,
	"album" varchar(7) DEFAULT 'general' NOT NULL,
	"file_key" varchar(512) NOT NULL,
	"file_name" varchar(120) NOT NULL,
	"body_part" varchar(8),
	"taken_on" date NOT NULL,
	"caption" varchar(200),
	"display_name" varchar(60),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_patient_images_album" CHECK ("app"."patient_images"."album" IN ('general', 'private', 'lhr')),
	CONSTRAINT "chk_patient_images_body_part" CHECK ("app"."patient_images"."body_part" IN ('face', 'scalp', 'hair', 'body', 'chest', 'back', 'underarm', 'legs', 'arms', 'other')),
	CONSTRAINT "chk_patient_images_updated" CHECK ("app"."patient_images"."updated_at" >= "app"."patient_images"."created_at"),
	CONSTRAINT "chk_patient_images_delete_reason" CHECK ("app"."patient_images"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_patient_images_delete_reason_when_deleted" CHECK (("app"."patient_images"."deleted_at" IS NULL) = ("app"."patient_images"."delete_reason" IS NULL)),
	CONSTRAINT "chk_patient_images_delete_note_when_other" CHECK ("app"."patient_images"."delete_reason" IS DISTINCT FROM 'other' OR "app"."patient_images"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."patient_images" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.patient_reports — A lab, scan or consent document of a patient (launch ROUTE #28).
CREATE TABLE IF NOT EXISTS "app"."patient_reports" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"patient_id" bigint NOT NULL,
	"type" varchar(7) DEFAULT 'lab' NOT NULL,
	"name" varchar(120) NOT NULL,
	"report_date" date NOT NULL,
	"file_keys" text[] DEFAULT '{}' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_patient_reports_type" CHECK ("app"."patient_reports"."type" IN ('lab', 'scan', 'consent', 'other')),
	CONSTRAINT "chk_patient_reports_updated" CHECK ("app"."patient_reports"."updated_at" >= "app"."patient_reports"."created_at"),
	CONSTRAINT "chk_patient_reports_delete_reason" CHECK ("app"."patient_reports"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_patient_reports_delete_reason_when_deleted" CHECK (("app"."patient_reports"."deleted_at" IS NULL) = ("app"."patient_reports"."delete_reason" IS NULL)),
	CONSTRAINT "chk_patient_reports_delete_note_when_other" CHECK ("app"."patient_reports"."delete_reason" IS DISTINCT FROM 'other' OR "app"."patient_reports"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."patient_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.patient_notes — A timeline note on a patient (launch ROUTE #29).
CREATE TABLE IF NOT EXISTS "app"."patient_notes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"patient_id" bigint NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_patient_notes_updated" CHECK ("app"."patient_notes"."updated_at" >= "app"."patient_notes"."created_at"),
	CONSTRAINT "chk_patient_notes_delete_reason" CHECK ("app"."patient_notes"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_patient_notes_delete_reason_when_deleted" CHECK (("app"."patient_notes"."deleted_at" IS NULL) = ("app"."patient_notes"."delete_reason" IS NULL)),
	CONSTRAINT "chk_patient_notes_delete_note_when_other" CHECK ("app"."patient_notes"."delete_reason" IS DISTINCT FROM 'other' OR "app"."patient_notes"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."patient_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.invoices — A bill — clinic, consultation or medical — numbered per branch GSTIN and financial year (D23) (launch ROUTE #30).
CREATE TABLE IF NOT EXISTS "app"."invoices" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"invoice_sequence" integer DEFAULT 0 NOT NULL,
	"invoice_number" varchar(30) NOT NULL,
	"financial_year" varchar(9) NOT NULL,
	"type" varchar(12) DEFAULT 'clinic' NOT NULL,
	"branch_id" bigint NOT NULL,
	"patient_id" bigint,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"overall_discount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"invoice_date" date NOT NULL,
	"remark" varchar(500),
	"prescription_id" bigint,
	"medical_contact_id" bigint,
	"medical_sale_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_invoices_invoice_sequence" CHECK ("app"."invoices"."invoice_sequence" > 0),
	CONSTRAINT "chk_invoices_type" CHECK ("app"."invoices"."type" IN ('clinic', 'medical', 'consultation')),
	CONSTRAINT "chk_invoices_overall_discount" CHECK ("app"."invoices"."overall_discount" >= 0),
	CONSTRAINT "chk_invoices_patient_unless_medical" CHECK ("app"."invoices"."patient_id" IS NOT NULL OR "app"."invoices"."type" = 'medical'),
	CONSTRAINT "chk_invoices_financial_year" CHECK ("app"."invoices"."financial_year" ~ '^\d{4}-\d{2}$'),
	CONSTRAINT "chk_invoices_updated" CHECK ("app"."invoices"."updated_at" >= "app"."invoices"."created_at"),
	CONSTRAINT "chk_invoices_delete_reason" CHECK ("app"."invoices"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_invoices_delete_reason_when_deleted" CHECK (("app"."invoices"."deleted_at" IS NULL) = ("app"."invoices"."delete_reason" IS NULL)),
	CONSTRAINT "chk_invoices_delete_note_when_other" CHECK ("app"."invoices"."delete_reason" IS DISTINCT FROM 'other' OR "app"."invoices"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.invoice_team_memberships — the team_membership_ids of an invoice (launch ROUTE #30).
CREATE TABLE IF NOT EXISTS "app"."invoice_team_memberships" (
	"invoice_id" bigint NOT NULL,
	"team_membership_id" bigint NOT NULL,
	"organization_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	CONSTRAINT "invoice_team_memberships_pkey" PRIMARY KEY ("invoice_id", "team_membership_id")
);
--> statement-breakpoint
ALTER TABLE "app"."invoice_team_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.patient_packages — A package a patient bought (or is about to) — its sessions and expiry (launch ROUTE #31).
CREATE TABLE IF NOT EXISTS "app"."patient_packages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"patient_id" bigint NOT NULL,
	"offering_id" bigint NOT NULL,
	"invoice_id" bigint,
	"sessions_total" integer NOT NULL,
	"sessions_used" integer DEFAULT 0 NOT NULL,
	"valid_until" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_patient_packages_sessions_total" CHECK ("app"."patient_packages"."sessions_total" BETWEEN 1 AND 99),
	CONSTRAINT "chk_patient_packages_sessions_used" CHECK ("app"."patient_packages"."sessions_used" BETWEEN 0 AND 99),
	CONSTRAINT "chk_patient_packages_sessions_used_within_total" CHECK ("app"."patient_packages"."sessions_used" <= "app"."patient_packages"."sessions_total"),
	CONSTRAINT "chk_patient_packages_updated" CHECK ("app"."patient_packages"."updated_at" >= "app"."patient_packages"."created_at"),
	CONSTRAINT "chk_patient_packages_delete_reason" CHECK ("app"."patient_packages"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_patient_packages_delete_reason_when_deleted" CHECK (("app"."patient_packages"."deleted_at" IS NULL) = ("app"."patient_packages"."delete_reason" IS NULL)),
	CONSTRAINT "chk_patient_packages_delete_note_when_other" CHECK ("app"."patient_packages"."delete_reason" IS DISTINCT FROM 'other' OR "app"."patient_packages"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."patient_packages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.offering_suggestions — An offering suggested to a patient — the plan card (launch ROUTE #32).
CREATE TABLE IF NOT EXISTS "app"."offering_suggestions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"patient_id" bigint NOT NULL,
	"offering_id" bigint NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"price" numeric(12, 2),
	"status" varchar(9) DEFAULT 'planned' NOT NULL,
	"source_label" varchar(80) NOT NULL,
	"appointment_id" bigint,
	"reason" varchar(200),
	"invoice_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_offering_suggestions_quantity" CHECK ("app"."offering_suggestions"."quantity" BETWEEN 1 AND 99),
	CONSTRAINT "chk_offering_suggestions_price" CHECK ("app"."offering_suggestions"."price" >= 0),
	CONSTRAINT "chk_offering_suggestions_status" CHECK ("app"."offering_suggestions"."status" IN ('planned', 'accepted', 'next_time', 'declined')),
	CONSTRAINT "chk_offering_suggestions_updated" CHECK ("app"."offering_suggestions"."updated_at" >= "app"."offering_suggestions"."created_at"),
	CONSTRAINT "chk_offering_suggestions_delete_reason" CHECK ("app"."offering_suggestions"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_offering_suggestions_delete_reason_when_deleted" CHECK (("app"."offering_suggestions"."deleted_at" IS NULL) = ("app"."offering_suggestions"."delete_reason" IS NULL)),
	CONSTRAINT "chk_offering_suggestions_delete_note_when_other" CHECK ("app"."offering_suggestions"."delete_reason" IS DISTINCT FROM 'other' OR "app"."offering_suggestions"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."offering_suggestions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.patient_ideas — A patient's suggested next steps — the AI's on a de-identified summary, rules as the fallback (D39) (launch ROUTE #33).
CREATE TABLE IF NOT EXISTS "app"."patient_ideas" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"patient_id" bigint NOT NULL,
	"ideas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" varchar(5) DEFAULT 'rules' NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_patient_ideas_source" CHECK ("app"."patient_ideas"."source" IN ('ai', 'rules')),
	CONSTRAINT "chk_patient_ideas_updated" CHECK ("app"."patient_ideas"."updated_at" >= "app"."patient_ideas"."created_at"),
	CONSTRAINT "chk_patient_ideas_delete_reason" CHECK ("app"."patient_ideas"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_patient_ideas_delete_reason_when_deleted" CHECK (("app"."patient_ideas"."deleted_at" IS NULL) = ("app"."patient_ideas"."delete_reason" IS NULL)),
	CONSTRAINT "chk_patient_ideas_delete_note_when_other" CHECK ("app"."patient_ideas"."delete_reason" IS DISTINCT FROM 'other' OR "app"."patient_ideas"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."patient_ideas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.payments — Money in or out — a receipt, refund, expense, supplier bill, money back or reversal (launch ROUTE #34).
CREATE TABLE IF NOT EXISTS "app"."payments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"payment_number" integer DEFAULT 0 NOT NULL,
	"direction" varchar(8) NOT NULL,
	"kind" varchar(13) NOT NULL,
	"branch_id" bigint NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"splits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"patient_id" bigint,
	"invoice_id" bigint,
	"payee_name" varchar(120),
	"expense_category" varchar(11),
	"bill_ref" jsonb,
	"credit_note_id" bigint,
	"pending_credit_id" bigint,
	"note" varchar(280),
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"day_close_id" bigint,
	"bill_allocations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reference" varchar(60),
	"attachment_keys" text[] DEFAULT '{}' NOT NULL,
	"is_checked_at_close" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_payments_payment_number" CHECK ("app"."payments"."payment_number" > 0),
	CONSTRAINT "chk_payments_direction" CHECK ("app"."payments"."direction" IN ('received', 'paid')),
	CONSTRAINT "chk_payments_kind" CHECK ("app"."payments"."kind" IN ('receipt', 'refund', 'expense', 'supplier_bill', 'money_back', 'reversal')),
	CONSTRAINT "chk_payments_amount" CHECK ("app"."payments"."amount" >= 0),
	CONSTRAINT "chk_payments_expense_category" CHECK ("app"."payments"."expense_category" IN ('medicines', 'consumables', 'salary', 'rent', 'marketing', 'utilities', 'maintenance', 'misc')),
	CONSTRAINT "chk_payments_amount_positive" CHECK ("app"."payments"."amount" > 0),
	CONSTRAINT "chk_payments_payee_when_paid" CHECK ("app"."payments"."direction" <> 'paid' OR "app"."payments"."payee_name" IS NOT NULL),
	CONSTRAINT "chk_payments_expense_category_when_expense" CHECK ("app"."payments"."kind" <> 'expense' OR "app"."payments"."expense_category" IS NOT NULL),
	CONSTRAINT "chk_payments_updated" CHECK ("app"."payments"."updated_at" >= "app"."payments"."created_at"),
	CONSTRAINT "chk_payments_delete_reason" CHECK ("app"."payments"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_payments_delete_reason_when_deleted" CHECK (("app"."payments"."deleted_at" IS NULL) = ("app"."payments"."delete_reason" IS NULL)),
	CONSTRAINT "chk_payments_delete_note_when_other" CHECK ("app"."payments"."delete_reason" IS DISTINCT FROM 'other' OR "app"."payments"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.payment_edits — One change to a payment — before and after, who and when (launch ROUTE #35).
CREATE TABLE IF NOT EXISTS "app"."payment_edits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"payment_id" bigint NOT NULL,
	"edited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_payment_edits_updated" CHECK ("app"."payment_edits"."updated_at" >= "app"."payment_edits"."created_at"),
	CONSTRAINT "chk_payment_edits_delete_reason" CHECK ("app"."payment_edits"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_payment_edits_delete_reason_when_deleted" CHECK (("app"."payment_edits"."deleted_at" IS NULL) = ("app"."payment_edits"."delete_reason" IS NULL)),
	CONSTRAINT "chk_payment_edits_delete_note_when_other" CHECK ("app"."payment_edits"."delete_reason" IS DISTINCT FROM 'other' OR "app"."payment_edits"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."payment_edits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.credit_notes — A credit against an invoice — the invoice is never edited (D22) (launch ROUTE #36).
CREATE TABLE IF NOT EXISTS "app"."credit_notes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"credit_note_number" integer DEFAULT 0 NOT NULL,
	"invoice_id" bigint NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"reason" varchar(280) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_credit_notes_credit_note_number" CHECK ("app"."credit_notes"."credit_note_number" > 0),
	CONSTRAINT "chk_credit_notes_amount" CHECK ("app"."credit_notes"."amount" >= 0),
	CONSTRAINT "chk_credit_notes_updated" CHECK ("app"."credit_notes"."updated_at" >= "app"."credit_notes"."created_at"),
	CONSTRAINT "chk_credit_notes_delete_reason" CHECK ("app"."credit_notes"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_credit_notes_delete_reason_when_deleted" CHECK (("app"."credit_notes"."deleted_at" IS NULL) = ("app"."credit_notes"."delete_reason" IS NULL)),
	CONSTRAINT "chk_credit_notes_delete_note_when_other" CHECK ("app"."credit_notes"."delete_reason" IS DISTINCT FROM 'other' OR "app"."credit_notes"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."credit_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.pending_credits — Money owed to or by someone, to settle later (launch ROUTE #37).
CREATE TABLE IF NOT EXISTS "app"."pending_credits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"pending_credit_number" integer DEFAULT 0 NOT NULL,
	"direction" varchar(4) NOT NULL,
	"party_kind" varchar(8) DEFAULT 'patient' NOT NULL,
	"party_name" varchar(120) NOT NULL,
	"patient_id" bigint,
	"amount" numeric(12, 2) NOT NULL,
	"reason" varchar(280) NOT NULL,
	"source_payment_id" bigint,
	"status" varchar(10) DEFAULT 'open' NOT NULL,
	"settled_payment_id" bigint,
	"invoice_id" bigint,
	"settle_by" date,
	"settled_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"note" varchar(280),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_pending_credits_pending_credit_number" CHECK ("app"."pending_credits"."pending_credit_number" > 0),
	CONSTRAINT "chk_pending_credits_direction" CHECK ("app"."pending_credits"."direction" IN ('give', 'take')),
	CONSTRAINT "chk_pending_credits_party_kind" CHECK ("app"."pending_credits"."party_kind" IN ('patient', 'supplier', 'staff', 'other')),
	CONSTRAINT "chk_pending_credits_amount" CHECK ("app"."pending_credits"."amount" >= 0),
	CONSTRAINT "chk_pending_credits_status" CHECK ("app"."pending_credits"."status" IN ('open', 'given_back', 'got_back', 'used')),
	CONSTRAINT "chk_pending_credits_settled_amount" CHECK ("app"."pending_credits"."settled_amount" >= 0),
	CONSTRAINT "chk_pending_credits_amount_positive" CHECK ("app"."pending_credits"."amount" > 0),
	CONSTRAINT "chk_pending_credits_settled_within_amount" CHECK ("app"."pending_credits"."settled_amount" <= "app"."pending_credits"."amount"),
	CONSTRAINT "chk_pending_credits_updated" CHECK ("app"."pending_credits"."updated_at" >= "app"."pending_credits"."created_at"),
	CONSTRAINT "chk_pending_credits_delete_reason" CHECK ("app"."pending_credits"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_pending_credits_delete_reason_when_deleted" CHECK (("app"."pending_credits"."deleted_at" IS NULL) = ("app"."pending_credits"."delete_reason" IS NULL)),
	CONSTRAINT "chk_pending_credits_delete_note_when_other" CHECK ("app"."pending_credits"."delete_reason" IS DISTINCT FROM 'other' OR "app"."pending_credits"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."pending_credits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.day_closes — A branch's day — the opening cash accepted, then the count and the close (launch ROUTE #38).
CREATE TABLE IF NOT EXISTS "app"."day_closes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"branch_id" bigint NOT NULL,
	"close_date" date NOT NULL,
	"status" varchar(6) DEFAULT 'open' NOT NULL,
	"opening_cash" numeric(12, 2) NOT NULL,
	"opening_source" varchar(13) DEFAULT 'carried' NOT NULL,
	"opening_accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"counted_cash" numeric(12, 2),
	"closed_at" timestamp with time zone,
	"difference_reason" varchar(280),
	"reopened_at" timestamp with time zone,
	"is_auto_closed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_day_closes_status" CHECK ("app"."day_closes"."status" IN ('open', 'closed')),
	CONSTRAINT "chk_day_closes_opening_cash" CHECK ("app"."day_closes"."opening_cash" >= 0),
	CONSTRAINT "chk_day_closes_opening_source" CHECK ("app"."day_closes"."opening_source" IN ('carried', 'default_float')),
	CONSTRAINT "chk_day_closes_counted_cash" CHECK ("app"."day_closes"."counted_cash" >= 0),
	CONSTRAINT "chk_day_closes_updated" CHECK ("app"."day_closes"."updated_at" >= "app"."day_closes"."created_at"),
	CONSTRAINT "chk_day_closes_delete_reason" CHECK ("app"."day_closes"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_day_closes_delete_reason_when_deleted" CHECK (("app"."day_closes"."deleted_at" IS NULL) = ("app"."day_closes"."delete_reason" IS NULL)),
	CONSTRAINT "chk_day_closes_delete_note_when_other" CHECK ("app"."day_closes"."delete_reason" IS DISTINCT FROM 'other' OR "app"."day_closes"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."day_closes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.day_close_events — One line of a day's log — accepted, counted, closed, reopened (launch ROUTE #39).
CREATE TABLE IF NOT EXISTS "app"."day_close_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"day_close_id" bigint NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"text" varchar(280) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_day_close_events_updated" CHECK ("app"."day_close_events"."updated_at" >= "app"."day_close_events"."created_at"),
	CONSTRAINT "chk_day_close_events_delete_reason" CHECK ("app"."day_close_events"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_day_close_events_delete_reason_when_deleted" CHECK (("app"."day_close_events"."deleted_at" IS NULL) = ("app"."day_close_events"."delete_reason" IS NULL)),
	CONSTRAINT "chk_day_close_events_delete_note_when_other" CHECK ("app"."day_close_events"."delete_reason" IS DISTINCT FROM 'other' OR "app"."day_close_events"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."day_close_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.treatments — A treatment session done for a patient — reversed with a reason, never deleted (P89) (launch ROUTE #40).
CREATE TABLE IF NOT EXISTS "app"."treatments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"patient_id" bigint NOT NULL,
	"appointment_id" bigint,
	"offering_id" bigint,
	"name" varchar(120) NOT NULL,
	"template" varchar(7) DEFAULT 'skin' NOT NULL,
	"performed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"doctor_membership_id" bigint,
	"therapist_membership_id" bigint,
	"body_parts" text[] DEFAULT '{}' NOT NULL,
	"session_number" integer DEFAULT 1 NOT NULL,
	"parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"remark" text,
	"aftercare_call" varchar(11) DEFAULT 'next_day' NOT NULL,
	"patient_package_id" bigint,
	"status" varchar(8) DEFAULT 'done' NOT NULL,
	"reversed_reason" varchar(280),
	"reversed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_treatments_template" CHECK ("app"."treatments"."template" IN ('skin', 'dental', 'physio', 'gynac', 'general')),
	CONSTRAINT "chk_treatments_body_parts" CHECK ("app"."treatments"."body_parts" <@ ARRAY['face', 'scalp', 'hair', 'body', 'chest', 'back', 'underarm', 'legs', 'arms', 'other']::text[]),
	CONSTRAINT "chk_treatments_session_number" CHECK ("app"."treatments"."session_number" BETWEEN 1 AND 99),
	CONSTRAINT "chk_treatments_aftercare_call" CHECK ("app"."treatments"."aftercare_call" IN ('none', 'next_day', 'in_two_days', 'in_week')),
	CONSTRAINT "chk_treatments_status" CHECK ("app"."treatments"."status" IN ('done', 'reversed')),
	CONSTRAINT "chk_treatments_reversed_reason_when_reversed" CHECK (("app"."treatments"."status" = 'reversed') = ("app"."treatments"."reversed_reason" IS NOT NULL)),
	CONSTRAINT "chk_treatments_updated" CHECK ("app"."treatments"."updated_at" >= "app"."treatments"."created_at"),
	CONSTRAINT "chk_treatments_delete_reason" CHECK ("app"."treatments"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_treatments_delete_reason_when_deleted" CHECK (("app"."treatments"."deleted_at" IS NULL) = ("app"."treatments"."delete_reason" IS NULL)),
	CONSTRAINT "chk_treatments_delete_note_when_other" CHECK ("app"."treatments"."delete_reason" IS DISTINCT FROM 'other' OR "app"."treatments"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."treatments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.check_ins — A follow-up check on how a patient is doing (launch ROUTE #41).
CREATE TABLE IF NOT EXISTS "app"."check_ins" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"patient_id" bigint NOT NULL,
	"appointment_id" bigint,
	"treatment_id" bigint,
	"context" varchar(80) NOT NULL,
	"feel" varchar(11) NOT NULL,
	"score" integer NOT NULL,
	"followed" varchar(10),
	"followed_note" varchar(280),
	"current_state" varchar(500),
	"next_plan" varchar(500),
	"check_in_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_check_ins_feel" CHECK ("app"."check_ins"."feel" IN ('much_better', 'better', 'same', 'worse')),
	CONSTRAINT "chk_check_ins_score" CHECK ("app"."check_ins"."score" BETWEEN 1 AND 10),
	CONSTRAINT "chk_check_ins_followed" CHECK ("app"."check_ins"."followed" IN ('fully', 'mostly', 'partly', 'not_at_all')),
	CONSTRAINT "chk_check_ins_updated" CHECK ("app"."check_ins"."updated_at" >= "app"."check_ins"."created_at"),
	CONSTRAINT "chk_check_ins_delete_reason" CHECK ("app"."check_ins"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_check_ins_delete_reason_when_deleted" CHECK (("app"."check_ins"."deleted_at" IS NULL) = ("app"."check_ins"."delete_reason" IS NULL)),
	CONSTRAINT "chk_check_ins_delete_note_when_other" CHECK ("app"."check_ins"."delete_reason" IS DISTINCT FROM 'other' OR "app"."check_ins"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."check_ins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.check_in_next_offerings — the next_offering_ids of an check_in (launch ROUTE #41).
CREATE TABLE IF NOT EXISTS "app"."check_in_next_offerings" (
	"check_in_id" bigint NOT NULL,
	"next_offering_id" bigint NOT NULL,
	"organization_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	CONSTRAINT "check_in_next_offerings_pkey" PRIMARY KEY ("check_in_id", "next_offering_id")
);
--> statement-breakpoint
ALTER TABLE "app"."check_in_next_offerings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.reviews — A patient's review — Google, video, Instagram, the internal form or WhatsApp (launch ROUTE #42).
CREATE TABLE IF NOT EXISTS "app"."reviews" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"patient_id" bigint NOT NULL,
	"appointment_id" bigint,
	"source" varchar(13) NOT NULL,
	"rating" integer,
	"text" text,
	"link" varchar(500),
	"file_keys" text[] DEFAULT '{}' NOT NULL,
	"review_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_reviews_source" CHECK ("app"."reviews"."source" IN ('google', 'video', 'instagram', 'internal_form', 'whatsapp')),
	CONSTRAINT "chk_reviews_rating" CHECK ("app"."reviews"."rating" BETWEEN 1 AND 5),
	CONSTRAINT "chk_reviews_updated" CHECK ("app"."reviews"."updated_at" >= "app"."reviews"."created_at"),
	CONSTRAINT "chk_reviews_delete_reason" CHECK ("app"."reviews"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_reviews_delete_reason_when_deleted" CHECK (("app"."reviews"."deleted_at" IS NULL) = ("app"."reviews"."delete_reason" IS NULL)),
	CONSTRAINT "chk_reviews_delete_note_when_other" CHECK ("app"."reviews"."delete_reason" IS DISTINCT FROM 'other' OR "app"."reviews"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.feedback_actions — What the team did about a check-in or a review (launch ROUTE #43).
CREATE TABLE IF NOT EXISTS "app"."feedback_actions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"check_in_id" bigint,
	"review_id" bigint,
	"action" varchar(18) NOT NULL,
	"note" varchar(280),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_feedback_actions_action" CHECK ("app"."feedback_actions"."action" IN ('doctor_called', 'asked_revisit', 'free_review_booked', 'plan_changed', 'replied_google', 'replied_instagram', 'replied_whatsapp', 'refund_credit', 'other')),
	CONSTRAINT "chk_feedback_actions_check_in_or_review" CHECK (("app"."feedback_actions"."check_in_id" IS NULL) <> ("app"."feedback_actions"."review_id" IS NULL)),
	CONSTRAINT "chk_feedback_actions_note_when_other" CHECK ("app"."feedback_actions"."action" <> 'other' OR "app"."feedback_actions"."note" IS NOT NULL),
	CONSTRAINT "chk_feedback_actions_updated" CHECK ("app"."feedback_actions"."updated_at" >= "app"."feedback_actions"."created_at"),
	CONSTRAINT "chk_feedback_actions_delete_reason" CHECK ("app"."feedback_actions"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_feedback_actions_delete_reason_when_deleted" CHECK (("app"."feedback_actions"."deleted_at" IS NULL) = ("app"."feedback_actions"."delete_reason" IS NULL)),
	CONSTRAINT "chk_feedback_actions_delete_note_when_other" CHECK ("app"."feedback_actions"."delete_reason" IS DISTINCT FROM 'other' OR "app"."feedback_actions"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."feedback_actions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.manufacturers — A maker of medicines — the dot colour on medicine lines (launch ROUTE #44).
CREATE TABLE IF NOT EXISTS "app"."manufacturers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"name" varchar(80) NOT NULL,
	"tone" varchar(10) DEFAULT 'sky' NOT NULL,
	"is_quick" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_manufacturers_tone" CHECK ("app"."manufacturers"."tone" IN ('butter', 'lav', 'sky', 'sage', 'blush', 'mint', 'peach', 'plum', 'lime', 'slate', 'stone')),
	CONSTRAINT "chk_manufacturers_updated" CHECK ("app"."manufacturers"."updated_at" >= "app"."manufacturers"."created_at"),
	CONSTRAINT "chk_manufacturers_delete_reason" CHECK ("app"."manufacturers"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_manufacturers_delete_reason_when_deleted" CHECK (("app"."manufacturers"."deleted_at" IS NULL) = ("app"."manufacturers"."delete_reason" IS NULL)),
	CONSTRAINT "chk_manufacturers_delete_note_when_other" CHECK ("app"."manufacturers"."delete_reason" IS DISTINCT FROM 'other' OR "app"."manufacturers"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."manufacturers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.suppliers — An agency the store buys medicines from (launch ROUTE #45).
CREATE TABLE IF NOT EXISTS "app"."suppliers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"name" varchar(120) NOT NULL,
	"phone" varchar(16),
	"gst_number" varchar(15),
	"is_quick" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_suppliers_phone" CHECK ("app"."suppliers"."phone" ~ '^\+91\d{10}$'),
	CONSTRAINT "chk_suppliers_gst_number" CHECK ("app"."suppliers"."gst_number" ~ '^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$'),
	CONSTRAINT "chk_suppliers_updated" CHECK ("app"."suppliers"."updated_at" >= "app"."suppliers"."created_at"),
	CONSTRAINT "chk_suppliers_delete_reason" CHECK ("app"."suppliers"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_suppliers_delete_reason_when_deleted" CHECK (("app"."suppliers"."deleted_at" IS NULL) = ("app"."suppliers"."delete_reason" IS NULL)),
	CONSTRAINT "chk_suppliers_delete_note_when_other" CHECK ("app"."suppliers"."delete_reason" IS DISTINCT FROM 'other' OR "app"."suppliers"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."suppliers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.supplier_manufacturers — the manufacturer_ids of an supplier (launch ROUTE #45).
CREATE TABLE IF NOT EXISTS "app"."supplier_manufacturers" (
	"supplier_id" bigint NOT NULL,
	"manufacturer_id" bigint NOT NULL,
	"organization_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	CONSTRAINT "supplier_manufacturers_pkey" PRIMARY KEY ("supplier_id", "manufacturer_id")
);
--> statement-breakpoint
ALTER TABLE "app"."supplier_manufacturers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.medical_reps — A manufacturer's representative who visits the store (launch ROUTE #46).
CREATE TABLE IF NOT EXISTS "app"."medical_reps" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"name" varchar(120) NOT NULL,
	"phone" varchar(16),
	"next_visit_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_medical_reps_phone" CHECK ("app"."medical_reps"."phone" ~ '^\+91\d{10}$'),
	CONSTRAINT "chk_medical_reps_updated" CHECK ("app"."medical_reps"."updated_at" >= "app"."medical_reps"."created_at"),
	CONSTRAINT "chk_medical_reps_delete_reason" CHECK ("app"."medical_reps"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_medical_reps_delete_reason_when_deleted" CHECK (("app"."medical_reps"."deleted_at" IS NULL) = ("app"."medical_reps"."delete_reason" IS NULL)),
	CONSTRAINT "chk_medical_reps_delete_note_when_other" CHECK ("app"."medical_reps"."delete_reason" IS DISTINCT FROM 'other' OR "app"."medical_reps"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."medical_reps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.medical_rep_manufacturers — the manufacturer_ids of an medical_rep (launch ROUTE #46).
CREATE TABLE IF NOT EXISTS "app"."medical_rep_manufacturers" (
	"medical_rep_id" bigint NOT NULL,
	"manufacturer_id" bigint NOT NULL,
	"organization_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	CONSTRAINT "medical_rep_manufacturers_pkey" PRIMARY KEY ("medical_rep_id", "manufacturer_id")
);
--> statement-breakpoint
ALTER TABLE "app"."medical_rep_manufacturers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.medical_rep_visits — One visit of a medical rep (D36) (launch ROUTE #47).
CREATE TABLE IF NOT EXISTS "app"."medical_rep_visits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"medical_rep_id" bigint NOT NULL,
	"visit_date" date NOT NULL,
	"samples" varchar(120),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_medical_rep_visits_updated" CHECK ("app"."medical_rep_visits"."updated_at" >= "app"."medical_rep_visits"."created_at"),
	CONSTRAINT "chk_medical_rep_visits_delete_reason" CHECK ("app"."medical_rep_visits"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_medical_rep_visits_delete_reason_when_deleted" CHECK (("app"."medical_rep_visits"."deleted_at" IS NULL) = ("app"."medical_rep_visits"."delete_reason" IS NULL)),
	CONSTRAINT "chk_medical_rep_visits_delete_note_when_other" CHECK ("app"."medical_rep_visits"."delete_reason" IS DISTINCT FROM 'other' OR "app"."medical_rep_visits"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."medical_rep_visits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.medicines — A medicine the store stocks — its batches, supplier rates and stock levels (launch ROUTE #48).
CREATE TABLE IF NOT EXISTS "app"."medicines" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"medicine_number" integer DEFAULT 0 NOT NULL,
	"name" varchar(120) NOT NULL,
	"composition" varchar(160),
	"manufacturer_id" bigint NOT NULL,
	"mrp" numeric(12, 2) NOT NULL,
	"gst_percent" integer DEFAULT 12 NOT NULL,
	"min_stock" integer DEFAULT 2 NOT NULL,
	"max_stock" integer DEFAULT 10 NOT NULL,
	"batches" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"supplier_rates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_quick" boolean DEFAULT false NOT NULL,
	"is_prescription_only" boolean DEFAULT false NOT NULL,
	"near_expiry_discount_percent" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_medicines_medicine_number" CHECK ("app"."medicines"."medicine_number" > 0),
	CONSTRAINT "chk_medicines_mrp" CHECK ("app"."medicines"."mrp" >= 0),
	CONSTRAINT "chk_medicines_gst_percent" CHECK ("app"."medicines"."gst_percent" IN (0, 5, 12, 18, 28)),
	CONSTRAINT "chk_medicines_min_stock" CHECK ("app"."medicines"."min_stock" BETWEEN 0 AND 9999),
	CONSTRAINT "chk_medicines_max_stock" CHECK ("app"."medicines"."max_stock" BETWEEN 0 AND 9999),
	CONSTRAINT "chk_medicines_near_expiry_discount_percent" CHECK ("app"."medicines"."near_expiry_discount_percent" BETWEEN 0 AND 100),
	CONSTRAINT "chk_medicines_mrp_positive" CHECK ("app"."medicines"."mrp" > 0),
	CONSTRAINT "chk_medicines_stock_levels" CHECK ("app"."medicines"."min_stock" <= "app"."medicines"."max_stock"),
	CONSTRAINT "chk_medicines_updated" CHECK ("app"."medicines"."updated_at" >= "app"."medicines"."created_at"),
	CONSTRAINT "chk_medicines_delete_reason" CHECK ("app"."medicines"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_medicines_delete_reason_when_deleted" CHECK (("app"."medicines"."deleted_at" IS NULL) = ("app"."medicines"."delete_reason" IS NULL)),
	CONSTRAINT "chk_medicines_delete_note_when_other" CHECK ("app"."medicines"."delete_reason" IS DISTINCT FROM 'other' OR "app"."medicines"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."medicines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.medical_purchase_orders — An order of medicines from a supplier — received into stock, then paid (launch ROUTE #49).
CREATE TABLE IF NOT EXISTS "app"."medical_purchase_orders" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"purchase_order_number" integer DEFAULT 0 NOT NULL,
	"supplier_id" bigint NOT NULL,
	"supplier_bill_number" varchar(30),
	"order_date" date NOT NULL,
	"stage" varchar(9) DEFAULT 'ordered' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"paid_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"cancel_reason" varchar(10),
	"received_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_medical_purchase_orders_purchase_order_number" CHECK ("app"."medical_purchase_orders"."purchase_order_number" > 0),
	CONSTRAINT "chk_medical_purchase_orders_stage" CHECK ("app"."medical_purchase_orders"."stage" IN ('ordered', 'received', 'paid', 'cancelled')),
	CONSTRAINT "chk_medical_purchase_orders_paid_amount" CHECK ("app"."medical_purchase_orders"."paid_amount" >= 0),
	CONSTRAINT "chk_medical_purchase_orders_cancel_reason" CHECK ("app"."medical_purchase_orders"."cancel_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_medical_purchase_orders_cancel_reason_when_cancelled" CHECK (("app"."medical_purchase_orders"."stage" = 'cancelled') = ("app"."medical_purchase_orders"."cancel_reason" IS NOT NULL)),
	CONSTRAINT "chk_medical_purchase_orders_updated" CHECK ("app"."medical_purchase_orders"."updated_at" >= "app"."medical_purchase_orders"."created_at"),
	CONSTRAINT "chk_medical_purchase_orders_delete_reason" CHECK ("app"."medical_purchase_orders"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_medical_purchase_orders_delete_reason_when_deleted" CHECK (("app"."medical_purchase_orders"."deleted_at" IS NULL) = ("app"."medical_purchase_orders"."delete_reason" IS NULL)),
	CONSTRAINT "chk_medical_purchase_orders_delete_note_when_other" CHECK ("app"."medical_purchase_orders"."delete_reason" IS DISTINCT FROM 'other' OR "app"."medical_purchase_orders"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."medical_purchase_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.medical_contacts — A walk-in customer of the store (no patient record) (launch ROUTE #50).
CREATE TABLE IF NOT EXISTS "app"."medical_contacts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"name" varchar(120) NOT NULL,
	"phone" varchar(16),
	"search_text" text GENERATED ALWAYS AS ("name" || ' ' || coalesce("phone", '')) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_medical_contacts_phone" CHECK ("app"."medical_contacts"."phone" ~ '^\+91\d{10}$'),
	CONSTRAINT "chk_medical_contacts_updated" CHECK ("app"."medical_contacts"."updated_at" >= "app"."medical_contacts"."created_at"),
	CONSTRAINT "chk_medical_contacts_delete_reason" CHECK ("app"."medical_contacts"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_medical_contacts_delete_reason_when_deleted" CHECK (("app"."medical_contacts"."deleted_at" IS NULL) = ("app"."medical_contacts"."delete_reason" IS NULL)),
	CONSTRAINT "chk_medical_contacts_delete_note_when_other" CHECK ("app"."medical_contacts"."delete_reason" IS DISTINCT FROM 'other' OR "app"."medical_contacts"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."medical_contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.medical_sales — A sale over the store counter — never more than a batch holds, never an expired batch, never above MRP (D42) (launch ROUTE #51).
CREATE TABLE IF NOT EXISTS "app"."medical_sales" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"sale_number" integer DEFAULT 0 NOT NULL,
	"invoice_id" bigint,
	"patient_id" bigint,
	"medical_contact_id" bigint,
	"prescription_id" bigint,
	"lead_id" bigint,
	"status" varchar(6) DEFAULT 'sold' NOT NULL,
	"sold_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"returns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_medical_sales_sale_number" CHECK ("app"."medical_sales"."sale_number" > 0),
	CONSTRAINT "chk_medical_sales_status" CHECK ("app"."medical_sales"."status" IN ('sold', 'voided')),
	CONSTRAINT "chk_medical_sales_patient_or_contact" CHECK ("app"."medical_sales"."patient_id" IS NOT NULL OR "app"."medical_sales"."medical_contact_id" IS NOT NULL),
	CONSTRAINT "chk_medical_sales_updated" CHECK ("app"."medical_sales"."updated_at" >= "app"."medical_sales"."created_at"),
	CONSTRAINT "chk_medical_sales_delete_reason" CHECK ("app"."medical_sales"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_medical_sales_delete_reason_when_deleted" CHECK (("app"."medical_sales"."deleted_at" IS NULL) = ("app"."medical_sales"."delete_reason" IS NULL)),
	CONSTRAINT "chk_medical_sales_delete_note_when_other" CHECK ("app"."medical_sales"."delete_reason" IS DISTINCT FROM 'other' OR "app"."medical_sales"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."medical_sales" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.supplier_credits — Credit from a supplier for expiring stock returned (launch ROUTE #52).
CREATE TABLE IF NOT EXISTS "app"."supplier_credits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"supplier_id" bigint NOT NULL,
	"medicine_id" bigint,
	"batch_number" varchar(20),
	"quantity" integer NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"adjusted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_supplier_credits_quantity" CHECK ("app"."supplier_credits"."quantity" BETWEEN 1 AND 99999),
	CONSTRAINT "chk_supplier_credits_amount" CHECK ("app"."supplier_credits"."amount" >= 0),
	CONSTRAINT "chk_supplier_credits_updated" CHECK ("app"."supplier_credits"."updated_at" >= "app"."supplier_credits"."created_at"),
	CONSTRAINT "chk_supplier_credits_delete_reason" CHECK ("app"."supplier_credits"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_supplier_credits_delete_reason_when_deleted" CHECK (("app"."supplier_credits"."deleted_at" IS NULL) = ("app"."supplier_credits"."delete_reason" IS NULL)),
	CONSTRAINT "chk_supplier_credits_delete_note_when_other" CHECK ("app"."supplier_credits"."delete_reason" IS DISTINCT FROM 'other' OR "app"."supplier_credits"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."supplier_credits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.stock_vendors — A vendor the organization buys consumables from (launch ROUTE #53).
CREATE TABLE IF NOT EXISTS "app"."stock_vendors" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"name" varchar(120) NOT NULL,
	"phone" varchar(16),
	"is_quick" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_stock_vendors_phone" CHECK ("app"."stock_vendors"."phone" ~ '^\+91\d{10}$'),
	CONSTRAINT "chk_stock_vendors_updated" CHECK ("app"."stock_vendors"."updated_at" >= "app"."stock_vendors"."created_at"),
	CONSTRAINT "chk_stock_vendors_delete_reason" CHECK ("app"."stock_vendors"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_stock_vendors_delete_reason_when_deleted" CHECK (("app"."stock_vendors"."deleted_at" IS NULL) = ("app"."stock_vendors"."delete_reason" IS NULL)),
	CONSTRAINT "chk_stock_vendors_delete_note_when_other" CHECK ("app"."stock_vendors"."delete_reason" IS DISTINCT FROM 'other' OR "app"."stock_vendors"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."stock_vendors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.stock_items — A consumable kept in stock — its levels in milli-units (×1000) (launch ROUTE #54).
CREATE TABLE IF NOT EXISTS "app"."stock_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"stock_item_number" integer DEFAULT 0 NOT NULL,
	"name" varchar(120) NOT NULL,
	"category" varchar(13) DEFAULT 'creams_serums' NOT NULL,
	"unit" varchar(7) DEFAULT 'piece' NOT NULL,
	"size_per_unit_milli" integer,
	"measure_unit" varchar(5),
	"quantity_milli" integer DEFAULT 0 NOT NULL,
	"min_quantity" integer DEFAULT 1 NOT NULL,
	"max_quantity" integer DEFAULT 10 NOT NULL,
	"usage_per_week_milli" integer DEFAULT 0 NOT NULL,
	"stock_vendor_id" bigint,
	"last_rate" numeric(12, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_stock_items_stock_item_number" CHECK ("app"."stock_items"."stock_item_number" > 0),
	CONSTRAINT "chk_stock_items_category" CHECK ("app"."stock_items"."category" IN ('creams_serums', 'peels', 'masks', 'consumables', 'equipment', 'other')),
	CONSTRAINT "chk_stock_items_unit" CHECK ("app"."stock_items"."unit" IN ('piece', 'tube', 'bottle', 'kit', 'pack', 'box', 'vial', 'ampoule', 'sachet', 'jar', 'roll', 'pair', 'ml', 'g', 'litre')),
	CONSTRAINT "chk_stock_items_measure_unit" CHECK ("app"."stock_items"."measure_unit" IN ('ml', 'g', 'pcs', 'units')),
	CONSTRAINT "chk_stock_items_quantity_milli" CHECK ("app"."stock_items"."quantity_milli" >= 0),
	CONSTRAINT "chk_stock_items_min_quantity" CHECK ("app"."stock_items"."min_quantity" BETWEEN 0 AND 99999),
	CONSTRAINT "chk_stock_items_max_quantity" CHECK ("app"."stock_items"."max_quantity" BETWEEN 0 AND 99999),
	CONSTRAINT "chk_stock_items_usage_per_week_milli" CHECK ("app"."stock_items"."usage_per_week_milli" >= 0),
	CONSTRAINT "chk_stock_items_last_rate" CHECK ("app"."stock_items"."last_rate" >= 0),
	CONSTRAINT "chk_stock_items_quantity_levels" CHECK ("app"."stock_items"."min_quantity" <= "app"."stock_items"."max_quantity"),
	CONSTRAINT "chk_stock_items_measure_unit_with_size" CHECK ("app"."stock_items"."size_per_unit_milli" IS NULL OR "app"."stock_items"."measure_unit" IS NOT NULL),
	CONSTRAINT "chk_stock_items_size_positive" CHECK ("app"."stock_items"."size_per_unit_milli" IS NULL OR "app"."stock_items"."size_per_unit_milli" > 0),
	CONSTRAINT "chk_stock_items_updated" CHECK ("app"."stock_items"."updated_at" >= "app"."stock_items"."created_at"),
	CONSTRAINT "chk_stock_items_delete_reason" CHECK ("app"."stock_items"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_stock_items_delete_reason_when_deleted" CHECK (("app"."stock_items"."deleted_at" IS NULL) = ("app"."stock_items"."delete_reason" IS NULL)),
	CONSTRAINT "chk_stock_items_delete_note_when_other" CHECK ("app"."stock_items"."delete_reason" IS DISTINCT FROM 'other' OR "app"."stock_items"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."stock_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.stock_purchases — A purchase of consumables from a vendor (launch ROUTE #55).
CREATE TABLE IF NOT EXISTS "app"."stock_purchases" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"stock_purchase_number" integer DEFAULT 0 NOT NULL,
	"stock_vendor_id" bigint NOT NULL,
	"bill_number" varchar(30),
	"purchase_date" date NOT NULL,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bill_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"paid_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_stock_purchases_stock_purchase_number" CHECK ("app"."stock_purchases"."stock_purchase_number" > 0),
	CONSTRAINT "chk_stock_purchases_bill_amount" CHECK ("app"."stock_purchases"."bill_amount" >= 0),
	CONSTRAINT "chk_stock_purchases_paid_amount" CHECK ("app"."stock_purchases"."paid_amount" >= 0),
	CONSTRAINT "chk_stock_purchases_paid_within_bill" CHECK ("app"."stock_purchases"."paid_amount" <= "app"."stock_purchases"."bill_amount"),
	CONSTRAINT "chk_stock_purchases_updated" CHECK ("app"."stock_purchases"."updated_at" >= "app"."stock_purchases"."created_at"),
	CONSTRAINT "chk_stock_purchases_delete_reason" CHECK ("app"."stock_purchases"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_stock_purchases_delete_reason_when_deleted" CHECK (("app"."stock_purchases"."deleted_at" IS NULL) = ("app"."stock_purchases"."delete_reason" IS NULL)),
	CONSTRAINT "chk_stock_purchases_delete_note_when_other" CHECK ("app"."stock_purchases"."delete_reason" IS DISTINCT FROM 'other' OR "app"."stock_purchases"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."stock_purchases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.stock_counts — A stock count — only the changed lines write adjust movements (launch ROUTE #57).
CREATE TABLE IF NOT EXISTS "app"."stock_counts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"counted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_stock_counts_updated" CHECK ("app"."stock_counts"."updated_at" >= "app"."stock_counts"."created_at"),
	CONSTRAINT "chk_stock_counts_delete_reason" CHECK ("app"."stock_counts"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_stock_counts_delete_reason_when_deleted" CHECK (("app"."stock_counts"."deleted_at" IS NULL) = ("app"."stock_counts"."delete_reason" IS NULL)),
	CONSTRAINT "chk_stock_counts_delete_note_when_other" CHECK ("app"."stock_counts"."delete_reason" IS DISTINCT FROM 'other' OR "app"."stock_counts"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."stock_counts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.stock_movements — One change to an item's stock — used, received, adjusted, damaged, returned or reverted (a ledger) (launch ROUTE #56).
CREATE TABLE IF NOT EXISTS "app"."stock_movements" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"stock_item_id" bigint NOT NULL,
	"type" varchar(8) DEFAULT 'used' NOT NULL,
	"delta_milli" integer NOT NULL,
	"used_for" varchar(80),
	"patient_id" bigint,
	"stock_purchase_id" bigint,
	"stock_count_id" bigint,
	"reverts_stock_movement_id" bigint,
	"reverted_by_stock_movement_id" bigint,
	"revert_reason" varchar(14),
	"note" varchar(280),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_stock_movements_type" CHECK ("app"."stock_movements"."type" IN ('used', 'received', 'adjust', 'damaged', 'returned', 'reverted')),
	CONSTRAINT "chk_stock_movements_revert_reason" CHECK ("app"."stock_movements"."revert_reason" IN ('mistake', 'wrong_item', 'wrong_quantity', 'other')),
	CONSTRAINT "chk_stock_movements_delta_nonzero" CHECK ("app"."stock_movements"."delta_milli" <> 0),
	CONSTRAINT "chk_stock_movements_updated" CHECK ("app"."stock_movements"."updated_at" >= "app"."stock_movements"."created_at"),
	CONSTRAINT "chk_stock_movements_delete_reason" CHECK ("app"."stock_movements"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_stock_movements_delete_reason_when_deleted" CHECK (("app"."stock_movements"."deleted_at" IS NULL) = ("app"."stock_movements"."delete_reason" IS NULL)),
	CONSTRAINT "chk_stock_movements_delete_note_when_other" CHECK ("app"."stock_movements"."delete_reason" IS DISTINCT FROM 'other' OR "app"."stock_movements"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."stock_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.tasks — A to-do in the work queue — by hand or from a rule (launch ROUTE #58).
CREATE TABLE IF NOT EXISTS "app"."tasks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"kind" varchar(16) DEFAULT 'manual' NOT NULL,
	"rule_key" varchar(17),
	"title" varchar(120) NOT NULL,
	"why" varchar(280),
	"owner_membership_id" bigint,
	"owner_role" varchar(10) DEFAULT 'admin' NOT NULL,
	"patient_id" bigint,
	"lead_id" bigint,
	"source_type" varchar(11),
	"source_id" varchar(28),
	"due_at" timestamp with time zone NOT NULL,
	"status" varchar(7) DEFAULT 'open' NOT NULL,
	"snoozed_until" timestamp with time zone,
	"snooze_label" varchar(40),
	"outcome" varchar(12),
	"resolved_at" timestamp with time zone,
	"is_resolved_automatically" boolean DEFAULT false NOT NULL,
	"result_text" varchar(280),
	"note" varchar(280),
	"priority" varchar(6) DEFAULT 'normal' NOT NULL,
	"should_remind_before" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_tasks_kind" CHECK ("app"."tasks"."kind" IN ('manual', 'follow_up', 'aftercare_call', 'callback', 'payment_reminder', 'confirm_visit', 'review_request')),
	CONSTRAINT "chk_tasks_rule_key" CHECK ("app"."tasks"."rule_key" IN ('reply', 'failed_message', 'follow_up', 'call_back', 'claim', 'confirm', 'arrive', 'rebook', 'feedback', 'aftercare', 'next_visit', 'gone_quiet', 'payment_due', 'onboarding', 'unhappy', 'settle_by', 'medical_rep_visit')),
	CONSTRAINT "chk_tasks_owner_role" CHECK ("app"."tasks"."owner_role" IN ('admin', 'doctor', 'therapist', 'front_desk', 'counsellor', 'pharmacist', 'accountant', 'marketing', 'owner')),
	CONSTRAINT "chk_tasks_source_type" CHECK ("app"."tasks"."source_type" IN ('lead', 'appointment', 'treatment', 'check_in', 'review', 'invoice')),
	CONSTRAINT "chk_tasks_status" CHECK ("app"."tasks"."status" IN ('open', 'snoozed', 'done')),
	CONSTRAINT "chk_tasks_outcome" CHECK ("app"."tasks"."outcome" IN ('log_check_in', 'doing_well', 'no_answer', 'happy', 'done')),
	CONSTRAINT "chk_tasks_priority" CHECK ("app"."tasks"."priority" IN ('low', 'normal', 'high')),
	CONSTRAINT "chk_tasks_updated" CHECK ("app"."tasks"."updated_at" >= "app"."tasks"."created_at"),
	CONSTRAINT "chk_tasks_delete_reason" CHECK ("app"."tasks"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_tasks_delete_reason_when_deleted" CHECK (("app"."tasks"."deleted_at" IS NULL) = ("app"."tasks"."delete_reason" IS NULL)),
	CONSTRAINT "chk_tasks_delete_note_when_other" CHECK ("app"."tasks"."delete_reason" IS DISTINCT FROM 'other' OR "app"."tasks"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.task_owner_changes — A reassignment of a task — from whom, to whom, when (launch ROUTE #59).
CREATE TABLE IF NOT EXISTS "app"."task_owner_changes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"task_id" bigint NOT NULL,
	"from_membership_id" bigint,
	"to_membership_id" bigint,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_task_owner_changes_updated" CHECK ("app"."task_owner_changes"."updated_at" >= "app"."task_owner_changes"."created_at"),
	CONSTRAINT "chk_task_owner_changes_delete_reason" CHECK ("app"."task_owner_changes"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_task_owner_changes_delete_reason_when_deleted" CHECK (("app"."task_owner_changes"."deleted_at" IS NULL) = ("app"."task_owner_changes"."delete_reason" IS NULL)),
	CONSTRAINT "chk_task_owner_changes_delete_note_when_other" CHECK ("app"."task_owner_changes"."delete_reason" IS DISTINCT FROM 'other' OR "app"."task_owner_changes"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."task_owner_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.task_rule_settings — Whether a task rule is on, and whether the organization lets it run by itself ("Clinozy handles it") (launch ROUTE #60).
CREATE TABLE IF NOT EXISTS "app"."task_rule_settings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"rule_key" varchar(17) NOT NULL,
	"is_on" boolean DEFAULT true NOT NULL,
	"is_automatic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_task_rule_settings_rule_key" CHECK ("app"."task_rule_settings"."rule_key" IN ('reply', 'failed_message', 'follow_up', 'call_back', 'claim', 'confirm', 'arrive', 'rebook', 'feedback', 'aftercare', 'next_visit', 'gone_quiet', 'payment_due', 'onboarding', 'unhappy', 'settle_by', 'medical_rep_visit')),
	CONSTRAINT "chk_task_rule_settings_updated" CHECK ("app"."task_rule_settings"."updated_at" >= "app"."task_rule_settings"."created_at"),
	CONSTRAINT "chk_task_rule_settings_delete_reason" CHECK ("app"."task_rule_settings"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_task_rule_settings_delete_reason_when_deleted" CHECK (("app"."task_rule_settings"."deleted_at" IS NULL) = ("app"."task_rule_settings"."delete_reason" IS NULL)),
	CONSTRAINT "chk_task_rule_settings_delete_note_when_other" CHECK ("app"."task_rule_settings"."delete_reason" IS DISTINCT FROM 'other' OR "app"."task_rule_settings"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."task_rule_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."offering_groups" ADD CONSTRAINT "offering_groups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."offering_groups" ADD CONSTRAINT "offering_groups_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."offering_groups" ADD CONSTRAINT "offering_groups_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."branch_rooms" ADD CONSTRAINT "branch_rooms_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."branch_rooms" ADD CONSTRAINT "branch_rooms_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."branch_rooms" ADD CONSTRAINT "branch_rooms_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."branch_rooms" ADD CONSTRAINT "branch_rooms_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "app"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."branch_machines" ADD CONSTRAINT "branch_machines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."branch_machines" ADD CONSTRAINT "branch_machines_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."branch_machines" ADD CONSTRAINT "branch_machines_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."branch_machines" ADD CONSTRAINT "branch_machines_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "app"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."branch_holidays" ADD CONSTRAINT "branch_holidays_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."branch_holidays" ADD CONSTRAINT "branch_holidays_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."branch_holidays" ADD CONSTRAINT "branch_holidays_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."branch_holidays" ADD CONSTRAINT "branch_holidays_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "app"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."offerings" ADD CONSTRAINT "offerings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."offerings" ADD CONSTRAINT "offerings_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."offerings" ADD CONSTRAINT "offerings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."offerings" ADD CONSTRAINT "offerings_offering_group_id_offering_groups_id_fk" FOREIGN KEY ("offering_group_id") REFERENCES "app"."offering_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."offering_branches" ADD CONSTRAINT "offering_branches_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "app"."offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."offering_branches" ADD CONSTRAINT "offering_branches_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "app"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."offering_branches" ADD CONSTRAINT "offering_branches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."offering_branches" ADD CONSTRAINT "offering_branches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."offers" ADD CONSTRAINT "offers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."offers" ADD CONSTRAINT "offers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."offers" ADD CONSTRAINT "offers_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."offer_offerings" ADD CONSTRAINT "offer_offerings_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "app"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."offer_offerings" ADD CONSTRAINT "offer_offerings_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "app"."offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."offer_offerings" ADD CONSTRAINT "offer_offerings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."offer_offerings" ADD CONSTRAINT "offer_offerings_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."offer_branches" ADD CONSTRAINT "offer_branches_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "app"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."offer_branches" ADD CONSTRAINT "offer_branches_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "app"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."offer_branches" ADD CONSTRAINT "offer_branches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."offer_branches" ADD CONSTRAINT "offer_branches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patients" ADD CONSTRAINT "patients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patients" ADD CONSTRAINT "patients_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patients" ADD CONSTRAINT "patients_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patients" ADD CONSTRAINT "patients_home_branch_id_branches_id_fk" FOREIGN KEY ("home_branch_id") REFERENCES "app"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patients" ADD CONSTRAINT "patients_referred_by_patient_id_patients_id_fk" FOREIGN KEY ("referred_by_patient_id") REFERENCES "app"."patients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patients" ADD CONSTRAINT "patients_doctor_membership_id_memberships_id_fk" FOREIGN KEY ("doctor_membership_id") REFERENCES "tenancy"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patients" ADD CONSTRAINT "patients_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "app"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."appointments" ADD CONSTRAINT "appointments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."appointments" ADD CONSTRAINT "appointments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."appointments" ADD CONSTRAINT "appointments_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."appointments" ADD CONSTRAINT "appointments_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "app"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."appointments" ADD CONSTRAINT "appointments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "app"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."appointments" ADD CONSTRAINT "appointments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "app"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."appointments" ADD CONSTRAINT "appointments_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "app"."offerings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."appointments" ADD CONSTRAINT "appointments_doctor_membership_id_memberships_id_fk" FOREIGN KEY ("doctor_membership_id") REFERENCES "tenancy"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."appointments" ADD CONSTRAINT "appointments_therapist_membership_id_memberships_id_fk" FOREIGN KEY ("therapist_membership_id") REFERENCES "tenancy"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."appointments" ADD CONSTRAINT "appointments_branch_room_id_branch_rooms_id_fk" FOREIGN KEY ("branch_room_id") REFERENCES "app"."branch_rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."appointments" ADD CONSTRAINT "appointments_branch_machine_id_branch_machines_id_fk" FOREIGN KEY ("branch_machine_id") REFERENCES "app"."branch_machines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."appointments" ADD CONSTRAINT "appointments_copied_from_appointment_id_appointments_id_fk" FOREIGN KEY ("copied_from_appointment_id") REFERENCES "app"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."appointments" ADD CONSTRAINT "appointments_patient_package_id_patient_packages_id_fk" FOREIGN KEY ("patient_package_id") REFERENCES "app"."patient_packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."visits" ADD CONSTRAINT "visits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."visits" ADD CONSTRAINT "visits_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."visits" ADD CONSTRAINT "visits_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."visits" ADD CONSTRAINT "visits_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "app"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."visits" ADD CONSTRAINT "visits_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "app"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."diagnoses" ADD CONSTRAINT "diagnoses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."diagnoses" ADD CONSTRAINT "diagnoses_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."diagnoses" ADD CONSTRAINT "diagnoses_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_clinical_notes" ADD CONSTRAINT "patient_clinical_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_clinical_notes" ADD CONSTRAINT "patient_clinical_notes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_clinical_notes" ADD CONSTRAINT "patient_clinical_notes_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_clinical_notes" ADD CONSTRAINT "patient_clinical_notes_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "app"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."prescriptions" ADD CONSTRAINT "prescriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."prescriptions" ADD CONSTRAINT "prescriptions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."prescriptions" ADD CONSTRAINT "prescriptions_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."prescriptions" ADD CONSTRAINT "prescriptions_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "app"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."prescriptions" ADD CONSTRAINT "prescriptions_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "app"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."prescriptions" ADD CONSTRAINT "prescriptions_doctor_membership_id_memberships_id_fk" FOREIGN KEY ("doctor_membership_id") REFERENCES "tenancy"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."prescription_kits" ADD CONSTRAINT "prescription_kits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."prescription_kits" ADD CONSTRAINT "prescription_kits_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."prescription_kits" ADD CONSTRAINT "prescription_kits_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_images" ADD CONSTRAINT "patient_images_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_images" ADD CONSTRAINT "patient_images_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_images" ADD CONSTRAINT "patient_images_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_images" ADD CONSTRAINT "patient_images_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "app"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_images" ADD CONSTRAINT "patient_images_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "app"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_reports" ADD CONSTRAINT "patient_reports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_reports" ADD CONSTRAINT "patient_reports_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_reports" ADD CONSTRAINT "patient_reports_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_reports" ADD CONSTRAINT "patient_reports_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "app"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_notes" ADD CONSTRAINT "patient_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_notes" ADD CONSTRAINT "patient_notes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_notes" ADD CONSTRAINT "patient_notes_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_notes" ADD CONSTRAINT "patient_notes_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "app"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invoices" ADD CONSTRAINT "invoices_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invoices" ADD CONSTRAINT "invoices_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invoices" ADD CONSTRAINT "invoices_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "app"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invoices" ADD CONSTRAINT "invoices_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "app"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invoice_team_memberships" ADD CONSTRAINT "invoice_team_memberships_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "app"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invoice_team_memberships" ADD CONSTRAINT "invoice_team_memberships_team_membership_id_memberships_id_fk" FOREIGN KEY ("team_membership_id") REFERENCES "tenancy"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invoice_team_memberships" ADD CONSTRAINT "invoice_team_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invoice_team_memberships" ADD CONSTRAINT "invoice_team_memberships_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invoices" ADD CONSTRAINT "invoices_prescription_id_prescriptions_id_fk" FOREIGN KEY ("prescription_id") REFERENCES "app"."prescriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invoices" ADD CONSTRAINT "invoices_medical_contact_id_medical_contacts_id_fk" FOREIGN KEY ("medical_contact_id") REFERENCES "app"."medical_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invoices" ADD CONSTRAINT "invoices_medical_sale_id_medical_sales_id_fk" FOREIGN KEY ("medical_sale_id") REFERENCES "app"."medical_sales"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_packages" ADD CONSTRAINT "patient_packages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_packages" ADD CONSTRAINT "patient_packages_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_packages" ADD CONSTRAINT "patient_packages_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_packages" ADD CONSTRAINT "patient_packages_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "app"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_packages" ADD CONSTRAINT "patient_packages_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "app"."offerings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_packages" ADD CONSTRAINT "patient_packages_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "app"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."offering_suggestions" ADD CONSTRAINT "offering_suggestions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."offering_suggestions" ADD CONSTRAINT "offering_suggestions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."offering_suggestions" ADD CONSTRAINT "offering_suggestions_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."offering_suggestions" ADD CONSTRAINT "offering_suggestions_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "app"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."offering_suggestions" ADD CONSTRAINT "offering_suggestions_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "app"."offerings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."offering_suggestions" ADD CONSTRAINT "offering_suggestions_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "app"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_ideas" ADD CONSTRAINT "patient_ideas_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_ideas" ADD CONSTRAINT "patient_ideas_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_ideas" ADD CONSTRAINT "patient_ideas_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_ideas" ADD CONSTRAINT "patient_ideas_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "app"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "app"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "app"."patients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "app"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_credit_note_id_credit_notes_id_fk" FOREIGN KEY ("credit_note_id") REFERENCES "app"."credit_notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_pending_credit_id_pending_credits_id_fk" FOREIGN KEY ("pending_credit_id") REFERENCES "app"."pending_credits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_day_close_id_day_closes_id_fk" FOREIGN KEY ("day_close_id") REFERENCES "app"."day_closes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payment_edits" ADD CONSTRAINT "payment_edits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payment_edits" ADD CONSTRAINT "payment_edits_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payment_edits" ADD CONSTRAINT "payment_edits_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payment_edits" ADD CONSTRAINT "payment_edits_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "app"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."credit_notes" ADD CONSTRAINT "credit_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."credit_notes" ADD CONSTRAINT "credit_notes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."credit_notes" ADD CONSTRAINT "credit_notes_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "app"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."pending_credits" ADD CONSTRAINT "pending_credits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."pending_credits" ADD CONSTRAINT "pending_credits_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."pending_credits" ADD CONSTRAINT "pending_credits_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."pending_credits" ADD CONSTRAINT "pending_credits_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "app"."patients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."pending_credits" ADD CONSTRAINT "pending_credits_source_payment_id_payments_id_fk" FOREIGN KEY ("source_payment_id") REFERENCES "app"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."pending_credits" ADD CONSTRAINT "pending_credits_settled_payment_id_payments_id_fk" FOREIGN KEY ("settled_payment_id") REFERENCES "app"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."pending_credits" ADD CONSTRAINT "pending_credits_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "app"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."day_closes" ADD CONSTRAINT "day_closes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."day_closes" ADD CONSTRAINT "day_closes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."day_closes" ADD CONSTRAINT "day_closes_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."day_closes" ADD CONSTRAINT "day_closes_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "app"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."day_close_events" ADD CONSTRAINT "day_close_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."day_close_events" ADD CONSTRAINT "day_close_events_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."day_close_events" ADD CONSTRAINT "day_close_events_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."day_close_events" ADD CONSTRAINT "day_close_events_day_close_id_day_closes_id_fk" FOREIGN KEY ("day_close_id") REFERENCES "app"."day_closes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."treatments" ADD CONSTRAINT "treatments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."treatments" ADD CONSTRAINT "treatments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."treatments" ADD CONSTRAINT "treatments_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."treatments" ADD CONSTRAINT "treatments_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "app"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."treatments" ADD CONSTRAINT "treatments_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "app"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."treatments" ADD CONSTRAINT "treatments_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "app"."offerings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."treatments" ADD CONSTRAINT "treatments_doctor_membership_id_memberships_id_fk" FOREIGN KEY ("doctor_membership_id") REFERENCES "tenancy"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."treatments" ADD CONSTRAINT "treatments_therapist_membership_id_memberships_id_fk" FOREIGN KEY ("therapist_membership_id") REFERENCES "tenancy"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."treatments" ADD CONSTRAINT "treatments_patient_package_id_patient_packages_id_fk" FOREIGN KEY ("patient_package_id") REFERENCES "app"."patient_packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."check_ins" ADD CONSTRAINT "check_ins_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."check_ins" ADD CONSTRAINT "check_ins_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."check_ins" ADD CONSTRAINT "check_ins_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."check_ins" ADD CONSTRAINT "check_ins_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "app"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."check_ins" ADD CONSTRAINT "check_ins_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "app"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."check_ins" ADD CONSTRAINT "check_ins_treatment_id_treatments_id_fk" FOREIGN KEY ("treatment_id") REFERENCES "app"."treatments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."check_in_next_offerings" ADD CONSTRAINT "check_in_next_offerings_check_in_id_check_ins_id_fk" FOREIGN KEY ("check_in_id") REFERENCES "app"."check_ins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."check_in_next_offerings" ADD CONSTRAINT "check_in_next_offerings_next_offering_id_offerings_id_fk" FOREIGN KEY ("next_offering_id") REFERENCES "app"."offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."check_in_next_offerings" ADD CONSTRAINT "check_in_next_offerings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."check_in_next_offerings" ADD CONSTRAINT "check_in_next_offerings_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."reviews" ADD CONSTRAINT "reviews_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."reviews" ADD CONSTRAINT "reviews_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."reviews" ADD CONSTRAINT "reviews_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."reviews" ADD CONSTRAINT "reviews_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "app"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."reviews" ADD CONSTRAINT "reviews_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "app"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."feedback_actions" ADD CONSTRAINT "feedback_actions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."feedback_actions" ADD CONSTRAINT "feedback_actions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."feedback_actions" ADD CONSTRAINT "feedback_actions_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."feedback_actions" ADD CONSTRAINT "feedback_actions_check_in_id_check_ins_id_fk" FOREIGN KEY ("check_in_id") REFERENCES "app"."check_ins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."feedback_actions" ADD CONSTRAINT "feedback_actions_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "app"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."manufacturers" ADD CONSTRAINT "manufacturers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."manufacturers" ADD CONSTRAINT "manufacturers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."manufacturers" ADD CONSTRAINT "manufacturers_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."suppliers" ADD CONSTRAINT "suppliers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."suppliers" ADD CONSTRAINT "suppliers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."suppliers" ADD CONSTRAINT "suppliers_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."supplier_manufacturers" ADD CONSTRAINT "supplier_manufacturers_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "app"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."supplier_manufacturers" ADD CONSTRAINT "supplier_manufacturers_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "app"."manufacturers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."supplier_manufacturers" ADD CONSTRAINT "supplier_manufacturers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."supplier_manufacturers" ADD CONSTRAINT "supplier_manufacturers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."medical_reps" ADD CONSTRAINT "medical_reps_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."medical_reps" ADD CONSTRAINT "medical_reps_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."medical_reps" ADD CONSTRAINT "medical_reps_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."medical_rep_manufacturers" ADD CONSTRAINT "medical_rep_manufacturers_medical_rep_id_medical_reps_id_fk" FOREIGN KEY ("medical_rep_id") REFERENCES "app"."medical_reps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."medical_rep_manufacturers" ADD CONSTRAINT "medical_rep_manufacturers_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "app"."manufacturers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."medical_rep_manufacturers" ADD CONSTRAINT "medical_rep_manufacturers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."medical_rep_manufacturers" ADD CONSTRAINT "medical_rep_manufacturers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."medical_rep_visits" ADD CONSTRAINT "medical_rep_visits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."medical_rep_visits" ADD CONSTRAINT "medical_rep_visits_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."medical_rep_visits" ADD CONSTRAINT "medical_rep_visits_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."medical_rep_visits" ADD CONSTRAINT "medical_rep_visits_medical_rep_id_medical_reps_id_fk" FOREIGN KEY ("medical_rep_id") REFERENCES "app"."medical_reps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."medicines" ADD CONSTRAINT "medicines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."medicines" ADD CONSTRAINT "medicines_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."medicines" ADD CONSTRAINT "medicines_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."medicines" ADD CONSTRAINT "medicines_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "app"."manufacturers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."medical_purchase_orders" ADD CONSTRAINT "medical_purchase_orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."medical_purchase_orders" ADD CONSTRAINT "medical_purchase_orders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."medical_purchase_orders" ADD CONSTRAINT "medical_purchase_orders_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."medical_purchase_orders" ADD CONSTRAINT "medical_purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "app"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."medical_contacts" ADD CONSTRAINT "medical_contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."medical_contacts" ADD CONSTRAINT "medical_contacts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."medical_contacts" ADD CONSTRAINT "medical_contacts_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."medical_sales" ADD CONSTRAINT "medical_sales_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."medical_sales" ADD CONSTRAINT "medical_sales_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."medical_sales" ADD CONSTRAINT "medical_sales_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."medical_sales" ADD CONSTRAINT "medical_sales_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "app"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."medical_sales" ADD CONSTRAINT "medical_sales_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "app"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."medical_sales" ADD CONSTRAINT "medical_sales_medical_contact_id_medical_contacts_id_fk" FOREIGN KEY ("medical_contact_id") REFERENCES "app"."medical_contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."medical_sales" ADD CONSTRAINT "medical_sales_prescription_id_prescriptions_id_fk" FOREIGN KEY ("prescription_id") REFERENCES "app"."prescriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."medical_sales" ADD CONSTRAINT "medical_sales_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "app"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."supplier_credits" ADD CONSTRAINT "supplier_credits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."supplier_credits" ADD CONSTRAINT "supplier_credits_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."supplier_credits" ADD CONSTRAINT "supplier_credits_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."supplier_credits" ADD CONSTRAINT "supplier_credits_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "app"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."supplier_credits" ADD CONSTRAINT "supplier_credits_medicine_id_medicines_id_fk" FOREIGN KEY ("medicine_id") REFERENCES "app"."medicines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_vendors" ADD CONSTRAINT "stock_vendors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_vendors" ADD CONSTRAINT "stock_vendors_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_vendors" ADD CONSTRAINT "stock_vendors_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_items" ADD CONSTRAINT "stock_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_items" ADD CONSTRAINT "stock_items_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_items" ADD CONSTRAINT "stock_items_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_items" ADD CONSTRAINT "stock_items_stock_vendor_id_stock_vendors_id_fk" FOREIGN KEY ("stock_vendor_id") REFERENCES "app"."stock_vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_purchases" ADD CONSTRAINT "stock_purchases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_purchases" ADD CONSTRAINT "stock_purchases_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_purchases" ADD CONSTRAINT "stock_purchases_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_purchases" ADD CONSTRAINT "stock_purchases_stock_vendor_id_stock_vendors_id_fk" FOREIGN KEY ("stock_vendor_id") REFERENCES "app"."stock_vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_counts" ADD CONSTRAINT "stock_counts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_counts" ADD CONSTRAINT "stock_counts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_counts" ADD CONSTRAINT "stock_counts_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_movements" ADD CONSTRAINT "stock_movements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_movements" ADD CONSTRAINT "stock_movements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_movements" ADD CONSTRAINT "stock_movements_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_movements" ADD CONSTRAINT "stock_movements_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "app"."stock_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_movements" ADD CONSTRAINT "stock_movements_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "app"."patients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_movements" ADD CONSTRAINT "stock_movements_stock_purchase_id_stock_purchases_id_fk" FOREIGN KEY ("stock_purchase_id") REFERENCES "app"."stock_purchases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_movements" ADD CONSTRAINT "stock_movements_stock_count_id_stock_counts_id_fk" FOREIGN KEY ("stock_count_id") REFERENCES "app"."stock_counts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_movements" ADD CONSTRAINT "stock_movements_reverts_stock_movement_id_stock_movements_id_fk" FOREIGN KEY ("reverts_stock_movement_id") REFERENCES "app"."stock_movements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stock_movements" ADD CONSTRAINT "stock_movements_reverted_by_stock_movement_id_stock_movements_id_fk" FOREIGN KEY ("reverted_by_stock_movement_id") REFERENCES "app"."stock_movements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tasks" ADD CONSTRAINT "tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tasks" ADD CONSTRAINT "tasks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tasks" ADD CONSTRAINT "tasks_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tasks" ADD CONSTRAINT "tasks_owner_membership_id_memberships_id_fk" FOREIGN KEY ("owner_membership_id") REFERENCES "tenancy"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tasks" ADD CONSTRAINT "tasks_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "app"."patients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tasks" ADD CONSTRAINT "tasks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "app"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_owner_changes" ADD CONSTRAINT "task_owner_changes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_owner_changes" ADD CONSTRAINT "task_owner_changes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_owner_changes" ADD CONSTRAINT "task_owner_changes_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_owner_changes" ADD CONSTRAINT "task_owner_changes_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "app"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_owner_changes" ADD CONSTRAINT "task_owner_changes_from_membership_id_memberships_id_fk" FOREIGN KEY ("from_membership_id") REFERENCES "tenancy"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_owner_changes" ADD CONSTRAINT "task_owner_changes_to_membership_id_memberships_id_fk" FOREIGN KEY ("to_membership_id") REFERENCES "tenancy"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_rule_settings" ADD CONSTRAINT "task_rule_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_rule_settings" ADD CONSTRAINT "task_rule_settings_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_rule_settings" ADD CONSTRAINT "task_rule_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_offering_groups_public_id" ON "app"."offering_groups" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offering_groups_organization_created" ON "app"."offering_groups" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offering_groups_deleted_at" ON "app"."offering_groups" USING btree ("deleted_at") WHERE "app"."offering_groups"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offering_groups_created_by_user_id" ON "app"."offering_groups" USING btree ("created_by_user_id") WHERE "app"."offering_groups"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offering_groups_updated_by_user_id" ON "app"."offering_groups" USING btree ("updated_by_user_id") WHERE "app"."offering_groups"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offering_groups_organization_name" ON "app"."offering_groups" USING btree ("organization_id","name","id") WHERE "app"."offering_groups"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offering_groups_organization_sort_order_name" ON "app"."offering_groups" USING btree ("organization_id","sort_order","name","id") WHERE "app"."offering_groups"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_offering_groups_organization_name_unique" ON "app"."offering_groups" USING btree ("organization_id",lower("name")) WHERE "app"."offering_groups"."deleted_at" IS NULL;--> statement-breakpoint
CREATE POLICY "offering_groups_tenant_isolation" ON "app"."offering_groups" AS PERMISSIVE FOR ALL TO public USING ("app"."offering_groups"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."offering_groups"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."offering_groups" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_branch_rooms_public_id" ON "app"."branch_rooms" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_branch_rooms_organization_created" ON "app"."branch_rooms" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_branch_rooms_deleted_at" ON "app"."branch_rooms" USING btree ("deleted_at") WHERE "app"."branch_rooms"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_branch_rooms_created_by_user_id" ON "app"."branch_rooms" USING btree ("created_by_user_id") WHERE "app"."branch_rooms"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_branch_rooms_updated_by_user_id" ON "app"."branch_rooms" USING btree ("updated_by_user_id") WHERE "app"."branch_rooms"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_branch_rooms_branch_created" ON "app"."branch_rooms" USING btree ("branch_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_branch_rooms_organization_name" ON "app"."branch_rooms" USING btree ("organization_id","name","id") WHERE "app"."branch_rooms"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_branch_rooms_branch_name_unique" ON "app"."branch_rooms" USING btree ("organization_id","branch_id",lower("name")) WHERE "app"."branch_rooms"."deleted_at" IS NULL;--> statement-breakpoint
CREATE POLICY "branch_rooms_tenant_isolation" ON "app"."branch_rooms" AS PERMISSIVE FOR ALL TO public USING ("app"."branch_rooms"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."branch_rooms"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."branch_rooms" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_branch_machines_public_id" ON "app"."branch_machines" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_branch_machines_organization_created" ON "app"."branch_machines" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_branch_machines_deleted_at" ON "app"."branch_machines" USING btree ("deleted_at") WHERE "app"."branch_machines"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_branch_machines_created_by_user_id" ON "app"."branch_machines" USING btree ("created_by_user_id") WHERE "app"."branch_machines"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_branch_machines_updated_by_user_id" ON "app"."branch_machines" USING btree ("updated_by_user_id") WHERE "app"."branch_machines"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_branch_machines_branch_created" ON "app"."branch_machines" USING btree ("branch_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_branch_machines_organization_name" ON "app"."branch_machines" USING btree ("organization_id","name","id") WHERE "app"."branch_machines"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_branch_machines_branch_name_unique" ON "app"."branch_machines" USING btree ("organization_id","branch_id",lower("name")) WHERE "app"."branch_machines"."deleted_at" IS NULL;--> statement-breakpoint
CREATE POLICY "branch_machines_tenant_isolation" ON "app"."branch_machines" AS PERMISSIVE FOR ALL TO public USING ("app"."branch_machines"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."branch_machines"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."branch_machines" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_branch_holidays_public_id" ON "app"."branch_holidays" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_branch_holidays_organization_created" ON "app"."branch_holidays" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_branch_holidays_deleted_at" ON "app"."branch_holidays" USING btree ("deleted_at") WHERE "app"."branch_holidays"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_branch_holidays_created_by_user_id" ON "app"."branch_holidays" USING btree ("created_by_user_id") WHERE "app"."branch_holidays"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_branch_holidays_updated_by_user_id" ON "app"."branch_holidays" USING btree ("updated_by_user_id") WHERE "app"."branch_holidays"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_branch_holidays_branch_created" ON "app"."branch_holidays" USING btree ("branch_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_branch_holidays_organization_holiday_date" ON "app"."branch_holidays" USING btree ("organization_id","holiday_date","id") WHERE "app"."branch_holidays"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_branch_holidays_branch_date_unique" ON "app"."branch_holidays" USING btree ("organization_id","branch_id","holiday_date") WHERE "app"."branch_holidays"."deleted_at" IS NULL;--> statement-breakpoint
CREATE POLICY "branch_holidays_tenant_isolation" ON "app"."branch_holidays" AS PERMISSIVE FOR ALL TO public USING ("app"."branch_holidays"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."branch_holidays"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."branch_holidays" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_offerings_public_id" ON "app"."offerings" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offerings_organization_created" ON "app"."offerings" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offerings_deleted_at" ON "app"."offerings" USING btree ("deleted_at") WHERE "app"."offerings"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offerings_created_by_user_id" ON "app"."offerings" USING btree ("created_by_user_id") WHERE "app"."offerings"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offerings_updated_by_user_id" ON "app"."offerings" USING btree ("updated_by_user_id") WHERE "app"."offerings"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offerings_organization_name" ON "app"."offerings" USING btree ("organization_id","name","id") WHERE "app"."offerings"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offerings_offering_group_id" ON "app"."offerings" USING btree ("offering_group_id") WHERE "app"."offerings"."offering_group_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_offerings_organization_offering_number" ON "app"."offerings" USING btree ("organization_id","offering_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offering_branches_branch_id" ON "app"."offering_branches" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offering_branches_organization_id" ON "app"."offering_branches" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offering_branches_created_by_user_id" ON "app"."offering_branches" USING btree ("created_by_user_id") WHERE "app"."offering_branches"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_offerings_organization_name_unique" ON "app"."offerings" USING btree ("organization_id",lower("name")) WHERE "app"."offerings"."deleted_at" IS NULL;--> statement-breakpoint
CREATE POLICY "offerings_tenant_isolation" ON "app"."offerings" AS PERMISSIVE FOR ALL TO public USING ("app"."offerings"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."offerings"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."offerings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TRIGGER trg_offerings_offering_number BEFORE INSERT ON "app"."offerings" FOR EACH ROW EXECUTE FUNCTION app.fn_assign_record_number('offering_number');--> statement-breakpoint
CREATE POLICY "offering_branches_tenant_isolation" ON "app"."offering_branches" AS PERMISSIVE FOR ALL TO public USING ("app"."offering_branches"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )) WITH CHECK ("app"."offering_branches"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."offering_branches" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_offers_public_id" ON "app"."offers" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offers_organization_created" ON "app"."offers" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offers_deleted_at" ON "app"."offers" USING btree ("deleted_at") WHERE "app"."offers"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offers_created_by_user_id" ON "app"."offers" USING btree ("created_by_user_id") WHERE "app"."offers"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offers_updated_by_user_id" ON "app"."offers" USING btree ("updated_by_user_id") WHERE "app"."offers"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offers_organization_name" ON "app"."offers" USING btree ("organization_id","name","id") WHERE "app"."offers"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offers_organization_starts_on" ON "app"."offers" USING btree ("organization_id",coalesce("starts_on", '-infinity'::date),"id") WHERE "app"."offers"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_offers_organization_code_unique" ON "app"."offers" USING btree ("organization_id","code") WHERE "app"."offers"."deleted_at" IS NULL AND "app"."offers"."code" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offer_offerings_offering_id" ON "app"."offer_offerings" USING btree ("offering_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offer_offerings_organization_id" ON "app"."offer_offerings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offer_offerings_created_by_user_id" ON "app"."offer_offerings" USING btree ("created_by_user_id") WHERE "app"."offer_offerings"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offer_branches_branch_id" ON "app"."offer_branches" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offer_branches_organization_id" ON "app"."offer_branches" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offer_branches_created_by_user_id" ON "app"."offer_branches" USING btree ("created_by_user_id") WHERE "app"."offer_branches"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE POLICY "offers_tenant_isolation" ON "app"."offers" AS PERMISSIVE FOR ALL TO public USING ("app"."offers"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."offers"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."offers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "offer_offerings_tenant_isolation" ON "app"."offer_offerings" AS PERMISSIVE FOR ALL TO public USING ("app"."offer_offerings"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )) WITH CHECK ("app"."offer_offerings"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."offer_offerings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "offer_branches_tenant_isolation" ON "app"."offer_branches" AS PERMISSIVE FOR ALL TO public USING ("app"."offer_branches"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )) WITH CHECK ("app"."offer_branches"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."offer_branches" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_patients_public_id" ON "app"."patients" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patients_organization_created" ON "app"."patients" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patients_deleted_at" ON "app"."patients" USING btree ("deleted_at") WHERE "app"."patients"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patients_created_by_user_id" ON "app"."patients" USING btree ("created_by_user_id") WHERE "app"."patients"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patients_updated_by_user_id" ON "app"."patients" USING btree ("updated_by_user_id") WHERE "app"."patients"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patients_organization_first_name" ON "app"."patients" USING btree ("organization_id","first_name","id") WHERE "app"."patients"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patients_home_branch_id" ON "app"."patients" USING btree ("home_branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patients_referred_by_patient_id" ON "app"."patients" USING btree ("referred_by_patient_id") WHERE "app"."patients"."referred_by_patient_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patients_doctor_membership_id" ON "app"."patients" USING btree ("doctor_membership_id") WHERE "app"."patients"."doctor_membership_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patients_organization_follow_up_at" ON "app"."patients" USING btree ("organization_id","follow_up_at","id") WHERE "app"."patients"."deleted_at" IS NULL AND "app"."patients"."follow_up_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patients_lead_id" ON "app"."patients" USING btree ("lead_id") WHERE "app"."patients"."lead_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patients_search_text_trgm" ON "app"."patients" USING gin ("search_text" gin_trgm_ops) WHERE "app"."patients"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_patients_organization_patient_number" ON "app"."patients" USING btree ("organization_id","patient_number");--> statement-breakpoint
CREATE POLICY "patients_tenant_isolation" ON "app"."patients" AS PERMISSIVE FOR ALL TO public USING ("app"."patients"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."patients"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."patients" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TRIGGER trg_patients_patient_number BEFORE INSERT ON "app"."patients" FOR EACH ROW EXECUTE FUNCTION app.fn_assign_record_number('patient_number');--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_appointments_public_id" ON "app"."appointments" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_appointments_organization_created" ON "app"."appointments" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_appointments_deleted_at" ON "app"."appointments" USING btree ("deleted_at") WHERE "app"."appointments"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_appointments_created_by_user_id" ON "app"."appointments" USING btree ("created_by_user_id") WHERE "app"."appointments"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_appointments_updated_by_user_id" ON "app"."appointments" USING btree ("updated_by_user_id") WHERE "app"."appointments"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_appointments_branch_date" ON "app"."appointments" USING btree ("branch_id","appointment_date","start_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_appointments_doctor_date" ON "app"."appointments" USING btree ("doctor_membership_id","appointment_date","start_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_appointments_branch_room_date" ON "app"."appointments" USING btree ("branch_room_id","appointment_date") WHERE "app"."appointments"."branch_room_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_appointments_branch_machine_date" ON "app"."appointments" USING btree ("branch_machine_id","appointment_date") WHERE "app"."appointments"."branch_machine_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_appointments_patient_date" ON "app"."appointments" USING btree ("patient_id","appointment_date") WHERE "app"."appointments"."patient_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_appointments_lead_id" ON "app"."appointments" USING btree ("lead_id") WHERE "app"."appointments"."lead_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_appointments_offering_id" ON "app"."appointments" USING btree ("offering_id") WHERE "app"."appointments"."offering_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_appointments_therapist_membership_id" ON "app"."appointments" USING btree ("therapist_membership_id") WHERE "app"."appointments"."therapist_membership_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_appointments_organization_appointment_date" ON "app"."appointments" USING btree ("organization_id","appointment_date","id") WHERE "app"."appointments"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_appointments_copied_from_appointment_id" ON "app"."appointments" USING btree ("copied_from_appointment_id") WHERE "app"."appointments"."copied_from_appointment_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_appointments_patient_package_id" ON "app"."appointments" USING btree ("patient_package_id") WHERE "app"."appointments"."patient_package_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_appointments_organization_appointment_number" ON "app"."appointments" USING btree ("organization_id","appointment_number");--> statement-breakpoint
CREATE POLICY "appointments_tenant_isolation" ON "app"."appointments" AS PERMISSIVE FOR ALL TO public USING ("app"."appointments"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."appointments"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."appointments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TRIGGER trg_appointments_appointment_number BEFORE INSERT ON "app"."appointments" FOR EACH ROW EXECUTE FUNCTION app.fn_assign_record_number('appointment_number');--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_visits_public_id" ON "app"."visits" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_visits_organization_created" ON "app"."visits" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_visits_deleted_at" ON "app"."visits" USING btree ("deleted_at") WHERE "app"."visits"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_visits_created_by_user_id" ON "app"."visits" USING btree ("created_by_user_id") WHERE "app"."visits"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_visits_updated_by_user_id" ON "app"."visits" USING btree ("updated_by_user_id") WHERE "app"."visits"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_visits_appointment_id" ON "app"."visits" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_visits_patient_id" ON "app"."visits" USING btree ("patient_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_visits_appointment_unique" ON "app"."visits" USING btree ("organization_id","appointment_id") WHERE "app"."visits"."deleted_at" IS NULL;--> statement-breakpoint
CREATE POLICY "visits_tenant_isolation" ON "app"."visits" AS PERMISSIVE FOR ALL TO public USING ("app"."visits"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."visits"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."visits" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_diagnoses_public_id" ON "app"."diagnoses" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_diagnoses_organization_created" ON "app"."diagnoses" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_diagnoses_deleted_at" ON "app"."diagnoses" USING btree ("deleted_at") WHERE "app"."diagnoses"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_diagnoses_created_by_user_id" ON "app"."diagnoses" USING btree ("created_by_user_id") WHERE "app"."diagnoses"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_diagnoses_updated_by_user_id" ON "app"."diagnoses" USING btree ("updated_by_user_id") WHERE "app"."diagnoses"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_diagnoses_organization_name" ON "app"."diagnoses" USING btree ("organization_id","name","id") WHERE "app"."diagnoses"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_diagnoses_organization_name_unique" ON "app"."diagnoses" USING btree ("organization_id",lower("name")) WHERE "app"."diagnoses"."deleted_at" IS NULL;--> statement-breakpoint
CREATE POLICY "diagnoses_tenant_isolation" ON "app"."diagnoses" AS PERMISSIVE FOR ALL TO public USING ("app"."diagnoses"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."diagnoses"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."diagnoses" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_patient_clinical_notes_public_id" ON "app"."patient_clinical_notes" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_clinical_notes_organization_created" ON "app"."patient_clinical_notes" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_clinical_notes_deleted_at" ON "app"."patient_clinical_notes" USING btree ("deleted_at") WHERE "app"."patient_clinical_notes"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_clinical_notes_created_by_user_id" ON "app"."patient_clinical_notes" USING btree ("created_by_user_id") WHERE "app"."patient_clinical_notes"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_clinical_notes_updated_by_user_id" ON "app"."patient_clinical_notes" USING btree ("updated_by_user_id") WHERE "app"."patient_clinical_notes"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_clinical_notes_patient_created" ON "app"."patient_clinical_notes" USING btree ("patient_id","created_at","id");--> statement-breakpoint
CREATE POLICY "patient_clinical_notes_tenant_isolation" ON "app"."patient_clinical_notes" AS PERMISSIVE FOR ALL TO public USING ("app"."patient_clinical_notes"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."patient_clinical_notes"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."patient_clinical_notes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_prescriptions_public_id" ON "app"."prescriptions" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_prescriptions_organization_created" ON "app"."prescriptions" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_prescriptions_deleted_at" ON "app"."prescriptions" USING btree ("deleted_at") WHERE "app"."prescriptions"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_prescriptions_created_by_user_id" ON "app"."prescriptions" USING btree ("created_by_user_id") WHERE "app"."prescriptions"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_prescriptions_updated_by_user_id" ON "app"."prescriptions" USING btree ("updated_by_user_id") WHERE "app"."prescriptions"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_prescriptions_patient_created" ON "app"."prescriptions" USING btree ("patient_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_prescriptions_appointment_id" ON "app"."prescriptions" USING btree ("appointment_id") WHERE "app"."prescriptions"."appointment_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_prescriptions_doctor_membership_id" ON "app"."prescriptions" USING btree ("doctor_membership_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_prescriptions_organization_prescription_date" ON "app"."prescriptions" USING btree ("organization_id","prescription_date","id") WHERE "app"."prescriptions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_prescriptions_organization_prescription_number" ON "app"."prescriptions" USING btree ("organization_id","prescription_number");--> statement-breakpoint
CREATE POLICY "prescriptions_tenant_isolation" ON "app"."prescriptions" AS PERMISSIVE FOR ALL TO public USING ("app"."prescriptions"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."prescriptions"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."prescriptions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TRIGGER trg_prescriptions_prescription_number BEFORE INSERT ON "app"."prescriptions" FOR EACH ROW EXECUTE FUNCTION app.fn_assign_record_number('prescription_number');--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_prescription_kits_public_id" ON "app"."prescription_kits" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_prescription_kits_organization_created" ON "app"."prescription_kits" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_prescription_kits_deleted_at" ON "app"."prescription_kits" USING btree ("deleted_at") WHERE "app"."prescription_kits"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_prescription_kits_created_by_user_id" ON "app"."prescription_kits" USING btree ("created_by_user_id") WHERE "app"."prescription_kits"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_prescription_kits_updated_by_user_id" ON "app"."prescription_kits" USING btree ("updated_by_user_id") WHERE "app"."prescription_kits"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_prescription_kits_organization_name" ON "app"."prescription_kits" USING btree ("organization_id","name","id") WHERE "app"."prescription_kits"."deleted_at" IS NULL;--> statement-breakpoint
CREATE POLICY "prescription_kits_tenant_isolation" ON "app"."prescription_kits" AS PERMISSIVE FOR ALL TO public USING ("app"."prescription_kits"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."prescription_kits"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."prescription_kits" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_patient_images_public_id" ON "app"."patient_images" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_images_organization_created" ON "app"."patient_images" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_images_deleted_at" ON "app"."patient_images" USING btree ("deleted_at") WHERE "app"."patient_images"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_images_created_by_user_id" ON "app"."patient_images" USING btree ("created_by_user_id") WHERE "app"."patient_images"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_images_updated_by_user_id" ON "app"."patient_images" USING btree ("updated_by_user_id") WHERE "app"."patient_images"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_images_patient_created" ON "app"."patient_images" USING btree ("patient_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_images_appointment_id" ON "app"."patient_images" USING btree ("appointment_id") WHERE "app"."patient_images"."appointment_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_images_organization_taken_on" ON "app"."patient_images" USING btree ("organization_id","taken_on","id") WHERE "app"."patient_images"."deleted_at" IS NULL;--> statement-breakpoint
CREATE POLICY "patient_images_tenant_isolation" ON "app"."patient_images" AS PERMISSIVE FOR ALL TO public USING ("app"."patient_images"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."patient_images"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."patient_images" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_patient_reports_public_id" ON "app"."patient_reports" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_reports_organization_created" ON "app"."patient_reports" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_reports_deleted_at" ON "app"."patient_reports" USING btree ("deleted_at") WHERE "app"."patient_reports"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_reports_created_by_user_id" ON "app"."patient_reports" USING btree ("created_by_user_id") WHERE "app"."patient_reports"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_reports_updated_by_user_id" ON "app"."patient_reports" USING btree ("updated_by_user_id") WHERE "app"."patient_reports"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_reports_patient_created" ON "app"."patient_reports" USING btree ("patient_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_reports_organization_report_date" ON "app"."patient_reports" USING btree ("organization_id","report_date","id") WHERE "app"."patient_reports"."deleted_at" IS NULL;--> statement-breakpoint
CREATE POLICY "patient_reports_tenant_isolation" ON "app"."patient_reports" AS PERMISSIVE FOR ALL TO public USING ("app"."patient_reports"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."patient_reports"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."patient_reports" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_patient_notes_public_id" ON "app"."patient_notes" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_notes_organization_created" ON "app"."patient_notes" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_notes_deleted_at" ON "app"."patient_notes" USING btree ("deleted_at") WHERE "app"."patient_notes"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_notes_created_by_user_id" ON "app"."patient_notes" USING btree ("created_by_user_id") WHERE "app"."patient_notes"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_notes_updated_by_user_id" ON "app"."patient_notes" USING btree ("updated_by_user_id") WHERE "app"."patient_notes"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_notes_patient_created" ON "app"."patient_notes" USING btree ("patient_id","created_at","id");--> statement-breakpoint
CREATE POLICY "patient_notes_tenant_isolation" ON "app"."patient_notes" AS PERMISSIVE FOR ALL TO public USING ("app"."patient_notes"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."patient_notes"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."patient_notes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_invoices_public_id" ON "app"."invoices" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_invoices_organization_created" ON "app"."invoices" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_invoices_deleted_at" ON "app"."invoices" USING btree ("deleted_at") WHERE "app"."invoices"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_invoices_created_by_user_id" ON "app"."invoices" USING btree ("created_by_user_id") WHERE "app"."invoices"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_invoices_updated_by_user_id" ON "app"."invoices" USING btree ("updated_by_user_id") WHERE "app"."invoices"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_invoices_branch_date" ON "app"."invoices" USING btree ("branch_id","invoice_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_invoices_patient_id" ON "app"."invoices" USING btree ("patient_id") WHERE "app"."invoices"."patient_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_invoices_organization_invoice_date" ON "app"."invoices" USING btree ("organization_id","invoice_date","id") WHERE "app"."invoices"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_invoices_prescription_id" ON "app"."invoices" USING btree ("prescription_id") WHERE "app"."invoices"."prescription_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_invoices_medical_contact_id" ON "app"."invoices" USING btree ("medical_contact_id") WHERE "app"."invoices"."medical_contact_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_invoices_medical_sale_id" ON "app"."invoices" USING btree ("medical_sale_id") WHERE "app"."invoices"."medical_sale_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_invoices_organization_invoice_sequence" ON "app"."invoices" USING btree ("organization_id","invoice_sequence");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_invoice_team_memberships_team_membership_id" ON "app"."invoice_team_memberships" USING btree ("team_membership_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_invoice_team_memberships_organization_id" ON "app"."invoice_team_memberships" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_invoice_team_memberships_created_by_user_id" ON "app"."invoice_team_memberships" USING btree ("created_by_user_id") WHERE "app"."invoice_team_memberships"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_invoices_branch_financial_year_number" ON "app"."invoices" USING btree ("organization_id","branch_id","financial_year","invoice_number");--> statement-breakpoint
CREATE POLICY "invoices_tenant_isolation" ON "app"."invoices" AS PERMISSIVE FOR ALL TO public USING ("app"."invoices"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."invoices"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."invoices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TRIGGER trg_invoices_invoice_number BEFORE INSERT ON "app"."invoices" FOR EACH ROW EXECUTE FUNCTION app.fn_assign_invoice_number();--> statement-breakpoint
CREATE TRIGGER trg_invoices_invoice_sequence BEFORE INSERT ON "app"."invoices" FOR EACH ROW EXECUTE FUNCTION app.fn_assign_record_number('invoice_sequence');--> statement-breakpoint
CREATE POLICY "invoice_team_memberships_tenant_isolation" ON "app"."invoice_team_memberships" AS PERMISSIVE FOR ALL TO public USING ("app"."invoice_team_memberships"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )) WITH CHECK ("app"."invoice_team_memberships"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."invoice_team_memberships" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_patient_packages_public_id" ON "app"."patient_packages" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_packages_organization_created" ON "app"."patient_packages" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_packages_deleted_at" ON "app"."patient_packages" USING btree ("deleted_at") WHERE "app"."patient_packages"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_packages_created_by_user_id" ON "app"."patient_packages" USING btree ("created_by_user_id") WHERE "app"."patient_packages"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_packages_updated_by_user_id" ON "app"."patient_packages" USING btree ("updated_by_user_id") WHERE "app"."patient_packages"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_packages_patient_created" ON "app"."patient_packages" USING btree ("patient_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_packages_offering_id" ON "app"."patient_packages" USING btree ("offering_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_packages_invoice_id" ON "app"."patient_packages" USING btree ("invoice_id") WHERE "app"."patient_packages"."invoice_id" IS NOT NULL;--> statement-breakpoint
CREATE POLICY "patient_packages_tenant_isolation" ON "app"."patient_packages" AS PERMISSIVE FOR ALL TO public USING ("app"."patient_packages"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."patient_packages"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."patient_packages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_offering_suggestions_public_id" ON "app"."offering_suggestions" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offering_suggestions_organization_created" ON "app"."offering_suggestions" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offering_suggestions_deleted_at" ON "app"."offering_suggestions" USING btree ("deleted_at") WHERE "app"."offering_suggestions"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offering_suggestions_created_by_user_id" ON "app"."offering_suggestions" USING btree ("created_by_user_id") WHERE "app"."offering_suggestions"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offering_suggestions_updated_by_user_id" ON "app"."offering_suggestions" USING btree ("updated_by_user_id") WHERE "app"."offering_suggestions"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offering_suggestions_patient_created" ON "app"."offering_suggestions" USING btree ("patient_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offering_suggestions_offering_id" ON "app"."offering_suggestions" USING btree ("offering_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offering_suggestions_appointment_id" ON "app"."offering_suggestions" USING btree ("appointment_id") WHERE "app"."offering_suggestions"."appointment_id" IS NOT NULL;--> statement-breakpoint
CREATE POLICY "offering_suggestions_tenant_isolation" ON "app"."offering_suggestions" AS PERMISSIVE FOR ALL TO public USING ("app"."offering_suggestions"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."offering_suggestions"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."offering_suggestions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_patient_ideas_public_id" ON "app"."patient_ideas" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_ideas_organization_created" ON "app"."patient_ideas" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_ideas_deleted_at" ON "app"."patient_ideas" USING btree ("deleted_at") WHERE "app"."patient_ideas"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_ideas_created_by_user_id" ON "app"."patient_ideas" USING btree ("created_by_user_id") WHERE "app"."patient_ideas"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_ideas_updated_by_user_id" ON "app"."patient_ideas" USING btree ("updated_by_user_id") WHERE "app"."patient_ideas"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_ideas_patient_id" ON "app"."patient_ideas" USING btree ("patient_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_patient_ideas_patient_unique" ON "app"."patient_ideas" USING btree ("organization_id","patient_id") WHERE "app"."patient_ideas"."deleted_at" IS NULL;--> statement-breakpoint
CREATE POLICY "patient_ideas_tenant_isolation" ON "app"."patient_ideas" AS PERMISSIVE FOR ALL TO public USING ("app"."patient_ideas"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."patient_ideas"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."patient_ideas" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_payments_public_id" ON "app"."payments" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_organization_created" ON "app"."payments" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_deleted_at" ON "app"."payments" USING btree ("deleted_at") WHERE "app"."payments"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_created_by_user_id" ON "app"."payments" USING btree ("created_by_user_id") WHERE "app"."payments"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_updated_by_user_id" ON "app"."payments" USING btree ("updated_by_user_id") WHERE "app"."payments"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_branch_paid" ON "app"."payments" USING btree ("branch_id","paid_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_patient_id" ON "app"."payments" USING btree ("patient_id") WHERE "app"."payments"."patient_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_invoice_id" ON "app"."payments" USING btree ("invoice_id") WHERE "app"."payments"."invoice_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_credit_note_id" ON "app"."payments" USING btree ("credit_note_id") WHERE "app"."payments"."credit_note_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_pending_credit_id" ON "app"."payments" USING btree ("pending_credit_id") WHERE "app"."payments"."pending_credit_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_organization_paid_at" ON "app"."payments" USING btree ("organization_id","paid_at","id") WHERE "app"."payments"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_day_close_id" ON "app"."payments" USING btree ("day_close_id") WHERE "app"."payments"."day_close_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_payments_organization_payment_number" ON "app"."payments" USING btree ("organization_id","payment_number");--> statement-breakpoint
CREATE POLICY "payments_tenant_isolation" ON "app"."payments" AS PERMISSIVE FOR ALL TO public USING ("app"."payments"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."payments"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."payments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TRIGGER trg_payments_payment_number BEFORE INSERT ON "app"."payments" FOR EACH ROW EXECUTE FUNCTION app.fn_assign_record_number('payment_number');--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_payment_edits_public_id" ON "app"."payment_edits" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_edits_organization_created" ON "app"."payment_edits" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_edits_deleted_at" ON "app"."payment_edits" USING btree ("deleted_at") WHERE "app"."payment_edits"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_edits_created_by_user_id" ON "app"."payment_edits" USING btree ("created_by_user_id") WHERE "app"."payment_edits"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_edits_updated_by_user_id" ON "app"."payment_edits" USING btree ("updated_by_user_id") WHERE "app"."payment_edits"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_edits_payment_id" ON "app"."payment_edits" USING btree ("payment_id");--> statement-breakpoint
CREATE POLICY "payment_edits_tenant_isolation" ON "app"."payment_edits" AS PERMISSIVE FOR ALL TO public USING ("app"."payment_edits"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."payment_edits"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."payment_edits" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_credit_notes_public_id" ON "app"."credit_notes" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_credit_notes_organization_created" ON "app"."credit_notes" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_credit_notes_deleted_at" ON "app"."credit_notes" USING btree ("deleted_at") WHERE "app"."credit_notes"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_credit_notes_created_by_user_id" ON "app"."credit_notes" USING btree ("created_by_user_id") WHERE "app"."credit_notes"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_credit_notes_updated_by_user_id" ON "app"."credit_notes" USING btree ("updated_by_user_id") WHERE "app"."credit_notes"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_credit_notes_invoice_id" ON "app"."credit_notes" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_credit_notes_organization_credit_note_number" ON "app"."credit_notes" USING btree ("organization_id","credit_note_number");--> statement-breakpoint
CREATE POLICY "credit_notes_tenant_isolation" ON "app"."credit_notes" AS PERMISSIVE FOR ALL TO public USING ("app"."credit_notes"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."credit_notes"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."credit_notes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TRIGGER trg_credit_notes_credit_note_number BEFORE INSERT ON "app"."credit_notes" FOR EACH ROW EXECUTE FUNCTION app.fn_assign_record_number('credit_note_number');--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_pending_credits_public_id" ON "app"."pending_credits" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pending_credits_organization_created" ON "app"."pending_credits" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pending_credits_deleted_at" ON "app"."pending_credits" USING btree ("deleted_at") WHERE "app"."pending_credits"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pending_credits_created_by_user_id" ON "app"."pending_credits" USING btree ("created_by_user_id") WHERE "app"."pending_credits"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pending_credits_updated_by_user_id" ON "app"."pending_credits" USING btree ("updated_by_user_id") WHERE "app"."pending_credits"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pending_credits_patient_id" ON "app"."pending_credits" USING btree ("patient_id") WHERE "app"."pending_credits"."patient_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pending_credits_source_payment_id" ON "app"."pending_credits" USING btree ("source_payment_id") WHERE "app"."pending_credits"."source_payment_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pending_credits_settled_payment_id" ON "app"."pending_credits" USING btree ("settled_payment_id") WHERE "app"."pending_credits"."settled_payment_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pending_credits_invoice_id" ON "app"."pending_credits" USING btree ("invoice_id") WHERE "app"."pending_credits"."invoice_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pending_credits_organization_settle_by" ON "app"."pending_credits" USING btree ("organization_id","settle_by","id") WHERE "app"."pending_credits"."deleted_at" IS NULL AND "app"."pending_credits"."settle_by" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_pending_credits_organization_pending_credit_number" ON "app"."pending_credits" USING btree ("organization_id","pending_credit_number");--> statement-breakpoint
CREATE POLICY "pending_credits_tenant_isolation" ON "app"."pending_credits" AS PERMISSIVE FOR ALL TO public USING ("app"."pending_credits"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."pending_credits"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."pending_credits" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TRIGGER trg_pending_credits_pending_credit_number BEFORE INSERT ON "app"."pending_credits" FOR EACH ROW EXECUTE FUNCTION app.fn_assign_record_number('pending_credit_number');--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_day_closes_public_id" ON "app"."day_closes" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_day_closes_organization_created" ON "app"."day_closes" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_day_closes_deleted_at" ON "app"."day_closes" USING btree ("deleted_at") WHERE "app"."day_closes"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_day_closes_created_by_user_id" ON "app"."day_closes" USING btree ("created_by_user_id") WHERE "app"."day_closes"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_day_closes_updated_by_user_id" ON "app"."day_closes" USING btree ("updated_by_user_id") WHERE "app"."day_closes"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_day_closes_branch_id" ON "app"."day_closes" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_day_closes_organization_close_date" ON "app"."day_closes" USING btree ("organization_id","close_date","id") WHERE "app"."day_closes"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_day_closes_branch_date_unique" ON "app"."day_closes" USING btree ("organization_id","branch_id","close_date") WHERE "app"."day_closes"."deleted_at" IS NULL;--> statement-breakpoint
CREATE POLICY "day_closes_tenant_isolation" ON "app"."day_closes" AS PERMISSIVE FOR ALL TO public USING ("app"."day_closes"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."day_closes"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."day_closes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_day_close_events_public_id" ON "app"."day_close_events" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_day_close_events_organization_created" ON "app"."day_close_events" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_day_close_events_deleted_at" ON "app"."day_close_events" USING btree ("deleted_at") WHERE "app"."day_close_events"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_day_close_events_created_by_user_id" ON "app"."day_close_events" USING btree ("created_by_user_id") WHERE "app"."day_close_events"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_day_close_events_updated_by_user_id" ON "app"."day_close_events" USING btree ("updated_by_user_id") WHERE "app"."day_close_events"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_day_close_events_day_close_id" ON "app"."day_close_events" USING btree ("day_close_id");--> statement-breakpoint
CREATE POLICY "day_close_events_tenant_isolation" ON "app"."day_close_events" AS PERMISSIVE FOR ALL TO public USING ("app"."day_close_events"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."day_close_events"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."day_close_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_treatments_public_id" ON "app"."treatments" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_treatments_organization_created" ON "app"."treatments" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_treatments_deleted_at" ON "app"."treatments" USING btree ("deleted_at") WHERE "app"."treatments"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_treatments_created_by_user_id" ON "app"."treatments" USING btree ("created_by_user_id") WHERE "app"."treatments"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_treatments_updated_by_user_id" ON "app"."treatments" USING btree ("updated_by_user_id") WHERE "app"."treatments"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_treatments_patient_created" ON "app"."treatments" USING btree ("patient_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_treatments_appointment_id" ON "app"."treatments" USING btree ("appointment_id") WHERE "app"."treatments"."appointment_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_treatments_offering_id" ON "app"."treatments" USING btree ("offering_id") WHERE "app"."treatments"."offering_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_treatments_organization_performed_at" ON "app"."treatments" USING btree ("organization_id","performed_at","id") WHERE "app"."treatments"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_treatments_doctor_membership_id" ON "app"."treatments" USING btree ("doctor_membership_id") WHERE "app"."treatments"."doctor_membership_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_treatments_therapist_membership_id" ON "app"."treatments" USING btree ("therapist_membership_id") WHERE "app"."treatments"."therapist_membership_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_treatments_patient_package_id" ON "app"."treatments" USING btree ("patient_package_id") WHERE "app"."treatments"."patient_package_id" IS NOT NULL;--> statement-breakpoint
CREATE POLICY "treatments_tenant_isolation" ON "app"."treatments" AS PERMISSIVE FOR ALL TO public USING ("app"."treatments"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."treatments"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."treatments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_check_ins_public_id" ON "app"."check_ins" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_check_ins_organization_created" ON "app"."check_ins" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_check_ins_deleted_at" ON "app"."check_ins" USING btree ("deleted_at") WHERE "app"."check_ins"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_check_ins_created_by_user_id" ON "app"."check_ins" USING btree ("created_by_user_id") WHERE "app"."check_ins"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_check_ins_updated_by_user_id" ON "app"."check_ins" USING btree ("updated_by_user_id") WHERE "app"."check_ins"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_check_ins_patient_created" ON "app"."check_ins" USING btree ("patient_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_check_ins_appointment_id" ON "app"."check_ins" USING btree ("appointment_id") WHERE "app"."check_ins"."appointment_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_check_ins_treatment_id" ON "app"."check_ins" USING btree ("treatment_id") WHERE "app"."check_ins"."treatment_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_check_ins_organization_check_in_date" ON "app"."check_ins" USING btree ("organization_id","check_in_date","id") WHERE "app"."check_ins"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_check_in_next_offerings_next_offering_id" ON "app"."check_in_next_offerings" USING btree ("next_offering_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_check_in_next_offerings_organization_id" ON "app"."check_in_next_offerings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_check_in_next_offerings_created_by_user_id" ON "app"."check_in_next_offerings" USING btree ("created_by_user_id") WHERE "app"."check_in_next_offerings"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE POLICY "check_ins_tenant_isolation" ON "app"."check_ins" AS PERMISSIVE FOR ALL TO public USING ("app"."check_ins"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."check_ins"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."check_ins" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "check_in_next_offerings_tenant_isolation" ON "app"."check_in_next_offerings" AS PERMISSIVE FOR ALL TO public USING ("app"."check_in_next_offerings"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )) WITH CHECK ("app"."check_in_next_offerings"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."check_in_next_offerings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_reviews_public_id" ON "app"."reviews" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reviews_organization_created" ON "app"."reviews" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reviews_deleted_at" ON "app"."reviews" USING btree ("deleted_at") WHERE "app"."reviews"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reviews_created_by_user_id" ON "app"."reviews" USING btree ("created_by_user_id") WHERE "app"."reviews"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reviews_updated_by_user_id" ON "app"."reviews" USING btree ("updated_by_user_id") WHERE "app"."reviews"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reviews_patient_created" ON "app"."reviews" USING btree ("patient_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reviews_appointment_id" ON "app"."reviews" USING btree ("appointment_id") WHERE "app"."reviews"."appointment_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reviews_organization_review_date" ON "app"."reviews" USING btree ("organization_id","review_date","id") WHERE "app"."reviews"."deleted_at" IS NULL;--> statement-breakpoint
CREATE POLICY "reviews_tenant_isolation" ON "app"."reviews" AS PERMISSIVE FOR ALL TO public USING ("app"."reviews"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."reviews"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."reviews" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_feedback_actions_public_id" ON "app"."feedback_actions" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_feedback_actions_organization_created" ON "app"."feedback_actions" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_feedback_actions_deleted_at" ON "app"."feedback_actions" USING btree ("deleted_at") WHERE "app"."feedback_actions"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_feedback_actions_created_by_user_id" ON "app"."feedback_actions" USING btree ("created_by_user_id") WHERE "app"."feedback_actions"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_feedback_actions_updated_by_user_id" ON "app"."feedback_actions" USING btree ("updated_by_user_id") WHERE "app"."feedback_actions"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_feedback_actions_check_in_id" ON "app"."feedback_actions" USING btree ("check_in_id") WHERE "app"."feedback_actions"."check_in_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_feedback_actions_review_id" ON "app"."feedback_actions" USING btree ("review_id") WHERE "app"."feedback_actions"."review_id" IS NOT NULL;--> statement-breakpoint
CREATE POLICY "feedback_actions_tenant_isolation" ON "app"."feedback_actions" AS PERMISSIVE FOR ALL TO public USING ("app"."feedback_actions"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."feedback_actions"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."feedback_actions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_manufacturers_public_id" ON "app"."manufacturers" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_manufacturers_organization_created" ON "app"."manufacturers" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_manufacturers_deleted_at" ON "app"."manufacturers" USING btree ("deleted_at") WHERE "app"."manufacturers"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_manufacturers_created_by_user_id" ON "app"."manufacturers" USING btree ("created_by_user_id") WHERE "app"."manufacturers"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_manufacturers_updated_by_user_id" ON "app"."manufacturers" USING btree ("updated_by_user_id") WHERE "app"."manufacturers"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_manufacturers_organization_name" ON "app"."manufacturers" USING btree ("organization_id","name","id") WHERE "app"."manufacturers"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_manufacturers_organization_name_unique" ON "app"."manufacturers" USING btree ("organization_id",lower("name")) WHERE "app"."manufacturers"."deleted_at" IS NULL;--> statement-breakpoint
CREATE POLICY "manufacturers_tenant_isolation" ON "app"."manufacturers" AS PERMISSIVE FOR ALL TO public USING ("app"."manufacturers"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."manufacturers"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."manufacturers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_suppliers_public_id" ON "app"."suppliers" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_suppliers_organization_created" ON "app"."suppliers" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_suppliers_deleted_at" ON "app"."suppliers" USING btree ("deleted_at") WHERE "app"."suppliers"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_suppliers_created_by_user_id" ON "app"."suppliers" USING btree ("created_by_user_id") WHERE "app"."suppliers"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_suppliers_updated_by_user_id" ON "app"."suppliers" USING btree ("updated_by_user_id") WHERE "app"."suppliers"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_suppliers_organization_name" ON "app"."suppliers" USING btree ("organization_id","name","id") WHERE "app"."suppliers"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_supplier_manufacturers_manufacturer_id" ON "app"."supplier_manufacturers" USING btree ("manufacturer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_supplier_manufacturers_organization_id" ON "app"."supplier_manufacturers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_supplier_manufacturers_created_by_user_id" ON "app"."supplier_manufacturers" USING btree ("created_by_user_id") WHERE "app"."supplier_manufacturers"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE POLICY "suppliers_tenant_isolation" ON "app"."suppliers" AS PERMISSIVE FOR ALL TO public USING ("app"."suppliers"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."suppliers"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."suppliers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "supplier_manufacturers_tenant_isolation" ON "app"."supplier_manufacturers" AS PERMISSIVE FOR ALL TO public USING ("app"."supplier_manufacturers"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )) WITH CHECK ("app"."supplier_manufacturers"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."supplier_manufacturers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_medical_reps_public_id" ON "app"."medical_reps" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_reps_organization_created" ON "app"."medical_reps" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_reps_deleted_at" ON "app"."medical_reps" USING btree ("deleted_at") WHERE "app"."medical_reps"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_reps_created_by_user_id" ON "app"."medical_reps" USING btree ("created_by_user_id") WHERE "app"."medical_reps"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_reps_updated_by_user_id" ON "app"."medical_reps" USING btree ("updated_by_user_id") WHERE "app"."medical_reps"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_reps_organization_name" ON "app"."medical_reps" USING btree ("organization_id","name","id") WHERE "app"."medical_reps"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_reps_organization_next_visit_on" ON "app"."medical_reps" USING btree ("organization_id","next_visit_on","id") WHERE "app"."medical_reps"."deleted_at" IS NULL AND "app"."medical_reps"."next_visit_on" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_rep_manufacturers_manufacturer_id" ON "app"."medical_rep_manufacturers" USING btree ("manufacturer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_rep_manufacturers_organization_id" ON "app"."medical_rep_manufacturers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_rep_manufacturers_created_by_user_id" ON "app"."medical_rep_manufacturers" USING btree ("created_by_user_id") WHERE "app"."medical_rep_manufacturers"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE POLICY "medical_reps_tenant_isolation" ON "app"."medical_reps" AS PERMISSIVE FOR ALL TO public USING ("app"."medical_reps"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."medical_reps"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."medical_reps" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "medical_rep_manufacturers_tenant_isolation" ON "app"."medical_rep_manufacturers" AS PERMISSIVE FOR ALL TO public USING ("app"."medical_rep_manufacturers"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )) WITH CHECK ("app"."medical_rep_manufacturers"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."medical_rep_manufacturers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_medical_rep_visits_public_id" ON "app"."medical_rep_visits" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_rep_visits_organization_created" ON "app"."medical_rep_visits" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_rep_visits_deleted_at" ON "app"."medical_rep_visits" USING btree ("deleted_at") WHERE "app"."medical_rep_visits"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_rep_visits_created_by_user_id" ON "app"."medical_rep_visits" USING btree ("created_by_user_id") WHERE "app"."medical_rep_visits"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_rep_visits_updated_by_user_id" ON "app"."medical_rep_visits" USING btree ("updated_by_user_id") WHERE "app"."medical_rep_visits"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_rep_visits_medical_rep_created" ON "app"."medical_rep_visits" USING btree ("medical_rep_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_rep_visits_organization_visit_date" ON "app"."medical_rep_visits" USING btree ("organization_id","visit_date","id") WHERE "app"."medical_rep_visits"."deleted_at" IS NULL;--> statement-breakpoint
CREATE POLICY "medical_rep_visits_tenant_isolation" ON "app"."medical_rep_visits" AS PERMISSIVE FOR ALL TO public USING ("app"."medical_rep_visits"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."medical_rep_visits"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."medical_rep_visits" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_medicines_public_id" ON "app"."medicines" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medicines_organization_created" ON "app"."medicines" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medicines_deleted_at" ON "app"."medicines" USING btree ("deleted_at") WHERE "app"."medicines"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medicines_created_by_user_id" ON "app"."medicines" USING btree ("created_by_user_id") WHERE "app"."medicines"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medicines_updated_by_user_id" ON "app"."medicines" USING btree ("updated_by_user_id") WHERE "app"."medicines"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medicines_organization_name" ON "app"."medicines" USING btree ("organization_id","name","id") WHERE "app"."medicines"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medicines_manufacturer_id" ON "app"."medicines" USING btree ("manufacturer_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_medicines_organization_medicine_number" ON "app"."medicines" USING btree ("organization_id","medicine_number");--> statement-breakpoint
CREATE POLICY "medicines_tenant_isolation" ON "app"."medicines" AS PERMISSIVE FOR ALL TO public USING ("app"."medicines"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."medicines"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."medicines" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TRIGGER trg_medicines_medicine_number BEFORE INSERT ON "app"."medicines" FOR EACH ROW EXECUTE FUNCTION app.fn_assign_record_number('medicine_number');--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_medical_purchase_orders_public_id" ON "app"."medical_purchase_orders" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_purchase_orders_organization_created" ON "app"."medical_purchase_orders" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_purchase_orders_deleted_at" ON "app"."medical_purchase_orders" USING btree ("deleted_at") WHERE "app"."medical_purchase_orders"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_purchase_orders_created_by_user_id" ON "app"."medical_purchase_orders" USING btree ("created_by_user_id") WHERE "app"."medical_purchase_orders"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_purchase_orders_updated_by_user_id" ON "app"."medical_purchase_orders" USING btree ("updated_by_user_id") WHERE "app"."medical_purchase_orders"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_purchase_orders_supplier_id" ON "app"."medical_purchase_orders" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_purchase_orders_organization_order_date" ON "app"."medical_purchase_orders" USING btree ("organization_id","order_date","id") WHERE "app"."medical_purchase_orders"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_medical_purchase_orders_organization_purchase_order_number" ON "app"."medical_purchase_orders" USING btree ("organization_id","purchase_order_number");--> statement-breakpoint
CREATE POLICY "medical_purchase_orders_tenant_isolation" ON "app"."medical_purchase_orders" AS PERMISSIVE FOR ALL TO public USING ("app"."medical_purchase_orders"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."medical_purchase_orders"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."medical_purchase_orders" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TRIGGER trg_medical_purchase_orders_purchase_order_number BEFORE INSERT ON "app"."medical_purchase_orders" FOR EACH ROW EXECUTE FUNCTION app.fn_assign_record_number('purchase_order_number');--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_medical_contacts_public_id" ON "app"."medical_contacts" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_contacts_organization_created" ON "app"."medical_contacts" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_contacts_deleted_at" ON "app"."medical_contacts" USING btree ("deleted_at") WHERE "app"."medical_contacts"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_contacts_created_by_user_id" ON "app"."medical_contacts" USING btree ("created_by_user_id") WHERE "app"."medical_contacts"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_contacts_updated_by_user_id" ON "app"."medical_contacts" USING btree ("updated_by_user_id") WHERE "app"."medical_contacts"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_contacts_organization_name" ON "app"."medical_contacts" USING btree ("organization_id","name","id") WHERE "app"."medical_contacts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_contacts_search_text_trgm" ON "app"."medical_contacts" USING gin ("search_text" gin_trgm_ops) WHERE "app"."medical_contacts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE POLICY "medical_contacts_tenant_isolation" ON "app"."medical_contacts" AS PERMISSIVE FOR ALL TO public USING ("app"."medical_contacts"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."medical_contacts"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."medical_contacts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_medical_sales_public_id" ON "app"."medical_sales" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_sales_organization_created" ON "app"."medical_sales" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_sales_deleted_at" ON "app"."medical_sales" USING btree ("deleted_at") WHERE "app"."medical_sales"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_sales_created_by_user_id" ON "app"."medical_sales" USING btree ("created_by_user_id") WHERE "app"."medical_sales"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_sales_updated_by_user_id" ON "app"."medical_sales" USING btree ("updated_by_user_id") WHERE "app"."medical_sales"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_sales_invoice_id" ON "app"."medical_sales" USING btree ("invoice_id") WHERE "app"."medical_sales"."invoice_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_sales_patient_id" ON "app"."medical_sales" USING btree ("patient_id") WHERE "app"."medical_sales"."patient_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_sales_medical_contact_id" ON "app"."medical_sales" USING btree ("medical_contact_id") WHERE "app"."medical_sales"."medical_contact_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_sales_prescription_id" ON "app"."medical_sales" USING btree ("prescription_id") WHERE "app"."medical_sales"."prescription_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_sales_lead_id" ON "app"."medical_sales" USING btree ("lead_id") WHERE "app"."medical_sales"."lead_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_medical_sales_organization_sold_at" ON "app"."medical_sales" USING btree ("organization_id","sold_at","id") WHERE "app"."medical_sales"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_medical_sales_organization_sale_number" ON "app"."medical_sales" USING btree ("organization_id","sale_number");--> statement-breakpoint
CREATE POLICY "medical_sales_tenant_isolation" ON "app"."medical_sales" AS PERMISSIVE FOR ALL TO public USING ("app"."medical_sales"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."medical_sales"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."medical_sales" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TRIGGER trg_medical_sales_sale_number BEFORE INSERT ON "app"."medical_sales" FOR EACH ROW EXECUTE FUNCTION app.fn_assign_record_number('sale_number');--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_supplier_credits_public_id" ON "app"."supplier_credits" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_supplier_credits_organization_created" ON "app"."supplier_credits" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_supplier_credits_deleted_at" ON "app"."supplier_credits" USING btree ("deleted_at") WHERE "app"."supplier_credits"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_supplier_credits_created_by_user_id" ON "app"."supplier_credits" USING btree ("created_by_user_id") WHERE "app"."supplier_credits"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_supplier_credits_updated_by_user_id" ON "app"."supplier_credits" USING btree ("updated_by_user_id") WHERE "app"."supplier_credits"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_supplier_credits_supplier_id" ON "app"."supplier_credits" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_supplier_credits_medicine_id" ON "app"."supplier_credits" USING btree ("medicine_id") WHERE "app"."supplier_credits"."medicine_id" IS NOT NULL;--> statement-breakpoint
CREATE POLICY "supplier_credits_tenant_isolation" ON "app"."supplier_credits" AS PERMISSIVE FOR ALL TO public USING ("app"."supplier_credits"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."supplier_credits"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."supplier_credits" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_stock_vendors_public_id" ON "app"."stock_vendors" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_vendors_organization_created" ON "app"."stock_vendors" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_vendors_deleted_at" ON "app"."stock_vendors" USING btree ("deleted_at") WHERE "app"."stock_vendors"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_vendors_created_by_user_id" ON "app"."stock_vendors" USING btree ("created_by_user_id") WHERE "app"."stock_vendors"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_vendors_updated_by_user_id" ON "app"."stock_vendors" USING btree ("updated_by_user_id") WHERE "app"."stock_vendors"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_vendors_organization_name" ON "app"."stock_vendors" USING btree ("organization_id","name","id") WHERE "app"."stock_vendors"."deleted_at" IS NULL;--> statement-breakpoint
CREATE POLICY "stock_vendors_tenant_isolation" ON "app"."stock_vendors" AS PERMISSIVE FOR ALL TO public USING ("app"."stock_vendors"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."stock_vendors"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."stock_vendors" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_stock_items_public_id" ON "app"."stock_items" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_items_organization_created" ON "app"."stock_items" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_items_deleted_at" ON "app"."stock_items" USING btree ("deleted_at") WHERE "app"."stock_items"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_items_created_by_user_id" ON "app"."stock_items" USING btree ("created_by_user_id") WHERE "app"."stock_items"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_items_updated_by_user_id" ON "app"."stock_items" USING btree ("updated_by_user_id") WHERE "app"."stock_items"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_items_organization_name" ON "app"."stock_items" USING btree ("organization_id","name","id") WHERE "app"."stock_items"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_items_stock_vendor_id" ON "app"."stock_items" USING btree ("stock_vendor_id") WHERE "app"."stock_items"."stock_vendor_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_stock_items_organization_stock_item_number" ON "app"."stock_items" USING btree ("organization_id","stock_item_number");--> statement-breakpoint
CREATE POLICY "stock_items_tenant_isolation" ON "app"."stock_items" AS PERMISSIVE FOR ALL TO public USING ("app"."stock_items"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."stock_items"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."stock_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TRIGGER trg_stock_items_stock_item_number BEFORE INSERT ON "app"."stock_items" FOR EACH ROW EXECUTE FUNCTION app.fn_assign_record_number('stock_item_number');--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_stock_purchases_public_id" ON "app"."stock_purchases" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_purchases_organization_created" ON "app"."stock_purchases" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_purchases_deleted_at" ON "app"."stock_purchases" USING btree ("deleted_at") WHERE "app"."stock_purchases"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_purchases_created_by_user_id" ON "app"."stock_purchases" USING btree ("created_by_user_id") WHERE "app"."stock_purchases"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_purchases_updated_by_user_id" ON "app"."stock_purchases" USING btree ("updated_by_user_id") WHERE "app"."stock_purchases"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_purchases_stock_vendor_id" ON "app"."stock_purchases" USING btree ("stock_vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_purchases_organization_purchase_date" ON "app"."stock_purchases" USING btree ("organization_id","purchase_date","id") WHERE "app"."stock_purchases"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_stock_purchases_organization_stock_purchase_number" ON "app"."stock_purchases" USING btree ("organization_id","stock_purchase_number");--> statement-breakpoint
CREATE POLICY "stock_purchases_tenant_isolation" ON "app"."stock_purchases" AS PERMISSIVE FOR ALL TO public USING ("app"."stock_purchases"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."stock_purchases"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."stock_purchases" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TRIGGER trg_stock_purchases_stock_purchase_number BEFORE INSERT ON "app"."stock_purchases" FOR EACH ROW EXECUTE FUNCTION app.fn_assign_record_number('stock_purchase_number');--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_stock_counts_public_id" ON "app"."stock_counts" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_counts_organization_created" ON "app"."stock_counts" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_counts_deleted_at" ON "app"."stock_counts" USING btree ("deleted_at") WHERE "app"."stock_counts"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_counts_created_by_user_id" ON "app"."stock_counts" USING btree ("created_by_user_id") WHERE "app"."stock_counts"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_counts_updated_by_user_id" ON "app"."stock_counts" USING btree ("updated_by_user_id") WHERE "app"."stock_counts"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_counts_organization_counted_at" ON "app"."stock_counts" USING btree ("organization_id","counted_at","id") WHERE "app"."stock_counts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE POLICY "stock_counts_tenant_isolation" ON "app"."stock_counts" AS PERMISSIVE FOR ALL TO public USING ("app"."stock_counts"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."stock_counts"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."stock_counts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_stock_movements_public_id" ON "app"."stock_movements" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_movements_organization_created" ON "app"."stock_movements" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_movements_deleted_at" ON "app"."stock_movements" USING btree ("deleted_at") WHERE "app"."stock_movements"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_movements_created_by_user_id" ON "app"."stock_movements" USING btree ("created_by_user_id") WHERE "app"."stock_movements"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_movements_updated_by_user_id" ON "app"."stock_movements" USING btree ("updated_by_user_id") WHERE "app"."stock_movements"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_movements_stock_item_id" ON "app"."stock_movements" USING btree ("stock_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_movements_patient_id" ON "app"."stock_movements" USING btree ("patient_id") WHERE "app"."stock_movements"."patient_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_movements_stock_purchase_id" ON "app"."stock_movements" USING btree ("stock_purchase_id") WHERE "app"."stock_movements"."stock_purchase_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_movements_stock_count_id" ON "app"."stock_movements" USING btree ("stock_count_id") WHERE "app"."stock_movements"."stock_count_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_movements_reverts_stock_movement_id" ON "app"."stock_movements" USING btree ("reverts_stock_movement_id") WHERE "app"."stock_movements"."reverts_stock_movement_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_movements_reverted_by_stock_movement_id" ON "app"."stock_movements" USING btree ("reverted_by_stock_movement_id") WHERE "app"."stock_movements"."reverted_by_stock_movement_id" IS NOT NULL;--> statement-breakpoint
CREATE POLICY "stock_movements_tenant_isolation" ON "app"."stock_movements" AS PERMISSIVE FOR ALL TO public USING ("app"."stock_movements"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."stock_movements"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."stock_movements" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_tasks_public_id" ON "app"."tasks" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tasks_organization_created" ON "app"."tasks" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tasks_deleted_at" ON "app"."tasks" USING btree ("deleted_at") WHERE "app"."tasks"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tasks_created_by_user_id" ON "app"."tasks" USING btree ("created_by_user_id") WHERE "app"."tasks"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tasks_updated_by_user_id" ON "app"."tasks" USING btree ("updated_by_user_id") WHERE "app"."tasks"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tasks_owner_due" ON "app"."tasks" USING btree ("owner_membership_id","due_at") WHERE "app"."tasks"."owner_membership_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tasks_patient_id" ON "app"."tasks" USING btree ("patient_id") WHERE "app"."tasks"."patient_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tasks_lead_id" ON "app"."tasks" USING btree ("lead_id") WHERE "app"."tasks"."lead_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tasks_organization_due_at" ON "app"."tasks" USING btree ("organization_id","due_at","id") WHERE "app"."tasks"."deleted_at" IS NULL;--> statement-breakpoint
CREATE POLICY "tasks_tenant_isolation" ON "app"."tasks" AS PERMISSIVE FOR ALL TO public USING ("app"."tasks"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."tasks"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."tasks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_task_owner_changes_public_id" ON "app"."task_owner_changes" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_task_owner_changes_organization_created" ON "app"."task_owner_changes" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_task_owner_changes_deleted_at" ON "app"."task_owner_changes" USING btree ("deleted_at") WHERE "app"."task_owner_changes"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_task_owner_changes_created_by_user_id" ON "app"."task_owner_changes" USING btree ("created_by_user_id") WHERE "app"."task_owner_changes"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_task_owner_changes_updated_by_user_id" ON "app"."task_owner_changes" USING btree ("updated_by_user_id") WHERE "app"."task_owner_changes"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_task_owner_changes_task_id" ON "app"."task_owner_changes" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_task_owner_changes_from_membership_id" ON "app"."task_owner_changes" USING btree ("from_membership_id") WHERE "app"."task_owner_changes"."from_membership_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_task_owner_changes_to_membership_id" ON "app"."task_owner_changes" USING btree ("to_membership_id") WHERE "app"."task_owner_changes"."to_membership_id" IS NOT NULL;--> statement-breakpoint
CREATE POLICY "task_owner_changes_tenant_isolation" ON "app"."task_owner_changes" AS PERMISSIVE FOR ALL TO public USING ("app"."task_owner_changes"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."task_owner_changes"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."task_owner_changes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_task_rule_settings_public_id" ON "app"."task_rule_settings" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_task_rule_settings_organization_created" ON "app"."task_rule_settings" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_task_rule_settings_deleted_at" ON "app"."task_rule_settings" USING btree ("deleted_at") WHERE "app"."task_rule_settings"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_task_rule_settings_created_by_user_id" ON "app"."task_rule_settings" USING btree ("created_by_user_id") WHERE "app"."task_rule_settings"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_task_rule_settings_updated_by_user_id" ON "app"."task_rule_settings" USING btree ("updated_by_user_id") WHERE "app"."task_rule_settings"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_task_rule_settings_organization_rule_unique" ON "app"."task_rule_settings" USING btree ("organization_id","rule_key") WHERE "app"."task_rule_settings"."deleted_at" IS NULL;--> statement-breakpoint
CREATE POLICY "task_rule_settings_tenant_isolation" ON "app"."task_rule_settings" AS PERMISSIVE FOR ALL TO public USING ("app"."task_rule_settings"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."task_rule_settings"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."task_rule_settings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.contact_message_templates — reusable texts for outgoing WhatsApp and Instagram messages; `<first>` / `<interest>` filled per contact (launch ROUTE #130, routes-final 4.D).
CREATE TABLE IF NOT EXISTS "app"."contact_message_templates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"name" varchar(60) NOT NULL,
	"body" varchar(1000) NOT NULL,
	"type" varchar(9) DEFAULT 'whatsapp' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(20),
	"delete_note" varchar(280),
	CONSTRAINT "chk_contact_message_templates_name" CHECK (char_length(btrim("app"."contact_message_templates"."name")) > 0),
	CONSTRAINT "chk_contact_message_templates_body" CHECK (char_length(btrim("app"."contact_message_templates"."body")) > 0),
	CONSTRAINT "chk_contact_message_templates_type" CHECK ("app"."contact_message_templates"."type" IN ('whatsapp', 'instagram')),
	CONSTRAINT "chk_contact_message_templates_updated" CHECK ("app"."contact_message_templates"."updated_at" >= "app"."contact_message_templates"."created_at"),
	CONSTRAINT "chk_contact_message_templates_delete_reason" CHECK ("app"."contact_message_templates"."delete_reason" IN ('mistake', 'duplicate', 'not_needed', 'other')),
	CONSTRAINT "chk_contact_message_templates_delete_reason_when_deleted" CHECK (("app"."contact_message_templates"."deleted_at" IS NULL) = ("app"."contact_message_templates"."delete_reason" IS NULL)),
	CONSTRAINT "chk_contact_message_templates_delete_note_when_other" CHECK ("app"."contact_message_templates"."delete_reason" IS DISTINCT FROM 'other' OR "app"."contact_message_templates"."delete_note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."contact_message_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."contact_message_templates" ADD CONSTRAINT "contact_message_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_message_templates" ADD CONSTRAINT "contact_message_templates_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_message_templates" ADD CONSTRAINT "contact_message_templates_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_contact_message_templates_public_id" ON "app"."contact_message_templates" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_message_templates_organization_created" ON "app"."contact_message_templates" USING btree ("organization_id","created_at" DESC,"id") WHERE "app"."contact_message_templates"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_message_templates_organization_name" ON "app"."contact_message_templates" USING btree ("organization_id","name","id") WHERE "app"."contact_message_templates"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_contact_message_templates_organization_name_unique" ON "app"."contact_message_templates" USING btree ("organization_id",lower("name")) WHERE "app"."contact_message_templates"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_message_templates_deleted_at" ON "app"."contact_message_templates" USING btree ("deleted_at") WHERE "app"."contact_message_templates"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_message_templates_created_by_user_id" ON "app"."contact_message_templates" USING btree ("created_by_user_id") WHERE "app"."contact_message_templates"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_message_templates_updated_by_user_id" ON "app"."contact_message_templates" USING btree ("updated_by_user_id") WHERE "app"."contact_message_templates"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE POLICY "contact_message_templates_tenant_isolation" ON "app"."contact_message_templates" AS PERMISSIVE FOR ALL TO public USING ("app"."contact_message_templates"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."contact_message_templates"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."contact_message_templates" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- app.contact_activities — one entry of a contact's stream: a WhatsApp or Instagram message, a call log, a note or a server event; append-only, at most one record link (launch ROUTE #130, routes-final 4.C).
CREATE TABLE IF NOT EXISTS "app"."contact_activities" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"public_id" varchar(28) NOT NULL,
	"organization_id" bigint NOT NULL,
	"contact_id" bigint NOT NULL,
	"type" varchar(9) NOT NULL,
	"direction" varchar(8),
	"body" varchar(1000) NOT NULL,
	"contact_message_template_id" bigint,
	"attachment_keys" text[] DEFAULT '{}' NOT NULL,
	"reply_to_contact_activity_id" bigint,
	"delivery_status" varchar(9),
	"provider_message_id" varchar(128),
	"failure_reason" varchar(280),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"author_membership_id" bigint,
	"appointment_id" bigint,
	"invoice_id" bigint,
	"payment_id" bigint,
	"patient_prescription_id" bigint,
	"patient_offering_id" bigint,
	"patient_review_id" bigint,
	"patient_check_in_id" bigint,
	"task_id" bigint,
	"patient_treatment_id" bigint,
	"patient_clinical_note_id" bigint,
	"patient_image_id" bigint,
	"patient_report_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" bigint,
	"updated_by_user_id" bigint,
	CONSTRAINT "chk_contact_activities_type" CHECK ("app"."contact_activities"."type" IN ('whatsapp', 'instagram', 'call_log', 'note', 'system')),
	CONSTRAINT "chk_contact_activities_direction" CHECK ("app"."contact_activities"."direction" IN ('sent', 'received')),
	CONSTRAINT "chk_contact_activities_direction_by_type" CHECK (("app"."contact_activities"."type" IN ('note', 'system')) = ("app"."contact_activities"."direction" IS NULL)),
	CONSTRAINT "chk_contact_activities_body" CHECK (char_length(btrim("app"."contact_activities"."body")) >= 1),
	CONSTRAINT "chk_contact_activities_attachment_keys" CHECK (cardinality("app"."contact_activities"."attachment_keys") <= 5),
	CONSTRAINT "chk_contact_activities_delivery_status" CHECK ("app"."contact_activities"."delivery_status" IN ('queued', 'sent', 'delivered', 'read', 'failed')),
	CONSTRAINT "chk_contact_activities_delivery_status_on_sent_messages" CHECK (("app"."contact_activities"."delivery_status" IS NOT NULL) = ("app"."contact_activities"."type" IN ('whatsapp', 'instagram') AND "app"."contact_activities"."direction" IS NOT DISTINCT FROM 'sent')),
	CONSTRAINT "chk_contact_activities_failure_when_failed" CHECK ("app"."contact_activities"."delivery_status" IS DISTINCT FROM 'failed' OR "app"."contact_activities"."failure_reason" IS NOT NULL),
	CONSTRAINT "chk_contact_activities_author" CHECK ("app"."contact_activities"."author_membership_id" IS NULL OR ("app"."contact_activities"."type" <> 'system' AND "app"."contact_activities"."direction" IS DISTINCT FROM 'received')),
	CONSTRAINT "chk_contact_activities_one_link" CHECK (num_nonnulls("app"."contact_activities"."appointment_id", "app"."contact_activities"."invoice_id", "app"."contact_activities"."payment_id", "app"."contact_activities"."patient_prescription_id", "app"."contact_activities"."patient_offering_id", "app"."contact_activities"."patient_review_id", "app"."contact_activities"."patient_check_in_id", "app"."contact_activities"."task_id", "app"."contact_activities"."patient_treatment_id", "app"."contact_activities"."patient_clinical_note_id", "app"."contact_activities"."patient_image_id", "app"."contact_activities"."patient_report_id") <= 1),
	CONSTRAINT "chk_contact_activities_updated" CHECK ("app"."contact_activities"."updated_at" >= "app"."contact_activities"."created_at")
);
--> statement-breakpoint
ALTER TABLE "app"."contact_activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."contact_activities" ADD CONSTRAINT "contact_activities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_activities" ADD CONSTRAINT "contact_activities_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_activities" ADD CONSTRAINT "contact_activities_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_activities" ADD CONSTRAINT "contact_activities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "app"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_activities" ADD CONSTRAINT "contact_activities_contact_message_template_id_fk" FOREIGN KEY ("contact_message_template_id") REFERENCES "app"."contact_message_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_activities" ADD CONSTRAINT "contact_activities_reply_to_contact_activity_id_fk" FOREIGN KEY ("reply_to_contact_activity_id") REFERENCES "app"."contact_activities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_activities" ADD CONSTRAINT "contact_activities_author_membership_fk" FOREIGN KEY ("organization_id","author_membership_id") REFERENCES "tenancy"."memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_activities" ADD CONSTRAINT "contact_activities_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "app"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_activities" ADD CONSTRAINT "contact_activities_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "app"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_activities" ADD CONSTRAINT "contact_activities_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "app"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_activities" ADD CONSTRAINT "contact_activities_patient_prescription_id_prescriptions_id_fk" FOREIGN KEY ("patient_prescription_id") REFERENCES "app"."prescriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_activities" ADD CONSTRAINT "contact_activities_patient_offering_id_patient_packages_id_fk" FOREIGN KEY ("patient_offering_id") REFERENCES "app"."patient_packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_activities" ADD CONSTRAINT "contact_activities_patient_review_id_reviews_id_fk" FOREIGN KEY ("patient_review_id") REFERENCES "app"."reviews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_activities" ADD CONSTRAINT "contact_activities_patient_check_in_id_check_ins_id_fk" FOREIGN KEY ("patient_check_in_id") REFERENCES "app"."check_ins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_activities" ADD CONSTRAINT "contact_activities_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "app"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_activities" ADD CONSTRAINT "contact_activities_patient_treatment_id_treatments_id_fk" FOREIGN KEY ("patient_treatment_id") REFERENCES "app"."treatments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_activities" ADD CONSTRAINT "contact_activities_patient_clinical_note_id_patient_clinical_notes_id_fk" FOREIGN KEY ("patient_clinical_note_id") REFERENCES "app"."patient_clinical_notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_activities" ADD CONSTRAINT "contact_activities_patient_image_id_patient_images_id_fk" FOREIGN KEY ("patient_image_id") REFERENCES "app"."patient_images"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_activities" ADD CONSTRAINT "contact_activities_patient_report_id_patient_reports_id_fk" FOREIGN KEY ("patient_report_id") REFERENCES "app"."patient_reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_contact_activities_public_id" ON "app"."contact_activities" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_activities_contact_id_occurred_at" ON "app"."contact_activities" USING btree ("contact_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_activities_contact_id_created_at" ON "app"."contact_activities" USING btree ("contact_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_contact_activities_organization_provider_message_id" ON "app"."contact_activities" USING btree ("organization_id","provider_message_id") WHERE "app"."contact_activities"."provider_message_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_activities_organization_delivery_queue" ON "app"."contact_activities" USING btree ("organization_id","occurred_at") WHERE "app"."contact_activities"."delivery_status" IN ('queued', 'failed');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_activities_contact_message_template_id" ON "app"."contact_activities" USING btree ("contact_message_template_id") WHERE "app"."contact_activities"."contact_message_template_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_activities_reply_to_contact_activity_id" ON "app"."contact_activities" USING btree ("reply_to_contact_activity_id") WHERE "app"."contact_activities"."reply_to_contact_activity_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_activities_organization_id_author_membership_id" ON "app"."contact_activities" USING btree ("organization_id","author_membership_id") WHERE "app"."contact_activities"."author_membership_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_activities_appointment_id" ON "app"."contact_activities" USING btree ("appointment_id") WHERE "app"."contact_activities"."appointment_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_activities_invoice_id" ON "app"."contact_activities" USING btree ("invoice_id") WHERE "app"."contact_activities"."invoice_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_activities_payment_id" ON "app"."contact_activities" USING btree ("payment_id") WHERE "app"."contact_activities"."payment_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_activities_patient_prescription_id" ON "app"."contact_activities" USING btree ("patient_prescription_id") WHERE "app"."contact_activities"."patient_prescription_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_activities_patient_offering_id" ON "app"."contact_activities" USING btree ("patient_offering_id") WHERE "app"."contact_activities"."patient_offering_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_activities_patient_review_id" ON "app"."contact_activities" USING btree ("patient_review_id") WHERE "app"."contact_activities"."patient_review_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_activities_patient_check_in_id" ON "app"."contact_activities" USING btree ("patient_check_in_id") WHERE "app"."contact_activities"."patient_check_in_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_activities_task_id" ON "app"."contact_activities" USING btree ("task_id") WHERE "app"."contact_activities"."task_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_activities_patient_treatment_id" ON "app"."contact_activities" USING btree ("patient_treatment_id") WHERE "app"."contact_activities"."patient_treatment_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_activities_patient_clinical_note_id" ON "app"."contact_activities" USING btree ("patient_clinical_note_id") WHERE "app"."contact_activities"."patient_clinical_note_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_activities_patient_image_id" ON "app"."contact_activities" USING btree ("patient_image_id") WHERE "app"."contact_activities"."patient_image_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_activities_patient_report_id" ON "app"."contact_activities" USING btree ("patient_report_id") WHERE "app"."contact_activities"."patient_report_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_activities_created_by_user_id" ON "app"."contact_activities" USING btree ("created_by_user_id") WHERE "app"."contact_activities"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_activities_updated_by_user_id" ON "app"."contact_activities" USING btree ("updated_by_user_id") WHERE "app"."contact_activities"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE POLICY "contact_activities_tenant_isolation" ON "app"."contact_activities" AS PERMISSIVE FOR ALL TO public USING ("app"."contact_activities"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )) WITH CHECK ("app"."contact_activities"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."contact_activities" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."leads" ADD CONSTRAINT "leads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."leads" ADD CONSTRAINT "leads_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."leads" ADD CONSTRAINT "leads_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."leads" ADD CONSTRAINT "leads_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "app"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."leads" ADD CONSTRAINT "leads_owner_membership_fk" FOREIGN KEY ("organization_id","owner_membership_id") REFERENCES "tenancy"."memberships"("organization_id","id") ON DELETE SET NULL ("owner_membership_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."leads" ADD CONSTRAINT "leads_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "app"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."lead_involved_memberships" ADD CONSTRAINT "lead_involved_memberships_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "app"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."lead_involved_memberships" ADD CONSTRAINT "lead_involved_memberships_membership_fk" FOREIGN KEY ("organization_id","membership_id") REFERENCES "tenancy"."memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."lead_involved_memberships" ADD CONSTRAINT "lead_involved_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "tenancy"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."lead_involved_memberships" ADD CONSTRAINT "lead_involved_memberships_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_leads_public_id" ON "app"."leads" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_leads_organization_lead_number" ON "app"."leads" USING btree ("organization_id","lead_number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_leads_organization_contact_open_unique" ON "app"."leads" USING btree ("organization_id","contact_id") WHERE "app"."leads"."deleted_at" IS NULL AND "app"."leads"."status" IN ('new', 'contacted', 'follow_up', 'no_response');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leads_organization_created" ON "app"."leads" USING btree ("organization_id","created_at" DESC,"id") WHERE "app"."leads"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leads_organization_owner_created" ON "app"."leads" USING btree ("organization_id","owner_membership_id","created_at" DESC,"id") WHERE "app"."leads"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leads_organization_follow_up_at" ON "app"."leads" USING btree ("organization_id","follow_up_at","id") WHERE "app"."leads"."deleted_at" IS NULL AND "app"."leads"."follow_up_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leads_organization_held_until" ON "app"."leads" USING btree ("organization_id","held_until") WHERE "app"."leads"."deleted_at" IS NULL AND "app"."leads"."held_until" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leads_branch_id" ON "app"."leads" USING btree ("branch_id") WHERE "app"."leads"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leads_interests_gin" ON "app"."leads" USING gin ("interests") WHERE "app"."leads"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leads_contact_id" ON "app"."leads" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leads_deleted_at" ON "app"."leads" USING btree ("deleted_at") WHERE "app"."leads"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leads_created_by_user_id" ON "app"."leads" USING btree ("created_by_user_id") WHERE "app"."leads"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leads_updated_by_user_id" ON "app"."leads" USING btree ("updated_by_user_id") WHERE "app"."leads"."updated_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lead_involved_memberships_organization_id_membership_id" ON "app"."lead_involved_memberships" USING btree ("organization_id","membership_id","lead_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lead_involved_memberships_created_by_user_id" ON "app"."lead_involved_memberships" USING btree ("created_by_user_id") WHERE "app"."lead_involved_memberships"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE POLICY "leads_tenant_isolation" ON "app"."leads" AS PERMISSIVE FOR ALL TO public USING ("app"."leads"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )
          OR (current_setting('app.global_retention_cleanup', true) = 'true' AND current_user = 'clinozy_be_maintenance')) WITH CHECK ("app"."leads"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."leads" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TRIGGER trg_leads_lead_number BEFORE INSERT ON "app"."leads" FOR EACH ROW EXECUTE FUNCTION app.fn_assign_record_number('lead_number');--> statement-breakpoint
CREATE POLICY "lead_involved_memberships_tenant_isolation" ON "app"."lead_involved_memberships" AS PERMISSIVE FOR ALL TO public USING ("app"."lead_involved_memberships"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          )) WITH CHECK ("app"."lead_involved_memberships"."organization_id" = (
            SELECT id FROM tenancy.organizations
            WHERE public_id = current_setting('app.current_organization_public_id', true)
          ));--> statement-breakpoint
ALTER TABLE "app"."lead_involved_memberships" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- ── end of app records ──
GRANT USAGE ON SCHEMA auth, tenancy, billing, notify, audit, upload, app TO clinozy_be_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth, tenancy, billing, notify, audit, upload, app TO clinozy_be_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA auth, tenancy, billing, notify, audit, upload, app TO clinozy_be_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO clinozy_be_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA tenancy GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO clinozy_be_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA billing GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO clinozy_be_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA notify GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO clinozy_be_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA audit GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO clinozy_be_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA upload GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO clinozy_be_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO clinozy_be_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION billing.resolve_organization_public_id_for_stripe_subscription (TEXT) TO clinozy_be_app;
--> statement-breakpoint
ALTER TABLE tenancy.organizations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenancy.memberships FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenancy.membership_invitations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenancy.roles FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenancy.role_permissions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenancy.organization_settings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenancy.organization_notification_policies FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenancy.api_keys FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.branches FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.branch_members FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenancy.membership_additional_roles FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE billing.subscriptions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notify.webhooks FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notify.webhook_delivery_attempts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notify.notifications FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit.logs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE upload.uploads FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE auth.verification_tokens FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE auth.sessions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE auth.user_notification_preferences FORCE ROW LEVEL SECURITY;