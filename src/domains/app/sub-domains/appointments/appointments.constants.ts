/** Allowed values of `appointments.type`. */
export const APPOINTMENT_TYPE_VALUES = [
  'consultation',
  'follow_up',
  'treatment',
  'package_session',
  'other',
] as const;

/** Allowed values of `appointments.status`. */
export const APPOINTMENT_STATUS_VALUES = [
  'scheduled',
  'confirmed',
  'checked_in',
  'completed',
  'cancelled',
  'no_show',
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

/** Allowed values of `appointments.reminder_status`. */
export const APPOINTMENT_REMINDER_STATUS_VALUES = [
  'not_sent',
  'confirm_requested',
  'reminder_queued',
  'reminder_sent',
  'failed',
] as const;
