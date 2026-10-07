import type { BaseRecordVisibility } from '@/domains/app/base-record.types.js';
import type { CONTACT_KIND_VALUES } from './contacts.dto.js';

/** Who a contact is: a patient, a lead or a walk-in buyer of the medical store. */
export type ContactKind = (typeof CONTACT_KIND_VALUES)[number];

/**
 * A person anywhere in the app — a patient, a lead or a walk-in buyer — as one shape.
 *
 * @remarks
 * - **Notes:** `number` is the patient's or lead's running number (null for a walk-in buyer).
 */
export interface ContactOutput {
  kind: ContactKind;
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  number: number | null;
  created_at: string;
}

/** One appointment as a contact preview shows it. */
export interface ContactAppointmentSummary {
  id: string;
  appointment_date: string;
  start_time: string;
  service_label: string;
  status: string;
}

/**
 * The hover preview of a contact — who they are, plus what is next and what was last.
 *
 * @remarks
 * - **Notes:** appointments are a patient's or lead's (none for a walk-in buyer); `today` is the
 *   organization's own date (D41). `linked_patient_id` is a lead's converted patient;
 *   `lead_status` a lead's stage.
 */
export interface ContactPreviewOutput extends ContactOutput {
  next_appointment: ContactAppointmentSummary | null;
  last_appointment: ContactAppointmentSummary | null;
  lead_status: string | null;
  linked_patient_id: string | null;
}

/** What the caller may read, as the controller decided it from their permissions. */
export interface ContactAccess {
  actingUserPublicId: string | undefined;
  visibility: BaseRecordVisibility;
  patients: boolean;
  leads: boolean;
  medicalContacts: boolean;
  appointments: boolean;
}
