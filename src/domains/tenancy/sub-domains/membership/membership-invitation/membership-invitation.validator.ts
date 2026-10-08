import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  acceptMembershipInvitationDto,
  resendMembershipInvitationDto,
  type AcceptMembershipInvitationInput,
  type ResendMembershipInvitationInput,
} from './membership-invitation.dto.js';

/**
 * Validates a `POST /invitations/:invitation_id/accept` body against
 * {@link acceptMembershipInvitationDto}; the parsed `token` is then SHA-256
 * compared against the stored `token_hash` by the service.
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
