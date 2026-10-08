import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateOfferDto,
  type CreateOfferInput,
  listOffersQueryDto,
  UpdateOfferDto,
  type UpdateOfferInput,
} from './offers.dto.js';

/** Parses an offer create body; throws `ValidationError` naming each bad field. */
export function validateCreateOffer(data: unknown): CreateOfferInput {
  return parseWithSchema(CreateOfferDto, data);
}

/** Parses an offer update body; throws `ValidationError` naming each bad field. */
export function validateUpdateOffer(data: unknown): UpdateOfferInput {
  return parseWithSchema(UpdateOfferDto, data);
}

/** Parses the `GET /app/offers` query into a list input — filters by column, derived status, offering and branch. */
export function validateListOffersQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listOffersQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: {
      kind: query.kind,
    },
    derived: {
      status: query.status,
    },
    linkEquals: {
      offering_ids: query.offering_id,
      branch_ids: query.branch_id,
    },
    ranges: {
      starts_on: { from: query.starts_on_from, to: query.starts_on_to },
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}
