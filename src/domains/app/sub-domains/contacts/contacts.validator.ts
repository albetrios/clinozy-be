import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { fieldValidationError, type ValidationError } from '@/shared/errors/index.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { splitRecordIds } from '@/shared/utils/validation/record-fields.util.js';
import { PATIENT_NUMBER_PREFIX } from '@/domains/app/sub-domains/patients/patients.constants.js';
import {
  CreateContactDto,
  type CreateContactInput,
  listContactsQueryDto,
  UpdateContactDto,
  type UpdateContactInput,
} from './contacts.dto.js';

/**
 * A whole contact number: `C-12345`, `c12345` (CT9) — never `#12345`, which every screen shows for
 * a patient's or a lead's number (SHELL-M1, D81).
 */
const CONTACT_NUMBER_QUERY = /^c-?\s*0*(\d{1,9})$/i;
/** A whole record number: `#2371` (a patient's, a lead's, an appointment's). */
const RECORD_NUMBER_QUERY = /^#\s*0*(\d{1,9})$/;

/** A whole number shown with its display `prefix`: `PT-0412`, `pt 412`. */
function prefixedNumberQuery(prefix: string): RegExp {
  return new RegExp(`^${prefix}-?\\s*0*(\\d{1,9})$`, 'i');
}

/** A whole patient number: `PT-0412` (SHELL-M1, D81). */
const PATIENT_NUMBER_QUERY = prefixedNumberQuery(PATIENT_NUMBER_PREFIX);
/** A typed number: digits with the separators people type (`+91 98765-43210`). */
const PHONE_QUERY = /^[\d\s+().-]+$/;
/** The fewest letters a name search takes — the trigram index needs three (CT9). */
const NAME_QUERY_MIN_LENGTH = 3;
/** The fewest digits a number search takes (CT9). */
const PHONE_QUERY_MIN_DIGITS = 4;
/** The digits of a full Indian number after its `91` country code or `0` trunk prefix. */
const LOCAL_NUMBER_LENGTH = 10;

/**
 * How a `q` reads: a whole contact number, a record number (a patient's or a lead's), a patient
 * number, the digits of a number, or text.
 */
type ContactSearch =
  | { kind: 'contact_number'; contactNumber: number }
  | { kind: 'record_number'; recordNumber: number }
  | { kind: 'patient_number'; patientNumber: number }
  | { kind: 'text'; q: string }
  | { kind: 'none' };

/** The 400 for a `q` too short to search (CT9) — the contact search and the lead search (L7). */
function searchTooShortError(): ValidationError {
  return fieldValidationError({
    field: 'q',
    messageKey: 'errors:validation.contactSearchTooShort',
  });
}

/**
 * The digits of a typed number (CT9) — `+91 98765-43210` → `9876543210`: a typed country code
 * (`+91`, even on part of a number) or a full number's `91` / `0` dropped; undefined when `q` is not
 * a typed number. Shared by the contact search and the lead search (L7).
 */
function phoneQueryDigits(q: string): string | undefined {
  if (!(PHONE_QUERY.test(q) && /\d/.test(q))) return undefined;
  const digits = q.replace(/\D/g, '');
  if (q.startsWith('+91')) return digits.slice(2);
  if (digits.length > LOCAL_NUMBER_LENGTH && (digits.startsWith('91') || digits.startsWith('0'))) {
    return digits.slice(digits.length - LOCAL_NUMBER_LENGTH);
  }
  return digits;
}

/** A bare number short enough to be a record number. */
const BARE_NUMBER_QUERY = /^\s*0*(\d{1,9})\s*$/;

/**
 * How a list of records about a contact reads `q` (leads L7, appointments 6.8): the contact's search
 * text (its rules — CT9), a contact number (`C-12345`) and the record's own number (`#2371`) — a
 * plain number may be a record number and a phone's digits at once.
 */
export interface ContactLinkedSearch {
  /** The contact's search text holds it (3+ letters, or 4+ digits of a number). */
  text?: string | undefined;
  contactNumber?: number | undefined;
  recordNumber?: number | undefined;
}

/**
 * Reads a `q` of a list about a contact (L7, 6.8, P9): `#2371` is the record's number — and so is
 * `PT-0412` when the record shows one with a `recordPrefix` (`PT`); `C-12345` the contact number; a
 * typed number is the contact's digits (4 or more) and — when it could be one — the record number
 * too; anything else is the contact's text, 3 or more characters (400 `q` otherwise).
 */
export function readContactLinkedSearch({
  q,
  options = {},
}: {
  q: string | undefined;
  options?: { recordPrefix?: string } | undefined;
}): ContactLinkedSearch | undefined {
  if (q === undefined) return undefined;
  const prefixed =
    options.recordPrefix === undefined
      ? undefined
      : prefixedNumberQuery(options.recordPrefix).exec(q)?.[1];
  const recordNumber = prefixed ?? RECORD_NUMBER_QUERY.exec(q)?.[1];
  if (recordNumber !== undefined) return { recordNumber: Number(recordNumber) };
  const contactNumber = CONTACT_NUMBER_QUERY.exec(q)?.[1];
  if (contactNumber !== undefined) return { contactNumber: Number(contactNumber) };
  const digits = phoneQueryDigits(q);
  if (digits !== undefined) {
    const bare = BARE_NUMBER_QUERY.exec(q)?.[1];
    const isNumber = digits.length >= PHONE_QUERY_MIN_DIGITS;
    if (!isNumber && bare === undefined) throw searchTooShortError();
    return {
      text: isNumber ? digits : undefined,
      recordNumber: bare === undefined ? undefined : Number(bare),
    };
  }
  if (q.length < NAME_QUERY_MIN_LENGTH) throw searchTooShortError();
  return { text: q };
}

/**
 * Reads a contact search (CT9, SHELL-M1): a whole contact number (`C-12345`) is an exact match;
 * `#2371` is the number of the person's patient file or of their lead, and `PT-0412` the patient
 * number; a typed number keeps its digits (a leading `91` or `0` dropped from a full number), 4 or
 * more; anything else is text, 3 or more characters.
 */
function readContactSearch(q: string | undefined): ContactSearch {
  if (q === undefined) return { kind: 'none' };
  const contactNumber = CONTACT_NUMBER_QUERY.exec(q)?.[1];
  if (contactNumber !== undefined)
    return { kind: 'contact_number', contactNumber: Number(contactNumber) };
  const recordNumber = RECORD_NUMBER_QUERY.exec(q)?.[1];
  if (recordNumber !== undefined)
    return { kind: 'record_number', recordNumber: Number(recordNumber) };
  const patientNumber = PATIENT_NUMBER_QUERY.exec(q)?.[1];
  if (patientNumber !== undefined)
    return { kind: 'patient_number', patientNumber: Number(patientNumber) };
  const digits = phoneQueryDigits(q);
  if (digits !== undefined) {
    if (digits.length < PHONE_QUERY_MIN_DIGITS) throw searchTooShortError();
    return { kind: 'text', q: digits };
  }
  if (q.length < NAME_QUERY_MIN_LENGTH) throw searchTooShortError();
  return { kind: 'text', q };
}

/** Parses a contact create body; throws `ValidationError` naming each bad field. */
export function validateCreateContact(data: unknown): CreateContactInput {
  return parseWithSchema({ schema: CreateContactDto, data });
}

/** Parses a contact update body; throws `ValidationError` naming each bad field. */
export function validateUpdateContact(data: unknown): UpdateContactInput {
  return parseWithSchema({ schema: UpdateContactDto, data });
}

/**
 * Parses the `GET /app/contacts` query into a list input (routes-final 4.A.8 #1): a whole contact
 * number becomes an exact match, a record number (`#2371`) or a patient number (`PT-0412`) the
 * derived `record_number` / `patient_number` filter (SHELL-M1), a text or number search ranks the
 * best match first under the default name sort (`match`), and the filters map to columns, links and
 * derived conditions.
 */
export function validateListContactsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema({ schema: listContactsQueryDto, data });
  const search = readContactSearch(query.q);
  const ids = splitRecordIds(query.ids);
  const ranksMatches =
    search.kind === 'text' && (query.sort ?? 'name') === 'name' && query.order !== 'desc';
  return {
    after: query.after,
    limit: query.limit,
    q: search.kind === 'text' ? search.q : undefined,
    sort: ranksMatches ? 'match' : query.sort,
    order: query.order,
    equals: {
      contact_number: search.kind === 'contact_number' ? search.contactNumber : undefined,
      public_id: ids.length > 0 ? ids : undefined,
    },
    referenceEquals: {
      household_contact_id: query.household_contact_id,
    },
    linkEquals: {
      member_membership_ids: query.member_membership_id,
    },
    derived: {
      record_number: search.kind === 'record_number' ? search.recordNumber : undefined,
      patient_number: search.kind === 'patient_number' ? search.patientNumber : undefined,
      phone: query.phone,
      is_awaiting_reply:
        query.is_awaiting_reply === undefined ? undefined : query.is_awaiting_reply === 'true',
      preference_tags: query.preference_tags?.split(','),
      is_patient: query.is_patient === undefined ? undefined : query.is_patient === 'true',
      has_open_lead: query.has_open_lead === undefined ? undefined : query.has_open_lead === 'true',
    },
    ranges: {
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}
