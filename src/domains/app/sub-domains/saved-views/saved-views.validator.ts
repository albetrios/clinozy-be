import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateSavedViewDto,
  type CreateSavedViewInput,
  listSavedViewsQueryDto,
  UpdateSavedViewDto,
  type UpdateSavedViewInput,
} from './saved-views.dto.js';

/** Parses a saved view create body; throws `ValidationError` naming each bad field. */
export function validateCreateSavedView(data: unknown): CreateSavedViewInput {
  return parseWithSchema(CreateSavedViewDto, data);
}

/** Parses a saved view update body; throws `ValidationError` naming each bad field. */
export function validateUpdateSavedView(data: unknown): UpdateSavedViewInput {
  return parseWithSchema(UpdateSavedViewDto, data);
}

/** Parses the `GET /app/saved-views` query into a list input (filters by column). */
export function validateListSavedViewsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listSavedViewsQueryDto, data);
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
