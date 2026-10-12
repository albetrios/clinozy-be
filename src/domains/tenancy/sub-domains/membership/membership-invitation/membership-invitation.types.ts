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

/**
 * One of the signed-in person's pending invitations, as the cross-organization SECURITY DEFINER
 * read `tenancy.list_pending_membership_invitations_for_email` answers it (launch D84 (1)) —
 * internal ids included, for the cursor; never serialized as is.
 */
export interface PendingInvitationForEmailRow {
  invitation_id: number;
  invitation_public_id: string;
  organization_public_id: string;
  organization_name: string;
  organization_slug: string | null;
  /** The stored logo — an object-storage key or an absolute URL; presigned before it leaves. */
  organization_logo_url: string | null;
  membership_public_id: string;
  role_names: string[];
  inviter_name: string | null;
  expires_at: Date;
  created_at: Date;
}

/**
 * `GET /users/me/membership-invitations` item (launch D84 (1), ROUTE #172): what the invitee is
 * shown before accepting or declining — the clinic, the roles they would hold and who invited them.
 */
export interface MyMembershipInvitationOutput {
  id: string;
  organization: {
    id: string;
    name: string;
    slug: string | null;
    logo_url: string | null;
  };
  /** The roles the membership holds — the main role first, then the additional ones in order. */
  role_names: string[];
  /** The inviter's name in that organization (else their profile name); `null` when neither is known. */
  inviter_name: string | null;
  expires_at: string;
  created_at: string;
}
