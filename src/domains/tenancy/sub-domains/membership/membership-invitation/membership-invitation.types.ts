/**
 * Raw `tenancy.membership_invitations` row as returned by Drizzle. Contains the
 * SHA-256 `token_hash` and internal numeric ids — never serialize this shape
 * directly to API consumers.
 */
export interface MembershipInvitationRow {
  id: number;
  public_id: string;
  membership_id: number;
  email: string;
  token_hash: string;
  invited_by_user_id: number;
  expires_at: Date;
  accepted_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
}

/**
 * Public HTTP response shape for a membership invitation. `id` and `membership_id`
 * are external public ids; timestamps are ISO-8601. No token material leaves
 * the service through this shape — except the dev-only `debug_invitation_token`.
 */
export interface MembershipInvitationOutput {
  id: string;
  membership_id: string;
  email: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
  /**
   * The raw accept token, on the issue and resend answers only, and only when
   * `MEMBERSHIP_INVITATION_TOKEN_ECHO_ENABLED` is on — which the env schema refuses outside the
   * `local` and `development` targets (launch ROUTE #164, D82).
   */
  debug_invitation_token?: string;
}

/**
 * Response shape for `POST /tenancy/membership-invitations/{membership_invitation_id}/accept`: the
 * accepted invitation plus the public id of the organization the caller just
 * joined, so the client can `POST /auth/switch-to-organization` into it without
 * a separate lookup (the accept response is the only place that id surfaces).
 */
export interface AcceptMembershipInvitationOutput extends MembershipInvitationOutput {
  organization_id: string;
}
