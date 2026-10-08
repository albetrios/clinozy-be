import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { ValidationError } from '@/shared/errors/index.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { splitRecordIds } from '@/shared/utils/validation/record-fields.util.js';
import {
  CreateContactDto,
  type CreateContactInput,
  listContactsQueryDto,
  UpdateContactDto,
  type UpdateContactInput,
} from './contacts.dto.js';

/** A whole contact number: `C-12345`, `c12345` or `#12345` (CT9). */
const CONTACT_NUMBER_QUERY = /^(?:c-?|#)\s*0*(\d{1,9})$/i;
/** A typed number: digits with the separators people type (`+91 98765-43210`). */
const PHONE_QUERY = /^[\d\s+().-]+$/;
/** The fewest letters a name search takes — the trigram index needs three (CT9). */
const NAME_QUERY_MIN_LENGTH = 3;
/** The fewest digits a number search takes (CT9). */
const PHONE_QUERY_MIN_DIGITS = 4;
/** The digits of a full Indian number after its `91` country code or `0` trunk prefix. */
const LOCAL_NUMBER_LENGTH = 10;

/** How a `q` reads: a whole contact number, the digits of a number, or text. */
type ContactSearch =
  | { kind: 'contact_number'; contactNumber: number }
  | { kind: 'text'; q: string }
  | { kind: 'none' };

/** The 400 for a `q` too short to search (CT9). */
function searchTooShortError(): ValidationError {
  const messageKey = 'errors:validation.contactSearchTooShort';
  return new ValidationError(messageKey, undefined, undefined, [{ field: 'q', messageKey }]);
}

/**
 * Reads a contact search (CT9): a whole contact number is an exact match; a typed number keeps
 * its digits (a leading `91` or `0` dropped from a full number), 4 or more; anything else is text,
 * 3 or more characters.
 */
function readContactSearch(q: string | undefined): ContactSearch {
  if (q === undefined) return { kind: 'none' };
  const contactNumber = q.match(CONTACT_NUMBER_QUERY)?.[1];
  if (contactNumber !== undefined)
    return { kind: 'contact_number', contactNumber: Number(contactNumber) };
  if (PHONE_QUERY.test(q) && /\d/.test(q)) {
    let digits = q.replace(/\D/g, '');
    if (
      digits.length > LOCAL_NUMBER_LENGTH &&
      (digits.startsWith('91') || digits.startsWith('0'))
    ) {
      digits = digits.slice(digits.length - LOCAL_NUMBER_LENGTH);
    }
    if (digits.length < PHONE_QUERY_MIN_DIGITS) throw searchTooShortError();
    return { kind: 'text', q: digits };
  }
  if (q.length < NAME_QUERY_MIN_LENGTH) throw searchTooShortError();
  return { kind: 'text', q };
}

/** Parses a contact create body; throws `ValidationError` naming each bad field. */
export function validateCreateContact(data: unknown): CreateContactInput {
  return parseWithSchema(CreateContactDto, data);
}

/** Parses a contact update body; throws `ValidationError` naming each bad field. */
export function validateUpdateContact(data: unknown): UpdateContactInput {
  return parseWithSchema(UpdateContactDto, data);
}

/**
 * Parses the `GET /app/contacts` query into a list input (routes-final 4.A.8 #1): a whole contact
 * number becomes an exact match, a text or number search ranks the best match first under the
 * default name sort (`match`), and the filters map to columns, links and derived conditions.
 */
export function validateListContactsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listContactsQueryDto, data);
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
