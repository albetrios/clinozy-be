-- Migration: api_key_auth_requires_active_organization_and_creator
-- Created: 2026-10-31T11:37:21.277Z
-- Reference: docs/reference/data/migrations.md
--
-- An API key authenticates only while its organization is ACTIVE and its creator is still an
-- active member of it.
--
-- Why (security findings B2-3, B2-8):
-- - A suspended or archived organization refused its members' permissions and organization
--   switches, but its API keys kept working: the resolver never read `organizations.status`.
-- - A key whose creator was hard-deleted (`created_by_user_id` set to NULL by the retention purge,
--   20261010152248) skipped both creator checks — the active-member gate and the scope
--   intersection — and kept every stored scope, unbounded and with no one answerable for it.
--   Every key the API mints has a creator (an API-key principal cannot mint one), so a NULL
--   creator only ever means the person is gone: such a key is now refused, like a key whose
--   creator left.
--
-- Same signature and return columns as 20261010143106; CREATE OR REPLACE keeps the function's
-- grants (20261010135529).
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
    COALESCE(
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
    ) AS scopes,
    api_key_row.status::text AS status,
    api_key_row.expires_at AS expires_at
  FROM tenancy.api_keys AS api_key_row
  INNER JOIN tenancy.organizations AS organization_row
    ON organization_row.id = api_key_row.organization_id
  WHERE api_key_row.key_prefix = key_prefix_param
    AND api_key_row.status = 'ACTIVE'
    AND api_key_row.deleted_at IS NULL
    AND organization_row.deleted_at IS NULL
    AND organization_row.status = 'ACTIVE'
    AND api_key_row.created_by_user_id IS NOT NULL
    AND EXISTS (
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
    );
$$;
