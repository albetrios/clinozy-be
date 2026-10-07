import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { splitRecordIds, withInstants } from '@/shared/utils/validation/record-fields.util.js';
import {
  CreateLeadDto,
  type CreateLeadInput,
  listLeadsQueryDto,
  UpdateLeadDto,
  type UpdateLeadInput,
} from './leads.dto.js';

/** Parses a lead create body; throws `ValidationError` naming each bad field. */
export function validateCreateLead(data: unknown): CreateLeadInput {
  return withInstants(parseWithSchema(CreateLeadDto, data), ['follow_up_at']);
}

/** Parses a lead update body; throws `ValidationError` naming each bad field. */
export function validateUpdateLead(data: unknown): UpdateLeadInput {
  return withInstants(parseWithSchema(UpdateLeadDto, data), ['follow_up_at']);
}

/** Parses the `GET /app/leads` query into a list input (filters by column). */
export function validateListLeadsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listLeadsQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    branchPublicIds: splitRecordIds(query.branch_ids),
    equals: {
      status: query.status,
      source: query.source,
      is_contact_thread:
        query.is_contact_thread === undefined ? false : query.is_contact_thread === 'true',
      kind: query.kind,
    },
    referenceEquals: {
      owner_membership_id: query.owner_membership_id,
      branch_id: query.branch_id,
      patient_id: query.patient_id,
    },
    ranges: {
      follow_up_at: {
        from: query.follow_up_at_from === undefined ? undefined : new Date(query.follow_up_at_from),
        to: query.follow_up_at_to === undefined ? undefined : new Date(query.follow_up_at_to),
      },
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}
