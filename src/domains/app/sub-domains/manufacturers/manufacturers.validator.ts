import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateManufacturerDto,
  type CreateManufacturerInput,
  listManufacturersQueryDto,
  UpdateManufacturerDto,
  type UpdateManufacturerInput,
} from './manufacturers.dto.js';

/** Parses a manufacturer create body; throws `ValidationError` naming each bad field. */
export function validateCreateManufacturer(data: unknown): CreateManufacturerInput {
  return parseWithSchema(CreateManufacturerDto, data);
}

/** Parses a manufacturer update body; throws `ValidationError` naming each bad field. */
export function validateUpdateManufacturer(data: unknown): UpdateManufacturerInput {
  return parseWithSchema(UpdateManufacturerDto, data);
}

/** Parses the `GET /app/manufacturers` query into a list input (filters by column). */
export function validateListManufacturersQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listManufacturersQueryDto, data);
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
