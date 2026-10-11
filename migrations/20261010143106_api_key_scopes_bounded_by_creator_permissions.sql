-- Migration: api_key_scopes_bounded_by_creator_permissions
-- Created: 2026-10-10T14:31:06.318Z
-- Reference: docs/reference/data/migrations.md
--
-- An API key's effective scopes are its stored scopes INTERSECTED with what its creator holds now.
--
-- Why: a key's scopes were checked against the creator's permissions only when it was created.
-- Demoting the creator (a role change, or a role losing a permission) left every key they had
-- created with its original scopes — a member demoted from Admin kept Admin authority through a
-- retained key. The resolver already refuses a key whose creator is no longer an active member
-- (20261003120000); it now also narrows the scopes to the creator's current role permissions, so
-- a demotion takes effect on the key's next request and a later promotion restores it. Keys with no
-- recorded creator (created_by_user_id IS NULL) keep their stored scopes. The creator's permissions
-- are those of every live role they hold — the main role and the additional roles (launch D5).
--
-- Same signature and return columns as 20261003120000; only the `scopes` column changes.
-- CREATE OR REPLACE keeps the function's grants (20261010135529).
CREATE OR REPLACE FUNCTION tenancy.resolve_api_key_for_authentication (
  key_prefix_param TEXT
) RETURNS TABLE (
  public_id TEXT,
  organization_id BIGINT,
  organization_public_id TEXT,
  key_hash TEXT,
  scopes JSONB,
  status TEXT,
  expires_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = tenancy, public
AS $$
  SELECT
    api_key_row.public_id::text AS public_id,
    api_key_row.organization_id AS organization_id,
    organization_row.public_id::text AS organization_public_id,
    api_key_row.key_hash::text AS key_hash,
    CASE
      WHEN api_key_row.created_by_user_id IS NULL THEN api_key_row.scopes
      ELSE COALESCE(
        (
          SELECT jsonb_agg(scope_element.scope_code ORDER BY scope_element.scope_code)
          FROM jsonb_array_elements_text(api_key_row.scopes) AS scope_element (scope_code)
          WHERE scope_element.scope_code IN (
            SELECT role_permission_row.permission_code
            FROM tenancy.memberships AS creator_membership_row
            INNER JOIN tenancy.roles AS role_row
              ON (
                role_row.id = creator_membership_row.role_id
                OR EXISTS (
                  SELECT 1
                  FROM tenancy.membership_additional_roles AS additional_role_row
                  WHERE additional_role_row.membership_id = creator_membership_row.id
                    AND additional_role_row.role_id = role_row.id
                )
              )
              AND role_row.deleted_at IS NULL
            INNER JOIN tenancy.role_permissions AS role_permission_row
              ON role_permission_row.role_id = role_row.id
            WHERE creator_membership_row.user_id = api_key_row.created_by_user_id
              AND creator_membership_row.organization_id = api_key_row.organization_id
              AND creator_membership_row.status = 'active'
              AND creator_membership_row.deleted_at IS NULL
          )
        ),
        '[]'::jsonb
      )
    END AS scopes,
    api_key_row.status::text AS status,
    api_key_row.expires_at AS expires_at
  FROM tenancy.api_keys AS api_key_row
  INNER JOIN tenancy.organizations AS organization_row
    ON organization_row.id = api_key_row.organization_id
  WHERE api_key_row.key_prefix = key_prefix_param
    AND api_key_row.status = 'ACTIVE'
    AND api_key_row.deleted_at IS NULL
    AND organization_row.deleted_at IS NULL
    AND (
      api_key_row.created_by_user_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM tenancy.memberships AS membership_row
        INNER JOIN auth.users AS user_row
          ON user_row.id = membership_row.user_id
        WHERE membership_row.user_id = api_key_row.created_by_user_id
          AND membership_row.organization_id = api_key_row.organization_id
          AND membership_row.status = 'active'
          AND membership_row.deleted_at IS NULL
          AND user_row.status = 'ACTIVE'
          AND user_row.deleted_at IS NULL
      )
    );
$$;
