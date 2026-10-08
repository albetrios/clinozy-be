import type { BaseRecordRules } from '@/domains/app/base-record.types.js';
import {
  type BaseRecordRow,
  listChildRows,
  replaceChildRows,
} from '@/domains/app/base-record.repository.js';
import { ConflictError, ValidationError } from '@/shared/errors/index.js';
import { calendarDateInTimeZone } from '@/shared/utils/validation/record-fields.util.js';
import { CONTACT_REFERRAL_SOURCE } from './contacts.constants.js';
import {
  CONTACT_PHONES_CHILD,
  type ContactPhoneClash,
  type ContactsRepository,
} from './contacts.repository.js';
import type { ContactPreviewOutput } from './contacts.types.js';

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

/** A 400 naming one field, with a translated message. */
function fieldError(field: string, messageKey: string): ValidationError {
  return new ValidationError(messageKey, undefined, undefined, [{ field, messageKey }]);
}

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
    throw fieldError('date_of_birth', 'errors:validation.contactDateOfBirthFuture');
  }
  if (
    values.referred_by_contact_id != null &&
    values.referral_source !== CONTACT_REFERRAL_SOURCE.PATIENT
  ) {
    throw fieldError('referred_by_contact_id', 'errors:validation.contactReferredByNotPatient');
  }
}

/** The 409 naming the contact a number already belongs to (CT3 — "Using existing contact <name>"). */
function contactPhoneExistsError(clash: ContactPhoneClash): ConflictError {
  return new ConflictError('errors:contactPhoneExists', {
    phone: clash.phone,
    name: [clash.first_name, clash.last_name].filter(Boolean).join(' '),
    contact_id: clash.contact_public_id,
    contact_number: clash.contact_number,
  }).withReason('contact_phone_exists');
}

/** The primary number of a valid `phones` set (the DTO holds exactly one). */
function primaryPhoneOf(phones: readonly ContactPhoneInput[]): string {
  return phones.find((entry) => entry.is_primary)!.phone;
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
 * - **Notes:** the in-use guard (`contact_in_use`, CT7) and the patient, lead and visit fields come
 *   with the rows that point at a contact — #131, #132, #133 (D61).
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
      throw fieldError('household_contact_id', 'errors:validation.contactHouseholdHasMembers');
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
      // last appointment — each null until #131, #133 and #132 build them (D61).
      preview: async ({ existing, present }) => {
        const [contact] = (await present([existing])) as ContactPreviewOutput[];
        return {
          ...contact!,
          open_lead: null,
          patient: null,
          next_appointment: null,
          last_appointment: null,
        } satisfies ContactPreviewOutput;
      },
    },
  };
}
