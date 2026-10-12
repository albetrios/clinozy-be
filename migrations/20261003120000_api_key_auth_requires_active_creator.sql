-- An organization API key authenticates only while its creator still belongs to the
-- organization: the creator's membership there is ACTIVE and the creator's account is ACTIVE
-- and not deleted. Keys with no recorded creator (created_by_user_id IS NULL) are unaffected.
--
-- Why: suspending a member updated the membership and the member's permission cache but left
-- every key the member had created ACTIVE. Key authentication checked only the key's own status,
-- deletion state, hash and expiry, and key authorization uses the key's stored scopes — so a
-- suspended member kept scoped access through a retained key, and a key holding
-- membership:update could PATCH the member's own membership back to ACTIVE. Member deletion and
-- leaving already revoke the creator's keys; suspension is reversible, so instead of revoking,
-- the resolver refuses the key for as long as the creator is not an active member — covering
-- the single PATCH, bulk suspension and a suspended or deleted user account alike, and letting
-- the keys work again if an administrator reactivates the member.
--
-- Same signature and return columns as 20260530000003; only the WHERE clause grows.
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
    api_key_row.scopes AS scopes,
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
$$;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION tenancy.resolve_api_key_for_authentication (TEXT) TO clinozy_be_app;
