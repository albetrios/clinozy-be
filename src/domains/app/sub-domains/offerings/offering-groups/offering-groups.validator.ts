import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateOfferingGroupDto,
  type CreateOfferingGroupInput,
  listOfferingGroupsQueryDto,
  UpdateOfferingGroupDto,
  type UpdateOfferingGroupInput,
} from './offering-groups.dto.js';

/** Parses an offering group create body; throws `ValidationError` naming each bad field. */
export function validateCreateOfferingGroup(data: unknown): CreateOfferingGroupInput {
  return parseWithSchema({ schema: CreateOfferingGroupDto, data });
}

/** Parses an offering group update body; throws `ValidationError` naming each bad field. */
export function validateUpdateOfferingGroup(data: unknown): UpdateOfferingGroupInput {
  return parseWithSchema({ schema: UpdateOfferingGroupDto, data });
}

/** Parses the `GET /app/offering-groups` query into a list input (filters by column). */
export function validateListOfferingGroupsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema({ schema: listOfferingGroupsQueryDto, data });
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    ranges: {
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}
