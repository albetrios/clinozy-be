/**
 * Membership resource events — emitted by {@link MembershipService} with the membership's public
 * JSON and delivered to the organization's subscribed webhooks by the notify domain.
 */
export const MEMBERSHIP_EVENT = {
  CREATED: 'membership.created',
  UPDATED: 'membership.updated',
  DELETED: 'membership.deleted',
} as const;

/** Union of literal event codes defined by {@link MEMBERSHIP_EVENT}. */
export type MembershipEventType = (typeof MEMBERSHIP_EVENT)[keyof typeof MEMBERSHIP_EVENT];
