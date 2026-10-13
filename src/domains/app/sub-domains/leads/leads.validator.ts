import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { readContactLinkedSearch } from '@/domains/app/sub-domains/contacts/contacts.validator.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  queryInstantRange,
  splitRecordIds,
  withInstants,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  CreateLeadDto,
  type CreateLeadInput,
  listLeadsQueryDto,
  UpdateLeadDto,
  type UpdateLeadInput,
} from './leads.dto.js';

/** The `true` / `false` of a query flag (undefined when absent). */
function readFlag(value: 'true' | 'false' | undefined): boolean | undefined {
  return value === undefined ? undefined : value === 'true';
}

/** Parses a lead create body; throws `ValidationError` naming each bad field. */
export function validateCreateLead(data: unknown): CreateLeadInput {
  return withInstants({
    values: parseWithSchema({ schema: CreateLeadDto, data }),
    fields: ['follow_up_at'],
  });
}

/** Parses a lead update body; throws `ValidationError` naming each bad field. */
export function validateUpdateLead(data: unknown): UpdateLeadInput {
  return withInstants({
    values: parseWithSchema({ schema: UpdateLeadDto, data }),
    fields: ['follow_up_at'],
  });
}

/**
 * Parses the `GET /app/leads` query into a list input (routes-final 5.8 #1, L7): `q` through the
 * contact and the lead number, the several-value filters as lists, the references by public id,
 * and the contact- and hold-derived filters.
 */
export function validateListLeadsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema({ schema: listLeadsQueryDto, data });
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
      search: readContactLinkedSearch({ q: query.q }),
      interests: query.interests?.split(','),
      team_membership_id: query.team_membership_id,
      is_awaiting_reply: readFlag(query.is_awaiting_reply),
      ownership: query.ownership,
    },
    ranges: {
      follow_up_at: queryInstantRange({
        from: query.follow_up_at_from,
        to: query.follow_up_at_to,
      }),
      created_at: queryInstantRange({ from: query.created_from, to: query.created_to }),
    },
  };
}
