-- Migration: grant_patient_review_codes
-- Created: 2026-10-10T13:30:07.117Z
-- Reference: docs/reference/data/migrations.md
--
-- Launch D83 (4), ROUTE #169: a patient's review writes (log, change, delete, restore, log an
-- action — `/app/patients/{patient_id}/reviews…`) leave `patient:update` for their own codes,
-- `patient_review:create` · `update` · `delete`, so Marketing logs reviews without changing the
-- patient file. So that no clinic loses review logging, every existing role holding
-- `patient:update` gains the three codes, and so does every API key scoped to it. New
-- organizations get them from the role presets at provisioning; no other code moves.
--
-- The catalogue rows are inserted here too: a deploy migrates before it runs the reference seed,
-- and the grants' foreign key needs them (the seed's ON CONFLICT DO NOTHING keeps the two in step).
--
-- FORCE ROW LEVEL SECURITY binds the migrator (a member of the tables' owner), so each table the
-- data statements read or write is lifted to NO FORCE first and forced again before the end, in
-- this one transaction (`force_rls_data_migration_without_owner_bracket`).

ALTER TABLE tenancy.permissions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE tenancy.role_permissions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE tenancy.api_keys NO FORCE ROW LEVEL SECURITY;

INSERT INTO tenancy.permissions (code, name, category)
VALUES
  ('patient_review:create', 'Log Reviews', 'patients'),
  ('patient_review:update', 'Update Reviews', 'patients'),
  ('patient_review:delete', 'Delete Reviews', 'patients')
ON CONFLICT (code) DO NOTHING;

INSERT INTO tenancy.role_permissions (role_id, permission_code)
SELECT holder.role_id, review.code
FROM tenancy.role_permissions AS holder
CROSS JOIN (
  VALUES ('patient_review:create'), ('patient_review:update'), ('patient_review:delete')
) AS review (code)
WHERE holder.permission_code = 'patient:update'
ON CONFLICT (role_id, permission_code) DO NOTHING;

UPDATE tenancy.api_keys
SET scopes = tenancy.api_keys.scopes || (
  SELECT coalesce(jsonb_agg(review.code), '[]'::jsonb)
  FROM (
    VALUES ('patient_review:create'), ('patient_review:update'), ('patient_review:delete')
  ) AS review (code)
  WHERE NOT tenancy.api_keys.scopes @> jsonb_build_array(review.code)
)
WHERE tenancy.api_keys.scopes @> '["patient:update"]'::jsonb;

ALTER TABLE tenancy.permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE tenancy.role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE tenancy.api_keys FORCE ROW LEVEL SECURITY;
