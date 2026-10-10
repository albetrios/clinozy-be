import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  acceptMembershipInvitationDto,
  listMyMembershipInvitationsQueryDto,
  resendMembershipInvitationDto,
  type AcceptMembershipInvitationInput,
  type ListMyMembershipInvitationsQueryInput,
  type ResendMembershipInvitationInput,
} from './membership-invitation.dto.js';

/**
 * Validates a `POST /membership-invitations/:membership_invitation_id/accept` body against
 * {@link acceptMembershipInvitationDto}; a parsed `token` is then SHA-256 compared against the
 * stored `token_hash` by the service (none: the verified, matching email alone, launch D84 (2)).
 */
export function validateAcceptMembershipInvitation(data: unknown): AcceptMembershipInvitationInput {
  return parseWithSchema(acceptMembershipInvitationDto, data);
}

/**
 * Validates a `POST /organization/memberships/:membership_id/invitation/resend` body
 * against {@link resendMembershipInvitationDto}.
 */
export function validateResendMembershipInvitation(data: unknown): ResendMembershipInvitationInput {
  return parseWithSchema(resendMembershipInvitationDto, data);
}

/**
 * Validates a `GET /users/me/membership-invitations` query against
 * {@link listMyMembershipInvitationsQueryDto} (launch D84 (1)).
 */
export function validateListMyMembershipInvitationsQuery(
  data: unknown,
): ListMyMembershipInvitationsQueryInput {
  return parseWithSchema(listMyMembershipInvitationsQueryDto, data);
}
