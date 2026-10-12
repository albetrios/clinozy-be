import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  type ListAppMembershipsQueryInput,
  type ListAppRolesQueryInput,
  listAppMembershipsQueryDto,
  listAppRolesQueryDto,
} from './memberships.dto.js';

/** Parses the `GET /app/memberships` query (400 on a bad one). */
export function validateListAppMembershipsQuery(query: unknown): ListAppMembershipsQueryInput {
  return parseWithSchema({ schema: listAppMembershipsQueryDto, data: query });
}

/** Parses the `GET /app/roles` query (400 on a bad one). */
export function validateListAppRolesQuery(query: unknown): ListAppRolesQueryInput {
  return parseWithSchema({ schema: listAppRolesQueryDto, data: query });
}
