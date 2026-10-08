import type { BaseRecordRules, BaseRecordWriteContext } from '@/domains/app/base-record.types.js';
import { AppointmentsRepository } from '@/domains/app/sub-domains/appointments/appointments.repository.js';
import { ContactsRepository } from '@/domains/app/sub-domains/contacts/contacts.repository.js';
import { CONTACT_ACTIVITY_TYPE } from '@/domains/app/sub-domains/contacts/contact-activities/contact-activities.constants.js';
import { ContactActivitiesRepository } from '@/domains/app/sub-domains/contacts/contact-activities/contact-activities.repository.js';
import { ContactMembersRepository } from '@/domains/app/sub-domains/contacts/contact-members/contact-members.repository.js';
import { OfferingsRepository } from '@/domains/app/sub-domains/offerings/offerings.repository.js';
import { ConflictError, fieldValidationError } from '@/shared/errors/index.js';
import { calendarDateInTimeZone } from '@/shared/utils/validation/record-fields.util.js';
import { PatientTreatmentsRepository } from './patient-treatments/patient-treatments.repository.js';
import { PatientsRepository } from './patients.repository.js';

const appointmentsRepository = new AppointmentsRepository();
const contactsRepository = new ContactsRepository();
const contactActivitiesRepository = new ContactActivitiesRepository();
const contactMembersRepository = new ContactMembersRepository();
const offeringsRepository = new OfferingsRepository();
const patientsRepository = new PatientsRepository();
const patientTreatmentsRepository = new PatientTreatmentsRepository();

/** The appointment statuses of a visit — a photo of the visit needs one (P25). */
const VISIT_STATUS_VALUES: readonly unknown[] = ['checked_in', 'completed'];

/** The contact (internal id) of a patient file — its parent was resolved, so the file is there. */
async function contactOfPatient(patientId: number): Promise<number> {
  const patient = await patientsRepository.findById(patientId);
  return patient?.contact_id as number;
}

/**
 * The same-patient rule on a visit link (TR3, P25): the appointment is the patient's contact's —
 * and, for a photo, checked in or completed — else a 400 on `appointment_id`.
 */
export async function assertAppointmentOfPatient(options: {
  appointmentId: unknown;
  patientId: number;
  requireVisit?: boolean;
}): Promise<void> {
  if (typeof options.appointmentId !== 'number') return;
  const appointment = await appointmentsRepository.findById(options.appointmentId);
  const contactId = await contactOfPatient(options.patientId);
  if (appointment?.contact_id !== contactId) {
    throw fieldValidationError({
      field: 'appointment_id',
      messageKey: 'errors:validation.appointmentOtherPatient',
    });
  }
  if (options.requireVisit && !VISIT_STATUS_VALUES.includes(appointment.status)) {
    throw fieldValidationError({
      field: 'appointment_id',
      messageKey: 'errors:validation.appointmentNotAVisit',
    });
  }
}

/** The organization's today (its time zone) — a patient-file date's default and latest day. */
export async function organizationToday(context: BaseRecordWriteContext): Promise<string> {
  const { timezone } = await context.ports.organizationSettings(context.scope);
  return calendarDateInTimeZone(timezone);
}

/** A patient-file date is not after the organization's today — else a 400 on `field`. */
export async function assertDateNotFuture(options: {
  date: unknown;
  field: string;
  messageKey: string;
  context: BaseRecordWriteContext;
}): Promise<void> {
  if (
    typeof options.date === 'string' &&
    options.date > (await organizationToday(options.context))
  ) {
    throw fieldValidationError({ field: options.field, messageKey: options.messageKey });
  }
}

/** The session is the patient's (TR3, P24) — else a 400 on `patient_treatment_id`. */
export async function assertTreatmentOfPatient(options: {
  treatmentId: unknown;
  patientId: number;
}): Promise<void> {
  if (typeof options.treatmentId !== 'number') return;
  const treatment = await patientTreatmentsRepository.findById(options.treatmentId);
  if (treatment?.patient_id !== options.patientId) {
    throw fieldValidationError({
      field: 'patient_treatment_id',
      messageKey: 'errors:validation.patientTreatmentOtherPatient',
    });
  }
}

/** A sent offering is active (O13, TR8, PK10) — else a 400 on `field` naming it. */
export async function assertOfferingActive(
  offeringId: unknown,
  field = 'offering_id',
): Promise<void> {
  if (typeof offeringId !== 'number') return;
  const offering = await offeringsRepository.findById(offeringId);
  if (offering?.is_active !== true) {
    throw fieldValidationError({
      field,
      messageKey: 'errors:validation.offeringNotActive',
      messageParams: { id: String(offering?.public_id ?? '') },
    });
  }
}

/** `2026-10-08` → `8 Oct` — a patient-file date as a label names it (TR9, PK8). */
export function shortCalendarDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** The patient's usual doctor (internal membership id), or null. */
export async function usualDoctorOf(patientId: number): Promise<number | null> {
  const patient = await patientsRepository.findById(patientId);
  return typeof patient?.doctor_membership_id === 'number' ? patient.doctor_membership_id : null;
}

/** The record a patient-file `system` entry links to (one column — the stream's one link). */
export type PatientFileActivityLink =
  | { patient_prescription_id: number }
  | { patient_clinical_note_id: number }
  | { patient_image_id: number }
  | { patient_report_id: number }
  | { patient_treatment_id: number }
  | { patient_check_in_id: number }
  | { patient_review_id: number };

/**
 * Writes a patient-file event into the contact's activity (7.10, M10): a `system` entry linked to
 * its record — shown only to callers who can read that record, a private photo's only to the
 * album's holders (`is_private_photo`, P23) — in the write's transaction.
 */
export async function writePatientFileActivity(options: {
  context: BaseRecordWriteContext;
  patientId: number;
  body: string;
  link: PatientFileActivityLink;
  isPrivatePhoto?: boolean;
}): Promise<void> {
  const { context } = options;
  await contactActivitiesRepository.insert({
    organization_id: context.organizationId,
    contact_id: await contactOfPatient(options.patientId),
    type: CONTACT_ACTIVITY_TYPE.SYSTEM,
    body: options.body,
    ...options.link,
    is_private_photo: options.isPrivatePhoto ?? false,
    created_by_user_id: context.userId,
    updated_by_user_id: context.userId,
  });
}

/** The digits a patient number shows with (`PT-0412`). */
const PATIENT_NUMBER_DIGITS = 4;

/** Refuses a second live patient file for the contact, naming the one it has (P1). */
async function assertNoPatientFile(contactId: number): Promise<void> {
  const file = await contactsRepository.findPatientFile(contactId);
  if (!file) return;
  const contact = await contactsRepository.findById(contactId);
  throw new ConflictError('errors:contactIsPatient', {
    name: [contact?.first_name, contact?.last_name].filter(Boolean).join(' '),
    patient_number: String(file.patient_number).padStart(PATIENT_NUMBER_DIGITS, '0'),
    patient_id: file.public_id,
  }).withReason('contact_is_patient');
}

/**
 * The patients rules (launch ROUTE #133, routes-final 7.A): one live file per contact and the
 * usual doctor on the contact's team.
 *
 * @remarks
 * - **Algorithm:** a create and a restore check the contact has no live patient file (P1 — the
 *   partial unique index backs it up), naming the one it has; a restore also needs the contact
 *   live. After a create, update or restore the usual doctor handles the contact (7.10, CT11).
 *   Nothing is decorated: the file carries `contact_id` only (P3) and the visit dates are the
 *   contact's (PC7).
 * - **Failure modes:** `ConflictError` `contact_is_patient`, `record_restore_conflict` (the contact
 *   was removed).
 */
export const patientsRules: BaseRecordRules = {
  prepareCreate: async (values) => {
    await assertNoPatientFile(values.contact_id as number);
  },
  prepareRestore: async (deleted) => {
    const contact = await contactsRepository.findById(deleted.contact_id as number);
    if (!contact) {
      throw new ConflictError('errors:patientContactRemoved').withReason('record_restore_conflict');
    }
    await assertNoPatientFile(deleted.contact_id as number);
  },
  afterWrite: async (row, change, context) => {
    if (change.kind === 'delete' || typeof row.doctor_membership_id !== 'number') return;
    await contactMembersRepository.addForContact({
      organizationId: context.organizationId,
      contactId: row.contact_id as number,
      membershipIds: [row.doctor_membership_id],
      userId: context.userId,
    });
  },
};
