/**
 * A lead's statuses (L8): five open, four closed — `appointment_scheduled` set by the person's
 * bookings only, `clinic_visited` by check-in only, final.
 */
export const LEAD_STATUS = {
  NEW: 'new',
  CONTACTED: 'contacted',
  FOLLOW_UP: 'follow_up',
  APPOINTMENT_SCHEDULED: 'appointment_scheduled',
  NO_RESPONSE: 'no_response',
  NOT_INTERESTED: 'not_interested',
  INVALID: 'invalid',
  LOST: 'lost',
  CLINIC_VISITED: 'clinic_visited',
} as const;

/** Allowed values of `leads.status`. */
export const LEAD_STATUS_VALUES = [
  LEAD_STATUS.NEW,
  LEAD_STATUS.CONTACTED,
  LEAD_STATUS.FOLLOW_UP,
  LEAD_STATUS.APPOINTMENT_SCHEDULED,
  LEAD_STATUS.NO_RESPONSE,
  LEAD_STATUS.NOT_INTERESTED,
  LEAD_STATUS.INVALID,
  LEAD_STATUS.LOST,
  LEAD_STATUS.CLINIC_VISITED,
] as const;

/** The open statuses — one open lead per contact (L6); claim and release work on these only (L9). */
export const LEAD_OPEN_STATUS_VALUES = [
  LEAD_STATUS.NEW,
  LEAD_STATUS.CONTACTED,
  LEAD_STATUS.FOLLOW_UP,
  LEAD_STATUS.APPOINTMENT_SCHEDULED,
  LEAD_STATUS.NO_RESPONSE,
] as const;

/**
 * The closing statuses a lead with a live booking may still take by hand (L11): the person said
 * no — the booking stays until the team cancels it. Every other move out of
 * `appointment_scheduled` is the booking's.
 */
export const LEAD_BOOKED_CLOSING_STATUS_VALUES = [
  LEAD_STATUS.NOT_INTERESTED,
  LEAD_STATUS.INVALID,
  LEAD_STATUS.LOST,
] as const;

/** Allowed values of `leads.source`. */
export const LEAD_SOURCE_VALUES = [
  'instagram',
  'google',
  'whatsapp',
  'facebook',
  'walk_in',
  'referral',
  'retarget',
] as const;

/** Allowed values of `leads.interests` (up to all six). */
export const LEAD_INTERESTS_VALUES = [
  'clinical',
  'peel',
  'lhr',
  'hydrafacial',
  'prp',
  'others',
] as const;

/** Allowed values of `leads.kind` — server-set (L5). */
export const LEAD_KIND_VALUES = ['enquiry', 'retarget'] as const;

/** The list's `ownership` filter (L7): not held (open to claim), held, held until a time today. */
export const LEAD_OWNERSHIP = {
  OPEN: 'open',
  HELD: 'held',
  RELEASING_TODAY: 'releasing_today',
} as const;

/** Allowed values of the list's `ownership` filter. */
export const LEAD_OWNERSHIP_VALUES = [
  LEAD_OWNERSHIP.OPEN,
  LEAD_OWNERSHIP.HELD,
  LEAD_OWNERSHIP.RELEASING_TODAY,
] as const;

/** Most team members involved in one lead. */
export const LEAD_INVOLVED_MEMBERSHIPS_MAX = 10;
/** The longest lead notes. */
export const LEAD_NOTES_MAX = 2000;

/** The design's label of each interest (`schema-routes.md` › lead_interest) — a message's `<interest>` (M9). */
export const LEAD_INTEREST_LABELS: Readonly<
  Record<(typeof LEAD_INTERESTS_VALUES)[number], string>
> = {
  clinical: 'Clinical',
  peel: 'Peel',
  lhr: 'LHR',
  hydrafacial: 'Hydrafacial',
  prp: 'PRP',
  others: 'Others',
};
