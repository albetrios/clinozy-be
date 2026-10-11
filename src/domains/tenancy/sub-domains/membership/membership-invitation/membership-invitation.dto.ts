import { z } from 'zod';
import { cursorPaginationSchema } from '@/shared/utils/http/pagination.util.js';
import { recordIdSchema } from '@/shared/utils/validation/record-fields.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';

/**
 * Zod schema for the invitee-facing `/membership-invitations/:membership_invitation_id/accept` path
 * param (launch T9). Revoke and resend are addressed by the membership instead
 * (`/organization/memberships/:membership_id/invitation…`).
 */
export const membershipInvitationIdParamsDto = z
  .object({
    membership_invitation_id: recordIdSchema,
  })
  .strict();

/**
 * Zod schema for the `POST /membership-invitations/:membership_invitation_id/accept` request body —
 * the raw invitation token from the emailed link, SHA-256 compared against the stored `token_hash`.
 * Optional (launch D84 (2), ROUTE #173): the signed-in owner of the verified, matching email
 * accepts in the app without it; a token that is sent must still match.
 */
export const acceptMembershipInvitationDto = z
  .object({
    token: trimmedStringMinMax({ min: 1, max: 512 }).optional(),
  })
  .strict();

/**
 * Zod schema for the `GET /users/me/membership-invitations` query (launch D84 (1), ROUTE #172) —
 * cursor pagination only: the list is always the caller's own pending invitations, oldest first.
 */
export const listMyMembershipInvitationsQueryDto = cursorPaginationSchema.strict();

/**
 * Zod schema for the `POST /organization/memberships/:membership_id/invitation/resend`
 * request body. Regenerates the token and pushes the expiry by the supplied
 * number of days (1–365, default 7).
 */
export const resendMembershipInvitationDto = z
  .object({
    expires_in_days: z.number().int().min(1).max(365).optional().default(7),
  })
  .strict();

/** Validated body inferred from {@link acceptMembershipInvitationDto}. */
export type AcceptMembershipInvitationInput = z.infer<typeof acceptMembershipInvitationDto>;
/** Validated query inferred from {@link listMyMembershipInvitationsQueryDto}. */
export type ListMyMembershipInvitationsQueryInput = z.infer<
  typeof listMyMembershipInvitationsQueryDto
>;
/** Validated body inferred from {@link resendMembershipInvitationDto}. */
export type ResendMembershipInvitationInput = z.infer<typeof resendMembershipInvitationDto>;
