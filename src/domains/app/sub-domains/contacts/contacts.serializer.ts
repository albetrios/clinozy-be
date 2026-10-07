import type { AppointmentOutput } from '@/domains/app/sub-domains/appointments/appointments.types.js';
import type { LeadOutput } from '@/domains/app/sub-domains/leads/leads.types.js';
import type { MedicalContactOutput } from '@/domains/app/sub-domains/medical-contacts/medical-contacts.types.js';
import type { PatientOutput } from '@/domains/app/sub-domains/patients/patients.types.js';
import type { ContactAppointmentSummary, ContactOutput } from './contacts.types.js';

/** A patient as a contact. */
export function patientContact(patient: PatientOutput): ContactOutput {
  return {
    kind: 'patient',
    id: patient.id,
    name: [patient.first_name, patient.last_name].filter(Boolean).join(' '),
    phone: patient.phone,
    email: patient.email,
    number: patient.patient_number,
    created_at: patient.created_at,
  };
}

/** A lead as a contact. */
export function leadContact(lead: LeadOutput): ContactOutput {
  return {
    kind: 'lead',
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    number: lead.lead_number,
    created_at: lead.created_at,
  };
}

/** A walk-in buyer as a contact. */
export function medicalContactContact(contact: MedicalContactOutput): ContactOutput {
  return {
    kind: 'medical_contact',
    id: contact.id,
    name: contact.name,
    phone: contact.phone,
    email: null,
    number: null,
    created_at: contact.created_at,
  };
}

/** An appointment as a preview line. */
export function appointmentSummary(
  appointment: AppointmentOutput | undefined,
): ContactAppointmentSummary | null {
  if (!appointment) return null;
  return {
    id: appointment.id,
    appointment_date: appointment.appointment_date,
    start_time: appointment.start_time,
    service_label: appointment.service_label,
    status: appointment.status,
  };
}
