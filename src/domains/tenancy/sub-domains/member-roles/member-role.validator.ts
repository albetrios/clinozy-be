import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  createMemberRoleDto,
  deleteMemberRoleQueryDto,
  updateMemberRoleDto,
  listMemberRolesQueryDto,
} from './member-role.dto.js';
import type {
  CreateMemberRoleInput,
  DeleteMemberRoleQueryInput,
  UpdateMemberRoleInput,
  ListMemberRolesQueryInput,
} from './member-role.dto.js';

/**
 * Validates a `DELETE /organization/roles/:role_id` query against {@link deleteMemberRoleQueryDto}
 * (the reason, and a note for `other`).
 */
export function validateDeleteMemberRoleQuery(data: unknown): DeleteMemberRoleQueryInput {
  return parseWithSchema({ schema: deleteMemberRoleQueryDto, data });
}

/**
 * Validates a `POST /organization/roles` body against
 * {@link createMemberRoleDto}; throws `ValidationError('errors:invalidInput')`
 * with per-field details on failure.
 */
export function validateCreateMemberRole(data: unknown): CreateMemberRoleInput {
  return parseWithSchema({ schema: createMemberRoleDto, data });
}

/**
 * Validates a `PATCH /organization/roles/:role_id` body against
 * {@link updateMemberRoleDto}; throws `ValidationError('errors:invalidInput')`
 * with per-field details on failure.
 */
export function validateUpdateMemberRole(data: unknown): UpdateMemberRoleInput {
  return parseWithSchema({ schema: updateMemberRoleDto, data });
}

/**
 * Validates the `GET /organization/roles` query string against the strict
 * {@link listMemberRolesQueryDto} — the paging, the search and the sort — with the plain
 * invalid-input copy (USERS-M5: a bad `sort` is not a paging error), the field named in `errors[]`.
 */
export function validateListMemberRolesQuery(data: unknown): ListMemberRolesQueryInput {
  return parseWithSchema({ schema: listMemberRolesQueryDto, data });
}
