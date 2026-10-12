/**
 * HTTP response shape for a single role-to-permission assignment (launch §2.D.6): the code and
 * when the role got it; timestamps are ISO-8601 strings.
 */
export interface MemberRolePermissionOutput {
  permission_code: string;
  created_at: string;
}
