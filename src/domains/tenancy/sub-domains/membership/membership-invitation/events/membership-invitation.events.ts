/**
 * Domain event codes emitted by {@link MembershipInvitationService} when an
 * invitation is created or resent. Consumed by the invitation email handler
 * which records an outbox row and dispatches the mail job on commit.
 */
export const MEMBERSHIP_INVITATION_EVENT = {
  CREATED: 'tenancy.membership_invitation.created',
  RESENT: 'tenancy.membership_invitation.resent',
  ACCEPTED: 'tenancy.membership_invitation.accepted',
} as const;

/** Union of literal event codes defined by {@link MEMBERSHIP_INVITATION_EVENT}. */
export type MembershipInvitationEventType =
  (typeof MEMBERSHIP_INVITATION_EVENT)[keyof typeof MEMBERSHIP_INVITATION_EVENT];

/**
 * Payload carried by {@link MEMBERSHIP_INVITATION_EVENT} `CREATED` and `RESENT`.
 * `token` is the raw (un-hashed) invitation token — it is only ever delivered
 * to the invitee via email and never persisted in plaintext.
 */
export interface MembershipInvitationEmailPayload {
  email: string;
  organization_name: string;
  inviter_name: string;
  token: string;
  invitation_public_id: string;
  expires_in_days: number;
}

/**
 * Payload carried by {@link MEMBERSHIP_INVITATION_EVENT} `ACCEPTED`. Recipients are resolved by the
 * tenancy accept path (all `membership:create` holders, minus the invitee) so the notify handler
 * only fans out `createAndDispatchNotification` and never runs a cross-domain permission query.
 */
export interface MembershipInvitationAcceptedPayload {
  /** Internal user ids to notify — the organization's `membership:create` holders, excluding the invitee. */
  recipient_user_ids: number[];
  /** Internal id of the organization the invitee joined (the notification's `organization_id`). */
  organization_id: number;
  /** Display name of the organization, for the notification copy. */
  organization_name: string;
  /** Display name (or email) of the invitee who accepted, for the notification copy. */
  invitee_name: string;
}
