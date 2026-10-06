import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  createMemberRoleDto,
  updateMemberRoleDto,
  listMemberRolesQueryDto,
} from './member-role.dto.js';
import type {
  CreateMemberRoleInput,
  UpdateMemberRoleInput,
  ListMemberRolesQueryInput,
} from './member-role.dto.js';

/**
 * Validates a `POST /organization/roles` body against
 * {@link createMemberRoleDto}; throws `ValidationError('errors:invalidInput')`
 * with per-field details on failure.
 */
export function validateCreateMemberRole(data: unknown): CreateMemberRoleInput {
  return parseWithSchema(createMemberRoleDto, data);
}

/**
 * Validates a `PATCH /organization/roles/:role_id` body against
 * {@link updateMemberRoleDto}; throws `ValidationError('errors:invalidInput')`
 * with per-field details on failure.
 */
export function validateUpdateMemberRole(data: unknown): UpdateMemberRoleInput {
  return parseWithSchema(updateMemberRoleDto, data);
}

/**
 * Validates the `GET /organization/roles` query string against the strict
 * {@link listMemberRolesQueryDto} (cursor pagination only).
 */
export function validateListMemberRolesQuery(data: unknown): ListMemberRolesQueryInput {
  return parseWithSchema(listMemberRolesQueryDto, data, 'errors:validation.invalidPagination');
}
