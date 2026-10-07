/**
 * A user's status in the app's user menu (`auth.users.presence`) — the single source of
 * truth for the `chk_users_presence` CHECK and the presence DTO.
 *
 * @remarks
 * - **Algorithm:** the object literal is the authority; {@link USER_PRESENCE_VALUES} derives the list
 *   the CHECK and the DTO enum are built from.
 * - **Notes:** one status per user, the same in every organization (launch C8); the lowercase values
 *   are the drop's (`schema-routes.md` › Enum presence).
 */
export const USER_PRESENCE = {
  ONLINE: 'online',
  BUSY: 'busy',
  AWAY: 'away',
} as const;

/** Literal union of {@link USER_PRESENCE} values. */
export type UserPresence = (typeof USER_PRESENCE)[keyof typeof USER_PRESENCE];

/** All presence values, used to derive the CHECK and the DTO enum. */
export const USER_PRESENCE_VALUES = Object.values(USER_PRESENCE) as UserPresence[];
