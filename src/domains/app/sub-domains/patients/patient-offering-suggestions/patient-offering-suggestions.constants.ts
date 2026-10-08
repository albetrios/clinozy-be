/** A plan row's status (PK7) — moved freely by the team; `accepted` when an invoice line names it. */
export const PATIENT_OFFERING_SUGGESTION_STATUS = {
  PLANNED: 'planned',
  ACCEPTED: 'accepted',
  NEXT_TIME: 'next_time',
  DECLINED: 'declined',
} as const;

/** Allowed values of `patient_offering_suggestions.status`. */
export const PATIENT_OFFERING_SUGGESTION_STATUS_VALUES = [
  PATIENT_OFFERING_SUGGESTION_STATUS.PLANNED,
  PATIENT_OFFERING_SUGGESTION_STATUS.ACCEPTED,
  PATIENT_OFFERING_SUGGESTION_STATUS.NEXT_TIME,
  PATIENT_OFFERING_SUGGESTION_STATUS.DECLINED,
] as const;

/** The statuses that hold an offering in the plan — a second row for it is a duplicate (PK9, TR10). */
export const PATIENT_OFFERING_SUGGESTION_HELD_STATUS_VALUES = [
  PATIENT_OFFERING_SUGGESTION_STATUS.PLANNED,
  PATIENT_OFFERING_SUGGESTION_STATUS.NEXT_TIME,
  PATIENT_OFFERING_SUGGESTION_STATUS.ACCEPTED,
] as const;

/** The statuses the plan's total counts (PK9 — the card's total). */
export const PATIENT_OFFERING_SUGGESTION_TOTAL_STATUS_VALUES = [
  PATIENT_OFFERING_SUGGESTION_STATUS.PLANNED,
  PATIENT_OFFERING_SUGGESTION_STATUS.ACCEPTED,
] as const;

/** Most of one offering on a plan row. */
export const PATIENT_OFFERING_SUGGESTION_QUANTITY_MAX = 99;

/** The longest "why". */
export const PATIENT_OFFERING_SUGGESTION_REASON_MAX = 200;
