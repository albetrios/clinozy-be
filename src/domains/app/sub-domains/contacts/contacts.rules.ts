import type { BaseRecordRules, BaseRecordWriteContext } from '@/domains/app/base-record.types.js';
import {
  type BaseRecordRow,
  listChildRows,
  replaceChildRows,
} from '@/domains/app/base-record.repository.js';
import { ConflictError, fieldValidationError } from '@/shared/errors/index.js';
import { calendarDateInTimeZone } from '@/shared/utils/validation/record-fields.util.js';
import { CONTACT_REFERRAL_SOURCE } from './contacts.constants.js';
import {
  CONTACT_PHONES_CHILD,
  type ContactPhoneClash,
  type ContactsRepository,
} from './contacts.repository.js';
import type { ContactPreviewOutput } from './contacts.types.js';
import { LeadsRepository } from '@/domains/app/sub-domains/leads/leads.repository.js';
import { AppointmentsRepository } from '@/domains/app/sub-domains/appointments/appointments.repository.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';

/** One number of a write's `phones` (the DTO's defaults applied). */
interface ContactPhoneInput {
  phone: string;
  is_primary: boolean;
  is_on_whatsapp: boolean;
}

/**
 * The time zone of the database's `CURRENT_DATE` — the `chk_contacts_date_of_birth_past` CHECK the
 * app check mirrors, so a date the database would refuse is a 400, never a 500 (CT13).
 */
const DATABASE_TIME_ZONE = 'UTC';

/**
 * CT13: `date_of_birth` is not in the future, and `referred_by_contact_id` is set only while
 * `referral_source` is `patient` — checked on a create's values and on the row a `PATCH` would
 * leave.
 *
 * @remarks
 * - **Failure modes:** `ValidationError` (400) on `date_of_birth` or `referred_by_contact_id`.
 * - **Notes:** the database CHECKs `chk_contacts_date_of_birth_past` and
 *   `chk_contacts_referred_by_patient` hold the same rules.
 */
export function assertContactValues(values: Record<string, unknown>): void {
  if (
    typeof values.date_of_birth === 'string' &&
    values.date_of_birth > calendarDateInTimeZone(DATABASE_TIME_ZONE)
  ) {
    throw fieldValidationError({
      field: 'date_of_birth',
      messageKey: 'errors:validation.contactDateOfBirthFuture',
    });
  }
  if (
    values.referred_by_contact_id != null &&
    values.referral_source !== CONTACT_REFERRAL_SOURCE.PATIENT
  ) {
    throw fieldValidationError({
      field: 'referred_by_contact_id',
      messageKey: 'errors:validation.contactReferredByNotPatient',
    });
  }
}

/** The 409 naming the contact a number already belongs to (CT3 — "Using existing contact <name>"). */
function contactPhoneExistsError(clash: ContactPhoneClash): ConflictError {
  return new ConflictError('errors:contactPhoneExists', {
    phone: clash.phone,
    name: [clash.first_name, clash.last_name].filter(Boolean).join(' '),
    contact_number: clash.contact_number,
  }).withReason('contact_phone_exists');
}

/** The primary number of a valid `phones` set (the DTO holds exactly one). */
function primaryPhoneOf(phones: readonly ContactPhoneInput[]): string {
  return phones.find((entry) => entry.is_primary)!.phone;
}

const leadsRepository = new LeadsRepository();
const appointmentsRepository = new AppointmentsRepository();

/** One appointment of a contact as its last or next visit. */
type ContactVisit = {
  id: string;
  appointment_date: string;
  start_time: string;
  service_label: string;
  status: string;
};

/** The organization's today (its time zone) — a contact's last and next visit split on it. */
async function organizationToday(context: BaseRecordWriteContext): Promise<string> {
  const { timezone } = await context.ports.organizationSettings(context.scope);
  return calendarDateInTimeZone(timezone);
}

/** CT7: a live lead, patient file or appointment points at the contact. */
async function isInUse(repository: ContactsRepository, contactId: number): Promise<boolean> {
  return (
    (await leadsRepository.hasLiveLeadForContact(contactId)) ||
    (await repository.findPatientFile(contactId)) !== null ||
    (await appointmentsRepository.hasLiveAppointmentForContact(contactId))
  );
}

/**
 * Adds what a contact reads of the records about it to a page (4.A.6): its open lead (#131), its
 * patient file and its last and next visit (#132) — one read each.
 */
async function decorateContacts(
  repository: ContactsRepository,
  outputs: Record<string, unknown>[],
  context: BaseRecordWriteContext,
): Promise<void> {
  const ids = outputs.map((output) => String(output.id));
  const openLeads = await leadsRepository.findOpenLeadsOfContacts(ids);
  const patientFiles = await repository.findPatientFiles(ids);
  const visits = await appointmentsRepository.findLastAndNextVisits({
    contactPublicIds: ids,
    today: await organizationToday(context),
  });
  for (const output of outputs) {
    const id = String(output.id);
    const lead = openLeads.get(id);
    const patientFile = patientFiles.get(id);
    output.open_lead_id = lead?.id ?? null;
    output.open_lead_status = lead?.status ?? null;
    output.patient_id = patientFile?.id ?? null;
    output.patient_number = patientFile?.patient_number ?? null;
    output.last_visit_on = visits.last.get(id)?.appointment_date ?? null;
    output.next_visit_on = visits.next.get(id)?.appointment_date ?? null;
  }
}

/**
 * The contacts rules (launch ROUTE #129, routes-final 4.A): the primary number's copy, the
 * household and its numbers (CT2, CT3), the numbers' soft delete with their contact, and the
 * preview (route 7).
 *
 * @remarks
 * - **Algorithm:** a write's `phones` sets `primary_phone`. A named household is the household of
 *   the contact named (its first contact), `null` on a `PATCH` = the contact's own. Before a write
 *   that changes the numbers or the household — and before a restore — the numbers are checked
 *   against the live numbers of other households, so the clash names the contact holding it
 *   (`findPhoneClash`); the exclusion constraint backs the check up. A delete marks the numbers
 *   deleted with the contact (they leave the exclusion), a restore clears them.
 * - **Failure modes:** `ConflictError` (409 `contact_phone_exists`) for a number on another
 *   household; `ValidationError` (400 `household_contact_id`) for moving the first contact of a
 *   household that holds others (they would point at a contact of another household).
 *   A contact a live lead, patient file or appointment points at cannot be removed
 *   (`contact_in_use`, CT7); the open lead (#131), the patient file and the last and next visit
 *   (#132) are read per page; the preview's appointments only for `appointment:read` holders.
 * - **Notes:** a patient file points at its contact once a check-in opens it (#132, D68); every
 *   file does once #133 rebuilds the patient file.
 */
export function createContactsRules(repository: ContactsRepository): BaseRecordRules {
  /** The household a named contact belongs to — its first contact. */
  const householdOf = async (contactId: number): Promise<number> => {
    const named = await repository.findById(contactId);
    return (named?.household_contact_id as number | undefined) ?? contactId;
  };

  /** The live numbers a contact holds now. */
  const numbersOf = async (contactId: number): Promise<string[]> => {
    const rows = await listChildRows({ child: CONTACT_PHONES_CHILD, ownerIds: [contactId] });
    return (rows.get(contactId) ?? []).map((row) => row.phone as string);
  };

  /** Refuses numbers that sit on a live contact of another household (CT3). */
  const assertPhonesFree = async (options: {
    organizationId: number;
    phones: readonly string[];
    householdContactId: number | null;
    contactId: number | null;
  }): Promise<void> => {
    const clash = await repository.findPhoneClash(options);
    if (clash) throw contactPhoneExistsError(clash);
  };

  /** The household an update moves the contact to — undefined when it stays. */
  const householdMove = async (
    values: Record<string, unknown>,
    existing: BaseRecordRow,
  ): Promise<number | undefined> => {
    if (!('household_contact_id' in values)) return undefined;
    const named = values.household_contact_id;
    const target = named === null ? existing.id : await householdOf(named as number);
    if (target === existing.household_contact_id) return undefined;
    const isFirst = existing.household_contact_id === existing.id;
    if (isFirst && (await repository.countHouseholdMembers(existing.id)) > 0) {
      throw fieldValidationError({
        field: 'household_contact_id',
        messageKey: 'errors:validation.contactHouseholdHasMembers',
      });
    }
    return target;
  };

  return {
    prepareCreate: async (values, context) => {
      const phones = values.phones as ContactPhoneInput[];
      values.primary_phone = primaryPhoneOf(phones);
      if (typeof values.household_contact_id === 'number') {
        values.household_contact_id = await householdOf(values.household_contact_id);
      }
      await assertPhonesFree({
        organizationId: context.organizationId,
        phones: phones.map((entry) => entry.phone),
        householdContactId: (values.household_contact_id as number | undefined) ?? null,
        contactId: null,
      });
    },
    prepareUpdate: async (values, existing, context) => {
      const target = await householdMove(values, existing);
      if (target === undefined) delete values.household_contact_id;
      else values.household_contact_id = target;
      const phones = values.phones as ContactPhoneInput[] | undefined;
      if (phones) values.primary_phone = primaryPhoneOf(phones);
      if (phones === undefined && target === undefined) return;
      await assertPhonesFree({
        organizationId: context.organizationId,
        phones: phones ? phones.map((entry) => entry.phone) : await numbersOf(existing.id),
        householdContactId: target ?? (existing.household_contact_id as number),
        contactId: existing.id,
      });
      // A move that also replaces the numbers: the old ones go first, so they never follow the
      // contact into the new household (the exclusion would refuse a number they share there).
      if (phones && target !== undefined) {
        await replaceChildRows({ child: CONTACT_PHONES_CHILD, owner: existing, rows: [] });
      }
    },
    prepareRemove: async (existing) => {
      if (await isInUse(repository, existing.id)) {
        throw new ConflictError('errors:contactInUse').withReason('contact_in_use');
      }
    },
    decorate: (outputs, context) => decorateContacts(repository, outputs, context),
    afterWrite: async (row, change, context) => {
      if (change.kind === 'delete') {
        await repository.setPhonesDeletedAt(row.id, row.deleted_at);
      }
      if (change.kind === 'restore') {
        await assertPhonesFree({
          organizationId: context.organizationId,
          phones: await numbersOf(row.id),
          householdContactId: row.household_contact_id as number,
          contactId: row.id,
        });
        await repository.setPhonesDeletedAt(row.id, null);
      }
    },
    views: {
      // The hover card: the contact (no `phones`) plus its open lead, patient file and the next and
      // last appointment — the patient file and the appointments null until #133 and #132 (D61).
      preview: async ({ existing, present, context }) => {
        const [contact] = (await present([existing])) as ContactPreviewOutput[];
        const openLead = (await leadsRepository.findOpenLeadsOfContacts([existing.public_id])).get(
          existing.public_id,
        );
        const patientFile = (await repository.findPatientFiles([existing.public_id])).get(
          existing.public_id,
        );
        const visits = (await context.can(APP_PERMISSIONS.APPOINTMENT_READ))
          ? await appointmentsRepository.findLastAndNextVisits({
              contactPublicIds: [existing.public_id],
              today: await organizationToday(context),
            })
          : null;
        const appointmentOf = (visit: ContactVisit | undefined) =>
          visit
            ? {
                id: visit.id,
                appointment_date: visit.appointment_date,
                start_time: visit.start_time,
                service_label: visit.service_label,
                status: visit.status,
              }
            : null;
        return {
          ...contact!,
          open_lead: openLead ?? null,
          patient: patientFile ?? null,
          next_appointment: appointmentOf(visits?.next.get(existing.public_id)),
          last_appointment: appointmentOf(visits?.last.get(existing.public_id)),
        } satisfies ContactPreviewOutput;
      },
    },
  };
}
