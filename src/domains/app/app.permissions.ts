/**
 * Organization-scoped permission codes guarded by the app domain (the clinic records) — used by
 * `requireOrganizationPermission` preHandlers on branch routes and by `hasOrganizationPermission`
 * where a permission widens a result (`GET /app/branches/my`).
 */
export const APP_PERMISSIONS = {
  BRANCH_READ: 'branch:read',
  BRANCH_CREATE: 'branch:create',
  BRANCH_UPDATE: 'branch:update',
  BRANCH_DELETE: 'branch:delete',
} as const;
