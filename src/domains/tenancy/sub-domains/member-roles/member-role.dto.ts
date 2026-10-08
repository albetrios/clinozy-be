import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedString, trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  chipToneSchema,
  expectedUpdatedAtSchema,
  recordDeleteQuerySchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';

/** Zod schema for the `:role_id` path param (get/update/delete role + list/replace role permissions). */
export const roleIdParamsDto = z
  .object({
    role_id: recordIdSchema,
  })
  .strict();

/**
 * Zod schema for the `POST /organization/roles` request body.
 *
 * @remarks
 * sec-T3: `is_system` is a server-only flag set by the seeds (`tenancy.bulk.seed.ts`)
 * to mark Admin/Member as immutable. Clients have no legitimate path to set it; the
 * previous schema accepted it from the body so a tenant could mint roles
 * indistinguishable from seeds and bypass the delete-guard. The `.strict()` shape
 * rejects any body that includes the key.
 *
 * Optional `permission_codes` lets a role be created with its permission set in one
 * atomic call (create + assign in a single transaction). When present it is subject to
 * the same caller-can-grant guard as `PUT /roles/:role_id/permissions`; omit it to create
 * a role with no permissions and assign them later via the PUT.
 */
export const createMemberRoleDto = z
  .object({
    name: trimmedStringMinMax(1, 100),
    description: trimmedString().max(500).nullable().optional(),
    permission_codes: z.array(trimmedStringMinMax(1, 100)).max(200).optional(),
    tone: chipToneSchema.optional(),
    // Launch RC-142: start from another role's access ("copy access from").
    copy_from_role_id: recordIdSchema.optional(),
  })
  .strict();

/**
 * Zod schema for the `PATCH /organization/roles/:role_id` request body (launch §2.D.8): any of
 * `name`, `description` and `tone`, one at a time if wanted; `expected_updated_at` refuses a stale
 * save (T14).
 */
export const updateMemberRoleDto = z
  .object({
    name: trimmedStringMinMax(1, 100).optional(),
    description: trimmedString().max(500).nullable().optional(),
    tone: chipToneSchema.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/**
 * Query of `DELETE /organization/roles/:role_id` — why the role is deleted (`reason`, and a `note`
 * when the reason is `other`; launch T12).
 */
export const deleteMemberRoleQueryDto = recordDeleteQuerySchema;

/** Zod schema for the `GET /organization/roles` cursor pagination query. */
export const listMemberRolesQueryDto = listSearchSortSchema(['name', 'created_at'] as const);

/** Validated body inferred from {@link createMemberRoleDto}. */
export type CreateMemberRoleInput = z.infer<typeof createMemberRoleDto>;
/** Validated body inferred from {@link updateMemberRoleDto}. */
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleDto>;
/** Validated query inferred from {@link deleteMemberRoleQueryDto}. */
export type DeleteMemberRoleQueryInput = z.infer<typeof deleteMemberRoleQueryDto>;
/** Validated query inferred from {@link listMemberRolesQueryDto}. */
export type ListMemberRolesQueryInput = z.infer<typeof listMemberRolesQueryDto>;
