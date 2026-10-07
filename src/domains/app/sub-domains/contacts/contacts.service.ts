import type { AppointmentsService } from '@/domains/app/sub-domains/appointments/appointments.service.js';
import type { AppointmentOutput } from '@/domains/app/sub-domains/appointments/appointments.types.js';
import type { LeadsService } from '@/domains/app/sub-domains/leads/leads.service.js';
import type { MedicalContactsService } from '@/domains/app/sub-domains/medical-contacts/medical-contacts.service.js';
import type { PatientsService } from '@/domains/app/sub-domains/patients/patients.service.js';
import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import {
  type OrganizationPrincipalDatabaseScope,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { NotFoundError } from '@/shared/errors/index.js';
import { PUBLIC_ID_PREFIXES } from '@/shared/utils/identity/public-id.util.js';
import { calendarDateInTimeZone } from '@/shared/utils/validation/record-fields.util.js';
import {
  appointmentSummary,
  leadContact,
  medicalContactContact,
  patientContact,
} from './contacts.serializer.js';
import type {
  ContactAccess,
  ContactKind,
  ContactOutput,
  ContactPreviewOutput,
} from './contacts.types.js';
import { validateListContactsQuery } from './contacts.validator.js';

/** Contacts per kind a search returns. */
const CONTACTS_PER_KIND = 5;
/** Appointments a preview reads to find the next and the last that still count. */
const APPOINTMENTS_SCANNED = 10;
/** Appointment statuses a preview skips (they did not happen and will not). */
const NOT_HAPPENING = new Set(['cancelled', 'no_show']);

/**
 * The services contacts read — each table's own, so its rules and D9 visibility apply.
 *
 * @remarks
 * - **Notes:** the app container passes its record services.
 */
export interface ContactsSources {
  patientsService: PatientsService;
  leadsService: LeadsService;
  medicalContactsService: MedicalContactsService;
  appointmentsService: AppointmentsService;
}

/**
 * Contacts (launch RC-140, ROUTE #62): every person — patient, lead or walk-in buyer — as one
 * kind of record, searched together and previewed on hover.
 *
 * @remarks
 * - **Algorithm:** a search lists each kind the caller may read through its own service (names,
 *   phones, running numbers; 5 per kind); a preview reads the one record by its id's prefix
 *   (`pat_`, `lead_`, `mcon_`) and, for a patient or lead, its next and last appointment in the
 *   organization's own date (D41).
 * - **Failure modes:** `ValidationError` for a bad query; `NotFoundError('Contact')` for an id of
 *   no contact kind, one not here, or one the caller may not read.
 */
export class ContactsService {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly sources: ContactsSources,
  ) {}

  /**
   * Contacts matching a search, patients first.
   *
   * @remarks
   * - **Algorithm:** see the class; `kind` narrows to one kind.
   * - **Failure modes:** `ValidationError`.
   */
  async list(
    scope: OrganizationPrincipalDatabaseScope,
    query: unknown,
    access: ContactAccess,
  ): Promise<ContactOutput[]> {
    const { q, phone, kind } = validateListContactsQuery(query);
    // A phone matches on its 10 national digits, so `+91 98250 44120` finds `+919825044120`.
    const search = phone === undefined ? q : phone.replace(/\D/g, '').slice(-10);
    const page = { q: search, limit: CONTACTS_PER_KIND };
    const options = {
      actingUserPublicId: access.actingUserPublicId,
      visibility: access.visibility,
    };
    const wants = (wanted: ContactKind) => kind === undefined || kind === wanted;
    return [
      ...(access.patients && wants('patient')
        ? (await this.sources.patientsService.list(scope, page, options)).items.map(patientContact)
        : []),
      ...(access.leads && wants('lead')
        ? (await this.sources.leadsService.list(scope, page, options)).items.map(leadContact)
        : []),
      ...(access.medicalContacts && wants('medical_contact')
        ? (await this.sources.medicalContactsService.list(scope, page, options)).items.map(
            medicalContactContact,
          )
        : []),
    ];
  }

  /**
   * One contact's preview: who they are, their next and last appointment.
   *
   * @remarks
   * - **Algorithm:** see the class.
   * - **Failure modes:** `NotFoundError('Contact')`.
   */
  async preview(
    scope: OrganizationPrincipalDatabaseScope,
    contactId: string,
    access: ContactAccess,
  ): Promise<ContactPreviewOutput> {
    const actor = access.actingUserPublicId;
    const prefix = contactId.split('_')[0];
    if (prefix === PUBLIC_ID_PREFIXES.patient && access.patients) {
      const patient = await this.sources.patientsService.get(scope, contactId, actor);
      return {
        ...patientContact(patient),
        ...(await this.appointmentsOf(scope, { patient_id: patient.id }, access)),
        lead_status: null,
        linked_patient_id: null,
      };
    }
    if (prefix === PUBLIC_ID_PREFIXES.lead && access.leads) {
      const lead = await this.sources.leadsService.get(scope, contactId, actor, access.visibility);
      return {
        ...leadContact(lead),
        ...(await this.appointmentsOf(scope, { lead_id: lead.id }, access)),
        lead_status: lead.status,
        linked_patient_id: lead.patient_id,
      };
    }
    if (prefix === PUBLIC_ID_PREFIXES.medicalContact && access.medicalContacts) {
      const contact = await this.sources.medicalContactsService.get(scope, contactId, actor);
      return {
        ...medicalContactContact(contact),
        next_appointment: null,
        last_appointment: null,
        lead_status: null,
        linked_patient_id: null,
      };
    }
    throw new NotFoundError('Contact');
  }

  /** The next (today on) and the last (before today) appointment that still counts. */
  private async appointmentsOf(
    scope: OrganizationPrincipalDatabaseScope,
    owner: { patient_id: string } | { lead_id: string },
    access: ContactAccess,
  ): Promise<Pick<ContactPreviewOutput, 'next_appointment' | 'last_appointment'>> {
    if (!access.appointments) return { next_appointment: null, last_appointment: null };
    const timeZone = await withAppDatabaseContext(scope, () =>
      this.organizationService.requireOrganizationTimeZone(scope.organizationPublicId),
    );
    const today = calendarDateInTimeZone(timeZone);
    const options = {
      actingUserPublicId: access.actingUserPublicId,
      visibility: access.visibility,
    };
    const read = async (range: Record<string, string>, order: 'asc' | 'desc') =>
      (
        await this.sources.appointmentsService.list(
          scope,
          { ...owner, ...range, sort: 'appointment_date', order, limit: APPOINTMENTS_SCANNED },
          options,
        )
      ).items.find((appointment: AppointmentOutput) => !NOT_HAPPENING.has(appointment.status));
    return {
      next_appointment: appointmentSummary(await read({ appointment_date_from: today }, 'asc')),
      last_appointment: appointmentSummary(await read({ appointment_date_to: today }, 'desc')),
    };
  }
}
