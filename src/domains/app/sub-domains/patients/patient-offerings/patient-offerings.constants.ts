/** A bought offering's derived status (PK5): a session left and not expired, none left, past `valid_until`. */
export const PATIENT_OFFERING_STATUS = {
  ACTIVE: 'active',
  USED_UP: 'used_up',
  EXPIRED: 'expired',
} as const;

/** The derived statuses a list filters on. */
export const PATIENT_OFFERING_STATUS_VALUES = [
  PATIENT_OFFERING_STATUS.ACTIVE,
  PATIENT_OFFERING_STATUS.USED_UP,
  PATIENT_OFFERING_STATUS.EXPIRED,
] as const;

/** Most sessions one bought offering holds (packages up to 999 — TR8). */
export const PATIENT_OFFERING_SESSIONS_MAX = 999;
