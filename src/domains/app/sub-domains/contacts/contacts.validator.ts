import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { type ListContactsQueryInput, listContactsQueryDto } from './contacts.dto.js';

/** Parses the `GET /app/contacts` query; throws `ValidationError` naming each bad field. */
export function validateListContactsQuery(data: unknown): ListContactsQueryInput {
  return parseWithSchema(listContactsQueryDto, data);
}
