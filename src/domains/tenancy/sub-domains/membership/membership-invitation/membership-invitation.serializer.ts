import type { MembershipInvitationRef } from '@/domains/tenancy/sub-domains/membership/membership.types.js';
import type { MembershipInvitationOutput } from './membership-invitation.types.js';

/**
 * Shapes a `membership_invitations` row into the HTTP response form. Substitutes
 * the external membership public id for the internal numeric `membership_id`
 * and converts timestamps to ISO-8601; the raw `token_hash` is never exposed.
 */
export function serializeMembershipInvitation(
  row: {
    public_id: string;
    membership_id: number;
    email: string;
    expires_at: Date;
    accepted_at: Date | null;
    revoked_at: Date | null;
    created_at: Date;
  },
  membership_public_id: string,
): MembershipInvitationOutput {
  return {
    id: row.public_id,
    membership_id: membership_public_id,
    email: row.email,
    expires_at: row.expires_at.toISOString(),
    accepted_at: row.accepted_at?.toISOString() ?? null,
    revoked_at: row.revoked_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
  };
}

/**
 * Carries an issued invitation's dev-only `debug_invitation_token` (launch ROUTE #164) onto the
 * membership answer's embedded `invitation` ref, so the add-member answer echoes the accept token
 * the same way the resend answer does. Returns the membership unchanged when the issued invitation
 * carries no echo (the flag is off) or the membership has no live invitation.
 */
export function attachInvitationTokenEcho<
  TMembership extends { invitation: MembershipInvitationRef | null },
>(
  membership: TMembership,
  issued: Pick<MembershipInvitationOutput, 'debug_invitation_token'>,
): TMembership {
  if (issued.debug_invitation_token === undefined || membership.invitation === null) {
    return membership;
  }
  return {
    ...membership,
    invitation: { ...membership.invitation, debug_invitation_token: issued.debug_invitation_token },
  };
}
