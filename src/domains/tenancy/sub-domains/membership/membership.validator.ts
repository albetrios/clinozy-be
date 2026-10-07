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
  return parseWithSchema(createMembershipDto, data);
}

/**
 * Validates a `PATCH /organization/memberships/:membership_id` body
 * against {@link updateMembershipDto}; throws
 * `ValidationError('errors:invalidInput')` on failure.
 */
export function validateUpdateMembership(data: unknown): UpdateMembershipInput {
  return parseWithSchema(updateMembershipDto, data);
}

/**
 * Validates a `DELETE /organization/memberships/:membership_id` query string against
 * {@link deleteMembershipQueryDto}; throws `ValidationError('errors:invalidInput')` on failure.
 */
export function validateDeleteMembershipQuery(data: unknown): DeleteMembershipQueryInput {
  return parseWithSchema(deleteMembershipQueryDto, data);
}

/**
 * Validates the `GET /organization/memberships` query string against the strict
 * {@link listMembershipsQueryDto} (cursor pagination only).
 */
export function validateListMembershipsQuery(data: unknown): ListMembershipsQueryInput {
  return parseWithSchema(listMembershipsQueryDto, data, 'errors:validation.invalidPagination');
}

/**
 * Validates a `POST /organization/transfer-ownership` body against
 * {@link transferOwnershipDto}; throws `ValidationError('errors:invalidInput')`
 * on failure.
 */
export function validateTransferOwnership(data: unknown): TransferOwnershipInput {
  return parseWithSchema(transferOwnershipDto, data);
}
