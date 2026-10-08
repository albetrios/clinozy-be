import type { MemberRolePermissionOutput } from './member-role-permission.types.js';

/**
 * Shapes a `role_permissions` row into the HTTP response form (launch §2.D.6 "Role permission") —
 * the same shape for `GET` and `PUT` (T15); the role is the path's, so it is not repeated per row.
 */
export function serializeMemberRolePermission(row: {
  permission_code: string;
  created_at: Date;
}): MemberRolePermissionOutput {
  return {
    permission_code: row.permission_code,
    created_at: row.created_at.toISOString(),
  };
}
