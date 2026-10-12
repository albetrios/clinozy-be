/**
 * Canonical permission codes for tenancy-domain resources (organizations,
 * memberships, invitations, roles, API keys, notification policies).
 * Codes are persisted in `tenancy.permissions` and checked at request time
 * by `requireOrganizationPermission` / the Redis-cached `AuthorizationService`.
 */
export const TENANCY_PERMISSIONS = {
  ORGANIZATION_READ: 'organization:read',
  ORGANIZATION_UPDATE: 'organization:update',
  ORGANIZATION_DELETE: 'organization:delete',
  // One code set per resource (launch T8): invite = create, resend = update, revoke = delete.
  MEMBERSHIP_READ: 'membership:read',
  MEMBERSHIP_CREATE: 'membership:create',
  MEMBERSHIP_UPDATE: 'membership:update',
  MEMBERSHIP_DELETE: 'membership:delete',
  ROLE_READ: 'role:read',
  ROLE_CREATE: 'role:create',
  ROLE_UPDATE: 'role:update',
  ROLE_DELETE: 'role:delete',
  API_KEY_READ: 'api-key:read',
  API_KEY_MANAGE: 'api-key:manage',
  NOTIFICATION_POLICY_READ: 'notification-policy:read',
  NOTIFICATION_POLICY_MANAGE: 'notification-policy:manage',
} as const;
