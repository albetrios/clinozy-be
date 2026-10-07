import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateUserPreferenceDto,
  type CreateUserPreferenceInput,
  listUserPreferencesQueryDto,
  UpdateUserPreferenceDto,
  type UpdateUserPreferenceInput,
} from './user-preferences.dto.js';

/** Parses a user preference create body; throws `ValidationError` naming each bad field. */
export function validateCreateUserPreference(data: unknown): CreateUserPreferenceInput {
  return parseWithSchema(CreateUserPreferenceDto, data);
}

/** Parses a user preference update body; throws `ValidationError` naming each bad field. */
export function validateUpdateUserPreference(data: unknown): UpdateUserPreferenceInput {
  return parseWithSchema(UpdateUserPreferenceDto, data);
}

/** Parses the `GET /app/user-preferences` query into a list input (filters by column). */
export function validateListUserPreferencesQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listUserPreferencesQueryDto, data);
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
