import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  createMembershipDto,
  updateMembershipDto,
  deleteMembershipQueryDto,
  listMembershipsQueryDto,
  transferOwnershipDto,
} from './membership.dto.js';
import type {
  CreateMembershipInput,
  UpdateMembershipInput,
  DeleteMembershipQueryInput,
  ListMembershipsQueryInput,
  TransferOwnershipInput,
} from './membership.dto.js';

/**
 * Validates a `POST /organization/memberships` body against
 * {@link createMembershipDto}; throws `ValidationError('errors:invalidInput')`
 * with per-field details on failure.
 */
export function validateCreateMembership(data: unknown): CreateMembershipInput {
  return parseWithSchema({ schema: createMembershipDto, data });
}

/**
 * Validates a `PATCH /organization/memberships/:membership_id` body
 * against {@link updateMembershipDto}; throws
 * `ValidationError('errors:invalidInput')` on failure.
 */
export function validateUpdateMembership(data: unknown): UpdateMembershipInput {
  return parseWithSchema({ schema: updateMembershipDto, data });
}

/**
 * Validates a `DELETE /organization/memberships/:membership_id` query string against
 * {@link deleteMembershipQueryDto}; throws `ValidationError('errors:invalidInput')` on failure.
 */
export function validateDeleteMembershipQuery(data: unknown): DeleteMembershipQueryInput {
  return parseWithSchema({ schema: deleteMembershipQueryDto, data });
}

/**
 * Validates the `GET /organization/memberships` query string against the strict
 * {@link listMembershipsQueryDto} — the paging, the search, the sort and the filters — with the
 * plain invalid-input copy (USERS-M5: a bad `status` is not a paging error), the field named in
 * `errors[]`.
 */
export function validateListMembershipsQuery(data: unknown): ListMembershipsQueryInput {
  return parseWithSchema({ schema: listMembershipsQueryDto, data });
}

/**
 * Validates a `POST /organization/transfer-ownership` body against
 * {@link transferOwnershipDto}; throws `ValidationError('errors:invalidInput')`
 * on failure.
 */
export function validateTransferOwnership(data: unknown): TransferOwnershipInput {
  return parseWithSchema({ schema: transferOwnershipDto, data });
}
