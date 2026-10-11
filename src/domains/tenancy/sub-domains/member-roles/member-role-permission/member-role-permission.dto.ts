import { z } from 'zod';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';

/**
 * Zod schema for the `PUT /organization/roles/:role_id/permissions` request
 * body. The provided `permission_codes` array replaces the role's full permission
 * set (set semantics, not append).
 */
export const putMemberRolePermissionsDto = z
  .object({
    permission_codes: z
      .array(trimmedStringMinMax({ min: 1, max: 100 }))
      .min(0)
      .max(200),
  })
  .strict();

/** Validated body inferred from {@link putMemberRolePermissionsDto}. */
export type PutMemberRolePermissionsInput = z.infer<typeof putMemberRolePermissionsDto>;
