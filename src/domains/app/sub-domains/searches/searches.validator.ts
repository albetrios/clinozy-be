import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { type ListSearchesQueryInput, listSearchesQueryDto } from './searches.dto.js';

/** Parses the `GET /app/searches` query; throws `ValidationError` naming each bad field. */
export function validateListSearchesQuery(data: unknown): ListSearchesQueryInput {
  return parseWithSchema(listSearchesQueryDto, data);
}
