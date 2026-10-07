import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreatePendingCreditDto,
  type CreatePendingCreditInput,
  listPendingCreditsQueryDto,
  UpdatePendingCreditDto,
  type UpdatePendingCreditInput,
} from './pending-credits.dto.js';

/** Parses a pending credit create body; throws `ValidationError` naming each bad field. */
export function validateCreatePendingCredit(data: unknown): CreatePendingCreditInput {
  return parseWithSchema(CreatePendingCreditDto, data);
}

/** Parses a pending credit update body; throws `ValidationError` naming each bad field. */
export function validateUpdatePendingCredit(data: unknown): UpdatePendingCreditInput {
  return parseWithSchema(UpdatePendingCreditDto, data);
}

/** Parses the `GET /app/pending-credits` query into a list input (filters by column). */
export function validateListPendingCreditsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listPendingCreditsQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: {
      direction: query.direction,
      party_kind: query.party_kind,
      status: query.status,
    },
    referenceEquals: {
      patient_id: query.patient_id,
    },
    ranges: {
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}
