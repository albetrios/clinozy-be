-- Migration: membership_invitations_for_the_invitee
-- Created: 2026-10-10T20:44:37.767Z
-- Reference: docs/reference/data/migrations.md
--
-- Launch D84, ROUTE #172–#175: an invited person who signs in sees their invitations, accepts
-- without the emailed link, declines, and an invite left 7 days past its expiry frees its seat.
--
-- 1. Two new reasons a membership ends: `declined` (the invitee declined, #174) and
--    `invitation_expired` (the expiry sweep, #175). Widening the CHECK: drop, re-add NOT VALID,
--    then validate without blocking writers.
-- 2. `tenancy.list_pending_membership_invitations_for_email` — the cross-organization read of one
--    email's pending invitations (SECURITY DEFINER: the invitee is not a member of the inviting
--    organization yet, so its row-level security hides every row) — also answers what the
--    invitee is shown (#172): the organization's name, slug and logo, the role names (the main
--    role first, then the additional roles in their order) and who invited them (their name in
--    that organization, else their profile name), and only the latest invitation of a membership
--    that is still `invited` (a member removed and invited again keeps the earlier row). The cursor arm leaves out the boundary row by id, as the shared keyset helper
--    does: the cursor carries milliseconds and Postgres keeps microseconds, so `created_at >
--    cursor` alone answered the last row of a page again. The return type changes, so the
--    function is dropped and created again. It stays owned by the migration role, like every
--    resolver (docs/reference/security/rls-architecture.md — SECURITY DEFINER nuance).

ALTER TABLE tenancy.memberships
  DROP CONSTRAINT IF EXISTS chk_memberships_delete_reason;
--> statement-breakpoint

ALTER TABLE tenancy.memberships
  ADD CONSTRAINT chk_memberships_delete_reason
  CHECK (delete_reason IN ('mistake', 'duplicate', 'not_needed', 'other', 'left', 'account_deleted', 'declined', 'invitation_expired'))
  NOT VALID;
--> statement-breakpoint

ALTER TABLE tenancy.memberships
  VALIDATE CONSTRAINT chk_memberships_delete_reason;
--> statement-breakpoint

DROP FUNCTION IF EXISTS tenancy.list_pending_membership_invitations_for_email (TEXT, INTEGER, TIMESTAMPTZ, BIGINT);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION tenancy.list_pending_membership_invitations_for_email (
  email_param TEXT,
  limit_param INTEGER DEFAULT 100,
  after_created_at_param TIMESTAMPTZ DEFAULT NULL,
  after_id_param BIGINT DEFAULT NULL
) RETURNS TABLE (
  invitation_id BIGINT,
  invitation_public_id TEXT,
  organization_public_id TEXT,
  organization_id BIGINT,
  organization_name TEXT,
  organization_slug TEXT,
  organization_logo_url TEXT,
  membership_public_id TEXT,
  membership_id BIGINT,
  role_names TEXT[],
  inviter_name TEXT,
  invitation_email TEXT,
  invitation_expires_at TIMESTAMPTZ,
  invitation_created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = tenancy, public
AS $$
  SELECT
    invitation_row.id AS invitation_id,
    invitation_row.public_id::text AS invitation_public_id,
    organization_row.public_id::text AS organization_public_id,
    organization_row.id AS organization_id,
    organization_row.name::text AS organization_name,
    organization_row.slug::text AS organization_slug,
    organization_row.logo_url::text AS organization_logo_url,
    membership_row.public_id::text AS membership_public_id,
    membership_row.id AS membership_id,
    ARRAY(
      SELECT role_names.name
      FROM (
        SELECT main_role.name::text AS name, 0 AS position
        FROM tenancy.roles AS main_role
        WHERE main_role.id = membership_row.role_id
          AND main_role.deleted_at IS NULL
        UNION ALL
        SELECT additional_role.name::text AS name, additional_role_row.position AS position
        FROM tenancy.membership_additional_roles AS additional_role_row
        INNER JOIN tenancy.roles AS additional_role ON additional_role.id = additional_role_row.role_id
        WHERE additional_role_row.membership_id = membership_row.id
          AND additional_role.deleted_at IS NULL
      ) AS role_names
      ORDER BY role_names.position ASC
    ) AS role_names,
    COALESCE(
      NULLIF(btrim(inviter_membership.display_name), ''),
      NULLIF(btrim(concat_ws(' ', inviter_user.first_name, inviter_user.last_name)), '')
    ) AS inviter_name,
    invitation_row.email AS invitation_email,
    invitation_row.expires_at AS invitation_expires_at,
    invitation_row.created_at AS invitation_created_at
  FROM tenancy.membership_invitations AS invitation_row
  INNER JOIN tenancy.memberships AS membership_row ON membership_row.id = invitation_row.membership_id
  INNER JOIN tenancy.organizations AS organization_row ON organization_row.id = membership_row.organization_id
  LEFT JOIN auth.users AS inviter_user
    ON inviter_user.id = invitation_row.invited_by_user_id
  LEFT JOIN tenancy.memberships AS inviter_membership
    ON inviter_membership.user_id = invitation_row.invited_by_user_id
    AND inviter_membership.organization_id = organization_row.id
    AND inviter_membership.deleted_at IS NULL
  WHERE invitation_row.email = email_param
    AND invitation_row.accepted_at IS NULL
    AND invitation_row.revoked_at IS NULL
    AND invitation_row.expires_at > NOW()
    AND membership_row.deleted_at IS NULL
    AND membership_row.status = 'invited'
    AND NOT EXISTS (
      SELECT 1
      FROM tenancy.membership_invitations AS newer_invitation
      WHERE newer_invitation.membership_id = invitation_row.membership_id
        AND (newer_invitation.created_at, newer_invitation.id)
          > (invitation_row.created_at, invitation_row.id)
    )
    AND organization_row.deleted_at IS NULL
    AND (
      after_created_at_param IS NULL
      OR (
        invitation_row.created_at > after_created_at_param
        AND invitation_row.id <> after_id_param
      )
      OR (
        invitation_row.created_at = after_created_at_param
        AND invitation_row.id > after_id_param
      )
    )
  ORDER BY invitation_row.created_at ASC, invitation_row.id ASC
  LIMIT limit_param;
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION tenancy.list_pending_membership_invitations_for_email (TEXT, INTEGER, TIMESTAMPTZ, BIGINT) TO clinozy_be_app, clinozy_be_maintenance;
