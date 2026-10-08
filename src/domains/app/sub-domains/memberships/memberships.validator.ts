import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  type ListAppMembershipsQueryInput,
  listAppMembershipsQueryDto,
} from './memberships.dto.js';

/** Parses the `GET /app/memberships` query (400 on a bad one). */
export function validateListAppMembershipsQuery(query: unknown): ListAppMembershipsQueryInput {
  return parseWithSchema(listAppMembershipsQueryDto, query);
}
