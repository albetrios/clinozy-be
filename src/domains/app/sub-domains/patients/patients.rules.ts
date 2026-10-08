import type { BaseRecordRules, BaseRecordWriteContext } from '@/domains/app/base-record.types.js';
import { AppointmentsRepository } from '@/domains/app/sub-domains/appointments/appointments.repository.js';
import { ContactsRepository } from '@/domains/app/sub-domains/contacts/contacts.repository.js';
import { CONTACT_ACTIVITY_TYPE } from '@/domains/app/sub-domains/contacts/contact-activities/contact-activities.constants.js';
import { ContactActivitiesRepository } from '@/domains/app/sub-domains/contacts/contact-activities/contact-activities.repository.js';
import { ContactMembersRepository } from '@/domains/app/sub-domains/contacts/contact-members/contact-members.repository.js';
import { ConflictError, fieldValidationError } from '@/shared/errors/index.js';
import { PatientsRepository } from './patients.repository.js';

const appointmentsRepository = new AppointmentsRepository();
const contactsRepository = new ContactsRepository();
const contactActivitiesRepository = new ContactActivitiesRepository();
const contactMembersRepository = new ContactMembersRepository();
const patientsRepository = new PatientsRepository();

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

/** The record a patient-file `system` entry links to (one column — the stream's one link). */
export type PatientFileActivityLink =
  | { patient_prescription_id: number }
  | { patient_clinical_note_id: number }
  | { patient_image_id: number }
  | { patient_report_id: number };

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
