-- Migration: user_bug_reports
-- Created: 2026-10-13T17:27:50.255Z
-- Reference: docs/reference/data/migrations.md
--
-- feat-bug-report-2026-10-13-dgnx (BR3 – BR10): the frontend's own "Report a bug" (a textbox with a
-- native voice button) replaces Sentry's feedback widget, and every report is kept here — what the
-- person wrote, how (typed / voice / mixed), where they were, which release, and WHO: user_id,
-- reporter_name and reporter_email are stamped by the service from the verified session's account,
-- never from the request body.
--
-- A new, empty table: the foreign key, the CHECKs and the index are created with it, inside this
-- file's transaction — nothing to lock against, nothing to validate.
-- migration-safety: allow create_index_without_concurrently reason="new empty table created in this file"
--
-- Row-level security: ENABLE + FORCE, one owner policy on app.current_user_public_id (USING and
-- WITH CHECK), no bypass arm — nobody reads another person's reports through the app role (BR8).
-- organization_public_id is a snapshot of the token's org claim, deliberately without a foreign
-- key (a deleted workspace leaves the report, BR10); user_id cascades with the account.

CREATE TABLE IF NOT EXISTS auth.user_bug_reports (
  id BIGSERIAL PRIMARY KEY,
  public_id VARCHAR(28) NOT NULL,
  user_id BIGINT NOT NULL,
  reporter_name VARCHAR(201),
  reporter_email VARCHAR(255) NOT NULL,
  organization_public_id VARCHAR(28),
  description TEXT NOT NULL,
  input_method VARCHAR(10) NOT NULL,
  page_path VARCHAR(2048),
  app_version VARCHAR(64),
  user_agent VARCHAR(512),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_bug_reports_public_id_unique UNIQUE (public_id),
  CONSTRAINT user_bug_reports_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT chk_user_bug_reports_description CHECK (char_length(btrim(description)) BETWEEN 1 AND 5000),
  CONSTRAINT chk_user_bug_reports_input_method CHECK (input_method IN ('typed', 'voice', 'mixed'))
);

CREATE INDEX IF NOT EXISTS idx_user_bug_reports_user_id ON auth.user_bug_reports USING btree (user_id);

ALTER TABLE auth.user_bug_reports OWNER TO clinozy_be_owner;

GRANT SELECT, INSERT, UPDATE, DELETE ON auth.user_bug_reports TO clinozy_be_app, clinozy_be_maintenance;
GRANT USAGE, SELECT ON SEQUENCE auth.user_bug_reports_id_seq TO clinozy_be_app, clinozy_be_maintenance;

ALTER TABLE auth.user_bug_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.user_bug_reports FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_bug_reports_owner_access ON auth.user_bug_reports;
CREATE POLICY user_bug_reports_owner_access ON auth.user_bug_reports
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (
    user_id = (
      SELECT users.id FROM auth.users
      WHERE users.public_id = (SELECT current_setting('app.current_user_public_id', true))
        AND users.deleted_at IS NULL
    )
  )
  WITH CHECK (
    user_id = (
      SELECT users.id FROM auth.users
      WHERE users.public_id = (SELECT current_setting('app.current_user_public_id', true))
        AND users.deleted_at IS NULL
    )
  );
