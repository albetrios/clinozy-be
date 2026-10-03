-- Organization-mandated MFA is enforced wherever organization authority is minted or used, not
-- only at first-factor login.
--
-- Why: MFA was decided once, while completing the first factor, from the user's ACTIVE memberships
-- at that moment. A user who logged in without MFA while a membership was still INVITED could
-- accept the invitation and switch the same session into an organization requiring MFA; refresh
-- and organization authorization never re-checked, and an organization turning MFA on left
-- existing sessions untouched.
--
-- 1) auth.sessions.mfa_verified_at — when this session last proved a second factor: set when the
--    session is created by the MFA login challenge, or when it completes MFA verification
--    (step-up) or MFA enrollment. NULL for a first-factor-only session (and every session that
--    predates this column). The access token mirrors it as the standard `amr` claim (RFC 8176).
ALTER TABLE auth.sessions ADD COLUMN IF NOT EXISTS mfa_verified_at TIMESTAMPTZ;--> statement-breakpoint

-- 2) tenancy.organization_requires_mfa — does this organization's security policy require MFA?
--    Read at organization switch, refresh and per-request organization authorization, before any
--    tenant GUC applies to the caller; tenancy.organization_settings / organizations are FORCE RLS,
--    so — like tenancy.user_has_organization_requiring_mfa — it is a SECURITY DEFINER resolver.
--    Strict JSON boolean true only (not the string "true"), matching the application's
--    `securityPolicy.mfa_required === true`.
CREATE OR REPLACE FUNCTION tenancy.organization_requires_mfa (
  organization_public_id_param TEXT
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = tenancy, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM tenancy.organization_settings AS settings_row
    INNER JOIN tenancy.organizations AS organization_row
      ON organization_row.id = settings_row.organization_id
    WHERE organization_row.public_id = organization_public_id_param
      AND organization_row.deleted_at IS NULL
      AND (settings_row.security_policy -> 'mfa_required') = 'true'::jsonb
  );
$$;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION tenancy.organization_requires_mfa (TEXT) TO clinozy_be_app;
