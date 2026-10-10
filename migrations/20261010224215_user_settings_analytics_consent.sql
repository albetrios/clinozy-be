-- Migration: user_settings_analytics_consent
-- Created: 2026-10-10T22:42:15.242Z
-- Reference: docs/reference/data/migrations.md
--
-- Launch D85, ROUTE #176: a person's analytics consent is theirs, not the browser's. The frontend
-- applies the saved decision at sign-in, clears the device's at sign-out, and re-asks when the
-- policy version moves or the decision is six months old; the server keeps the latest decision,
-- the policy version it answered and when, as the proof of consent the DPDP Act asks for (each
-- change is also an audit row, `user.settings.analytics_consent.update`).
--
-- Three nullable columns on `auth.user_settings` — null until the person first answers — set
-- together or not at all. The CHECKs are added NOT VALID and validated after, so the table is
-- never locked against writers for a scan.

ALTER TABLE auth.user_settings
  ADD COLUMN IF NOT EXISTS analytics_consent VARCHAR(10) NULL,
  ADD COLUMN IF NOT EXISTS analytics_consent_version INTEGER NULL,
  ADD COLUMN IF NOT EXISTS analytics_consent_at TIMESTAMPTZ NULL;
--> statement-breakpoint

ALTER TABLE auth.user_settings
  DROP CONSTRAINT IF EXISTS chk_user_settings_analytics_consent;
--> statement-breakpoint

ALTER TABLE auth.user_settings
  ADD CONSTRAINT chk_user_settings_analytics_consent
  CHECK (
    (analytics_consent IS NULL AND analytics_consent_version IS NULL AND analytics_consent_at IS NULL)
    OR (
      analytics_consent IN ('granted', 'denied')
      AND analytics_consent_version > 0
      AND analytics_consent_at IS NOT NULL
    )
  )
  NOT VALID;
--> statement-breakpoint

ALTER TABLE auth.user_settings
  VALIDATE CONSTRAINT chk_user_settings_analytics_consent;
