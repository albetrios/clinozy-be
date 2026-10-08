/** Allowed values of `appointments.type` (`package_session` is a label — A12). */
export const APPOINTMENT_TYPE_VALUES = [
  'consultation',
  'follow_up',
  'treatment',
  'package_session',
  'other',
] as const;

/** An appointment's statuses (A5). */
export const APPOINTMENT_STATUS = {
  SCHEDULED: 'scheduled',
  CONFIRMED: 'confirmed',
  CHECKED_IN: 'checked_in',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no_show',
} as const;

/** Allowed values of `appointments.status`. */
export const APPOINTMENT_STATUS_VALUES = [
  APPOINTMENT_STATUS.SCHEDULED,
  APPOINTMENT_STATUS.CONFIRMED,
  APPOINTMENT_STATUS.CHECKED_IN,
  APPOINTMENT_STATUS.COMPLETED,
  APPOINTMENT_STATUS.CANCELLED,
  APPOINTMENT_STATUS.NO_SHOW,
] as const;

/** The statuses that hold their slot — the exclusion constraints' (A3); cancelled and no-show free it. */
export const APPOINTMENT_SLOT_HOLDING_STATUS_VALUES = [
  APPOINTMENT_STATUS.SCHEDULED,
  APPOINTMENT_STATUS.CONFIRMED,
  APPOINTMENT_STATUS.CHECKED_IN,
  APPOINTMENT_STATUS.COMPLETED,
] as const;

/** The statuses whose date, time, length, place or people may still change. */
export const APPOINTMENT_MOVABLE_STATUS_VALUES = [
  APPOINTMENT_STATUS.SCHEDULED,
  APPOINTMENT_STATUS.CONFIRMED,
] as const;

/** The floor stages while checked in, in their order — moves go forward only (A10, A11). */
export const APPOINTMENT_VISIT_STAGE_VALUES = [
  'waiting',
  'with_doctor',
  'treatment',
  'checkout',
  'pharmacy',
] as const;

/** Allowed values of `appointments.cancel_reason`. */
export const APPOINTMENT_CANCEL_REASON_VALUES = [
  'patient_asked',
  'unreachable',
  'doctor_unavailable',
  'resource_unavailable',
  'rescheduling_later',
  'booked_by_mistake',
  'other',
] as const;

/** Allowed values of `appointments.reminder_status` (the messaging worker's, A13). */
export const APPOINTMENT_REMINDER_STATUS_VALUES = [
  'not_sent',
  'confirm_requested',
  'reminder_queued',
  'reminder_sent',
  'failed',
] as const;

/** The shortest booking (minutes). */
export const APPOINTMENT_DURATION_MIN = 5;
/** The longest booking (minutes). */
export const APPOINTMENT_DURATION_MAX = 240;
/** The grid a booking's length keeps — a multiple of 5 minutes (A13). */
export const APPOINTMENT_DURATION_STEP = 5;
/** A booking's length when none is sent. */
export const APPOINTMENT_DEFAULT_DURATION = 30;
/** The longest appointment notes. */
export const APPOINTMENT_NOTES_MAX = 2000;
/** The longest range `daily-counts` answers (two months of a calendar). */
export const APPOINTMENT_DAILY_COUNTS_MAX_DAYS = 62;

/** The resource each exclusion constraint guards — a `slot_taken` names it (A3). */
export const APPOINTMENT_SLOT_CONSTRAINTS = {
  excl_appointments_doctor_time: 'doctor',
  excl_appointments_room_time: 'room',
  excl_appointments_machine_time: 'machine',
} as const;
