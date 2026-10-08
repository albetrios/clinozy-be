import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import {
  NAME_QUERY_MIN_LENGTH,
  PHONE_QUERY_MIN_DIGITS,
  phoneQueryDigits,
  searchTooShortError,
} from '@/domains/app/sub-domains/contacts/contacts.validator.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { splitRecordIds, withInstants } from '@/shared/utils/validation/record-fields.util.js';
import {
  CreateLeadDto,
  type CreateLeadInput,
  listLeadsQueryDto,
  UpdateLeadDto,
  type UpdateLeadInput,
} from './leads.dto.js';
import type { LeadSearch } from './leads.types.js';

/** A whole lead number: `#2371` (L7). */
const LEAD_NUMBER_QUERY = /^#\s*0*(\d{1,9})$/;
/** A whole contact number: `C-12345` or `c12345` (CT9). */
const CONTACT_NUMBER_QUERY = /^c-?\s*0*(\d{1,9})$/i;
/** A bare number short enough to be a lead number. */
const BARE_NUMBER_QUERY = /^\s*0*(\d{1,9})\s*$/;

/**
 * Reads a lead search (L7): `#2371` is the lead number, `C-12345` the contact number; a typed number
 * is the contact's digits (4 or more) and — when it could be one — the lead number too; anything
 * else is the contact's text, 3 or more characters.
 */
function readLeadSearch(q: string | undefined): LeadSearch | undefined {
  if (q === undefined) return undefined;
  const leadNumber = q.match(LEAD_NUMBER_QUERY)?.[1];
  if (leadNumber !== undefined) return { leadNumber: Number(leadNumber) };
  const contactNumber = q.match(CONTACT_NUMBER_QUERY)?.[1];
  if (contactNumber !== undefined) return { contactNumber: Number(contactNumber) };
  const digits = phoneQueryDigits(q);
  if (digits !== undefined) {
    const bare = q.match(BARE_NUMBER_QUERY)?.[1];
    const isNumber = digits.length >= PHONE_QUERY_MIN_DIGITS;
    if (!isNumber && bare === undefined) throw searchTooShortError();
    return {
      text: isNumber ? digits : undefined,
      leadNumber: bare === undefined ? undefined : Number(bare),
    };
  }
  if (q.length < NAME_QUERY_MIN_LENGTH) throw searchTooShortError();
  return { text: q };
}

/** The `true` / `false` of a query flag (undefined when absent). */
function readFlag(value: 'true' | 'false' | undefined): boolean | undefined {
  return value === undefined ? undefined : value === 'true';
}

/** A query instant as a `Date` (undefined when absent). */
function readInstant(value: string | undefined): Date | undefined {
  return value === undefined ? undefined : new Date(value);
}

/** Parses a lead create body; throws `ValidationError` naming each bad field. */
export function validateCreateLead(data: unknown): CreateLeadInput {
  return withInstants(parseWithSchema(CreateLeadDto, data), ['follow_up_at']);
}

/** Parses a lead update body; throws `ValidationError` naming each bad field. */
export function validateUpdateLead(data: unknown): UpdateLeadInput {
  return withInstants(parseWithSchema(UpdateLeadDto, data), ['follow_up_at']);
}

/**
 * Parses the `GET /app/leads` query into a list input (routes-final 5.8 #1, L7): `q` through the
 * contact and the lead number, the several-value filters as lists, the references by public id,
 * and the contact- and hold-derived filters.
 */
export function validateListLeadsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listLeadsQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    sort: query.sort,
    order: query.order,
    branchPublicIds: splitRecordIds(query.branch_ids),
    equals: {
      status: query.status?.split(','),
      source: query.source?.split(','),
      kind: query.kind,
    },
    referenceEquals: {
      contact_id: query.contact_id,
      owner_membership_id: query.owner_membership_id,
      branch_id: query.branch_id,
    },
    derived: {
      search: readLeadSearch(query.q),
      interests: query.interests?.split(','),
      team_membership_id: query.team_membership_id,
      is_awaiting_reply: readFlag(query.is_awaiting_reply),
      ownership: query.ownership,
    },
    ranges: {
      follow_up_at: {
        from: readInstant(query.follow_up_at_from),
        to: readInstant(query.follow_up_at_to),
      },
      created_at: { from: readInstant(query.created_from), to: readInstant(query.created_to) },
    },
  };
}
