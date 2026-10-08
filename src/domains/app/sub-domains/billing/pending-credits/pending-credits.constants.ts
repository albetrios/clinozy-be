/** Who owes whom (B23): the clinic gives back, or takes back. */
export const PENDING_CREDIT_DIRECTION = {
  GIVE: 'give',
  TAKE: 'take',
} as const;

/** Allowed values of `pending_credits.direction`. */
export const PENDING_CREDIT_DIRECTION_VALUES = [
  PENDING_CREDIT_DIRECTION.GIVE,
  PENDING_CREDIT_DIRECTION.TAKE,
] as const;

/** A pending credit's status (B23): open until settled in full, then how its last part went. */
export const PENDING_CREDIT_STATUS = {
  OPEN: 'open',
  GIVEN_BACK: 'given_back',
  GOT_BACK: 'got_back',
  USED: 'used',
} as const;

/** Allowed values of `pending_credits.status`. */
export const PENDING_CREDIT_STATUS_VALUES = [
  PENDING_CREDIT_STATUS.OPEN,
  PENDING_CREDIT_STATUS.GIVEN_BACK,
  PENDING_CREDIT_STATUS.GOT_BACK,
  PENDING_CREDIT_STATUS.USED,
] as const;

/** How a part is settled (B24): money moves, or it is used on one of the party's bills. */
export const PENDING_CREDIT_SETTLE_METHOD = {
  MONEY: 'money',
  USE_ON_BILL: 'use_on_bill',
} as const;

/** Allowed settle methods. */
export const PENDING_CREDIT_SETTLE_METHOD_VALUES = [
  PENDING_CREDIT_SETTLE_METHOD.MONEY,
  PENDING_CREDIT_SETTLE_METHOD.USE_ON_BILL,
] as const;

/** A pending credit's display prefix (`CR-2`) — also read by the list's `q`. */
export const PENDING_CREDIT_NUMBER_PREFIX = 'CR';

/** The longest note. */
export const PENDING_CREDIT_NOTE_MAX = 300;
