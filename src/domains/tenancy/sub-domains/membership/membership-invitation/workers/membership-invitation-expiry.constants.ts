/** BullMQ queue that ends invited memberships whose invitation expired long ago (launch D84 (4)). */
export const MEMBERSHIP_INVITATION_EXPIRY_QUEUE_NAME = 'membership-invitation-expiry';

/**
 * Days an expired invitation keeps its seat before the sweep ends the invited membership (launch
 * D84 (4)): long enough for an admin to resend it (T11), short enough that a forgotten invite does
 * not hold a paid seat for good.
 */
export const MEMBERSHIP_INVITATION_SEAT_RELEASE_DAYS = 7;

/** Most invited memberships one tick ends (oldest expiry first); the next tick takes the rest. */
export const MEMBERSHIP_INVITATION_EXPIRY_BATCH = 100;
