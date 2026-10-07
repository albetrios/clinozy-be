import type { AppointmentOutput } from '@/domains/app/sub-domains/appointments/appointments.types.js';
import type { BaseRecordVisibility } from '@/domains/app/base-record.types.js';
import type { InvoiceOutput } from '@/domains/app/sub-domains/invoices/invoices.types.js';
import type { LeadOutput } from '@/domains/app/sub-domains/leads/leads.types.js';
import type { PatientOutput } from '@/domains/app/sub-domains/patients/patients.types.js';

/**
 * The command search's answer — up to 10 records per kind; a kind the caller may not read is
 * always empty.
 *
 * @remarks
 * - **Notes:** each entry is the record as its own route returns it.
 */
export interface SearchOutput {
  patients: PatientOutput[];
  leads: LeadOutput[];
  appointments: AppointmentOutput[];
  invoices: InvoiceOutput[];
}

/** What the caller may search, as the controller decided it from their permissions. */
export interface SearchAccess {
  actingUserPublicId: string | undefined;
  visibility: BaseRecordVisibility;
  patients: boolean;
  leads: boolean;
  appointments: boolean;
  invoices: boolean;
}
