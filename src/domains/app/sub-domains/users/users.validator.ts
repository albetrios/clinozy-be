import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { type ListAppUsersQueryInput, listAppUsersQueryDto } from './users.dto.js';

/** Parses the `GET /app/users` query; throws `ValidationError` naming each bad field. */
export function validateListAppUsersQuery(data: unknown): ListAppUsersQueryInput {
  return parseWithSchema(listAppUsersQueryDto, data);
}
