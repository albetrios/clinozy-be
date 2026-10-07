/** Allowed values of `pending_credits.direction`. */
export const PENDING_CREDIT_DIRECTION_VALUES = ['give', 'take'] as const;

/** Allowed values of `pending_credits.party_kind`. */
export const PENDING_CREDIT_PARTY_KIND_VALUES = ['patient', 'supplier', 'staff', 'other'] as const;

/** Allowed values of `pending_credits.status`. */
export const PENDING_CREDIT_STATUS_VALUES = ['open', 'given_back', 'got_back', 'used'] as const;
